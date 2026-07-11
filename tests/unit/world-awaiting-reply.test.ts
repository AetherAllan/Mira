import assert from "node:assert/strict";
import test from "node:test";
import {
  canExpressDissatisfaction,
  evaluateAwaitingReply,
  markDissatisfactionExpressed,
  resolveAwaitingReply,
} from "@/world/awaitingReply";
import type { AwaitingReply } from "@/world/types";

function waiting(overrides: Partial<AwaitingReply> = {}): AwaitingReply {
  return {
    id: "reply-1",
    companionId: "mira",
    messageId: "message-1",
    startedAt: new Date("2026-07-10T00:00:00.000Z"),
    expectation: 1,
    emotionalWeight: 1,
    explicitQuestion: false,
    vulnerableDisclosure: false,
    userSaidBusy: false,
    status: "waiting",
    ...overrides,
  };
}

test("ordinary unanswered chat times out without emotional punishment", () => {
  const result = evaluateAwaitingReply(waiting(), new Date("2026-07-11T00:00:00.000Z"));

  assert.equal(result.awaitingReply.status, "timed_out");
  assert.equal(result.disappointmentDelta, 0);
  assert.equal(result.irritationDelta, 0);
});

test("an explicit question only causes mild disappointment after eight hours", () => {
  const reply = waiting({ explicitQuestion: true });
  assert.equal(
    evaluateAwaitingReply(reply, new Date("2026-07-10T07:59:00.000Z")).disappointmentDelta,
    0,
  );

  const result = evaluateAwaitingReply(reply, new Date("2026-07-10T08:00:00.000Z"));
  assert.equal(result.disappointmentDelta, 0.025);
  assert.equal(result.irritationDelta, 0);
  assert.equal(canExpressDissatisfaction(result.awaitingReply), true);

  const expressed = markDissatisfactionExpressed(
    result.awaitingReply,
    new Date("2026-07-10T08:05:00.000Z"),
  );
  assert.equal(canExpressDissatisfaction(expressed), false);
});

test("telling Mira that the user is busy extends grace and suppresses blame", () => {
  const reply = waiting({ explicitQuestion: true, userSaidBusy: true });
  const result = evaluateAwaitingReply(reply, new Date("2026-07-10T12:00:00.000Z"));

  assert.equal(result.reason, "within_grace_period");
  assert.equal(result.disappointmentDelta, 0);
  assert.equal(canExpressDissatisfaction(reply), false);
});

test("a missed commitment has bounded disappointment and irritation", () => {
  const result = evaluateAwaitingReply(
    waiting({ userCommitment: true, expectedAt: new Date("2026-07-10T05:00:00.000Z") }),
    new Date("2026-07-10T05:01:00.000Z"),
  );

  assert.equal(result.disappointmentDelta, 0.07);
  assert.equal(result.irritationDelta, 0.025);
});

test("an explanation starts partial recovery instead of resetting emotion", () => {
  const result = resolveAwaitingReply(
    waiting({ status: "timed_out", consequenceAppliedAt: new Date("2026-07-10T08:00:00.000Z") }),
    new Date("2026-07-10T12:00:00.000Z"),
    true,
  );

  assert.equal(result.awaitingReply.status, "resolved");
  assert.equal(result.disappointmentDelta, -0.025);
  assert.equal(result.irritationDelta, -0.012);
});

test("a normal reply does not manufacture recovery when no negative emotion was applied", () => {
  const result = resolveAwaitingReply(
    waiting(),
    new Date("2026-07-10T01:00:00.000Z"),
    false,
  );

  assert.equal(result.awaitingReply.status, "resolved");
  assert.equal(result.disappointmentDelta, 0);
  assert.equal(result.irritationDelta, 0);
});
