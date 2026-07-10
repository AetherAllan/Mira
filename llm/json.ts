export type JsonObject = Record<string, unknown>;

export function clamp01(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

export function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

/**
 * OpenRouter models occasionally wrap JSON in a Markdown fence despite JSON mode.
 * Keep recovery narrow: accept a full object, a fenced object, or the outermost
 * object substring. Anything else falls back to deterministic runtime behavior.
 */
export function parseJsonObject(text: string): JsonObject | null {
  const candidates = [
    text.trim(),
    text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  ];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const object = asObject(parsed);
      if (object) return object;
    } catch {
      // Try the next conservative recovery form.
    }
  }
  return null;
}
