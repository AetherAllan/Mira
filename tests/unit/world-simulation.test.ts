import assert from "node:assert/strict";
import test from "node:test";
import { simulateWorld } from "@/world/simulation";

test("fourteen-day fixed-seed world simulation is stable and bounded", () => {
  const first = simulateWorld({ days: 14, seed: "regression-14d" });
  const replay = simulateWorld({ days: 14, seed: "regression-14d" });
  assert.deepEqual(first, replay);
  assert.equal(first.ticks, 14 * 24 * 4);
  assert.equal(first.scheduleDays, 14);
  assert.equal(first.scheduleConsistencyFailures, 0);
  assert.equal(first.ordinaryDensityViolations, 0);
  assert.ok(first.eventCount > 0);
  assert.ok(first.shareCandidateCount > 0);
  assert.ok(first.eligibleShareCandidateCount > 0);
  assert.ok(first.maxShareScore >= 0.62);
  for (const range of Object.values(first.affectRange)) {
    assert.ok(range.min >= 0);
    assert.ok(range.max <= 1);
  }
});

