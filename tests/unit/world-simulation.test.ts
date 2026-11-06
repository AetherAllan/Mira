import assert from "node:assert/strict";
import test from "node:test";
import { simulateWorld } from "@/world/simulation";

test("thirty-day fixed-seed world simulation is stable and keeps six to ten daily events", () => {
  const first = simulateWorld({ days: 30, seed: "regression-30d" });
  const replay = simulateWorld({ days: 30, seed: "regression-30d" });
  assert.deepEqual(first, replay);
  assert.equal(first.ticks, 30 * 24 * 4);
  assert.equal(first.scheduleDays, 30);
  assert.equal(first.scheduleConsistencyFailures, 0);
  assert.equal(first.densityViolations, 0);
  assert.ok(Object.values(first.eventsPerDay).every((count) => count >= 6 && count <= 10));
  assert.ok(first.eventCount > 0);
  assert.ok(first.shareCandidateCount > 0);
  assert.ok(first.eligibleShareCandidateCount > 0);
  assert.ok(first.maxShareScore >= 0.62);
  for (const range of Object.values(first.affectRange)) {
    assert.ok(range.min >= 0);
    assert.ok(range.max <= 1);
  }
});

test("thirty days without the planning model still vary what happens", () => {
  const first = simulateWorld({ days: 30, seed: "variety-30d" });
  // The previous fallback content reached 15 distinct titles over the same run.
  assert.ok(first.distinctEventTitles >= 90, `only ${first.distinctEventTitles} distinct titles`);
  // Every day's two major events stay eligible to be shared.
  assert.equal(first.shareCandidateCount, 60);
  assert.equal(first.eligibleShareCandidateCount, first.shareCandidateCount);
});

test("ordinary events run alongside the plan at about one a day", () => {
  for (const seed of ["ordinary-a", "ordinary-b", "ordinary-c"]) {
    const { ordinaryEventCount, maxOrdinaryEventsPerDay, densityViolations } = simulateWorld({ days: 30, seed });
    assert.ok(ordinaryEventCount >= 15 && ordinaryEventCount <= 50, `${seed} produced ${ordinaryEventCount}`);
    assert.ok(maxOrdinaryEventsPerDay <= 2);
    assert.equal(densityViolations, 0);
  }
});

test("the replay digest covers content and depends on the seed", () => {
  const first = simulateWorld({ days: 7, seed: "digest-a" });
  assert.equal(simulateWorld({ days: 7, seed: "digest-a" }).replayDigest, first.replayDigest);
  assert.notEqual(simulateWorld({ days: 7, seed: "digest-b" }).replayDigest, first.replayDigest);
});
