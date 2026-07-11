import "dotenv/config";
import { runDailyReflection, runHourlyProactive } from "@/core/runtime";
import { closeDb } from "@/db/client";
import { drainTelegramOutbox } from "@/messaging/outbox";

const job = process.argv[2];
if (job !== "hourly" && job !== "daily" && job !== "outbox") {
  throw new Error("Usage: bun scripts/run-cron.ts <hourly|daily|outbox>");
}

// Railway cron services must finish and exit. Calling the runtime directly
// avoids exposing an internal scheduler URL or passing CRON_SECRET over HTTP.
try {
  const result = job === "hourly"
    ? await runHourlyProactive()
    : job === "daily"
      ? await runDailyReflection()
      : await drainTelegramOutbox(undefined, 50);
  console.log(JSON.stringify({ job, ok: true, result }));
} finally {
  // Railway cron containers must exit after the short-lived job completes.
  await closeDb();
}
