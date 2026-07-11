import assert from "node:assert/strict";
import test from "node:test";
import { scoreShareCandidate, shouldSuppressCandidate } from "@/world/share";

const candidate = {
  emotionalIntensity: 0.8,
  relevanceToUser: 0.9,
  novelty: 0.7,
  intimacy: 0.4,
  urgency: 0.6,
  interruptionCost: 0.1,
};

const context = {
  currentShareDesire: 0.5,
  eventImportance: 0.8,
  relationshipTrust: 0.8,
  miraIrritation: 0.2,
  quietHours: false,
  userLikelyBusy: false,
  hasUnansweredProactive: false,
  dailySentCount: 0,
  hoursSinceLastProactive: 10,
};

test("share scoring follows the documented weights", () => {
  const result = scoreShareCandidate(candidate, context);

  assert.ok(Math.abs(result.score - 0.684) < 1e-12);
  assert.equal(result.shouldShare, true);
  assert.deepEqual(result.blockedBy, []);
});

test("hard gates block even a high-scoring candidate", () => {
  const result = scoreShareCandidate(candidate, {
    ...context,
    quietHours: true,
    userLikelyBusy: true,
    hasUnansweredProactive: true,
    dailySentCount: 3,
    hoursSinceLastProactive: 1,
  });

  assert.equal(result.shouldShare, false);
  assert.deepEqual(result.blockedBy, [
    "quiet_hours",
    "user_busy",
    "unanswered_proactive",
    "daily_limit",
    "minimum_interval",
  ]);
});

test("low-value candidates remain pending", () => {
  const result = scoreShareCandidate(
    {
      emotionalIntensity: 0.1,
      relevanceToUser: 0.1,
      novelty: 0.1,
      intimacy: 0.1,
      urgency: 0.1,
      interruptionCost: 0.5,
    },
    context,
  );

  assert.equal(result.shouldShare, false);
  assert.ok(result.blockedBy.includes("below_threshold"));
});

test("a newer equal-priority event cannot suppress a more important candidate", () => {
  assert.equal(
    shouldSuppressCandidate(
      { priority: 60, eventImportance: 0.9 },
      { priority: 60, eventImportance: 0.5 },
    ),
    false,
  );
  assert.equal(
    shouldSuppressCandidate(
      { priority: 60, eventImportance: 0.4 },
      { priority: 60, eventImportance: 0.7 },
    ),
    true,
  );
  assert.equal(
    shouldSuppressCandidate(
      { priority: 80, eventImportance: 0.9 },
      { priority: 20, eventImportance: 0.2 },
    ),
    true,
  );
});
