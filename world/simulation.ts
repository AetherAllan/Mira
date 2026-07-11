import { createHash } from "node:crypto";
import { zonedDateKey, zonedMinutes } from "@/lib/time";
import { activeIntervalAt } from "@/platform/time";
import { applyEventConsequences, generateOrdinaryWorldEvent } from "@/world/events";
import { buildDailySchedule } from "@/world/planner";
import { createWorldSeed, deterministicUuid } from "@/world/random";
import { reduceWorldTick } from "@/world/reducer";
import { scoreShareCandidate } from "@/world/share";
import { buildThoughtAndShareCandidate } from "@/world/thoughts";
import type { ScheduleBlock, WorldEvent, WorldState } from "@/world/types";

export interface WorldSimulationMetrics {
  days: number;
  ticks: number;
  scheduleDays: number;
  scheduleConsistencyFailures: number;
  eventCount: number;
  ordinaryEventsPerDay: Record<string, number>;
  ordinaryDensityViolations: number;
  shareCandidateCount: number;
  eligibleShareCandidateCount: number;
  maxShareScore: number;
  affectRange: Record<"energy" | "boredom" | "loneliness" | "shareDesire", { min: number; max: number }>;
  replayDigest: string;
}

const TICK_MS = 15 * 60_000;
const AFFECTS = ["energy", "boredom", "loneliness", "shareDesire"] as const;

function initialState(at: Date): WorldState {
  return {
    companionId: "simulation-mira",
    currentTime: at,
    currentLocationId: "home",
    energy: 0.55,
    boredom: 0.18,
    curiosity: 0.7,
    loneliness: 0.12,
    irritation: 0,
    disappointment: 0,
    attachment: 0.3,
    shareDesire: 0.45,
    lastWorldTickAt: at,
    version: 0,
  };
}

function weatherScenario(
  dayIndex: number,
  at: Date,
  active: ScheduleBlock | undefined,
  seed: string,
): WorldEvent | null {
  if (dayIndex !== 4 || zonedMinutes(at) !== 19 * 60 + 30 || !active?.locationId) return null;
  const idempotencyKey = createWorldSeed(seed, "weather-plan-change");
  return {
    id: deterministicUuid(idempotencyKey),
    companionId: "simulation-mira",
    realityLayer: "physical",
    idempotencyKey,
    correlationId: deterministicUuid(`${idempotencyKey}:correlation`),
    characterIds: [],
    type: "weather",
    title: "降雨改变了晚间安排",
    description: "原定的室外活动因持续降雨改成了附近室内活动。",
    occurredAt: at,
    locationId: active.locationId,
    causeType: "external_information",
    causeId: "simulation:open-meteo:rain",
    emotionalImpact: { disappointment: 0.08, curiosity: 0.06, shareDesire: 0.1 },
    consequences: ["重新选择一个可达的室内地点"],
    importance: 0.75,
    sharePotential: 0.8,
    randomSeed: seed,
  };
}

export function simulateWorld(input: { days?: number; seed?: string } = {}): WorldSimulationMetrics {
  const days = Math.max(7, Math.min(14, input.days ?? 14));
  const seed = input.seed ?? "mira-world-regression-v1";
  const startedAt = new Date("2026-07-05T16:00:00.000Z"); // Beijing Monday midnight.
  const endAt = new Date(startedAt.getTime() + days * 24 * 60 * 60_000);
  let state = initialState(startedAt);
  const schedules = new Map<string, ScheduleBlock[]>();
  const events: WorldEvent[] = [];
  const ordinaryEventsPerDay: Record<string, number> = {};
  const affectRange = Object.fromEntries(
    AFFECTS.map((affect) => [affect, { min: state[affect], max: state[affect] }]),
  ) as WorldSimulationMetrics["affectRange"];
  let scheduleConsistencyFailures = 0;
  let shareCandidateCount = 0;
  let eligibleShareCandidateCount = 0;
  let maxShareScore = 0;
  let ticks = 0;

  while (state.lastWorldTickAt < endAt) {
    const windowStart = state.lastWorldTickAt;
    const windowEnd = new Date(windowStart.getTime() + TICK_MS);
    const localDate = zonedDateKey(windowStart);
    let schedule = schedules.get(localDate);
    if (!schedule) {
      schedule = buildDailySchedule({
        companionId: state.companionId,
        date: windowStart,
        homeLocationId: "home",
        workLocationId: "work",
        optionalLocationId: "optional",
        seed: createWorldSeed(seed, localDate, "schedule"),
      });
      schedules.set(localDate, schedule);
    }
    const reduced = reduceWorldTick({ state, schedule, windowStart, windowEnd });
    state = reduced.state;
    schedules.set(localDate, reduced.schedule);
    const active = activeIntervalAt(reduced.schedule, windowEnd);
    if ((active?.id ?? undefined) !== state.currentScheduleBlockId) {
      scheduleConsistencyFailures += 1;
    }

    const dayIndex = Math.floor((windowEnd.getTime() - startedAt.getTime()) / (24 * 60 * 60_000));
    const eventSeed = createWorldSeed(seed, windowStart.toISOString(), "ordinary");
    const ordinary = active?.locationId
      ? generateOrdinaryWorldEvent({
          companionId: state.companionId,
          occurredAt: windowEnd,
          locationId: active.locationId,
          scheduleType: active.type,
          correlationId: deterministicUuid(`${eventSeed}:correlation`),
          seed: eventSeed,
          existingEvents: events,
        })
      : null;
    const event = ordinary ?? weatherScenario(dayIndex, windowEnd, active, seed);
    if (event) {
      events.push(event);
      state = applyEventConsequences(state, event).state;
      if (event.idempotencyKey.startsWith("ordinary:")) {
        const eventDate = zonedDateKey(event.occurredAt);
        ordinaryEventsPerDay[eventDate] = (ordinaryEventsPerDay[eventDate] ?? 0) + 1;
      }
      const bundle = buildThoughtAndShareCandidate(event);
      if (bundle) {
        shareCandidateCount += 1;
        const evaluation = scoreShareCandidate(bundle.candidate, {
          currentShareDesire: state.shareDesire,
          eventImportance: bundle.candidate.eventImportance,
          relationshipTrust: 0.35,
          miraIrritation: state.irritation,
          quietHours: false,
          userLikelyBusy: false,
          hasUnansweredProactive: false,
          dailySentCount: 0,
          hoursSinceLastProactive: 12,
        });
        maxShareScore = Math.max(maxShareScore, evaluation.score);
        if (evaluation.shouldShare) eligibleShareCandidateCount += 1;
      }
    }
    for (const affect of AFFECTS) {
      affectRange[affect].min = Math.min(affectRange[affect].min, state[affect]);
      affectRange[affect].max = Math.max(affectRange[affect].max, state[affect]);
    }
    ticks += 1;
  }

  const trace = {
    finalState: AFFECTS.map((affect) => [affect, state[affect]]),
    eventIds: events.map((event) => event.id),
    scheduleIds: [...schedules.values()].flatMap((schedule) => schedule.map((block) => block.id)),
  };
  return {
    days,
    ticks,
    scheduleDays: schedules.size,
    scheduleConsistencyFailures,
    eventCount: events.length,
    ordinaryEventsPerDay,
    ordinaryDensityViolations: Object.values(ordinaryEventsPerDay).filter((count) => count > 2).length,
    shareCandidateCount,
    eligibleShareCandidateCount,
    maxShareScore,
    affectRange,
    replayDigest: createHash("sha256").update(JSON.stringify(trace)).digest("hex"),
  };
}

