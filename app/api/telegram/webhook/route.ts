import { handleTelegramMessage } from "@/core/runtime";
import { isAllowedTelegramUser, verifyTelegramSecret } from "@/telegram/verify";
import { parseTelegramTextMessage, type TelegramUpdate } from "@/telegram/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!verifyTelegramSecret(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const message = parseTelegramTextMessage(update);
  if (!message) return Response.json({ ok: true, ignored: "unsupported_update" });
  // Return 200 for a valid Telegram delivery from a non-allowed user. A 403 would
  // make Telegram retry an update that can never become authorized.
  if (!isAllowedTelegramUser(message.userId)) {
    return Response.json({ ok: true, ignored: "user_not_allowed" });
  }

  try {
    const result = await handleTelegramMessage(message);
    // Before a durable outbox exists Telegram must retry if another worker is
    // still processing. Once the reply is enqueued, duplicate deliveries get 200.
    if (result.status === "in_progress") {
      return Response.json({ ok: false, ...result }, {
        status: 503,
        headers: { "Retry-After": "10" },
      });
    }
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("Telegram webhook failed", error);
    return Response.json({ ok: false, error: "runtime_failed" }, { status: 500 });
  }
}
