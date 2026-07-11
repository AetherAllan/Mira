import assert from "node:assert/strict";
import test from "node:test";
import type { ActorOutput } from "@/core/types";
import type { ActorGroundedContext } from "@/core/promptBuilder";
import { validateActorGrounding } from "@/world/grounding";

const context: ActorGroundedContext = {
  currentTime: "2026-07-11T10:00:00.000Z",
  currentLocation: { id: "place-1", name: "书店", category: "bookstore" },
  currentActivity: { id: "schedule-1", title: "逛书店", type: "leisure", startAt: "a", endAt: "b" },
  schedule: [{ id: "schedule-1", title: "逛书店", type: "leisure", startAt: "a", endAt: "b", locationId: "place-1", status: "active", changeReason: null }],
  emotionReasons: {},
  workingMemory: null,
  openLoops: [],
  worldEvents: [{ id: "event-1", locationId: "place-1", characterIds: [] }],
  externalInformation: [{ id: "external-1", title: "北京降雨" }],
  shareCandidate: null,
  recentMessages: [],
  allowedReferenceIds: ["place-1", "schedule-1", "event-1", "external-1"],
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
