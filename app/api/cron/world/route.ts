import { runWorldTick } from "@/world/tick";
import { runCron } from "@/app/api/cron/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runCron(request, "World tick", runWorldTick);
}
