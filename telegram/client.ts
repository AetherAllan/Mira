interface TelegramApiResponse {
  ok?: boolean;
  description?: string;
  result?: { message_id?: number };
}

/** Each non-empty line becomes its own Telegram bubble.
 * Accepts real newlines and literal "\\n" (models often emit the latter in JSON). */
export function splitTelegramBubbles(text: string): string[] {
  return text
    .replace(/\\n/g, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(0, 4096));
}

async function sendOne(token: string, chatId: string, text: string): Promise<{
  messageId: number | null;
  raw: TelegramApiResponse;
}> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(12_000),
  });
  const body = (await response.json()) as TelegramApiResponse;
  if (!response.ok || !body.ok) throw new Error(body.description || `Telegram returned ${response.status}`);
  return { messageId: body.result?.message_id ?? null, raw: body };
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<{
  messageId: number | null;
  raw: TelegramApiResponse;
  parts: number;
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const bubbles = splitTelegramBubbles(text);
  if (!bubbles.length) throw new Error("Telegram send failed: empty message");

  try {
    let last: { messageId: number | null; raw: TelegramApiResponse } | null = null;
    for (let i = 0; i < bubbles.length; i++) {
      last = await sendOne(token, chatId, bubbles[i]!);
      // ponytail: fixed gap; jitter if Telegram rate-limits start biting
      if (i < bubbles.length - 1) await new Promise((r) => setTimeout(r, 350));
    }
    return { messageId: last!.messageId, raw: last!.raw, parts: bubbles.length };
  } catch (error) {
    throw new Error(
      `Telegram send failed: ${error instanceof Error ? error.message : "unknown error"}`,
      { cause: error },
    );
  }
}
