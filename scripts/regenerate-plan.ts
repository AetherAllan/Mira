import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { companions, dailyLifePlans, scheduleBlocks } from "@/db/schema";
import { generateDailyLifePlan } from "@/world/dailyPlan";

const date = process.argv.find((argument) => /^\d{4}-\d{2}-\d{2}$/.test(argument));
if (!date || !process.argv.includes("--confirm")) {
  throw new Error("Usage: bun scripts/regenerate-plan.ts YYYY-MM-DD --confirm");
}

const db = getDb();
try {
  const [companion] = await db.select({ id: companions.id }).from(companions).limit(1);
  if (!companion) throw new Error("No companion exists");
  await db.transaction(async (tx) => {
    await tx.delete(scheduleBlocks).where(and(
      eq(scheduleBlocks.companionId, companion.id),
      eq(scheduleBlocks.localDate, date),
    ));
    await tx.delete(dailyLifePlans).where(and(
      eq(dailyLifePlans.companionId, companion.id),
      eq(dailyLifePlans.localDate, date),
    ));
  });
  console.log(JSON.stringify(await generateDailyLifePlan(companion.id, date), null, 2));
} finally {
  await closeDb();
}
