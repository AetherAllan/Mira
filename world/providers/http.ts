import type { ProviderFetch } from "@/world/providers/types";

export interface FetchJsonOptions {
  fetcher?: ProviderFetch;
  headers?: HeadersInit;
  timeoutMs?: number;
  retryDelayMs?: number;
}

export class ProviderHttpError extends Error {
  constructor(readonly status: number) {
    super(`Provider returned HTTP ${status}`);
    this.name = "ProviderHttpError";
  }
}

const isRetryable = (status: number) => status === 429 || status >= 500;

export async function fetchJson(
  url: string | URL,
  options: FetchJsonOptions = {},
): Promise<unknown> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetcher(url, {
      headers: options.headers,
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    });

    if (response.ok) {
      try {
        return (await response.json()) as unknown;
      } catch (error) {
        throw new Error("Provider returned invalid JSON", { cause: error });
      }
    }

    if (attempt === 0 && isRetryable(response.status)) {
      const delayMs = options.retryDelayMs ?? 250;
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      continue;
    }

    // Deliberately omit the request URL: AMap credentials live in its query string.
    throw new ProviderHttpError(response.status);
  }

  throw new Error("Provider request exhausted retries");
}

export function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toIsoString(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
