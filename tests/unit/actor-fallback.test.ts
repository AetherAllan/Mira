import assert from "node:assert/strict";
import test from "node:test";
import type { ActorGroundedContext } from "@/core/promptBuilder";
import { buildDeterministicActorFallback } from "@/core/runtime/actorRunner";

const context: ActorGroundedContext = {
  temporal: {
    timeZone: "Asia/Shanghai",
    observedAtUtc: "2026-07-11T08:30:00.000Z",
    localDateTime: "2026-07-11T16:30:00+08:00",
    localDate: "2026-07-11",
    localTime: "16:30:00",
    weekday: "Saturday",
    dayPeriod: "afternoon",
    utcOffset: "+08:00",
    worldAdvancedThroughUtc: "2026-07-11T08:15:00.000Z",
    worldAdvancedThroughLocal: "2026-07-11T16:15:00+08:00",
    worldLagSeconds: 900,
    worldStateFresh: true,
  },
  currentLocation: { id: "place-1", name: "某书店", category: "bookstore" },
  currentActivity: {
    id: "schedule-1",
    title: "翻书",
    type: "leisure",
    startAtUtc: "2026-07-11T08:00:00.000Z",
    startLocal: "2026-07-11T16:00:00+08:00",
    endAtUtc: "2026-07-11T09:00:00.000Z",
    endLocal: "2026-07-11T17:00:00+08:00",
    localDate: "2026-07-11",
    timeZone: "Asia/Shanghai",
  },
  lastConfirmedActivity: null,
  schedule: [],
  emotionReasons: {},
  workingMemory: null,
  openLoops: [],
  worldEvents: [],
  externalInformation: [],
  shareCandidate: null,
  recentMessages: [],
  allowedReferenceIds: ["temporal:observed", "place-1", "schedule-1"],
};

test("deterministic actor fallback answers Beijing time with a grounding ref", () => {
  const result = buildDeterministicActorFallback({ userMessage: "现在周几，几点了？", groundedContext: context });
  assert.equal(result.message, "现在是北京时间 2026-07-11 16:30，周六。");
  assert.deepEqual(result.groundingRefs, ["temporal:observed"]);
});

test("deterministic actor fallback uses persisted place and activity", () => {
  const result = buildDeterministicActorFallback({ userMessage: "你现在在哪干嘛？", groundedContext: context });
  assert.equal(result.message, "我现在在某书店，正翻书。");
  assert.deepEqual(result.groundingRefs, ["place-1", "schedule-1"]);
});
