import { createHash } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { externalInformation, providerCache } from "@/db/schema";

export interface ExternalFactDraft {
  sourceName: string;
  sourceUrl?: string;
  title: string;
  factualSummary: string;
  category: string;
  facts: Record<string, unknown>;
  publishedAt?: Date;
  beijingRelevance: number;
  personalRelevance: number;
  reliability: number;
  novelty: number;
  expiresAt?: Date;
  embedding?: number[];
}

export interface PersistedExternalFact {
  id: string;
  companionId: string;
  title: string;
  factualSummary: string;
  category: string;
  personalRelevance: number;
  reliability: number;
  novelty: number;
  fetchedAt: Date;
  expiresAt?: Date;
  correlationId: string;
}

function normalizeUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|spm|from|source)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function normalizeTitle(value: string) {
  return value.toLocaleLowerCase("zh-CN").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return "web-search";
  }
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftLength = 0;
  let rightLength = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftLength += left[index]! ** 2;
    rightLength += right[index]! ** 2;
  }
  const denominator = Math.sqrt(leftLength) * Math.sqrt(rightLength);
  return denominator ? dot / denominator : 0;
}

export async function getCachedProviderValue<T>(input: {
  companionId: string;
  provider: string;
  cacheKey: string;
  now: Date;
}): Promise<T | null> {
  const [row] = await getDb()
    .select({ payload: providerCache.payloadJson })
    .from(providerCache)
    .where(
      and(
        eq(providerCache.companionId, input.companionId),
        eq(providerCache.provider, input.provider),
        eq(providerCache.cacheKey, input.cacheKey),
        gt(providerCache.expiresAt, input.now),
      ),
    )
    .limit(1);
  return row ? (row.payload as T) : null;
}

export async function setCachedProviderValue(input: {
  companionId: string;
  provider: string;
  cacheKey: string;
  payload: unknown;
  fetchedAt: Date;
  expiresAt: Date;
}) {
  await getDb()
    .insert(providerCache)
    .values({
      companionId: input.companionId,
      provider: input.provider,
      cacheKey: input.cacheKey,
      payloadJson: input.payload,
      fetchedAt: input.fetchedAt,
      expiresAt: input.expiresAt,
    })
    .onConflictDoUpdate({
      target: [providerCache.companionId, providerCache.provider, providerCache.cacheKey],
      set: {
        payloadJson: input.payload,
        fetchedAt: input.fetchedAt,
        expiresAt: input.expiresAt,
        updatedAt: input.fetchedAt,
      },
    });
}

export async function persistExternalFacts(input: {
  companionId: string;
  drafts: ExternalFactDraft[];
  fetchedAt: Date;
  correlationId: string;
}) {
  const recent = await getDb()
    .select({
      id: externalInformation.id,
      sourceUrl: externalInformation.sourceUrl,
      title: externalInformation.title,
      embedding: externalInformation.embedding,
      duplicateGroupId: externalInformation.duplicateGroupId,
    })
    .from(externalInformation)
    .where(eq(externalInformation.companionId, input.companionId))
    .orderBy(desc(externalInformation.fetchedAt))
    .limit(200);
  let inserted = 0;
  let duplicates = 0;
  const insertedFacts: PersistedExternalFact[] = [];

  for (const draft of input.drafts) {
    const sourceUrl = normalizeUrl(draft.sourceUrl);
    const titleKey = normalizeTitle(draft.title);
    const idempotencyKey = digest(
      sourceUrl
        ? `url:${sourceUrl}`
        : `title:${titleKey}:${draft.publishedAt?.toISOString().slice(0, 10) ?? "unknown"}`,
    );
    const duplicate = recent.find((row) => {
      if (sourceUrl && normalizeUrl(row.sourceUrl ?? undefined) === sourceUrl) return true;
      if (normalizeTitle(row.title) === titleKey) return true;
      return Boolean(
        draft.embedding &&
          row.embedding &&
          cosineSimilarity(draft.embedding, row.embedding) >= 0.92,
      );
    });

    const [row] = await getDb()
      .insert(externalInformation)
      .values({
        companionId: input.companionId,
        idempotencyKey,
        sourceName: draft.sourceName,
        sourceUrl,
        title: draft.title.slice(0, 500),
        factualSummary: draft.factualSummary.slice(0, 1_200),
        category: draft.category,
        factsJson: draft.facts,
        publishedAt: draft.publishedAt,
        fetchedAt: input.fetchedAt,
        beijingRelevance: draft.beijingRelevance,
        personalRelevance: draft.personalRelevance,
        reliability: draft.reliability,
        novelty: duplicate ? 0 : draft.novelty,
        duplicateGroupId: duplicate?.duplicateGroupId ?? duplicate?.id,
        status: duplicate ? "ignored" : "new",
        expiresAt: draft.expiresAt,
        embedding: draft.embedding,
        correlationId: input.correlationId,
      })
      .onConflictDoNothing({
        target: [externalInformation.companionId, externalInformation.idempotencyKey],
      })
      .returning({ id: externalInformation.id });
    if (!row) {
      duplicates += 1;
      continue;
    }
    inserted += 1;
    if (!duplicate) {
      insertedFacts.push({
        id: row.id,
        companionId: input.companionId,
        title: draft.title,
        factualSummary: draft.factualSummary,
        category: draft.category,
        personalRelevance: draft.personalRelevance,
        reliability: draft.reliability,
        novelty: draft.novelty,
        fetchedAt: input.fetchedAt,
        expiresAt: draft.expiresAt,
        correlationId: input.correlationId,
      });
    }
    if (duplicate) duplicates += 1;
    recent.unshift({
      id: row.id,
      sourceUrl: sourceUrl ?? null,
      title: draft.title,
      embedding: draft.embedding ?? null,
      duplicateGroupId: duplicate?.duplicateGroupId ?? duplicate?.id ?? null,
    });
  }
  return { inserted, duplicates, insertedFacts };
}

export function persistWebCitations(input: {
  companionId: string;
  citations: Array<{ url: string; title: string; content: string }>;
  fetchedAt: Date;
  correlationId: string;
}) {
  if (input.citations.length === 0) return Promise.resolve({ inserted: 0, duplicates: 0 });
  return persistExternalFacts({
    companionId: input.companionId,
    fetchedAt: input.fetchedAt,
    correlationId: input.correlationId,
    drafts: input.citations.slice(0, 3).map((citation) => ({
      sourceName: hostname(citation.url),
      sourceUrl: citation.url,
      title: citation.title,
      factualSummary: citation.content.slice(0, 1_200),
      category: "actor_web_search",
      facts: { obtainedBy: "openrouter:web_search" },
      beijingRelevance: /北京|beijing/i.test(`${citation.title} ${citation.content}`) ? 0.9 : 0.3,
      personalRelevance: 0.6,
      reliability: 0.55,
      novelty: 0.7,
      expiresAt: new Date(input.fetchedAt.getTime() + 3 * 24 * 60 * 60_000),
    })),
  });
}
