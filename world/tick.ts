import {
  claimWorldTickRun,
  commitWorldTick,
  ensurePersistentWorld,
  failWorldTickRun,
  getWorldState,
  listScheduleBlocksForDate,
  listWorldCompanions,
  worldStateRowToDomain,
} from "@/db/worldRepo";
import { processAwaitingReplyTimeouts } from "@/db/awaitingReplyRepo";
import { getCompanionState } from "@/db/repo";
import { applyWeatherScheduleAdjustment } from "@/db/weatherRepo";
import { ingestBeijingExternalInformation } from "@/world/providers/service";
import { zonedDateKey } from "@/lib/time";
import { DEFAULT_CHARACTER_PROFILE } from "@/seed/world";
import { createWorldSeed, deterministicUuid } from "@/world/random";
import {
  getCompletedTickWindow,
  reduceOfflineGap,
  reduceWorldTick,
} from "@/world/reducer";
import type { CharacterProfile } from "@/core/types";
import type { KnownPlaceRow, WorldStateRow } from "@/db/schema";
import type { PlannedWorldEvent, ScheduleBlock, WorldEvent } from "@/world/types";
import { activeIntervalAt } from "@/platform/time";
import { generateDailyLifePlan, selectPlannedEventForTick } from "@/world/dailyPlan";
import {
  applyWorldEventToCompanionState,
  reduceCompanionStateForTime,
} from "@/psyche/stateReducer";

const ENGINE_VERSION = "world-v1";
const TICK_MS = 15 * 60_000;
const MAX_DETAILED_GAP_MS = 7 * 24 * 60 * 60_000;
// A normal cron is one window behind at most. The cap prevents a six-day
// outage from turning one Railway job into hundreds of transactions; later
// cron invocations resume from the persisted boundary without losing time.
const MAX_WINDOWS_PER_RUN = 96;

type CompanionTickResult = {
  companionId: string;
  processedWindows: number;
  aggregated: boolean;
  remainingWindows: number;
  status: "advanced" | "up_to_date" | "busy" | "failed";
  error?: string;
  awaitingRepliesProcessed?: number;
  externalIngestion?: { status: string; inserted: number; failures: string[] };
  weatherScheduleAdjusted?: boolean;
};

function profileOrDefault(value: CharacterProfile | undefined) {
  return value ?? DEFAULT_CHARACTER_PROFILE;
}

async function scheduleForDate(input: {
  companionId: string;
  profile: CharacterProfile;
  places: KnownPlaceRow[];
  homePlaceId: string;
  workPlaceId: string;
  at: Date;
  correlationId: string;
}) {
  const localDate = zonedDateKey(input.at, input.profile.timeZone);
  const existing = await listScheduleBlocksForDate(input.companionId, localDate);
  if (existing.length > 0) return { schedule: existing, created: false };

  await generateDailyLifePlan(input.companionId, localDate);
  return {
    schedule: await listScheduleBlocksForDate(input.companionId, localDate),
    created: true,
  };
}

const activeBlockAt = activeIntervalAt<ScheduleBlock>;

function materializePlannedEvent(
  planned: PlannedWorldEvent,
  occurredAt: Date,
  correlationId: string,
): WorldEvent {
  const key = `planned-event:${planned.idempotencyKey}`;
  return {
    id: deterministicUuid(key),
    companionId: planned.companionId,
    realityLayer: "physical",
    idempotencyKey: key,
    correlationId,
    characterIds: planned.characterIds,
    type: planned.eventType,
    title: planned.title,
    description: planned.description,
    occurredAt,
    locationId: planned.locationId,
    causeType: planned.characterIds.length ? "character_interaction" : "schedule",
    causeId: planned.id,
    emotionalImpact: planned.emotionalImpact,
    consequences: planned.consequences,
    importance: planned.importance,
    sharePotential: planned.sharePotential,
    randomSeed: planned.idempotencyKey,
  };
}

async function runAggregateCatchUp(input: {
  stateRow: WorldStateRow;
  completedEnd: Date;
  profile: CharacterProfile;
  places: KnownPlaceRow[];
  homePlaceId: string;
  workPlaceId: string;
}) {
  const randomSeed = createWorldSeed(
    input.stateRow.companionId,
    input.stateRow.lastWorldTickAt.toISOString(),
    input.completedEnd.toISOString(),
    ENGINE_VERSION,
    "aggregate",
  );
  const claimResult = await claimWorldTickRun({
    companionId: input.stateRow.companionId,
    windowStart: input.stateRow.lastWorldTickAt,
    windowEnd: input.completedEnd,
    randomSeed,
    engineVersion: ENGINE_VERSION,
  });
  if (claimResult.status !== "claimed") return claimResult.status;

  const { claim } = claimResult;
  try {
    const { schedule, created } = await scheduleForDate({
      companionId: input.stateRow.companionId,
      profile: input.profile,
      places: input.places,
      homePlaceId: input.homePlaceId,
      workPlaceId: input.workPlaceId,
      at: new Date(input.completedEnd.getTime() - 1),
      correlationId: claim.correlationId,
    });
    const reduced = reduceOfflineGap({
      state: worldStateRowToDomain(input.stateRow),
      schedule,
      until: input.completedEnd,
      correlationId: claim.correlationId,
    });
    const active = activeBlockAt(schedule, input.completedEnd);
    reduced.state.currentLocationId = active?.locationId ?? input.homePlaceId;
    reduced.state.currentActivityId = active?.id;
    reduced.state.currentScheduleBlockId = active?.id;
    if (created) reduced.state.lastDailyPlanAt = input.completedEnd;
    const expectedCompanionState = await getCompanionState(input.stateRow.companionId);
    const psychology = reduceCompanionStateForTime({
      state: expectedCompanionState,
      active,
      hours: Math.max(0, (input.completedEnd.getTime() - input.stateRow.lastWorldTickAt.getTime()) / 3_600_000),
      occurredAt: input.completedEnd,
      correlationId: claim.correlationId,
    });

    await commitWorldTick({
      claim,
      expectedState: input.stateRow,
      result: reduced,
      expectedCompanionState,
      companionState: psychology.state,
      companionStateChanges: psychology.changes,
      mode: "aggregate",
    });
    return "completed" as const;
  } catch (error) {
    await failWorldTickRun(claim, error).catch(() => false);
    throw error;
  }
}

async function runCompanionTick(
  companion: Awaited<ReturnType<typeof listWorldCompanions>>[number],
  completedEnd: Date,
): Promise<CompanionTickResult> {
  const profile = profileOrDefault(companion.configJson.character.profile);
  const context = await ensurePersistentWorld(companion.id, profile);
  let stateRow = context.state;
  if (stateRow.lastWorldTickAt.getTime() >= completedEnd.getTime()) {
    return {
      companionId: companion.id,
      processedWindows: 0,
      aggregated: false,
      remainingWindows: 0,
      status: "up_to_date",
    };
  }

  const gapMs = completedEnd.getTime() - stateRow.lastWorldTickAt.getTime();
  if (gapMs > MAX_DETAILED_GAP_MS) {
    const status = await runAggregateCatchUp({
      stateRow,
      completedEnd,
      profile,
      places: context.places,
      homePlaceId: context.homePlace.id,
      workPlaceId: context.workPlace.id,
    });
    return {
      companionId: companion.id,
      processedWindows: 0,
      aggregated: status === "completed",
      remainingWindows: status === "completed" ? 0 : Math.ceil(gapMs / TICK_MS),
      status: status === "busy" ? "busy" : "advanced",
    };
  }

  let processedWindows = 0;
  while (
    stateRow.lastWorldTickAt.getTime() < completedEnd.getTime() &&
    processedWindows < MAX_WINDOWS_PER_RUN
  ) {
    const windowStart = stateRow.lastWorldTickAt;
    const windowEnd = new Date(windowStart.getTime() + TICK_MS);
    const randomSeed = createWorldSeed(
      companion.id,
      windowStart.toISOString(),
      ENGINE_VERSION,
      "tick",
    );
    const claimResult = await claimWorldTickRun({
      companionId: companion.id,
      windowStart,
      windowEnd,
      randomSeed,
      engineVersion: ENGINE_VERSION,
    });
    if (claimResult.status === "busy") {
      return {
        companionId: companion.id,
        processedWindows,
        aggregated: false,
        remainingWindows: Math.ceil(
          (completedEnd.getTime() - stateRow.lastWorldTickAt.getTime()) / TICK_MS,
        ),
        status: "busy",
      };
    }
    if (claimResult.status === "completed") {
      const current = await getWorldState(companion.id);
      if (!current) throw new Error("World state disappeared after a completed tick");
      stateRow = current;
      continue;
    }

    const { claim } = claimResult;
    try {
      const { schedule, created } = await scheduleForDate({
        companionId: companion.id,
        profile,
        places: context.places,
        homePlaceId: context.homePlace.id,
        workPlaceId: context.workPlace.id,
        at: windowStart,
        correlationId: claim.correlationId,
      });
      const reduced = reduceWorldTick({
        state: worldStateRowToDomain(stateRow),
        schedule,
        windowStart,
        windowEnd,
        correlationId: claim.correlationId,
      });
      const expectedCompanionState = await getCompanionState(companion.id);
      const active = activeBlockAt(reduced.schedule, windowEnd);
      const timePsychology = reduceCompanionStateForTime({
        state: expectedCompanionState,
        active,
        hours: TICK_MS / 3_600_000,
        occurredAt: windowEnd,
        correlationId: claim.correlationId,
      });
      const decision = await selectPlannedEventForTick({
        companionId: companion.id,
        occurredAt: windowEnd,
        mood: timePsychology.state.mood,
        drives: timePsychology.state.drives,
      });
      const worldEvent = decision?.event.status === "selected"
        ? materializePlannedEvent(decision.event, windowEnd, claim.correlationId)
        : null;
      let companionState = timePsychology.state;
      const companionStateChanges = [...timePsychology.changes];
      if (worldEvent) {
        const eventPsychology = applyWorldEventToCompanionState(companionState, worldEvent);
        companionState = eventPsychology.state;
        companionStateChanges.push(...eventPsychology.changes);
      }
      if (created) reduced.state.lastDailyPlanAt = windowEnd;
      stateRow = await commitWorldTick({
        claim,
        expectedState: stateRow,
        result: reduced,
        expectedCompanionState,
        companionState,
        companionStateChanges,
        mode: "detailed",
        worldEvent,
        plannedEvent: decision?.event,
        createThought: decision?.createThought,
      });
      processedWindows += 1;
    } catch (error) {
      await failWorldTickRun(claim, error).catch(() => false);
      throw error;
    }
  }

  const remainingWindows = Math.max(
    0,
    Math.ceil((completedEnd.getTime() - stateRow.lastWorldTickAt.getTime()) / TICK_MS),
  );
  return {
    companionId: companion.id,
    processedWindows,
    aggregated: false,
    remainingWindows,
    status: processedWindows > 0 ? "advanced" : "up_to_date",
  };
}

export async function runWorldTick(now = new Date()) {
  const { windowEnd: completedEnd } = getCompletedTickWindow(now);
  const companions = await listWorldCompanions();
  const results: CompanionTickResult[] = [];

  // Companion count is intentionally small in this product. Sequential work
  // avoids competing row locks and makes audit order deterministic.
  for (const companion of companions) {
    try {
      // Provider I/O happens before the tick transaction. A timeout or provider
      // outage is recorded but must not prevent deterministic schedule progress.
      const ingestionCorrelationId = deterministicUuid(
        createWorldSeed(companion.id, completedEnd.toISOString(), "external-ingestion"),
      );
      const ingestion = await ingestBeijingExternalInformation(
        companion.id,
        ingestionCorrelationId,
        completedEnd,
      ).catch((error) => ({
        status: "failed" as const,
        inserted: 0,
        duplicates: 0,
        failures: [error instanceof Error ? error.message : String(error)],
        weatherRisk: 0,
        weatherSummary: null,
      }));
      const result = await runCompanionTick(companion, completedEnd);
      const weatherAdjustment = ingestion.weatherSummary
        ? await applyWeatherScheduleAdjustment({
            companionId: companion.id,
            now: completedEnd,
            weatherRisk: ingestion.weatherRisk,
            weatherSummary: ingestion.weatherSummary,
          }).catch((error) => ({
            adjusted: false,
            reason: error instanceof Error ? error.message : String(error),
          }))
        : { adjusted: false };
      const awaiting = await processAwaitingReplyTimeouts(
        companion.id,
        completedEnd,
        deterministicUuid(
          createWorldSeed(companion.id, completedEnd.toISOString(), "awaiting-reply-tick"),
        ),
      );
      results.push({
        ...result,
        awaitingRepliesProcessed: awaiting.processed,
        externalIngestion: {
          status: ingestion.status,
          inserted: ingestion.inserted,
          failures: ingestion.failures,
        },
        weatherScheduleAdjusted: weatherAdjustment.adjusted,
      });
    } catch (error) {
      results.push({
        companionId: companion.id,
        processedWindows: 0,
        aggregated: false,
        remainingWindows: 0,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    completedThrough: completedEnd.toISOString(),
    companionCount: results.length,
    advancedCount: results.filter((result) => result.status === "advanced").length,
    failedCount: results.filter((result) => result.status === "failed").length,
    results,
  };
}

export async function catchUpCompanionWorld(companionId: string, now = new Date()) {
  const { windowEnd } = getCompletedTickWindow(now);
  const companion = (await listWorldCompanions()).find((row) => row.id === companionId);
  if (!companion) throw new Error("Companion not found for deterministic world catch-up");
  // This path intentionally excludes providers, awaiting-reply processing and
  // proactive sending. A chat request may repair stale deterministic state but
  // must never turn into an unbounded external-I/O worker.
  return runCompanionTick(companion, windowEnd);
}
