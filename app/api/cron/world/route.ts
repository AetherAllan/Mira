import { runWorldTick } from "@/world/tick";
import { verifyCronSecret } from "@/telegram/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    return Response.json({ ok: true, ...(await runWorldTick()) });
  } catch (error) {
    console.error("World tick cron failed", error);
    return Response.json({ ok: false, error: "cron_failed" }, { status: 500 });
  }
}
