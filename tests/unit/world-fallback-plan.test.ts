import assert from "node:assert/strict";
import test from "node:test";
import { addLocalDays, validatePlan } from "@/world/dailyPlan";
import { fallbackPlan, fingerprints, type FallbackPlanInput } from "@/world/fallbackPlan";
import { FALLBACK_POOLS, FALLBACK_THEMES } from "@/world/fallbackPlanContent";
import { INITIAL_WORLD_CHARACTERS } from "@/seed/world";
import type { DailyPlanDayType, WeekendMode } from "@/world/types";
import { resolveWorkday } from "@/world/workCalendar";

const PLACE_IDS = new Map([["home", "home-id"], ["work", "work-id"], ["optional", "optional-id"]]);
const CHARACTER_KEYS = new Set(INITIAL_WORLD_CHARACTERS.map((character) => character.stableKey));
const IMPACT_KEYS = new Set([
  "valence", "energy", "curiosity", "concern", "playfulness", "boredom",
  "loneliness", "irritation", "disappointment", "affection", "aestheticUrge",
  "noveltySeeking", "shareDesire",
]);

type RecentPlan = { theme: string; fingerprintJson: string[] };

function plan(overrides: Partial<FallbackPlanInput> & Pick<FallbackPlanInput, "localDate" | "dayType">) {
  return fallbackPlan({
    companionId: "mira",
    weekendMode: null,
    homePlaceId: "home-id",
    workPlaceId: "work-id",
    optionalPlaceId: "optional-id",
    characters: INITIAL_WORLD_CHARACTERS,
    correlationId: "00000000-0000-4000-8000-000000000001",
    samplingSeed: 12345,
    recentPlans: [],
    ...overrides,
  });
}

function validate(
  input: { localDate: string; dayType: DailyPlanDayType; weekendMode: WeekendMode | null; recentPlans: RecentPlan[]; notBeforeMinute?: number },
  generated: ReturnType<typeof plan>["generated"],
) {
  return validatePlan({
    generated,
    companionId: "mira",
    placeIdByKey: PLACE_IDS,
    characterKeys: CHARACTER_KEYS,
    correlationId: "00000000-0000-4000-8000-000000000001",
    ...input,
  }).errors;
}

function overlap(left: readonly string[], right: readonly string[]) {
  const a = new Set(left);
  const hits = [...new Set(right)].filter((value) => a.has(value)).length;
  return hits / Math.max(1, Math.min(a.size, new Set(right).size));
}

function weekendModeOn(date: string, dayType: DailyPlanDayType, seed: number): WeekendMode | null {
  const weekday = new Date(`${date}T12:00:00+08:00`).getUTCDay();
  if (dayType !== "restday" || (weekday !== 0 && weekday !== 6)) return null;
  return (seed + weekday) % 2 === 0 ? "outing" : "flexible";
}

/** Consecutive fallback days along the real work calendar. */
function fallbackRun(start: string, days: number, baseSeed: number) {
  const recentPlans: RecentPlan[] = [];
  const results: Array<{
    localDate: string;
    dayType: DailyPlanDayType;
    weekendMode: WeekendMode | null;
    errors: string[];
    maxOverlapInWindow: number;
    generated: ReturnType<typeof plan>["generated"];
    fingerprints: string[];
  }> = [];
  let localDate = start;
  for (let index = 0; index < days; index += 1) {
    const { dayType } = resolveWorkday(localDate);
    const weekendMode = weekendModeOn(localDate, dayType, baseSeed);
    const result = plan({ localDate, dayType, weekendMode, samplingSeed: baseSeed + index * 7919, recentPlans });
    results.push({
      localDate,
      dayType,
      weekendMode,
      errors: validate({ localDate, dayType, weekendMode, recentPlans }, result.generated),
      maxOverlapInWindow: Math.max(0, ...recentPlans.slice(0, 7).map((recent) => overlap(result.fingerprints, recent.fingerprintJson))),
      generated: result.generated,
      fingerprints: result.fingerprints,
    });
    recentPlans.unshift({ theme: result.generated.theme, fingerprintJson: result.fingerprints });
    recentPlans.length = Math.min(recentPlans.length, 14);
    localDate = addLocalDays(localDate, 1);
  }
  return results;
}

test("a fallback plan replays exactly from its seed and recent plans", () => {
  const input = { localDate: "2026-07-07", dayType: "workday" as const, samplingSeed: 777 };
  assert.deepEqual(plan(input).generated, plan(input).generated);
  assert.deepEqual(plan(input).fingerprints, plan(input).fingerprints);
});

test("different seeds choose different fallback days", () => {
  const titles = new Set(
    Array.from({ length: 8 }, (_, index) =>
      plan({ localDate: "2026-07-07", dayType: "workday", samplingSeed: index + 1 }).generated.events
        .map((event) => event.title).join("|")),
  );
  assert.ok(titles.size >= 6, `expected varied days, got ${titles.size} of 8`);
});

test("thirty consecutive fallback days keep fingerprints apart and pass every plan rule", () => {
  for (const baseSeed of [1, 4242, 987654]) {
    const run = fallbackRun("2026-07-06", 30, baseSeed);
    for (const day of run) {
      assert.deepEqual(day.errors, [], `${day.localDate} failed validation`);
      assert.ok(
        day.maxOverlapInWindow <= 0.2,
        `${day.localDate} overlaps a recent plan by ${day.maxOverlapInWindow}`,
      );
    }
    const titles = new Set(run.flatMap((day) => day.generated.events.map((event) => event.title)));
    assert.ok(titles.size >= 100, `expected a wide spread of titles, got ${titles.size}`);
  }
});

test("a week of fallback days repeats no event and no theme", () => {
  const week = fallbackRun("2026-07-06", 7, 99);
  const titles = week.flatMap((day) => day.generated.events.map((event) => event.title));
  assert.equal(new Set(titles).size, titles.length);
  const themes = week.map((day) => day.generated.theme);
  assert.equal(new Set(themes).size, themes.length);
});

test("the plan rules still hold when every day has the same shape", () => {
  // Without an optional place every day stays home, the fewest pools a plan can draw on.
  for (const dayType of ["workday", "restday"] as const) {
    const recentPlans: RecentPlan[] = [];
    let localDate = "2026-08-03";
    for (let index = 0; index < 21; index += 1) {
      const result = plan({ localDate, dayType, samplingSeed: 31 + index, recentPlans, optionalPlaceId: undefined });
      assert.deepEqual(
        validate({ localDate, dayType, weekendMode: null, recentPlans }, result.generated),
        [],
        `${dayType} day ${index} failed validation`,
      );
      recentPlans.unshift({ theme: result.generated.theme, fingerprintJson: result.fingerprints });
      recentPlans.length = Math.min(recentPlans.length, 14);
      localDate = addLocalDays(localDate, 1);
    }
  }
});

test("a fallback plan avoids what a model-written recent plan already used", () => {
  const first = plan({ localDate: "2026-07-07", dayType: "workday", samplingSeed: 5 });
  const next = plan({
    localDate: "2026-07-07",
    dayType: "workday",
    samplingSeed: 5,
    recentPlans: [{ theme: first.generated.theme, fingerprintJson: first.fingerprints }],
  });
  assert.notEqual(next.generated.theme, first.generated.theme);
  const earlier = new Set(first.generated.events.map((event) => event.title));
  assert.equal(next.generated.events.filter((event) => earlier.has(event.title)).length, 0);
});

test("a repeated title is avoided even at another place or with other people", () => {
  const source = plan({ localDate: "2026-07-07", dayType: "workday", samplingSeed: 5 }).generated.events;
  const moved = fingerprints(source.map((event) => ({ ...event, placeKey: "elsewhere", characterKeys: ["someone"] })));
  const next = plan({
    localDate: "2026-07-07",
    dayType: "workday",
    samplingSeed: 5,
    recentPlans: [{ theme: "别的主题", fingerprintJson: moved }],
  });
  const earlier = new Set(source.map((event) => event.title));
  assert.equal(next.generated.events.filter((event) => earlier.has(event.title)).length, 0);
});

test("events sit in the schedule block at their own place", () => {
  for (const baseSeed of [3, 8080]) {
    for (const day of fallbackRun("2026-07-06", 30, baseSeed)) {
      for (const event of day.generated.events) {
        const block = day.generated.schedule.find(
          (item) => item.startMinute <= event.startMinute && event.startMinute < item.endMinute,
        );
        assert.ok(block, `${day.localDate} has no block at minute ${event.startMinute}`);
        assert.notEqual(block.type, "sleep", `${event.title} happens during sleep`);
        assert.equal(event.placeKey, block.placeKey, `${day.localDate} ${event.title} is not in ${block.title}`);
      }
    }
  }
});

test("a bootstrap day starts after the given minute and stays valid", () => {
  for (const notBeforeMinute of [9 * 60, 13 * 60, 17 * 60 + 40, 20 * 60]) {
    const input = { localDate: "2026-07-07", dayType: "workday" as const, weekendMode: null, notBeforeMinute };
    const result = plan(input);
    assert.deepEqual(validate({ ...input, recentPlans: [] }, result.generated), []);
    assert.ok(result.generated.events.every((event) => event.startMinute >= notBeforeMinute));
  }
});

test("variants naming an unknown character are skipped", () => {
  const result = plan({ localDate: "2026-07-07", dayType: "workday", characters: [{ stableKey: "lin_xia" }] });
  const keys = result.generated.events.flatMap((event) => event.characterKeys);
  assert.ok(keys.every((key) => key === "lin_xia"));
  assert.deepEqual(
    validatePlan({
      generated: result.generated,
      companionId: "mira",
      localDate: "2026-07-07",
      dayType: "workday",
      weekendMode: null,
      placeIdByKey: PLACE_IDS,
      characterKeys: new Set(["lin_xia"]),
      recentPlans: [],
      correlationId: "00000000-0000-4000-8000-000000000001",
    }).errors,
    [],
  );
});

test("fallback content stays unique, grounded and within the plan's limits", () => {
  const variants = Object.entries(FALLBACK_POOLS).flatMap(([pool, items]) =>
    items.map((item) => ({ pool, ...item })));
  const keys = variants.map((item) => item.title.replace(/[\s，。！？、]/g, "").slice(0, 12));
  assert.equal(new Set(keys).size, keys.length, "titles must differ within the fingerprint's 12 characters");

  for (const item of variants) {
    assert.ok(item.title && item.description && item.innerNarrative && item.consequence, item.title);
    assert.ok(Object.keys(item.impacts).length > 0, `${item.title} has no impact`);
    for (const [dimension, delta] of Object.entries(item.impacts)) {
      assert.ok(IMPACT_KEYS.has(dimension), `${item.title} uses unknown impact ${dimension}`);
      assert.ok(Math.abs(delta) <= 0.2, `${item.title} has an out-of-range impact`);
    }
    for (const key of item.characters ?? []) assert.ok(CHARACTER_KEYS.has(key), `${item.title} names ${key}`);
    const text = [item.title, item.description, item.innerNarrative, item.consequence].join("");
    assert.doesNotMatch(text, /恋|暧昧|约会|表白|心动|男友|女友/, `${item.title} is not a friendship`);
    assert.doesNotMatch(text, /下雨|雨后|下雪|晴天|大风|太阳/, `${item.title} states the weather`);
  }

  for (const pool of ["workMajor", "homeEveningMajor", "friendOutMajor", "restdayHomeMajor"] as const) {
    for (const item of FALLBACK_POOLS[pool]) {
      assert.ok(item.nextAction, `${item.title} opens a loop with nowhere to go`);
      // Share scoring reads the strongest impact; a weaker one drops a major event below the gate.
      assert.ok(
        Math.max(...Object.values(item.impacts).map(Math.abs)) >= 0.05,
        `${item.title} is too mild for a major event`,
      );
    }
  }

  for (const [name, pool] of Object.entries(FALLBACK_POOLS)) {
    assert.ok(pool.length >= 6, `${name} is too small to rotate`);
  }
  for (const themes of Object.values(FALLBACK_THEMES)) {
    assert.ok(themes.length >= 4, "themes must outlast the three-day repeat rule");
  }
});
