import assert from "node:assert/strict";
import test from "node:test";
import { buildBudgetedActorPrompt, type ActorGroundedContext } from "@/core/promptBuilder";
import { resolveActivityFreshness } from "@/core/actorContextPolicy";
import { DEFAULT_RUNTIME_CONFIG, INITIAL_STATE } from "@/seed/character";

function grounded(): ActorGroundedContext {
  return {
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
    currentLocation: { id: "place-1", name: "某书店", category: "bookstore" },
    currentActivity: null,
    lastConfirmedActivity: null,
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

test("Actor prompt names Beijing wall time and renders schedule locally", () => {
  const context = grounded();
  context.temporal = {
    ...context.temporal,
    observedAtUtc: "2026-07-11T08:00:00.000Z",
    localDateTime: "2026-07-11T16:00:00+08:00",
    localTime: "16:00:00",
    worldAdvancedThroughUtc: "2026-07-11T07:45:00.000Z",
    worldAdvancedThroughLocal: "2026-07-11T15:45:00+08:00",
    worldLagSeconds: 900,
  };
  context.schedule = [{
    id: "afternoon-work",
    title: "下午工作",
    type: "work",
    startAtUtc: "2026-07-11T05:00:00.000Z",
    endAtUtc: "2026-07-11T10:00:00.000Z",
    startLocal: "2026-07-11T13:00:00+08:00",
    endLocal: "2026-07-11T18:00:00+08:00",
    localDate: "2026-07-11",
    timeZone: "Asia/Shanghai",
    locationId: "place-1",
    status: "active",
    changeReason: null,
  }];

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
      reason: "time test",
    },
    memories: [],
    selectedSeed: null,
    cooldownWarnings: [],
    userMessage: "现在几点？",
    groundedContext: context,
  });

  assert.match(result.prompt, /Observed Beijing time: 2026-07-11T16:00:00\+08:00/);
  assert.doesNotMatch(result.prompt, /Observed Beijing time: .*T08:00:00/);
  assert.match(result.prompt, /下午工作: 13:00–18:00, Asia\/Shanghai/);
  assert.match(result.prompt, /World advanced through: 2026-07-11T15:45:00\+08:00/);
});

test("stale world state exposes only the last confirmed activity", () => {
  const block = { id: "morning", title: "上午工作" };
  const stale = resolveActivityFreshness({
    schedule: [block],
    currentScheduleBlockId: block.id,
    worldStateFresh: false,
  });
  assert.equal(stale.currentActivity, undefined);
  assert.equal(stale.lastConfirmedActivity, block);

  const fresh = resolveActivityFreshness({
    schedule: [block],
    currentScheduleBlockId: block.id,
    worldStateFresh: true,
  });
  assert.equal(fresh.currentActivity, block);
  assert.equal(fresh.lastConfirmedActivity, undefined);
});
