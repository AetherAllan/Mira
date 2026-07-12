import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "@/db/client";
import { users } from "@/db/schema";
import { ensureCompanionContext } from "@/db/repo";
import { localDateAt } from "@/platform/time";
import { addLocalDays, generateDailyLifePlan } from "@/world/dailyPlan";

if (!process.argv.includes("--confirm")) {
  throw new Error("Refusing destructive reset. Run: bun run reset:world-v3 --confirm");
}

const db = getDb();
try {
  const accounts = await db.select({ telegramUserId: users.telegramUserId }).from(users);
  await db.execute(sql.raw(`
    DO $$
    DECLARE table_list text;
    BEGIN
      SELECT string_agg(format('%I.%I', table_schema, table_name), ', ')
      INTO table_list
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'companion_id'
        AND table_name <> 'companions';
      IF table_list IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';
      END IF;
    END $$;
  `));

  const now = new Date();
  const today = localDateAt(now, "Asia/Shanghai");
  const initialized = [];
  for (const account of accounts) {
    const context = await ensureCompanionContext({ telegramUserId: account.telegramUserId });
    const currentPlan = await generateDailyLifePlan(context.companion.id, today, { notBefore: now });
    const tomorrowPlan = await generateDailyLifePlan(context.companion.id, addLocalDays(today, 1));
    initialized.push({
      companionId: context.companion.id,
      currentPlanId: currentPlan.id,
      tomorrowPlanId: tomorrowPlan.id,
    });
  }
  console.log(JSON.stringify({ reset: true, preservedAccounts: accounts.length, initialized }));
} finally {
  await closeDb();
}
