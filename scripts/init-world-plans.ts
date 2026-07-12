import "dotenv/config";
import { closeDb } from "@/db/client";
import { ensureCompanionContext } from "@/db/repo";
import { localDateAt } from "@/platform/time";
import { addLocalDays, generateDailyLifePlan } from "@/world/dailyPlan";

try {
  const context = await ensureCompanionContext();
  const now = new Date();
  const today = localDateAt(now, "Asia/Shanghai");
  const current = await generateDailyLifePlan(context.companion.id, today, { notBefore: now });
  const tomorrow = await generateDailyLifePlan(context.companion.id, addLocalDays(today, 1));
  console.log(JSON.stringify({ current, tomorrow }, null, 2));
} finally {
  await closeDb();
}
