import "dotenv/config";
import { runDailyReflection, runHourlyProactive } from "@/core/runtime";

const job = process.argv[2];
if (job !== "hourly" && job !== "daily") {
  throw new Error("Usage: bun scripts/run-cron.ts <hourly|daily>");
}

// Railway cron services must finish and exit. Calling the runtime directly
// avoids exposing an internal scheduler URL or passing CRON_SECRET over HTTP.
const result = job === "hourly"
  ? await runHourlyProactive()
  : await runDailyReflection();

console.log(JSON.stringify({ job, ok: true, result }));
