import { timingSafeEqual } from "node:crypto";

function safeEqual(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyTelegramSecret(request: Request): boolean {
  return safeEqual(
    request.headers.get("x-telegram-bot-api-secret-token"),
    process.env.TELEGRAM_WEBHOOK_SECRET,
  );
}

export function isAllowedTelegramUser(userId: string | number): boolean {
  const allowed = process.env.TELEGRAM_ALLOWED_USER_ID;
  return Boolean(allowed) && String(userId) === allowed;
}

export function verifyCronSecret(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  return safeEqual(bearer, process.env.CRON_SECRET);
}
