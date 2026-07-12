import { parseJsonObject, type JsonObject } from "@/llm/json";
import { recordLlmUsage, type LlmUsageContext } from "@/db/usageRepo";
import { DEFAULT_CHAT_MODEL, resolveFreeChatModel } from "@/llm/models";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string;
      annotations?: Array<{
        type?: string;
        url_citation?: { url?: string; title?: string; content?: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
}

export interface WebCitation {
  url: string;
  title: string;
  content: string;
}

export interface JsonCallResult<T> {
  data: T;
  raw: JsonObject | null;
  usedFallback: boolean;
  error: string | null;
  citations: WebCitation[];
}

interface JsonCallOptions<T> {
  messages: ChatMessage[];
  fallback: T;
  validate: (value: JsonObject) => T | null;
  model?: string;
  temperature?: number;
  topP?: number;
  seed?: number;
  maxTokens?: number;
  timeoutMs?: number;
  responseSchema?: { name: string; schema: Record<string, unknown> };
  webSearch?: boolean;
  usageContext?: LlmUsageContext;
}

export async function callJson<T>({
  messages,
  fallback,
  validate,
  model = DEFAULT_CHAT_MODEL,
  temperature = 0.4,
  topP,
  seed,
  maxTokens = 900,
  timeoutMs = 45_000,
  responseSchema,
  webSearch = false,
  usageContext,
}: JsonCallOptions<T>): Promise<JsonCallResult<T>> {
  const startedAt = Date.now();
  const selectedModel = resolveFreeChatModel(process.env.MODEL?.trim() || model);
  const webSearchEnabled =
    webSearch && process.env.OPENROUTER_WEB_SEARCH_ENABLED?.trim() === "true";
  // Persist exactly what is sent to OpenRouter. Authentication headers are
  // deliberately excluded because audit data must never become a key store.
  const requestBody = {
    model: selectedModel,
    messages,
    temperature,
    ...(topP === undefined ? {} : { top_p: topP }),
    ...(seed === undefined ? {} : { seed }),
    max_tokens: maxTokens,
    response_format: responseSchema
      ? {
          type: "json_schema",
          json_schema: {
            name: responseSchema.name,
            strict: true,
            schema: responseSchema.schema,
          },
        }
      : { type: "json_object" },
    ...(responseSchema ? { provider: { require_parameters: true } } : {}),
    // ponytail: Nemotron defaults to thinking; effort none kills the latency tax
    reasoning: { effort: "none" },
    ...(webSearchEnabled
      ? {
          tools: [{
            type: "openrouter:web_search",
            parameters: { max_results: 3, max_total_results: 3 },
          }],
        }
      : {}),
  };
  const finish = async (
    result: JsonCallResult<T>,
    usage?: ChatCompletionResponse["usage"],
    responseBody?: unknown,
    generationId?: string,
  ) => {
    if (usageContext) {
      await recordLlmUsage({
        context: usageContext,
        model: selectedModel,
        generationId,
        request: requestBody,
        response: responseBody,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
        costUsd: usage?.cost,
        latencyMs: Date.now() - startedAt,
        usedFallback: result.usedFallback,
        error: result.error,
      }).catch((error) => console.error("Failed to record LLM usage", error));
    }
    return result;
  };
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return finish({ data: fallback, raw: null, usedFallback: true, error: "API_KEY is not configured", citations: [] });
  }

  const baseUrl = (process.env.BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.RAILWAY_PUBLIC_DOMAIN
          ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
          : process.env.NEXT_PUBLIC_APP_URL ?? "https://mira.local",
        "X-Title": "Mira",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const body = (await response.json()) as ChatCompletionResponse & {
      error?: { message?: string };
    };
    if (!response.ok) {
      return finish({
        data: fallback,
        raw: null,
        usedFallback: true,
        error: body.error?.message || `OpenRouter returned ${response.status}`,
        citations: [],
      }, body.usage, body, body.id);
    }

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      return finish({ data: fallback, raw: null, usedFallback: true, error: "OpenRouter returned no content", citations: [] }, body.usage, body, body.id);
    }

    const raw = parseJsonObject(content);
    const validated = raw ? validate(raw) : null;
    if (!raw || !validated) {
      return finish({ data: fallback, raw, usedFallback: true, error: "Model JSON failed validation", citations: [] }, body.usage, body, body.id);
    }
    const citations = (body.choices?.[0]?.message?.annotations ?? []).flatMap((annotation) => {
      const citation = annotation.type === "url_citation" ? annotation.url_citation : undefined;
      if (!citation?.url || !citation.title) return [];
      return [{
        url: citation.url,
        title: citation.title.slice(0, 500),
        content: (citation.content ?? citation.title).slice(0, 1_200),
      }];
    });
    return finish({ data: validated, raw, usedFallback: false, error: null, citations }, body.usage, body, body.id);
  } catch (error) {
    return finish({
      data: fallback,
      raw: null,
      usedFallback: true,
      error: error instanceof Error ? error.message : "Unknown OpenRouter error",
      citations: [],
    });
  }
}
