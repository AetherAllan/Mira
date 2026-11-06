import { createHash } from "node:crypto";
import { INITIAL_STATE } from "@/seed/character";
import { INITIAL_WORLD_CHARACTERS } from "@/seed/world";
import { zonedDateKey, zonedMinutes } from "@/lib/time";
import { activeIntervalAt } from "@/platform/time";
import { applyWorldEventToCompanionState, reduceCompanionStateForTime } from "@/psyche/stateReducer";
import type { CompanionState } from "@/core/types";
import type { GeneratedEvent } from "@/world/dailyPlan";
import { ordinaryEventForBlock } from "@/world/events";
import { fallbackPlan } from "@/world/fallbackPlan";
import { decidePlannedCandidate, localMinute } from "@/world/planner";
import { createSeededRandom, createWorldSeed, deterministicUuid } from "@/world/random";
import { reduceWorldTick } from "@/world/reducer";
import { scoreShareCandidate } from "@/world/share";
import { buildThoughtAndShareCandidate } from "@/world/thoughts";
import type { ScheduleBlock, WeekendMode, WorldEvent, WorldState } from "@/world/types";
import { resolveWorkday } from "@/world/workCalendar";

export interface WorldSimulationMetrics {
  days: number;
  ticks: number;
  scheduleDays: number;
  scheduleConsistencyFailures: number;
  eventCount: number;
  eventsPerDay: Record<string, number>;
  /** Days outside six to ten events: six to eight planned, at most two ordinary. */
  densityViolations: number;
  ordinaryEventCount: number;
  maxOrdinaryEventsPerDay: number;
  distinctEventTitles: number;
  shareCandidateCount: number;
  eligibleShareCandidateCount: number;
  maxShareScore: number;
  affectRange: Record<"energy" | "boredom" | "loneliness" | "shareDesire", { min: number; max: number }>;
  replayDigest: string;
}

const TICK_MS = 15 * 60_000;
const MIN_DAILY_EVENTS = 6;
const MAX_DAILY_EVENTS = 10;

function runtimeState(at: Date): WorldState {
  return {
    companionId: "simulation-mira",
    currentTime: at,
    currentLocationId: "home",
    lastWorldTickAt: at,
    version: 0,
  };
}

interface SimulatedPlannedEvent {
  key: string;
  id: string;
  event: GeneratedEvent;
  windowStart: Date;
  windowEnd: Date;
  status: "planned" | "occurred" | "skipped";
}

interface SimulatedDay {
  samplingSeed: number;
  planned: SimulatedPlannedEvent[];
}

/** The same rule `generateDailyLifePlan` applies when it reads Saturday's plan. */
function weekendModeFor(
  seed: string,
  localDate: string,
  saturdayMode: WeekendMode | null,
): WeekendMode | null {
  const weekday = new Date(`${localDate}T12:00:00+08:00`).getUTCDay();
  if (resolveWorkday(localDate).dayType !== "restday") return null;
  if (weekday === 0) return saturdayMode === "outing" ? "flexible" : "outing";
  if (weekday !== 6) return null;
  return createSeededRandom(createWorldSeed(seed, localDate, "weekend-mode"))() < 0.5 ? "outing" : "flexible";
}

function plannedEventsFor(localDate: string, events: readonly GeneratedEvent[]) {
  return events
    .map((event, index): SimulatedPlannedEvent => {
      const key = `simulation-mira:planned:${localDate}:${index}`;
      return {
        key,
        id: deterministicUuid(key),
        event,
        windowStart: localMinute(localDate, event.startMinute),
        windowEnd: localMinute(localDate, event.endMinute),
        status: "planned",
      };
    })
    .sort((left, right) => left.windowStart.getTime() - right.windowStart.getTime());
}

/**
 * The in-memory counterpart of `selectPlannedEventForTick`, which reads the
 * database. Null means nothing was due, leaving the window open to an ordinary
 * event; `occurred: null` means a due candidate was skipped.
 */
function settleDueEvent(day: SimulatedDay, at: Date, psyche: CompanionState) {
  const rows = day.planned.filter((row) => row.status === "planned" && row.windowStart <= at);
  const due = rows.find((row) => row.windowEnd > at) ?? rows.find((row) => row.event.slot === "required");
  if (!due) return null;
  if (due.event.slot === "candidate") {
    const candidates = day.planned.filter((row) => row.event.slot === "candidate");
    const { selected } = decidePlannedCandidate({
      samplingSeed: day.samplingSeed,
      eventId: due.id,
      weight: due.event.weight,
      occurred: candidates.filter((row) => row.status === "occurred").length,
      remaining: candidates.filter((row) => row.status === "planned").length,
      noveltySeeking: psyche.drives.noveltySeeking,
      boredom: psyche.mood.boredom,
      localHour: Math.floor(zonedMinutes(at) / 60),
    });
    if (!selected) {
      due.status = "skipped";
      return { occurred: null };
    }
  }
  due.status = "occurred";
  return { occurred: due };
}

function materializeEvent(planned: SimulatedPlannedEvent, seed: string, at: Date): WorldEvent {
  const { event } = planned;
  const idempotencyKey = `planned-event:${planned.key}`;
  return {
    id: deterministicUuid(idempotencyKey),
    companionId: "simulation-mira",
    realityLayer: "physical",
    idempotencyKey,
    correlationId: deterministicUuid(`${seed}:${idempotencyKey}:correlation`),
    characterIds: event.characterKeys,
    type: event.eventType,
    title: event.title,
    description: event.description,
    occurredAt: at,
    locationId: event.placeKey === "transit" ? undefined : event.placeKey,
    causeType: event.characterKeys.length ? "character_interaction" : "schedule",
    causeId: planned.id,
    emotionalImpact: Object.fromEntries(event.impacts.map((impact) => [impact.dimension, impact.delta])),
    consequences: event.consequences,
    importance: event.importance,
    sharePotential: event.sharePotential,
    randomSeed: planned.key,
  };
}

/**
 * Thirty days with the planning model down: every day runs on `fallbackPlan`,
 * the real selection rule and the real ordinary-event rule, so density and
 * variety are measured, not assumed.
 */
export function simulateWorld(input: { days?: number; seed?: string } = {}): WorldSimulationMetrics {
  const days = Math.max(7, Math.min(30, input.days ?? 30));
  const seed = input.seed ?? "mira-world-v3-regression";
  const startedAt = new Date("2026-07-05T16:00:00.000Z");
  const endAt = new Date(startedAt.getTime() + days * 24 * 60 * 60_000);
  let world = runtimeState(startedAt);
  let psyche = structuredClone(INITIAL_STATE);
  const schedules = new Map<string, ScheduleBlock[]>();
  const planDays = new Map<string, SimulatedDay>();
  const recentPlans: Array<{ theme: string; fingerprintJson: string[] }> = [];
  let previousWeekendMode: WeekendMode | null = null;
  const events: WorldEvent[] = [];
  const eventsPerDay: Record<string, number> = {};
  const ordinaryPerDay: Record<string, number> = {};
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
      const samplingSeed = Number.parseInt(createWorldSeed(seed, localDate, "sampling-seed").slice(0, 8), 16) % 2_147_483_646 + 1;
      const weekendMode = weekendModeFor(seed, localDate, previousWeekendMode);
      previousWeekendMode = weekendMode;
      const plan = fallbackPlan({
        companionId: world.companionId,
        localDate,
        dayType: resolveWorkday(localDate).dayType,
        weekendMode,
        homePlaceId: "home",
        workPlaceId: "work",
        optionalPlaceId: "optional",
        characters: INITIAL_WORLD_CHARACTERS,
        correlationId: deterministicUuid(`${seed}:${localDate}:plan`),
        samplingSeed,
        recentPlans,
      });
      recentPlans.unshift({ theme: plan.generated.theme, fingerprintJson: plan.fingerprints });
      recentPlans.length = Math.min(recentPlans.length, 14);
      planDays.set(localDate, { samplingSeed, planned: plannedEventsFor(localDate, plan.generated.events) });
      schedule = plan.schedule;
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

    const settled = settleDueEvent(planDays.get(localDate)!, windowEnd, psyche);
    const planned = settled?.occurred;
    const event = planned
      ? materializeEvent(planned, seed, windowEnd)
      : settled
        ? null
        : ordinaryEventForBlock({
            companionId: world.companionId,
            block: active,
            occurredAt: windowEnd,
            correlationId: deterministicUuid(`${seed}:${windowStart.toISOString()}:ordinary`),
            tickSeed: createWorldSeed(seed, windowStart.toISOString(), "tick"),
            existingEvents: events,
          });
    if (event) {
      events.push(event);
      eventsPerDay[localDate] = (eventsPerDay[localDate] ?? 0) + 1;
      if (!planned) ordinaryPerDay[localDate] = (ordinaryPerDay[localDate] ?? 0) + 1;
      psyche = applyWorldEventToCompanionState(psyche, event).state;
      const bundle = buildThoughtAndShareCandidate(event, planned?.event.innerNarrative);
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
    eventTitles: events.map((event) => event.title),
    scheduleIds: [...schedules.values()].flatMap((schedule) => schedule.map((block) => block.id)),
  };
  return {
    days,
    ticks,
    scheduleDays: schedules.size,
    scheduleConsistencyFailures,
    eventCount: events.length,
    eventsPerDay,
    densityViolations: Object.values(eventsPerDay)
      .filter((count) => count < MIN_DAILY_EVENTS || count > MAX_DAILY_EVENTS).length,
    ordinaryEventCount: Object.values(ordinaryPerDay).reduce((sum, count) => sum + count, 0),
    maxOrdinaryEventsPerDay: Math.max(0, ...Object.values(ordinaryPerDay)),
    distinctEventTitles: new Set(events.map((event) => event.title)).size,
    shareCandidateCount,
    eligibleShareCandidateCount,
    maxShareScore,
    affectRange,
    replayDigest: createHash("sha256").update(JSON.stringify(trace)).digest("hex"),
  };
}
