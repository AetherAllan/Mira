import assert from "node:assert/strict";
import test from "node:test";
import { simulateWorld } from "@/world/simulation";

test("thirty-day fixed-seed world simulation is stable and keeps six to eight daily events", () => {
  const first = simulateWorld({ days: 30, seed: "regression-30d" });
  const replay = simulateWorld({ days: 30, seed: "regression-30d" });
  assert.deepEqual(first, replay);
  assert.equal(first.ticks, 30 * 24 * 4);
  assert.equal(first.scheduleDays, 30);
  assert.equal(first.scheduleConsistencyFailures, 0);
  assert.equal(first.ordinaryDensityViolations, 0);
  assert.ok(Object.values(first.ordinaryEventsPerDay).every((count) => count >= 6 && count <= 8));
  assert.ok(first.eventCount > 0);
  assert.ok(first.shareCandidateCount > 0);
  assert.ok(first.eligibleShareCandidateCount > 0);
  assert.ok(first.maxShareScore >= 0.62);
  for (const range of Object.values(first.affectRange)) {
    assert.ok(range.min >= 0);
    assert.ok(range.max <= 1);
  }
});
