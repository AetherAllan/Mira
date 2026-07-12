function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getTelegramConfig() {
  return {
    botToken: required("TELEGRAM_BOT_TOKEN"),
    allowedUserId: required("TELEGRAM_ALLOWED_USER_ID"),
    webhookSecret: required("TELEGRAM_WEBHOOK_SECRET"),
  };
}

export function getAdminPassword() {
  return required("ADMIN_PASSWORD");
}
