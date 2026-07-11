import { drainTelegramOutbox } from "@/messaging/outbox";
import { verifyCronSecret } from "@/telegram/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    return Response.json({ ok: true, ...(await drainTelegramOutbox(undefined, 50)) });
  } catch (error) {
    console.error("Outbox cron failed", error);
    return Response.json({ ok: false, error: "cron_failed" }, { status: 500 });
  }
}
