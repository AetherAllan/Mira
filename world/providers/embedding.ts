import { asArray, asObject, asNumber } from "@/world/providers/http";

interface EmbeddingResponse {
  data?: Array<{ index?: number; embedding?: number[] }>;
}

export async function embedWithBgeM3(texts: string[]): Promise<number[][] | null> {
  const apiKey = process.env.API_KEY?.trim();
  if (!apiKey || texts.length === 0) return null;
  const baseUrl = (process.env.BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Mira",
      },
      body: JSON.stringify({ model: "baai/bge-m3", input: texts }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as EmbeddingResponse;
    const embeddings = asArray(body.data)
      .map(asObject)
      .filter((value): value is Record<string, unknown> => Boolean(value))
      .sort((left, right) => (asNumber(left.index) ?? 0) - (asNumber(right.index) ?? 0))
      .map((value) => asArray(value.embedding).filter((item): item is number => typeof item === "number"));
    return embeddings.length === texts.length && embeddings.every((item) => item.length === 1024)
      ? embeddings
      : null;
  } catch {
    // Embeddings improve semantic dedupe but are never allowed to block the world.
    return null;
  }
}
