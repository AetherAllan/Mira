import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  getCachedProviderValue,
  persistDiscoveredPlaces,
  persistExternalFacts,
  setCachedProviderValue,
  type ExternalFactDraft,
} from "@/db/providerRepo";
import { events, externalInformation } from "@/db/schema";
import { getDb } from "@/db/client";
import { persistExternalThoughtCandidates } from "@/db/externalThoughtRepo";
import { embedExternalInformation } from "@/world/providers/embedding";
import { GdeltProvider } from "@/world/providers/gdelt";
import { OpenMeteoProvider } from "@/world/providers/openMeteo";
import { NominatimProvider, OsrmProvider } from "@/world/providers/publicGeo";
import type {
  PlaceSearchRequest,
  ProviderArticle,
  ProviderCurrentWeather,
  ProviderPlace,
  ProviderRoute,
  RouteRequest,
} from "@/world/providers/types";

const BEIJING = { longitude: 116.4074, latitude: 39.9042 };
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function cacheKey(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function cached<T>(input: {
  companionId: string;
  provider: string;
  key: string;
  ttlMs: number;
  now: Date;
  load: () => Promise<T>;
}) {
  const hit = await getCachedProviderValue<T>({
    companionId: input.companionId,
    provider: input.provider,
    cacheKey: input.key,
    now: input.now,
  });
  if (hit !== null) return hit;
  const value = await input.load();
  await setCachedProviderValue({
    companionId: input.companionId,
    provider: input.provider,
    cacheKey: input.key,
    payload: value,
    fetchedAt: input.now,
    expiresAt: new Date(input.now.getTime() + input.ttlMs),
  });
  return value;
}

export async function searchBeijingPois(
  companionId: string,
  query: PlaceSearchRequest,
  now = new Date(),
): Promise<ProviderPlace[]> {
  return cached({
    companionId,
    provider: "nominatim",
    key: `poi:${cacheKey(query)}`,
    ttlMs: 7 * 24 * HOUR,
    now,
    load: () => new NominatimProvider().searchPlaces(query),
  }).catch(() => []);
}

export async function discoverBeijingPlaces(input: {
  companionId: string;
  query: PlaceSearchRequest;
  correlationId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const places = await searchBeijingPois(input.companionId, input.query, now);
  return persistDiscoveredPlaces({
    companionId: input.companionId,
    places,
    discoveredAt: now,
    correlationId: input.correlationId,
  });
}

export async function getBeijingRoute(
  companionId: string,
  request: RouteRequest,
  now = new Date(),
): Promise<ProviderRoute | null> {
  if (request.mode === "transit") return null;
  return cached({
    companionId,
    provider: "osrm",
    key: `route:${cacheKey(request)}`,
    ttlMs: 30 * MINUTE,
    now,
    load: () => new OsrmProvider().getRoute(request),
  }).catch(() => null);
}

function weatherDraft(weather: ProviderCurrentWeather, now: Date): ExternalFactDraft {
  const summary = `北京当前${weather.condition}，气温${weather.temperatureC ?? "未知"}℃，降水${weather.precipitationMm ?? "未知"}毫米。`;
  return {
    sourceName: "Open-Meteo",
    sourceUrl: weather.sourceUrl ?? undefined,
    title: `北京实时天气：${weather.condition}`,
    factualSummary: summary,
    category: "weather",
    facts: { ...weather },
    publishedAt: weather.observedAt ? new Date(weather.observedAt) : now,
    beijingRelevance: 1,
    personalRelevance: 0.9,
    reliability: 0.92,
    novelty: 0.55,
    expiresAt: new Date(now.getTime() + 2 * HOUR),
  };
}

function articleDraft(article: ProviderArticle, now: Date): ExternalFactDraft {
  const beijingRelevance = /北京|京城|beijing/i.test(article.title) ? 0.9 : 0.3;
  const personalRelevance = /科技|游戏|人工智能|AI|互联网|展览|咖啡|书店/i.test(article.title)
    ? 0.75
    : 0.4;
  return {
    sourceName: article.sourceDomain,
    sourceUrl: article.sourceUrl,
    title: article.title,
    // GDELT provides discovery metadata, not licensed article bodies. Keeping
    // the title as a factual candidate prevents accidental article storage.
    factualSummary: article.title,
    category: beijingRelevance > 0.5 ? "beijing_news" : "social_news",
    facts: {
      language: article.language,
      sourceCountry: article.sourceCountry,
      imageUrl: article.imageUrl,
    },
    publishedAt: article.publishedAt ? new Date(article.publishedAt) : undefined,
    beijingRelevance,
    personalRelevance,
    reliability: 0.62,
    novelty: 0.7,
    expiresAt: new Date(now.getTime() + 3 * 24 * HOUR),
  };
}

async function attachEmbeddingsToNewFacts(input: {
  companionId: string;
  correlationId: string;
  drafts: ExternalFactDraft[];
}) {
  const candidates = input.drafts
    .map((draft, index) => ({ draft, index }))
    // Weather is selected by category and time, never semantic similarity.
    .filter(({ draft }) => !draft.category.startsWith("weather"));
  const urls = candidates.flatMap(({ draft }) => draft.sourceUrl ? [draft.sourceUrl] : []);
  const existingUrls = urls.length
    ? await getDb()
        .select({ sourceUrl: externalInformation.sourceUrl })
        .from(externalInformation)
        .where(
          and(
            eq(externalInformation.companionId, input.companionId),
            inArray(externalInformation.sourceUrl, urls),
          ),
        )
    : [];
  const knownUrls = new Set(existingUrls.flatMap((row) => row.sourceUrl ? [row.sourceUrl] : []));
  const novel = candidates.filter(
    ({ draft }) => !draft.sourceUrl || !knownUrls.has(draft.sourceUrl),
  );
  if (!novel.length) return;

  const embeddings = await embedExternalInformation(
    novel.map(({ draft }) => `${draft.title}\n${draft.factualSummary}`),
    {
      companionId: input.companionId,
      correlationId: input.correlationId,
      category: "embedding",
      metadata: { itemCount: novel.length, source: "external_ingestion" },
    },
  );
  if (!embeddings) return;
  novel.forEach(({ draft }, index) => {
    draft.embedding = embeddings[index];
  });
}

export async function ingestBeijingExternalInformation(
  companionId: string,
  correlationId: string,
  now = new Date(),
) {
  const enabled = process.env.EXTERNAL_INGESTION_ENABLED === "true";
  if (!enabled) return {
    status: "disabled" as const,
    inserted: 0,
    duplicates: 0,
    failures: [] as string[],
    weatherRisk: 0,
    weatherSummary: null as string | null,
  };

  const tasks: Array<Promise<ExternalFactDraft[]>> = [];
  const publicWeather = () => cached({
    companionId,
    provider: "open_meteo",
    key: "current:beijing",
    ttlMs: 30 * MINUTE,
    now,
    load: () => new OpenMeteoProvider().getCurrent(BEIJING),
  });
  tasks.push(publicWeather().then((value) => [weatherDraft(value, now)]));
  tasks.push(
    cached({
      companionId,
      provider: "gdelt",
      key: "news:beijing:2h",
      ttlMs: 2 * HOUR,
      now,
      load: () => new GdeltProvider().searchArticles({
        query: "(北京 OR Beijing) (生活 OR 科技 OR 游戏 OR 展览)",
        timespan: "24h",
        maxRecords: 40,
      }),
    }).then((values) => values.map((value) => articleDraft(value, now))),
  );

  const settled = await Promise.allSettled(tasks);
  const failures = settled.flatMap((result) =>
    result.status === "rejected"
      ? [result.reason instanceof Error ? result.reason.message : String(result.reason)]
      : [],
  );
  const drafts = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  await attachEmbeddingsToNewFacts({ companionId, correlationId, drafts });
  const persisted = await persistExternalFacts({ companionId, drafts, fetchedAt: now, correlationId });
  const thoughtResult = await persistExternalThoughtCandidates(persisted.insertedFacts).catch(
    () => ({ inserted: 0 }),
  );
  const weatherFacts = drafts.filter((draft) => draft.category.startsWith("weather"));
  const weatherRisk = weatherFacts.some((draft) => draft.category === "weather_warning")
    ? 1
    : weatherFacts.some((draft) => /雨|雪|雷|大风|沙尘/.test(`${draft.title}${draft.factualSummary}`))
      ? 0.75
      : 0;

  await getDb().insert(events).values({
    companionId,
    type: "external_information.ingested",
    source: "world.provider",
    correlationId,
    payloadJson: {
      inserted: persisted.inserted,
      duplicates: persisted.duplicates,
      thoughtCount: thoughtResult.inserted,
      failures,
      candidateCount: drafts.length,
    },
  });
  return {
    status: "completed" as const,
    inserted: persisted.inserted,
    duplicates: persisted.duplicates,
    thoughtCount: thoughtResult.inserted,
    failures,
    weatherRisk,
    weatherSummary: weatherFacts[0]?.factualSummary ?? null,
  };
}
