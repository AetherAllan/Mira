import { createHash } from "node:crypto";
import {
  getCachedProviderValue,
  persistExternalFacts,
  setCachedProviderValue,
  type ExternalFactDraft,
} from "@/db/providerRepo";
import { events } from "@/db/schema";
import { getDb } from "@/db/client";
import { AMapProvider, type AMapPoiSearch, type AMapRouteRequest } from "@/world/providers/amap";
import { embedWithBgeM3 } from "@/world/providers/embedding";
import { GdeltProvider } from "@/world/providers/gdelt";
import { QWeatherProvider } from "@/world/providers/qweather";
import type {
  ProviderArticle,
  ProviderCurrentWeather,
  ProviderPlace,
  ProviderRoute,
  ProviderWeatherAlert,
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
  query: AMapPoiSearch,
  now = new Date(),
): Promise<ProviderPlace[]> {
  const apiKey = process.env.AMAP_WEB_API_KEY?.trim();
  if (!apiKey) return [];
  return cached({
    companionId,
    provider: "amap",
    key: `poi:${cacheKey(query)}`,
    ttlMs: 7 * 24 * HOUR,
    now,
    load: () => new AMapProvider({ apiKey }).searchPois(query),
  });
}

export async function getBeijingRoute(
  companionId: string,
  request: AMapRouteRequest,
  now = new Date(),
): Promise<ProviderRoute | null> {
  const apiKey = process.env.AMAP_WEB_API_KEY?.trim();
  if (!apiKey) return null;
  return cached({
    companionId,
    provider: "amap",
    key: `route:${cacheKey(request)}`,
    ttlMs: 30 * MINUTE,
    now,
    load: () => new AMapProvider({ apiKey }).getRoute(request),
  });
}

function weatherDraft(weather: ProviderCurrentWeather, now: Date): ExternalFactDraft {
  const summary = `北京当前${weather.condition}，气温${weather.temperatureC ?? "未知"}℃，降水${weather.precipitationMm ?? "未知"}毫米。`;
  return {
    sourceName: "QWeather",
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

function alertDraft(alert: ProviderWeatherAlert, now: Date): ExternalFactDraft {
  return {
    sourceName: alert.senderName ?? "QWeather",
    title: alert.headline,
    factualSummary: alert.description?.slice(0, 1_000) || alert.headline,
    category: "weather_warning",
    facts: { ...alert },
    publishedAt: alert.issuedAt ? new Date(alert.issuedAt) : now,
    beijingRelevance: 1,
    personalRelevance: 1,
    reliability: 0.94,
    novelty: 0.9,
    expiresAt: alert.expiresAt ? new Date(alert.expiresAt) : new Date(now.getTime() + 12 * HOUR),
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

export async function ingestBeijingExternalInformation(
  companionId: string,
  correlationId: string,
  now = new Date(),
) {
  const qweatherKey = process.env.QWEATHER_API_KEY?.trim();
  const qweatherHost = process.env.QWEATHER_API_HOST?.trim();
  const enabled = process.env.EXTERNAL_INGESTION_ENABLED === "true" || Boolean(qweatherKey && qweatherHost);
  if (!enabled) return { status: "disabled" as const, inserted: 0, duplicates: 0, failures: [] as string[] };

  const tasks: Array<Promise<ExternalFactDraft[]>> = [];
  if (qweatherKey && qweatherHost) {
    const weather = new QWeatherProvider({ apiKey: qweatherKey, apiHost: qweatherHost });
    tasks.push(
      cached({
        companionId,
        provider: "qweather",
        key: "current:beijing",
        ttlMs: 30 * MINUTE,
        now,
        load: () => weather.getCurrent(BEIJING),
      }).then((value) => [weatherDraft(value, now)]),
      cached({
        companionId,
        provider: "qweather",
        key: "alerts:beijing",
        ttlMs: 30 * MINUTE,
        now,
        load: () => weather.getAlerts(BEIJING),
      }).then((values) => values.map((value) => alertDraft(value, now))),
    );
  }
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
  const embeddings = await embedWithBgeM3(
    drafts.map((draft) => `${draft.title}\n${draft.factualSummary}`),
  );
  if (embeddings) drafts.forEach((draft, index) => { draft.embedding = embeddings[index]; });
  const persisted = await persistExternalFacts({ companionId, drafts, fetchedAt: now, correlationId });

  await getDb().insert(events).values({
    companionId,
    type: "external_information.ingested",
    source: "world.provider",
    correlationId,
    payloadJson: { ...persisted, failures, candidateCount: drafts.length },
  });
  return { status: "completed" as const, ...persisted, failures };
}
