interface TelegramApiResponse {
  ok?: boolean;
  description?: string;
  parameters?: { retry_after?: number };
  result?: { message_id?: number };
}

export const TELEGRAM_BUBBLE_LIMIT = 4096;
export const TELEGRAM_MAX_BUBBLES = 6;

function chunkByCodePoint(text: string, size: number) {
  const characters = Array.from(text);
  const chunks: string[] = [];
  for (let offset = 0; offset < characters.length; offset += size) {
    chunks.push(characters.slice(offset, offset + size).join(""));
  }
  return chunks;
}

/**
 * Keep explicit short lines as separate chat bubbles. If a model emits more
 * than the allowed bubble count, repack the full text instead of truncating it.
 * Refuse oversized logical messages so callers can regenerate before enqueue.
 */
export function splitTelegramBubbles(
  text: string,
  maxBubbles = TELEGRAM_MAX_BUBBLES,
): string[] {
  const normalized = text.replace(/\\n/g, "\n").trim();
  if (!normalized) return [];
  if (Array.from(normalized).length > TELEGRAM_BUBBLE_LIMIT * maxBubbles) {
    throw new Error(`Telegram message exceeds ${maxBubbles} bubbles`);
  }

  const explicit = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => chunkByCodePoint(line, TELEGRAM_BUBBLE_LIMIT));
  if (explicit.length <= maxBubbles) return explicit;

  return chunkByCodePoint(normalized, TELEGRAM_BUBBLE_LIMIT);
}

export class TelegramSendError extends Error {
  constructor(
    message: string,
    readonly outcome: "definite_failure" | "delivery_unknown",
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TelegramSendError";
  }
}

export async function sendTelegramBubble(chatId: string, text: string): Promise<{
  messageId: number | null;
  raw: TelegramApiResponse;
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  if (!text || Array.from(text).length > TELEGRAM_BUBBLE_LIMIT) {
    throw new Error("Telegram bubble must contain 1-4096 characters");
  }

  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    // Once the request left this process Telegram may have accepted it. Retrying
    // automatically would trade a rare lost message for a duplicate message.
    throw new TelegramSendError(
      error instanceof Error ? error.message : "Telegram network failure",
      "delivery_unknown",
      false,
      undefined,
      { cause: error },
    );
  }

  let body: TelegramApiResponse;
  try {
    body = (await response.json()) as TelegramApiResponse;
  } catch (error) {
    throw new TelegramSendError(
      `Telegram returned an unreadable ${response.status} response`,
      response.ok ? "delivery_unknown" : "definite_failure",
      !response.ok && response.status >= 500,
      undefined,
      { cause: error },
    );
  }

  if (!response.ok || !body.ok) {
    throw new TelegramSendError(
      body.description || `Telegram returned ${response.status}`,
      "definite_failure",
      response.status === 429 || response.status >= 500,
      body.parameters?.retry_after,
    );
  }
  return { messageId: body.result?.message_id ?? null, raw: body };
}

/** Compatibility wrapper. Runtime delivery now uses the durable outbox. */
export async function sendTelegramMessage(chatId: string, text: string): Promise<{
  messageId: number | null;
  raw: TelegramApiResponse;
  parts: number;
}> {
  const bubbles = splitTelegramBubbles(text);
  if (!bubbles.length) throw new Error("Telegram send failed: empty message");

  let last: Awaited<ReturnType<typeof sendTelegramBubble>> | null = null;
  for (const bubble of bubbles) last = await sendTelegramBubble(chatId, bubble);
  return { messageId: last!.messageId, raw: last!.raw, parts: bubbles.length };
}
