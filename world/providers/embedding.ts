import { asArray, asObject, asNumber } from "@/world/providers/http";
import { recordLlmUsage, type LlmUsageContext } from "@/db/usageRepo";

interface EmbeddingResponse {
  data?: Array<{ index?: number; embedding?: number[] }>;
  usage?: { prompt_tokens?: number; total_tokens?: number; cost?: number };
}

export async function embedWithBgeM3(
  texts: string[],
  usageContext?: LlmUsageContext,
): Promise<number[][] | null> {
  const startedAt = Date.now();
  const model = "baai/bge-m3";
  const log = (input: { usage?: EmbeddingResponse["usage"]; usedFallback: boolean; error?: string }) => {
    if (!usageContext) return Promise.resolve();
    return recordLlmUsage({
      context: usageContext,
      model,
      promptTokens: input.usage?.prompt_tokens,
      totalTokens: input.usage?.total_tokens,
      costUsd: input.usage?.cost,
      latencyMs: Date.now() - startedAt,
      usedFallback: input.usedFallback,
      error: input.error,
    }).catch((error) => console.error("Failed to record embedding usage", error));
  };
  const apiKey = process.env.API_KEY?.trim();
  if (!apiKey || texts.length === 0) {
    await log({ usedFallback: true, error: apiKey ? "No embedding input" : "API_KEY is not configured" });
    return null;
  }
  const baseUrl = (process.env.BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Mira",
      },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      await log({ usedFallback: true, error: `OpenRouter returned ${response.status}` });
      return null;
    }
    const body = (await response.json()) as EmbeddingResponse;
    const embeddings = asArray(body.data)
      .map(asObject)
      .filter((value): value is Record<string, unknown> => Boolean(value))
      .sort((left, right) => (asNumber(left.index) ?? 0) - (asNumber(right.index) ?? 0))
      .map((value) => asArray(value.embedding).filter((item): item is number => typeof item === "number"));
    const valid = embeddings.length === texts.length && embeddings.every((item) => item.length === 1024);
    await log({ usage: body.usage, usedFallback: !valid, error: valid ? undefined : "Invalid embedding dimensions" });
    return valid
      ? embeddings
      : null;
  } catch (error) {
    // Embeddings improve semantic dedupe but are never allowed to block the world.
    await log({ usedFallback: true, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
