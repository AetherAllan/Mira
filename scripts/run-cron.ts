import "dotenv/config";
import { runDailyReflection, runHourlyProactive } from "@/core/runtime";
import { closeDb } from "@/db/client";
import { drainTelegramOutbox } from "@/messaging/outbox";
import { runWorldTick } from "@/world/tick";

const job = process.argv[2];
if (job !== "hourly" && job !== "hourly-daily" && job !== "daily" && job !== "world" && job !== "outbox") {
  throw new Error("Usage: bun scripts/run-cron.ts <hourly|hourly-daily|daily|world|outbox>");
}

// Railway cron services must finish and exit. Calling the runtime directly
// avoids exposing an internal scheduler URL or passing CRON_SECRET over HTTP.
try {
  const result = job === "hourly-daily"
    ? {
        hourly: await runHourlyProactive(),
        // The shared cron runs at minute 50. UTC hour 15 is Beijing 23:50;
        // daily reflection remains idempotent if Railway retries the job.
        daily: new Date().getUTCHours() === 15 ? await runDailyReflection() : null,
      }
    : job === "hourly"
    ? await runHourlyProactive()
    : job === "daily"
      ? await runDailyReflection()
      : job === "world"
        ? await runWorldTick()
      : await drainTelegramOutbox(undefined, 50);
  console.log(JSON.stringify({ job, ok: true, result }));
} finally {
  // Railway cron containers must exit after the short-lived job completes.
  await closeDb();
}
