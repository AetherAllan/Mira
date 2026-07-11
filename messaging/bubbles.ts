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

