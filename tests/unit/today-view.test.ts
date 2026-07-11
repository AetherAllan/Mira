import assert from "node:assert/strict";
import test from "node:test";
import { buildTodayWorldView } from "@/world/todayView";
import type { WorldHealth } from "@/world/health";

const staleHealth: WorldHealth = {
  scheduleExistsForToday: true,
  lastWorldTickAt: "2026-07-11T07:00:00.000Z",
  lagSeconds: 3_600,
  latestTickStatus: "completed",
  currentBlockConsistent: false,
  cronHealthy: false,
  worldStateFresh: false,
};

test("Today never labels stale activity or location as current", () => {
  const view = buildTodayWorldView({
    observedAt: new Date("2026-07-11T08:00:00.000Z"),
    timeZone: "Asia/Shanghai",
    lastWorldTickAt: new Date("2026-07-11T07:00:00.000Z"),
    currentScheduleBlockId: "old-block",
    currentLocationId: "old-place",
    schedule: [{ id: "old-block", title: "早晨活动" }],
    places: [{ id: "old-place", name: "上次地点" }],
    health: staleHealth,
  });

  assert.equal(view.temporal.localTime, "16:00:00");
  assert.equal(view.temporal.worldAdvancedThroughLocal, "2026-07-11T15:00:00+08:00");
  assert.equal(view.currentBlock, null);
  assert.equal(view.currentPlace, null);
  assert.equal(view.lastConfirmedPlace?.name, "上次地点");
});
