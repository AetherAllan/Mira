import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { scheduleBlocks, worldStates, worldTickRuns } from "@/db/schema";
import { activeIntervalAt, buildTemporalContext } from "@/platform/time";

export interface WorldHealth {
  scheduleExistsForToday: boolean;
  lastWorldTickAt: string | null;
  lagSeconds: number | null;
  latestTickStatus: "processing" | "completed" | "failed" | null;
  currentBlockConsistent: boolean;
  cronHealthy: boolean;
  worldStateFresh: boolean;
}

export async function getWorldHealth(
  companionId: string,
  timeZone: string,
  observedAt = new Date(),
): Promise<WorldHealth> {
  const db = getDb();
  const [stateRows, latestTickRows] = await Promise.all([
    db.select().from(worldStates).where(eq(worldStates.companionId, companionId)).limit(1),
    db
      .select({ status: worldTickRuns.status })
      .from(worldTickRuns)
      .where(eq(worldTickRuns.companionId, companionId))
      .orderBy(desc(worldTickRuns.windowStart), desc(worldTickRuns.id))
      .limit(1),
  ]);
  const state = stateRows[0];
  if (!state) {
    return {
      scheduleExistsForToday: false,
      lastWorldTickAt: null,
      lagSeconds: null,
      latestTickStatus: latestTickRows[0]?.status ?? null,
      currentBlockConsistent: false,
      cronHealthy: false,
      worldStateFresh: false,
    };
  }

  const temporal = buildTemporalContext({
    observedAt,
    worldAdvancedThrough: state.lastWorldTickAt,
    timeZone,
  });
  const schedule = await db
    .select()
    .from(scheduleBlocks)
    .where(
      and(
        eq(scheduleBlocks.companionId, companionId),
        eq(scheduleBlocks.localDate, temporal.localDate),
      ),
    )
    .orderBy(scheduleBlocks.startAt);
  const active = activeIntervalAt(schedule, observedAt);
  const currentBlockConsistent =
    temporal.worldStateFresh &&
    Boolean(active) &&
    active?.id === state.currentScheduleBlockId &&
    active.status === "active";
  const latestTickStatus = latestTickRows[0]?.status ?? null;

  return {
    scheduleExistsForToday: schedule.length > 0,
    lastWorldTickAt: state.lastWorldTickAt.toISOString(),
    lagSeconds: temporal.worldLagSeconds,
    latestTickStatus,
    currentBlockConsistent,
    cronHealthy:
      temporal.worldStateFresh &&
      latestTickStatus !== "failed" &&
      schedule.length > 0 &&
      currentBlockConsistent,
    worldStateFresh: temporal.worldStateFresh,
  };
}

