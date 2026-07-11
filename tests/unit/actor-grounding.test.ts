import assert from "node:assert/strict";
import test from "node:test";
import type { ActorOutput } from "@/core/types";
import type { ActorGroundedContext } from "@/core/promptBuilder";
import { validateActorGrounding } from "@/world/grounding";

const context: ActorGroundedContext = {
  temporal: {
    timeZone: "Asia/Shanghai",
    observedAtUtc: "2026-07-11T10:00:00.000Z",
    localDateTime: "2026-07-11T18:00:00+08:00",
    localDate: "2026-07-11",
    localTime: "18:00:00",
    weekday: "Saturday",
    dayPeriod: "evening",
    utcOffset: "+08:00",
    worldAdvancedThroughUtc: "2026-07-11T10:00:00.000Z",
    worldAdvancedThroughLocal: "2026-07-11T18:00:00+08:00",
    worldLagSeconds: 0,
    worldStateFresh: true,
  },
  currentLocation: { id: "place-1", name: "书店", category: "bookstore" },
  currentActivity: {
    id: "schedule-1",
    title: "逛书店",
    type: "leisure",
    startAtUtc: "2026-07-11T09:00:00.000Z",
    startAtLocal: "2026-07-11T17:00:00+08:00",
    endAtUtc: "2026-07-11T11:00:00.000Z",
    endAtLocal: "2026-07-11T19:00:00+08:00",
  },
  lastConfirmedActivity: null,
  schedule: [{ id: "schedule-1", title: "逛书店", type: "leisure", startAtUtc: "2026-07-11T09:00:00.000Z", startAtLocal: "2026-07-11T17:00:00+08:00", endAtUtc: "2026-07-11T11:00:00.000Z", endAtLocal: "2026-07-11T19:00:00+08:00", locationId: "place-1", status: "active", changeReason: null }],
  emotionReasons: {},
  workingMemory: null,
  openLoops: [],
  worldEvents: [{ id: "event-1", locationId: "place-1", characterIds: [] }],
  externalInformation: [{ id: "external-1", title: "北京降雨" }],
  shareCandidate: null,
  recentMessages: [],
  allowedReferenceIds: ["temporal:observed", "place-1", "schedule-1", "event-1", "external-1"],
};

function output(overrides: Partial<ActorOutput> = {}): ActorOutput {
  return {
    message: "我现在在书店。",
    factClaims: [{ type: "world", sourceRefs: ["schedule-1", "place-1"] }],
    groundingRefs: ["schedule-1", "place-1"],
    proposedWorldMutation: null,
    toolCall: null,
    memoryCandidate: null,
    ...overrides,
  };
}

test("Actor may describe a persisted world fact with valid references", () => {
  assert.deepEqual(validateActorGrounding(output(), context), { valid: true, reasons: [] });
});

test("Actor cannot invent a physical visit or smuggle a mutation", () => {
  const result = validateActorGrounding(output({
    message: "我下午去了一个新酒吧。",
    factClaims: [],
    groundingRefs: [],
    proposedWorldMutation: { type: "visit", payload: { place: "new" }, reason: "interesting" },
  }), context);
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes("actor_cannot_propose_world_mutation"));
  assert.ok(result.reasons.includes("physical_experience_claim_is_ungrounded"));
});

test("external facts and personal world facts use separate reference sets", () => {
  const result = validateActorGrounding(output({
    message: "北京今天有雨。",
    factClaims: [{ type: "external", sourceRefs: ["event-1"] }],
    groundingRefs: ["event-1"],
  }), context);
  assert.deepEqual(result.reasons, ["invalid_external_ref:event-1"]);
});

test("grounding catches physical paraphrases without rejecting future intent", () => {
  for (const message of [
    "我刚从书店出来，手里还拿着一杯咖啡。",
    "这会儿在书店门口等雨停。",
    "刚坐完地铁，已经下班了。",
  ]) {
    const result = validateActorGrounding(
      output({ message, factClaims: [], groundingRefs: [] }),
      context,
    );
    assert.ok(result.reasons.includes("physical_experience_claim_is_ungrounded"), message);
  }

  for (const message of [
    "我想去书店，但还没决定。",
    "如果我下午去了书店，应该会待很久。",
    "我在想这场雨什么时候停。",
    "我现在不太想去人多的地方。",
  ]) {
    const result = validateActorGrounding(
      output({ message, factClaims: [], groundingRefs: [] }),
      context,
    );
    assert.equal(result.valid, true, message);
  }
});
