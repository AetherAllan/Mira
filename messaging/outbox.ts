import {
  claimNextOutbox,
  markOutboxDelivered,
  markOutboxFailed,
} from "@/db/messageOutboxRepo";
import {
  sendTelegramBubble,
  TelegramSendError,
} from "@/telegram/client";

export interface OutboxDrainResult {
  delivered: number;
  failed: number;
  unknown: number;
}

/**
 * Drain one logical message in bubble order, or a small global batch for cron.
 * A delivery-unknown row stops the sequence because later bubbles would make
 * the conversation incoherent and could amplify a duplicate.
 */
export async function drainTelegramOutbox(
  messageId?: string,
  maxItems = messageId ? 6 : 20,
): Promise<OutboxDrainResult> {
  const result: OutboxDrainResult = { delivered: 0, failed: 0, unknown: 0 };

  for (let index = 0; index < maxItems; index += 1) {
    const item = await claimNextOutbox(messageId);
    if (!item) break;

    try {
      const sent = await sendTelegramBubble(item.chatId, item.body);
      await markOutboxDelivered({
        id: item.id,
        leaseToken: item.leaseToken,
        messageId: item.messageId,
        telegramMessageId: sent.messageId,
        response: sent.raw,
      });
      result.delivered += 1;
    } catch (error) {
      const telegramError = error instanceof TelegramSendError ? error : null;
      const unknown = telegramError?.outcome === "delivery_unknown";
      await markOutboxFailed({
        id: item.id,
        leaseToken: item.leaseToken,
        messageId: item.messageId,
        error: error instanceof Error ? error.message : "Unknown Telegram error",
        unknown,
        retryable: telegramError?.retryable ?? false,
        retryAfterSeconds: telegramError?.retryAfterSeconds,
      });
      if (unknown) {
        result.unknown += 1;
        break;
      }
      result.failed += 1;
      if (!telegramError?.retryable) break;
    }
  }
  return result;
}
