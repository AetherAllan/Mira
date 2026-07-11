export const DEFAULT_CHAT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
export const DEFAULT_EMBEDDING_MODEL = "nvidia/llama-nemotron-embed-vl-1b-v2:free";

/**
 * Mira deliberately runs only OpenRouter's explicit free model variants.
 * A zero price observed today is not enough: the `:free` id prevents an
 * accidental Settings or environment change from selecting a paid route.
 */
export function isFreeModel(model: string): boolean {
  return model.trim().endsWith(":free");
}

export function requireFreeModel(model: string): string {
  const normalized = model.trim();
  if (!isFreeModel(normalized)) throw new Error("Model must end with :free");
  return normalized;
}

/**
 * Runtime calls fail closed against paid models without taking Telegram
 * offline because of an old database row. Admin writes reject bad input.
 */
export function resolveFreeChatModel(model?: string): string {
  return model?.trim() && isFreeModel(model) ? model.trim() : DEFAULT_CHAT_MODEL;
}
