import {
  claimWorldTickRun,
  commitWorldTick,
  ensurePersistentWorld,
  ensureScheduleBlocks,
  failWorldTickRun,
  getWorldState,
  listScheduleBlocksForDate,
  listRecentPhysicalWorldEvents,
  listWorldCompanions,
  worldStateRowToDomain,
} from "@/db/worldRepo";
import { zonedDateKey } from "@/lib/time";
import { DEFAULT_CHARACTER_PROFILE } from "@/seed/world";
import {
  applyEventConsequences,
  generateOrdinaryWorldEvent,
  validatePhysicalWorldEvent,
} from "@/world/events";
import { evaluateTripFeasibility } from "@/world/feasibility";
import { placeDistanceMeters } from "@/world/places";
import { buildDailySchedule } from "@/world/planner";
import { createSeededRandom, createWorldSeed, seededChoice } from "@/world/random";
import {
  getCompletedTickWindow,
  reduceOfflineGap,
  reduceWorldTick,
} from "@/world/reducer";
import type { CharacterProfile } from "@/core/types";
import type {
  KnownPlaceRow,
  WorldCharacterRow,
  WorldStateRow,
} from "@/db/schema";
import type { ScheduleBlock, WorldEvent } from "@/world/types";

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
};

function profileOrDefault(value: CharacterProfile | undefined) {
  return value ?? DEFAULT_CHARACTER_PROFILE;
}

function selectOptionalPlace(places: KnownPlaceRow[], companionId: string, localDate: string) {
  const weekDay = new Date(`${localDate}T00:00:00+08:00`).getUTCDay();
  const isWeekend = weekDay === 0 || weekDay === 6;
  const origin = places.find(
    (place) => place.metadataJson.placeRole === (isWeekend ? "home" : "work"),
  );
  const candidates = places.filter(
    (place) =>
      place.status === "want_to_visit" &&
      place.canonicalKey !== DEFAULT_CHARACTER_PROFILE.homePlaceKey &&
      place.canonicalKey !== DEFAULT_CHARACTER_PROFILE.workPlaceKey &&
      (estimatedTravelMinutes(origin, place) ?? Number.POSITIVE_INFINITY) <= 60,
  );
  return seededChoice(candidates, createWorldSeed(companionId, localDate, "optional-place-v1"));
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

  const optional = selectOptionalPlace(input.places, input.companionId, localDate);
  const planned = buildDailySchedule({
    companionId: input.companionId,
    date: input.at,
    homeLocationId: input.homePlaceId,
    workLocationId: input.workPlaceId,
    optionalLocationId: optional?.id,
    seed: createWorldSeed(input.companionId, localDate, ENGINE_VERSION, "daily-plan"),
    correlationId: input.correlationId,
  });
  return {
    schedule: await ensureScheduleBlocks(input.companionId, planned, input.correlationId),
    created: true,
  };
}

function activeBlockAt(schedule: ScheduleBlock[], at: Date) {
  const instant = at.getTime() - 1;
  return schedule.find(
    (block) =>
      block.status !== "cancelled" &&
      block.startAt.getTime() <= instant &&
      block.endAt.getTime() > instant,
  );
}

function estimatedTravelMinutes(first: KnownPlaceRow | undefined, second: KnownPlaceRow | undefined) {
  if (!first || !second) return undefined;
  if (first.id === second.id) return 0;
  const distance = placeDistanceMeters(
    { latitude: first.latitude ?? undefined, longitude: first.longitude ?? undefined },
    { latitude: second.latitude ?? undefined, longitude: second.longitude ?? undefined },
  );
  return distance === undefined ? undefined : Math.ceil(10 + distance / 350);
}

async function ordinaryEventForTick(input: {
  companionId: string;
  correlationId: string;
  randomSeed: string;
  occurredAt: Date;
  schedule: ScheduleBlock[];
  places: KnownPlaceRow[];
  characters: WorldCharacterRow[];
}): Promise<WorldEvent | null> {
  const active = activeBlockAt(input.schedule, input.occurredAt);
  if (!active?.locationId || active.type === "sleep" || active.type === "commute") return null;
  const place = input.places.find((candidate) => candidate.id === active.locationId);
  if (!place) return null;

  const existingEvents = await listRecentPhysicalWorldEvents(
    input.companionId,
    new Date(input.occurredAt.getTime() - 36 * 60 * 60_000),
  );
  let event = generateOrdinaryWorldEvent({
    companionId: input.companionId,
    occurredAt: input.occurredAt,
    locationId: active.locationId,
    scheduleType: active.type,
    correlationId: input.correlationId,
    seed: createWorldSeed(input.randomSeed, "ordinary-event"),
    existingEvents,
  });
  if (!event) return null;

  if (active.type === "work" && createSeededRandom(`${input.randomSeed}:character`)() < 0.35) {
    const coworker = seededChoice(
      input.characters.filter((character) => character.relationshipType === "coworker"),
      createWorldSeed(input.randomSeed, "coworker"),
    );
    if (coworker) {
      event = {
        ...event,
        causeType: "character_interaction",
        causeId: `character:${coworker.id}:${event.causeId ?? "ordinary"}`,
        characterIds: [coworker.id],
      };
    }
  }

  const privateRoutinePlace =
    place.metadataJson.placeRole === "home" || place.metadataJson.placeRole === "work";
  const remainingMinutes = Math.max(
    0,
    (active.endAt.getTime() - input.occurredAt.getTime()) / 60_000,
  );
  const feasibility = evaluateTripFeasibility({
    currentLocationId: active.locationId,
    destinationLocationId: active.locationId,
    currentTime: input.occurredAt,
    visitStartAt: input.occurredAt,
    travelMinutes: 0,
    estimatedCost: 0,
    maximumCost: 120,
    availableWindowMinutes: remainingMinutes,
    minimumVisitMinutes: 0,
    openingStatus: privateRoutinePlace ? "open" : "unknown",
    weatherRisk: 0,
    reservationRequired: false,
    scheduleAllows: true,
  });
  const previous = existingEvents[0];
  const previousPlace = previous?.locationId
    ? input.places.find((candidate) => candidate.id === previous.locationId)
    : undefined;
  const validation = validatePhysicalWorldEvent({
    authority: "world_engine",
    event,
    destinationLocationId: active.locationId,
    feasibility,
    scheduleBlock: active,
    knownPlaceIds: input.places.map((candidate) => candidate.id),
    previousPhysicalEvent: previous,
    travelMinutesFromPrevious: estimatedTravelMinutes(previousPlace, place),
  });
  return validation.valid ? event : null;
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

    await commitWorldTick({
      claim,
      expectedState: input.stateRow,
      result: reduced,
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
      const worldEvent = await ordinaryEventForTick({
        companionId: companion.id,
        correlationId: claim.correlationId,
        randomSeed,
        occurredAt: windowEnd,
        schedule: reduced.schedule,
        places: context.places,
        characters: context.characters,
      });
      if (worldEvent) {
        const consequences = applyEventConsequences(reduced.state, worldEvent);
        reduced.state = consequences.state;
        reduced.stateChanges.push(...consequences.stateChanges);
      }
      if (created) reduced.state.lastDailyPlanAt = windowEnd;
      stateRow = await commitWorldTick({
        claim,
        expectedState: stateRow,
        result: reduced,
        mode: "detailed",
        worldEvent,
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
      results.push(await runCompanionTick(companion, completedEnd));
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
