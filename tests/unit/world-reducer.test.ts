import assert from "node:assert/strict";
import test from "node:test";
import { buildDailySchedule, rescheduleScheduleBlock } from "@/world/planner";
import {
  getCompletedTickWindow,
  getTickWindow,
  reduceOfflineGap,
  reduceWorldTick,
} from "@/world/reducer";
import type { WorldState } from "@/world/types";

function initialState(at: Date): WorldState {
  return {
    companionId: "mira",
    currentTime: at,
    currentLocationId: "home",
    energy: 0.5,
    boredom: 0.2,
    curiosity: 0.7,
    loneliness: 0.3,
    irritation: 0.4,
    disappointment: 0.25,
    attachment: 0.5,
    shareDesire: 0.6,
    lastWorldTickAt: at,
    version: 4,
  };
}

test("tick windows are stable fifteen-minute UTC windows", () => {
  const window = getTickWindow(new Date("2026-07-10T02:07:59.000Z"));
  assert.equal(window.windowStart.toISOString(), "2026-07-10T02:00:00.000Z");
  assert.equal(window.windowEnd.toISOString(), "2026-07-10T02:15:00.000Z");
});

test("completed tick window never includes the still-open window", () => {
  const window = getCompletedTickWindow(new Date("2026-07-10T02:07:59.000Z"));
  assert.equal(window.windowStart.toISOString(), "2026-07-10T01:45:00.000Z");
  assert.equal(window.windowEnd.toISOString(), "2026-07-10T02:00:00.000Z");
});

test("world tick advances schedule and applies reasoned natural decay", () => {
  const windowStart = new Date("2026-07-10T01:45:00.000Z"); // 09:45 Beijing.
  const windowEnd = new Date("2026-07-10T02:00:00.000Z");
  const schedule = buildDailySchedule({
    companionId: "mira",
    date: windowStart,
    homeLocationId: "home",
    workLocationId: "studio",
    seed: "tick-fixture",
  });
  const result = reduceWorldTick({ state: initialState(windowStart), schedule, windowStart, windowEnd });

  assert.equal(result.state.currentTime.toISOString(), windowEnd.toISOString());
  assert.equal(result.state.currentLocationId, "studio");
  assert.equal(result.state.version, 5);
  assert.ok(result.state.energy < 0.5);
  assert.ok(result.state.irritation < 0.4);
  assert.ok(result.state.disappointment < 0.25);
  assert.equal(result.schedule.find((block) => block.title === "上午工作")?.status, "active");
  assert.equal(result.schedule.find((block) => block.title === "通勤去工作室")?.status, "completed");
  assert.ok(result.stateChanges.every((change) => change.reason.length > 0));
});

test("world tick is deterministic for the same persisted input", () => {
  const windowStart = new Date("2026-07-10T02:00:00.000Z");
  const windowEnd = new Date("2026-07-10T02:15:00.000Z");
  const schedule = buildDailySchedule({ companionId: "mira", date: windowStart, seed: "same" });
  const state = initialState(windowStart);

  assert.deepEqual(
    reduceWorldTick({ state, schedule, windowStart, windowEnd }),
    reduceWorldTick({ state, schedule, windowStart, windowEnd }),
  );
});

test("world reducer rejects stale or oversized tick windows", () => {
  const windowStart = new Date("2026-07-10T02:00:00.000Z");
  const schedule = buildDailySchedule({ companionId: "mira", date: windowStart, seed: "same" });
  const state = initialState(windowStart);

  assert.throws(
    () =>
      reduceWorldTick({
        state,
        schedule,
        windowStart,
        windowEnd: new Date("2026-07-10T02:30:00.000Z"),
      }),
    /exactly 15 minutes/,
  );
  assert.throws(
    () =>
      reduceWorldTick({
        state: { ...state, lastWorldTickAt: new Date("2026-07-10T01:45:00.000Z") },
        schedule,
        windowStart,
        windowEnd: new Date("2026-07-10T02:15:00.000Z"),
      }),
    /not positioned/,
  );
});

test("a delayed block becomes active at its new start", () => {
  const windowStart = new Date("2026-07-10T02:00:00.000Z"); // 10:00 Beijing.
  const base = buildDailySchedule({ companionId: "mira", date: windowStart, seed: "delay" });
  const work = base.find((block) => block.title === "上午工作")!;
  const schedule = rescheduleScheduleBlock(
    base,
    work.id,
    { startAt: new Date("2026-07-10T02:15:00.000Z"), status: "delayed" },
    "地铁晚点",
  );
  const result = reduceWorldTick({
    state: initialState(windowStart),
    schedule,
    windowStart,
    windowEnd: new Date("2026-07-10T02:15:00.000Z"),
  });

  assert.equal(result.schedule.find((block) => block.id === work.id)?.status, "active");
});

test("offline reduction crosses Beijing midnight with detailed windows", () => {
  const start = new Date("2026-07-10T15:45:00.000Z"); // Friday 23:45 Beijing.
  const until = new Date("2026-07-10T16:15:00.000Z"); // Saturday 00:15 Beijing.
  const schedule = [
    ...buildDailySchedule({ companionId: "mira", date: start, homeLocationId: "home", seed: "fri" }),
    ...buildDailySchedule({ companionId: "mira", date: until, homeLocationId: "home", seed: "sat" }),
  ];
  const result = reduceOfflineGap({ state: initialState(start), schedule, until });

  assert.equal(result.mode, "detailed");
  assert.equal(result.processedWindows, 2);
  assert.equal(result.eventWindowStarts.length, 2);
  assert.equal(result.state.currentTime.toISOString(), until.toISOString());
  assert.equal(result.state.currentLocationId, "home");
});

test("gaps longer than seven days only perform aggregate decay", () => {
  const start = new Date("2026-07-01T00:00:00.000Z");
  const result = reduceOfflineGap({
    state: initialState(start),
    schedule: [],
    until: new Date("2026-07-09T00:00:00.000Z"),
  });

  assert.equal(result.mode, "aggregate_decay");
  assert.equal(result.eventGenerationAllowed, false);
  assert.equal(result.processedWindows, 0);
  assert.deepEqual(result.eventWindowStarts, []);
  assert.ok(result.state.irritation < 0.4);
  assert.equal(result.state.version, 5);
});
