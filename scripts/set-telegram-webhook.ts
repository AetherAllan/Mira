import "dotenv/config";
import { getTelegramConfig } from "@/lib/config";

const appUrl = process.argv[2]?.replace(/\/$/, "");
if (!appUrl) {
  throw new Error(
    "Usage: bun run telegram:set-webhook -- https://your-service.up.railway.app",
  );
}
if (!appUrl.startsWith("https://")) {
  throw new Error("Telegram webhooks require a public HTTPS URL");
}

const { botToken, webhookSecret } = getTelegramConfig();
const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${appUrl}/api/telegram/webhook`,
    secret_token: webhookSecret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  }),
});

const result = (await response.json().catch(() => ({}))) as {
  ok?: boolean;
  description?: string;
};
if (!response.ok || !result.ok) {
  throw new Error(result.description || `Telegram returned HTTP ${response.status}`);
}

console.log(`Webhook configured: ${appUrl}/api/telegram/webhook`);
