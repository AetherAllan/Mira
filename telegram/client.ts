interface TelegramApiResponse {
  ok?: boolean;
  description?: string;
  result?: { message_id?: number };
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<{
  messageId: number | null;
  raw: TelegramApiResponse;
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
      signal: AbortSignal.timeout(12_000),
    });
    const body = (await response.json()) as TelegramApiResponse;
    if (!response.ok || !body.ok) throw new Error(body.description || `Telegram returned ${response.status}`);
    return { messageId: body.result?.message_id ?? null, raw: body };
  } catch (error) {
    throw new Error(
      `Telegram send failed: ${error instanceof Error ? error.message : "unknown error"}`,
      { cause: error },
    );
  }
}
