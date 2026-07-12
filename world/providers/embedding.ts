import { asArray, asObject, asNumber } from "@/world/providers/http";
import { recordLlmUsage, type LlmUsageContext } from "@/db/usageRepo";
import { DEFAULT_EMBEDDING_MODEL } from "@/llm/models";

interface EmbeddingResponse {
  id?: string;
  data?: Array<{ index?: number; embedding?: number[] }>;
  usage?: { prompt_tokens?: number; total_tokens?: number; cost?: number };
}

const EMBEDDING_DIMENSIONS = 1024;

export async function embedExternalInformation(
  texts: string[],
  usageContext?: LlmUsageContext,
): Promise<number[][] | null> {
  const startedAt = Date.now();
  const model = DEFAULT_EMBEDDING_MODEL;
  const requestBody = { model, input: texts, dimensions: EMBEDDING_DIMENSIONS };
  const log = (input: {
    usage?: EmbeddingResponse["usage"];
    usedFallback: boolean;
    error?: string;
    response?: unknown;
    generationId?: string;
  }) => {
    if (!usageContext) return Promise.resolve();
    return recordLlmUsage({
      context: usageContext,
      model,
      generationId: input.generationId,
      request: requestBody,
      response: input.response,
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
      // The model defaults to 2048 dimensions. Keep the existing pgvector
      // column stable by requesting its supported 1024-dimensional output.
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json()) as EmbeddingResponse & { error?: unknown };
    if (!response.ok) {
      await log({
        usedFallback: true,
        error: `OpenRouter returned ${response.status}`,
        response: body,
        generationId: body.id,
      });
      return null;
    }
    const embeddings = asArray(body.data)
      .map(asObject)
      .filter((value): value is Record<string, unknown> => Boolean(value))
      .sort((left, right) => (asNumber(left.index) ?? 0) - (asNumber(right.index) ?? 0))
      .map((value) => asArray(value.embedding).filter((item): item is number => typeof item === "number"));
    const valid = embeddings.length === texts.length && embeddings.every((item) => item.length === EMBEDDING_DIMENSIONS);
    await log({
      usage: body.usage,
      usedFallback: !valid,
      error: valid ? undefined : "Invalid embedding dimensions",
      response: body,
      generationId: body.id,
    });
    return valid
      ? embeddings
      : null;
  } catch (error) {
    // Embeddings improve semantic dedupe but are never allowed to block the world.
    await log({ usedFallback: true, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
