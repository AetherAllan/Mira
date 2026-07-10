export const dynamic = "force-dynamic";

export function GET() {
  const required = [
    "API_KEY",
    "DATABASE_URL",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_ALLOWED_USER_ID",
    "TELEGRAM_WEBHOOK_SECRET",
    "CRON_SECRET",
    "ADMIN_PASSWORD",
  ];
  const missing = required.filter((name) => !process.env[name]?.trim());

  // Railway's deployment healthcheck verifies that the web process is ready.
  // Configuration readiness remains visible without exposing any secret values.
  return Response.json({
    status: "ok",
    service: "mira",
    configured: missing.length === 0,
  });
}
