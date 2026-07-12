import "dotenv/config";
import { count, desc, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import {
  companionStates,
  companions,
  dailyLifePlans,
  innerThoughts,
  llmUsageLogs,
  memories,
  messages,
  openLoops,
  plannedWorldEvents,
  promptContextSnapshots,
  shareCandidates,
  worldCharacters,
  worldEvents,
  worldStates,
} from "@/db/schema";

const db = getDb();
try {
  const [companion] = await db.select({ id: companions.id }).from(companions).limit(1);
  if (!companion) throw new Error("No companion exists");
  const tables = {
    messages, companionStates, worldStates, worldCharacters, dailyLifePlans,
    plannedWorldEvents, worldEvents, memories, openLoops, innerThoughts, shareCandidates,
  };
  const counts = Object.fromEntries(await Promise.all(Object.entries(tables).map(async ([name, table]) => {
    const [row] = await db.select({ value: count() }).from(table).where(eq(table.companionId, companion.id));
    return [name, row?.value ?? 0];
  })));
  const plans = await db.select().from(dailyLifePlans)
    .where(eq(dailyLifePlans.companionId, companion.id))
    .orderBy(desc(dailyLifePlans.localDate));
  const planEvents = await db.execute(sql`
    SELECT p.local_date, e.slot, e.status, COUNT(*)::int AS count,
      MIN(e.window_start) AS first_window, MAX(e.window_end) AS last_window
    FROM daily_life_plans p JOIN planned_world_events e ON e.plan_id = p.id
    WHERE p.companion_id = ${companion.id}::uuid
    GROUP BY p.local_date, e.slot, e.status
    ORDER BY p.local_date, e.slot, e.status
  `);
  const llm = await db.select({
    category: llmUsageLogs.category,
    generationId: llmUsageLogs.generationId,
    requestStored: sql<boolean>`${llmUsageLogs.requestJson} IS NOT NULL`,
    responseStored: sql<boolean>`${llmUsageLogs.responseJson} IS NOT NULL`,
    usedFallback: llmUsageLogs.usedFallback,
    error: llmUsageLogs.error,
    createdAt: llmUsageLogs.createdAt,
  }).from(llmUsageLogs).where(eq(llmUsageLogs.companionId, companion.id))
    .orderBy(desc(llmUsageLogs.createdAt)).limit(10);
  const recentMessages = await db.select({
    role: messages.role,
    text: messages.text,
    createdAt: messages.createdAt,
  }).from(messages).where(eq(messages.companionId, companion.id))
    .orderBy(desc(messages.createdAt)).limit(4);
  const promptContexts = await db.select({
    purpose: promptContextSnapshots.purpose,
    selectedIds: promptContextSnapshots.selectedIdsJson,
    estimatedTokens: promptContextSnapshots.estimatedTokens,
    tokenBudget: promptContextSnapshots.tokenBudget,
    contextHash: promptContextSnapshots.contextHash,
    createdAt: promptContextSnapshots.createdAt,
  }).from(promptContextSnapshots).where(eq(promptContextSnapshots.companionId, companion.id))
    .orderBy(desc(promptContextSnapshots.createdAt)).limit(2);
  const [legacy] = await db.execute(sql`SELECT to_regclass('public.event_seeds') AS event_seeds`);
  console.log(JSON.stringify({ counts, plans, planEvents, recentMessages, promptContexts, llm, legacy }, null, 2));
} finally {
  await closeDb();
}
