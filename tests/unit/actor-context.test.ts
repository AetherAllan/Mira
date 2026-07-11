import assert from "node:assert/strict";
import test from "node:test";
import { buildBudgetedActorPrompt, type ActorGroundedContext } from "@/core/promptBuilder";
import { DEFAULT_RUNTIME_CONFIG, INITIAL_STATE } from "@/seed/character";

function grounded(): ActorGroundedContext {
  return {
    currentTime: "2026-07-11T10:00:00.000Z",
    currentLocation: { id: "place-1", name: "某书店", category: "bookstore" },
    currentActivity: null,
    schedule: [],
    emotionReasons: {},
    workingMemory: { recentSummary: "working summary" },
    openLoops: [],
    worldEvents: Array.from({ length: 8 }, (_, index) => ({
      id: `event-${index}`,
      description: `event ${index} ${"事".repeat(600)}`,
    })),
    externalInformation: Array.from({ length: 8 }, (_, index) => ({
      id: `external-${index}`,
      factualSummary: `external ${index} ${"闻".repeat(600)}`,
    })),
    shareCandidate: null,
    recentMessages: Array.from({ length: 24 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 ? "assistant" : "user",
      text: `message ${index} ${"话".repeat(800)}`,
      createdAt: new Date(index * 1_000).toISOString(),
    })),
    allowedReferenceIds: ["place-1"],
  };
}

test("Actor context keeps one current message, chronological history and token budget", () => {
  const currentMessage = "CURRENT_MESSAGE_UNIQUE_7f447f";
  const result = buildBudgetedActorPrompt({
    config: DEFAULT_RUNTIME_CONFIG,
    state: INITIAL_STATE,
    plan: {
      action: "reply",
      mode: "quiet_observation",
      memoryBudget: "none",
      noveltyBudget: "none",
      selectedSeed: null,
      toolAllowed: false,
      webAccess: "none",
      styleHints: ["short"],
      reason: "test",
    },
    memories: [],
    selectedSeed: null,
    cooldownWarnings: [],
    userMessage: currentMessage,
    groundedContext: grounded(),
  });

  assert.ok(result.estimatedTokens <= result.tokenBudget);
  assert.equal(result.prompt.split(currentMessage).length - 1, 1);
  assert.ok((result.context?.recentMessages.length ?? 0) >= 16);
  const ids = result.context?.recentMessages.map((message) => Number(message.id.split("-")[1]));
  assert.deepEqual(ids, [...(ids ?? [])].sort((left, right) => left - right));
});
