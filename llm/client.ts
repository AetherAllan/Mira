import { parseJsonObject, type JsonObject } from "@/llm/json";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
      annotations?: Array<{
        type?: string;
        url_citation?: { url?: string; title?: string; content?: string };
      }>;
    };
  }>;
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
  maxTokens?: number;
  webSearch?: boolean;
}

export async function callJson<T>({
  messages,
  fallback,
  validate,
  model = process.env.MODEL ?? "openai/gpt-4.1-mini",
  temperature = 0.4,
  maxTokens = 900,
  webSearch = false,
}: JsonCallOptions<T>): Promise<JsonCallResult<T>> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return { data: fallback, raw: null, usedFallback: true, error: "API_KEY is not configured", citations: [] };
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
      body: JSON.stringify({
        model: process.env.MODEL?.trim() || model,
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        // ponytail: Nemotron defaults to thinking; effort none kills the latency tax
        reasoning: { effort: "none" },
        ...(webSearch
          ? {
              tools: [{
                type: "openrouter:web_search",
                parameters: { max_results: 3, max_total_results: 3 },
              }],
            }
          : {}),
      }),
      signal: AbortSignal.timeout(45_000),
    });

    const body = (await response.json()) as ChatCompletionResponse & {
      error?: { message?: string };
    };
    if (!response.ok) {
      return {
        data: fallback,
        raw: null,
        usedFallback: true,
        error: body.error?.message || `OpenRouter returned ${response.status}`,
        citations: [],
      };
    }

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      return { data: fallback, raw: null, usedFallback: true, error: "OpenRouter returned no content", citations: [] };
    }

    const raw = parseJsonObject(content);
    const validated = raw ? validate(raw) : null;
    if (!raw || !validated) {
      return { data: fallback, raw, usedFallback: true, error: "Model JSON failed validation", citations: [] };
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
    return { data: validated, raw, usedFallback: false, error: null, citations };
  } catch (error) {
    return {
      data: fallback,
      raw: null,
      usedFallback: true,
      error: error instanceof Error ? error.message : "Unknown OpenRouter error",
      citations: [],
    };
  }
}
