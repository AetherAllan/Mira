export interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    date?: number;
    text?: string;
    chat?: { id?: number | string; type?: string };
    from?: { id?: number | string; first_name?: string; last_name?: string; username?: string };
  };
}

export interface TelegramTextMessage {
  updateId: number | null;
  messageId: number;
  chatId: string;
  userId: string;
  displayName: string;
  text: string;
  raw: TelegramUpdate;
}

export function parseTelegramTextMessage(update: TelegramUpdate): TelegramTextMessage | null {
  const message = update.message;
  const text = message?.text?.trim();
  if (!message || !text || message.message_id === undefined || message.chat?.id === undefined || message.from?.id === undefined) {
    return null;
  }
  const displayName =
    [message.from.first_name, message.from.last_name].filter(Boolean).join(" ").trim() ||
    message.from.username ||
    "Telegram User";
  return {
    updateId: update.update_id ?? null,
    messageId: message.message_id,
    chatId: String(message.chat.id),
    userId: String(message.from.id),
    displayName,
    text,
    raw: update,
  };
}
