import type { GeneratedDay, GeneratedEvent } from "@/world/dailyPlan";
import {
  FALLBACK_POOLS,
  FALLBACK_THEMES,
  type FallbackEventVariant,
  type FallbackPoolName,
} from "@/world/fallbackPlanContent";
import { buildDailySchedule, localMinute } from "@/world/planner";
import { createWorldSeed, seededChoice } from "@/world/random";
import type { DailyPlanDayType, WeekendMode } from "@/world/types";

/** Matches the window `validatePlan` checks for event fingerprint overlap. */
const RECENT_PLAN_WINDOW = 7;

interface FallbackSlot {
  pool: FallbackPoolName;
  slot: GeneratedEvent["slot"];
  eventType: GeneratedEvent["eventType"];
  /** Chosen to fall inside the schedule block that matches `placeKey`. */
  startMinute: number;
  placeKey: "home" | "work" | "optional" | "transit";
  importance: number;
}

function slot(
  pool: FallbackPoolName,
  slotType: GeneratedEvent["slot"],
  eventType: GeneratedEvent["eventType"],
  startMinute: number,
  placeKey: FallbackSlot["placeKey"],
  importance: number,
): FallbackSlot {
  return { pool, slot: slotType, eventType, startMinute, placeKey, importance };
}

const WORKDAY_SLOTS: readonly FallbackSlot[] = [
  slot("workMajor", "required", "work", 660, "work", 0.78),
  slot("commute", "required", "travel", 570, "transit", 0.3),
  slot("lunchAtWork", "required", "routine", 750, "work", 0.28),
  slot("homeMorning", "candidate", "routine", 480, "home", 0.24),
  slot("workSmall", "candidate", "work", 930, "work", 0.38),
  slot("smallDetail", "candidate", "routine", 990, "work", 0.2),
];
const WORKDAY_EVENING_HOME: readonly FallbackSlot[] = [
  slot("homeEveningMajor", "required", "social", 1230, "home", 0.7),
  slot("lateHomeSocial", "candidate", "social", 1290, "home", 0.42),
  slot("thoughts", "candidate", "thought", 1320, "home", 0.36),
  slot("bedtime", "candidate", "routine", 1365, "home", 0.22),
];
const WORKDAY_EVENING_OUT: readonly FallbackSlot[] = [
  slot("friendOutMajor", "required", "social", 1230, "optional", 0.7),
  slot("outingSolo", "candidate", "routine", 1290, "optional", 0.42),
  slot("thoughts", "candidate", "thought", 1320, "optional", 0.36),
  slot("homewardTransit", "candidate", "travel", 1365, "transit", 0.22),
];
const RESTDAY_SLOTS: readonly FallbackSlot[] = [
  slot("restdayMorning", "required", "routine", 645, "home", 0.3),
  slot("homeEveningMajor", "required", "social", 1155, "home", 0.7),
  slot("homeMorning", "candidate", "routine", 585, "home", 0.24),
  slot("restdayMidday", "candidate", "social", 720, "home", 0.38),
  slot("lateHomeSocial", "candidate", "social", 1290, "home", 0.42),
  slot("thoughts", "candidate", "thought", 1320, "home", 0.36),
  slot("bedtime", "candidate", "routine", 1365, "home", 0.22),
];
const RESTDAY_AFTERNOON_HOME: readonly FallbackSlot[] = [
  slot("restdayHomeMajor", "required", "social", 870, "home", 0.78),
  slot("restdayHomeSolo", "required", "routine", 960, "home", 0.3),
  slot("smallDetail", "candidate", "routine", 1005, "home", 0.2),
];
const RESTDAY_AFTERNOON_OUT: readonly FallbackSlot[] = [
  slot("friendOutMajor", "required", "social", 870, "optional", 0.78),
  slot("outingSolo", "required", "routine", 960, "optional", 0.3),
  slot("smallDetail", "candidate", "routine", 1005, "optional", 0.2),
];

function fingerprintTitle(title: string) {
  return title.replace(/[\s，。！？、]/g, "").slice(0, 12);
}

export function fingerprints(events: GeneratedEvent[]) {
  return events.map((event) =>
    [
      event.eventType,
      event.placeKey,
      [...event.characterKeys].sort().join("+") || "solo",
      fingerprintTitle(event.title),
    ].join(":"),
  );
}

function normalizeTheme(theme: string) {
  return theme.trim().toLocaleLowerCase();
}

/** Plans-ago index (0 is the latest plan) at which each key was last used. */
function lastUsedIndexes(keysByPlan: ReadonlyArray<readonly string[]>) {
  const lastUsed = new Map<string, number>();
  keysByPlan.forEach((keys, index) => {
    for (const key of keys) if (!lastUsed.has(key)) lastUsed.set(key, index);
  });
  return lastUsed;
}

/**
 * Seeded pick among items unused within the recent window, falling back to the
 * longest-unused item once the whole pool has been used. The choice depends only
 * on the seed and the persisted recent plans, so a retry reproduces it.
 */
function pickFresh<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  lastUsed: ReadonlyMap<string, number>,
  seed: string,
): T {
  const age = (item: T) => lastUsed.get(keyOf(item)) ?? Number.POSITIVE_INFINITY;
  const fresh = items.filter((item) => age(item) >= RECENT_PLAN_WINDOW);
  const oldest = Math.max(...items.map(age));
  const choices = fresh.length > 0 ? fresh : items.filter((item) => age(item) === oldest);
  return seededChoice(choices, seed)!;
}

export interface FallbackPlanInput {
  companionId: string;
  localDate: string;
  dayType: DailyPlanDayType;
  weekendMode: WeekendMode | null;
  homePlaceId: string;
  workPlaceId: string;
  optionalPlaceId?: string;
  characters: ReadonlyArray<{ stableKey: string }>;
  correlationId: string;
  samplingSeed: number;
  notBeforeMinute?: number;
  /** Most recent first, as `generateDailyLifePlan` loads them. */
  recentPlans: ReadonlyArray<{ theme: string; fingerprintJson: readonly string[] }>;
}

/**
 * A complete day that needs no model. `samplingSeed` and `recentPlans` fully
 * determine the result, and the seed is persisted on the plan row.
 */
export function fallbackPlan(input: FallbackPlanInput) {
  const seed = String(input.samplingSeed);
  const schedule = buildDailySchedule({
    companionId: input.companionId,
    date: localMinute(input.localDate, 720),
    homeLocationId: input.homePlaceId,
    workLocationId: input.workPlaceId,
    optionalLocationId: input.optionalPlaceId,
    weekendMode: input.weekendMode ?? undefined,
    dayType: input.dayType,
    seed: createWorldSeed(seed, input.weekendMode ?? input.dayType),
    correlationId: input.correlationId,
  });
  const goingOut = input.optionalPlaceId !== undefined &&
    schedule.some((block) => block.locationId === input.optionalPlaceId);
  const workday = input.dayType === "workday";
  const slots = workday
    ? [...WORKDAY_SLOTS, ...(goingOut ? WORKDAY_EVENING_OUT : WORKDAY_EVENING_HOME)]
    : [...RESTDAY_SLOTS, ...(goingOut ? RESTDAY_AFTERNOON_OUT : RESTDAY_AFTERNOON_HOME)];

  const titleLastUsed = lastUsedIndexes(input.recentPlans.map((plan) =>
    // Compare on the title alone: the same text at another place is still a repeat.
    plan.fingerprintJson.map((fingerprint) => fingerprint.slice(fingerprint.lastIndexOf(":") + 1))));
  const known = new Set(input.characters.map((character) => character.stableKey));
  const generatedEvents = slots.map((item): GeneratedEvent => {
    const pool = FALLBACK_POOLS[item.pool];
    const castable = pool.filter((variant) => (variant.characters ?? []).every((key) => known.has(key)));
    const variant: FallbackEventVariant = pickFresh(
      castable.length > 0 ? castable : pool,
      (candidate) => fingerprintTitle(candidate.title),
      titleLastUsed,
      createWorldSeed(seed, input.localDate, item.pool, String(item.startMinute)),
    );
    const major = item.importance >= 0.65;
    return {
      slot: item.slot,
      eventType: item.eventType,
      title: variant.title,
      description: variant.description,
      startMinute: item.startMinute,
      endMinute: item.startMinute + 45,
      placeKey: item.placeKey,
      characterKeys: (variant.characters ?? []).filter((key) => known.has(key)),
      impacts: (Object.entries(variant.impacts) as Array<[GeneratedEvent["impacts"][number]["dimension"], number]>)
        .map(([dimension, delta]) => ({ dimension, delta })),
      consequences: [variant.consequence],
      innerNarrative: variant.innerNarrative,
      loop: {
        action: major ? "create" : "none",
        topic: variant.title,
        description: variant.description,
        nextAction: variant.nextAction ?? "",
      },
      importance: item.importance,
      sharePotential: major ? 0.72 : 0.32,
      weight: 0.55,
    };
  });

  if (input.notBeforeMinute !== undefined) {
    const first = Math.ceil(Math.max(input.notBeforeMinute, 570) / 15) * 15;
    const last = 1365;
    const step = Math.max(15, Math.floor((last - first) / Math.max(1, generatedEvents.length - 1) / 15) * 15);
    generatedEvents.forEach((item, index) => {
      item.startMinute = Math.min(last, first + index * step);
      item.endMinute = Math.min(1440, item.startMinute + 30);
    });
  }

  const { theme, summary } = pickFresh(
    FALLBACK_THEMES[workday ? "workday" : "restday"],
    (candidate) => normalizeTheme(candidate.theme),
    lastUsedIndexes(input.recentPlans.map((plan) => [normalizeTheme(plan.theme)])),
    createWorldSeed(seed, input.localDate, "theme"),
  );

  const placeKeyById = new Map([[input.homePlaceId, "home"], [input.workPlaceId, "work"]]);
  if (input.optionalPlaceId) placeKeyById.set(input.optionalPlaceId, "optional");
  const midnight = localMinute(input.localDate, 0).getTime();
  const generated: GeneratedDay = {
    theme,
    summary,
    weekendMode: input.weekendMode,
    schedule: schedule.map((block) => ({
      title: block.title,
      type: block.type,
      startMinute: Math.round((block.startAt.getTime() - midnight) / 60_000),
      endMinute: Math.round((block.endAt.getTime() - midnight) / 60_000),
      placeKey: block.locationId ? (placeKeyById.get(block.locationId) ?? "home") : "transit",
    })),
    events: generatedEvents,
  };
  return { generated, schedule, fingerprints: fingerprints(generatedEvents) };
}
