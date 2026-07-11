import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { scheduleBlocks, worldStates, worldTickRuns } from "@/db/schema";
import {
  buildTemporalContext,
  intervalContains,
  systemClock,
} from "@/platform/time";

export interface WorldHealth {
  scheduleExistsForToday: boolean;
  lastWorldTickAt: string | null;
  lagSeconds: number | null;
  latestTickStatus: "processing" | "completed" | "failed" | null;
  currentBlockConsistent: boolean;
  cronHealthy: boolean;
  worldStateFresh: boolean;
}

interface HealthScheduleBlock {
  id: string;
  startAt: Date;
  endAt: Date;
  status: string;
}

export function evaluateWorldHealth(input: {
  lastWorldTickAt: Date;
  currentScheduleBlockId: string | null;
  schedule: HealthScheduleBlock[];
  latestTickStatus: WorldHealth["latestTickStatus"];
  observedAt: Date;
  timeZone: string;
}): WorldHealth {
  const temporal = buildTemporalContext({
    observedAt: input.observedAt,
    worldAdvancedThrough: input.lastWorldTickAt,
    timeZone: input.timeZone,
  });
  const blocksAtObservedTime = input.schedule.filter((block) => intervalContains(block, input.observedAt));
  const markedActive = input.schedule.filter((block) => block.status === "active");
  const soleCurrent = blocksAtObservedTime.length === 1 ? blocksAtObservedTime[0] : undefined;
  const currentBlockConsistent =
    temporal.worldStateFresh &&
    markedActive.length === 1 &&
    soleCurrent?.id === markedActive[0]?.id &&
    soleCurrent.id === input.currentScheduleBlockId;
  const scheduleExistsForToday = input.schedule.length > 0;

  return {
    scheduleExistsForToday,
    lastWorldTickAt: input.lastWorldTickAt.toISOString(),
    lagSeconds: temporal.worldLagSeconds,
    latestTickStatus: input.latestTickStatus,
    currentBlockConsistent,
    cronHealthy:
      temporal.worldStateFresh &&
      input.latestTickStatus === "completed" &&
      scheduleExistsForToday &&
      currentBlockConsistent,
    worldStateFresh: temporal.worldStateFresh,
  };
}

export async function getWorldHealth(
  companionId: string,
  timeZone: string,
  observedAt = systemClock.now(),
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
  const latestTickStatus = latestTickRows[0]?.status ?? null;
  return evaluateWorldHealth({
    lastWorldTickAt: state.lastWorldTickAt,
    currentScheduleBlockId: state.currentScheduleBlockId,
    schedule,
    latestTickStatus,
    observedAt,
    timeZone,
  });
}
