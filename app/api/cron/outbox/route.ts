import { drainTelegramOutbox } from "@/messaging/outbox";
import { runCron } from "@/app/api/cron/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runCron(request, "Outbox", () => drainTelegramOutbox(undefined, 50));
}
