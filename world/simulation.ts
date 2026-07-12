import { createHash } from "node:crypto";
import { INITIAL_STATE } from "@/seed/character";
import { zonedDateKey, zonedMinutes } from "@/lib/time";
import { activeIntervalAt } from "@/platform/time";
import { applyWorldEventToCompanionState, reduceCompanionStateForTime } from "@/psyche/stateReducer";
import { buildDailySchedule } from "@/world/planner";
import { createSeededRandom, createWorldSeed, deterministicUuid } from "@/world/random";
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

function runtimeState(at: Date): WorldState {
  return {
    companionId: "simulation-mira",
    currentTime: at,
    currentLocationId: "home",
    lastWorldTickAt: at,
    version: 0,
  };
}

function eventSlots(seed: string, localDate: string) {
  const random = createSeededRandom(createWorldSeed(seed, localDate, "daily-event-count"));
  const slots = [510, 660, 780, 960, 1140, 1290];
  if (random() < 0.72) slots.push(600);
  if (random() < 0.48) slots.push(1230);
  return slots.sort((a, b) => a - b);
}

function simulatedEvent(input: {
  seed: string;
  localDate: string;
  minute: number;
  index: number;
  at: Date;
  active?: ScheduleBlock;
}): WorldEvent {
  const idempotencyKey = createWorldSeed(input.seed, input.localDate, String(input.index), "planned-event");
  const major = input.index < 2;
  const social = input.index === 1 || input.index === 4;
  return {
    id: deterministicUuid(idempotencyKey),
    companionId: "simulation-mira",
    realityLayer: "physical",
    idempotencyKey,
    correlationId: deterministicUuid(`${idempotencyKey}:correlation`),
    characterIds: social ? [input.index === 1 ? "lin_xia" : "tang_rui"] : [],
    type: input.active?.type === "work" ? "work" : social ? "social" : "routine",
    title: major ? `推进今天的重要事件 ${input.index + 1}` : `生活切片 ${input.index + 1}`,
    description: major ? "这件事改变了后续判断，并留下一个需要继续处理的问题。" : "一件具体的小事让这一天不只是时间表。",
    occurredAt: input.at,
    locationId: input.active?.locationId,
    causeType: social ? "character_interaction" : "schedule",
    emotionalImpact: major
      ? { valence: 0.05, curiosity: 0.04, shareDesire: 0.12 }
      : { valence: 0.01, boredom: -0.02 },
    consequences: [major ? "后续计划因此调整" : "留下一个具体生活印象"],
    importance: major ? 0.75 : 0.3,
    sharePotential: major ? 0.75 : input.index < 4 ? 0.4 : 0.2,
    randomSeed: input.seed,
  };
}

export function simulateWorld(input: { days?: number; seed?: string } = {}): WorldSimulationMetrics {
  const days = Math.max(7, Math.min(30, input.days ?? 30));
  const seed = input.seed ?? "mira-world-v3-regression";
  const startedAt = new Date("2026-07-05T16:00:00.000Z");
  const endAt = new Date(startedAt.getTime() + days * 24 * 60 * 60_000);
  let world = runtimeState(startedAt);
  let psyche = structuredClone(INITIAL_STATE);
  const schedules = new Map<string, ScheduleBlock[]>();
  const events: WorldEvent[] = [];
  const eventsPerDay: Record<string, number> = {};
  const affectRange: WorldSimulationMetrics["affectRange"] = {
    energy: { min: psyche.mood.energy, max: psyche.mood.energy },
    boredom: { min: psyche.mood.boredom, max: psyche.mood.boredom },
    loneliness: { min: psyche.mood.loneliness, max: psyche.mood.loneliness },
    shareDesire: { min: psyche.drives.shareDesire, max: psyche.drives.shareDesire },
  };
  let scheduleConsistencyFailures = 0;
  let shareCandidateCount = 0;
  let eligibleShareCandidateCount = 0;
  let maxShareScore = 0;
  let ticks = 0;

  while (world.lastWorldTickAt < endAt) {
    const windowStart = world.lastWorldTickAt;
    const windowEnd = new Date(windowStart.getTime() + TICK_MS);
    const localDate = zonedDateKey(windowStart);
    let schedule = schedules.get(localDate);
    if (!schedule) {
      schedule = buildDailySchedule({
        companionId: world.companionId,
        date: windowStart,
        homeLocationId: "home",
        workLocationId: "work",
        optionalLocationId: "optional",
        seed: createWorldSeed(seed, localDate, "schedule"),
      });
      schedules.set(localDate, schedule);
    }
    const reduced = reduceWorldTick({ state: world, schedule, windowStart, windowEnd });
    world = reduced.state;
    schedules.set(localDate, reduced.schedule);
    const active = activeIntervalAt(reduced.schedule, windowEnd);
    if ((active?.id ?? undefined) !== world.currentScheduleBlockId) scheduleConsistencyFailures += 1;
    psyche = reduceCompanionStateForTime({
      state: psyche,
      active,
      hours: 0.25,
      occurredAt: windowEnd,
      correlationId: deterministicUuid(`${seed}:${windowStart.toISOString()}`),
    }).state;

    const minute = zonedMinutes(windowEnd);
    const slots = eventSlots(seed, localDate);
    const index = slots.indexOf(minute);
    if (index >= 0) {
      const event = simulatedEvent({ seed, localDate, minute, index, at: windowEnd, active });
      events.push(event);
      eventsPerDay[localDate] = (eventsPerDay[localDate] ?? 0) + 1;
      psyche = applyWorldEventToCompanionState(psyche, event).state;
      const bundle = buildThoughtAndShareCandidate(event, `我对“${event.title}”形成了一个不依赖用户话题的具体判断。`);
      if (bundle?.candidate) {
        shareCandidateCount += 1;
        const evaluation = scoreShareCandidate(bundle.candidate, {
          currentShareDesire: psyche.drives.shareDesire,
          eventImportance: bundle.candidate.eventImportance,
          relationshipTrust: 0.5,
          miraIrritation: psyche.mood.irritation,
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
    for (const [key, value] of [
      ["energy", psyche.mood.energy],
      ["boredom", psyche.mood.boredom],
      ["loneliness", psyche.mood.loneliness],
      ["shareDesire", psyche.drives.shareDesire],
    ] as const) {
      affectRange[key].min = Math.min(affectRange[key].min, value);
      affectRange[key].max = Math.max(affectRange[key].max, value);
    }
    ticks += 1;
  }

  const trace = {
    finalState: { mood: psyche.mood, drives: psyche.drives },
    eventIds: events.map((event) => event.id),
    scheduleIds: [...schedules.values()].flatMap((schedule) => schedule.map((block) => block.id)),
  };
  return {
    days,
    ticks,
    scheduleDays: schedules.size,
    scheduleConsistencyFailures,
    eventCount: events.length,
    ordinaryEventsPerDay: eventsPerDay,
    ordinaryDensityViolations: Object.values(eventsPerDay).filter((count) => count < 6 || count > 8).length,
    shareCandidateCount,
    eligibleShareCandidateCount,
    maxShareScore,
    affectRange,
    replayDigest: createHash("sha256").update(JSON.stringify(trace)).digest("hex"),
  };
}
