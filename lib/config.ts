function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getLlmConfig() {
  return {
    baseUrl: (process.env.BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
    apiKey: required("API_KEY"),
    model: process.env.MODEL?.trim() || "openai/gpt-4.1-mini",
  };
}

export function getTelegramConfig() {
  return {
    botToken: required("TELEGRAM_BOT_TOKEN"),
    allowedUserId: required("TELEGRAM_ALLOWED_USER_ID"),
    webhookSecret: required("TELEGRAM_WEBHOOK_SECRET"),
  };
}

export function getCronSecret() {
  return required("CRON_SECRET");
}

export function getAdminPassword() {
  return required("ADMIN_PASSWORD");
}

export function hasDatabaseConfig() {
  return Boolean(process.env.DATABASE_URL?.trim());
}
