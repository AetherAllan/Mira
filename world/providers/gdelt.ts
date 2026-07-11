import {
  asArray,
  asObject,
  asString,
  fetchJson,
  toIsoString,
} from "@/world/providers/http";
import type { ProviderArticle, ProviderFetch } from "@/world/providers/types";

const API_URL = "https://api.gdeltproject.org/api/v2/doc/doc";

export interface GdeltProviderOptions {
  fetcher?: ProviderFetch;
  timeoutMs?: number;
}

export interface GdeltArticleSearch {
  query: string;
  timespan?: string;
  maxRecords?: number;
  sort?: "datedesc" | "dateasc" | "hybridrel";
}

function httpUrl(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function publishedAt(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return compact
    ? toIsoString(`${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`)
    : toIsoString(raw);
}

export class GdeltProvider {
  private readonly fetcher?: ProviderFetch;
  private readonly timeoutMs?: number;

  constructor(options: GdeltProviderOptions = {}) {
    this.fetcher = options.fetcher;
    this.timeoutMs = options.timeoutMs;
  }

  async searchArticles(search: GdeltArticleSearch): Promise<ProviderArticle[]> {
    const query = search.query.trim();
    if (!query) throw new Error("GDELT query is required");
    const maxRecords = search.maxRecords ?? 50;
    if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 250) {
      throw new Error("GDELT maxRecords must be between 1 and 250");
    }

    const params = new URLSearchParams({
      query,
      mode: "artlist",
      format: "json",
      timespan: search.timespan?.trim() || "24h",
      maxrecords: String(maxRecords),
      sort: search.sort ?? "datedesc",
    });
    const body = asObject(await fetchJson(`${API_URL}?${params}`, {
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
    }));
    if (!body) throw new Error("GDELT returned an invalid payload");

    return asArray(body.articles).flatMap((value): ProviderArticle[] => {
      const article = asObject(value);
      const sourceUrl = httpUrl(article?.url);
      const title = asString(article?.title);
      if (!article || !sourceUrl || !title) return [];
      const url = new URL(sourceUrl);
      return [{
        provider: "gdelt",
        sourceUrl,
        title,
        sourceDomain: asString(article.domain) ?? url.hostname,
        publishedAt: publishedAt(article.seendate),
        language: asString(article.language),
        sourceCountry: asString(article.sourcecountry),
        imageUrl: httpUrl(article.socialimage),
      }];
    });
  }
}
