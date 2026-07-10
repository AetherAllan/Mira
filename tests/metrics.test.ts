import assert from "node:assert/strict";
import test from "node:test";
import {
  computeMirrorIndex,
  computeRepetitionScore,
  computeTopicEntropy,
} from "@/core/metrics";
import { isQuietHours } from "@/lib/time";

test("topic entropy marks a dominant top three as collapse risk", () => {
  const annotations = Array.from({ length: 10 }, (_, index) => ({
    topics: [{ name: index < 8 ? "same_project" : `topic_${index}`, confidence: 0.9 }],
  }));
  const result = computeTopicEntropy(annotations);

  assert.equal(result.collapseRisk, true);
  assert.ok(result.top1Share >= 0.8);
});

test("repetition score reacts to repeated openings and keywords", () => {
  const score = computeRepetitionScore([
    { text: "先说结论：先把 webhook 做完。" },
    { text: "先说结论：先把 webhook 测完。" },
    { text: "先说结论：webhook 必须幂等。" },
  ]);

  assert.ok(score > 0.5);
});

test("mirror index is tag overlap, not prose similarity", () => {
  assert.equal(computeMirrorIndex(["coding", "project"], ["coding", "project"]), 1);
  assert.equal(computeMirrorIndex(["coding"], ["rain"]), 0);
});

test("quiet hours supports a same-day interval", () => {
  const policy = { start: "02:00", end: "09:30", timeZone: "Asia/Tokyo" };
  assert.equal(isQuietHours(new Date("2026-07-10T21:00:00Z"), policy), true); // 06:00 JST
  assert.equal(isQuietHours(new Date("2026-07-10T03:00:00Z"), policy), false); // 12:00 JST
});
