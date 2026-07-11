import assert from "node:assert/strict";
import test from "node:test";
import { evaluateWorldHealth } from "@/world/health";

const observedAt = new Date("2026-07-11T02:00:00.000Z");
const current = {
  id: "work",
  startAt: new Date("2026-07-11T01:00:00.000Z"),
  endAt: new Date("2026-07-11T04:00:00.000Z"),
  status: "active",
};

test("world health is healthy only for one consistent active block", () => {
  const health = evaluateWorldHealth({
    lastWorldTickAt: new Date("2026-07-11T01:45:00.000Z"),
    currentScheduleBlockId: "work",
    schedule: [current],
    latestTickStatus: "completed",
    observedAt,
    timeZone: "Asia/Shanghai",
  });
  assert.equal(health.cronHealthy, true);
  assert.equal(health.currentBlockConsistent, true);
});

test("stale cron, missing schedule, failed tick, and duplicate active blocks are unhealthy", () => {
  const base = {
    lastWorldTickAt: new Date("2026-07-11T01:45:00.000Z"),
    currentScheduleBlockId: "work",
    schedule: [current],
    latestTickStatus: "completed" as const,
    observedAt,
    timeZone: "Asia/Shanghai",
  };
  assert.equal(
    evaluateWorldHealth({ ...base, lastWorldTickAt: new Date("2026-07-11T01:29:59.000Z") }).cronHealthy,
    false,
  );
  assert.equal(evaluateWorldHealth({ ...base, schedule: [] }).cronHealthy, false);
  assert.equal(evaluateWorldHealth({ ...base, latestTickStatus: "failed" }).cronHealthy, false);
  assert.equal(
    evaluateWorldHealth({
      ...base,
      schedule: [current, { ...current, id: "duplicate" }],
    }).cronHealthy,
    false,
  );
});
