import { parseJsonObject, type JsonObject } from "@/llm/json";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export interface JsonCallResult<T> {
  data: T;
  raw: JsonObject | null;
  usedFallback: boolean;
  error: string | null;
}

interface JsonCallOptions<T> {
  messages: ChatMessage[];
  fallback: T;
  validate: (value: JsonObject) => T | null;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export async function callJson<T>({
  messages,
  fallback,
  validate,
  model = process.env.MODEL ?? "openai/gpt-4.1-mini",
  temperature = 0.4,
  maxTokens = 900,
}: JsonCallOptions<T>): Promise<JsonCallResult<T>> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return { data: fallback, raw: null, usedFallback: true, error: "API_KEY is not configured" };
  }

  const baseUrl = (process.env.BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://mira.local",
        "X-Title": "Mira",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return {
        data: fallback,
        raw: null,
        usedFallback: true,
        error: `OpenRouter returned ${response.status}`,
      };
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      return { data: fallback, raw: null, usedFallback: true, error: "OpenRouter returned no content" };
    }

    const raw = parseJsonObject(content);
    const validated = raw ? validate(raw) : null;
    if (!raw || !validated) {
      return { data: fallback, raw, usedFallback: true, error: "Model JSON failed validation" };
    }
    return { data: validated, raw, usedFallback: false, error: null };
  } catch (error) {
    return {
      data: fallback,
      raw: null,
      usedFallback: true,
      error: error instanceof Error ? error.message : "Unknown OpenRouter error",
    };
  }
}
