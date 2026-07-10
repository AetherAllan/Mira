export function parseJsonObject<T>(input: string, fallback: T): T {
  try {
    const normalized = input
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start < 0 || end < start) return fallback;
    return JSON.parse(normalized.slice(start, end + 1)) as T;
  } catch {
    return fallback;
  }
}

export function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
