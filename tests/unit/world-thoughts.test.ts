import assert from "node:assert/strict";
import test from "node:test";
import { buildThoughtAndShareCandidate } from "@/world/thoughts";
import type { WorldEvent } from "@/world/types";

const event: WorldEvent = {
  id: "00000000-0000-4000-8000-000000000201",
  companionId: "mira",
  realityLayer: "physical",
  idempotencyKey: "event:rain-plan-change",
  correlationId: "00000000-0000-4000-8000-000000000202",
  characterIds: [],
  type: "weather",
  title: "雨把晚上的公园计划改掉了",
  description: "下班后没有去公园，改成了附近室内活动。",
  occurredAt: new Date("2026-07-10T10:00:00.000Z"),
  locationId: "studio",
  causeType: "external_information",
  causeId: "weather:rain",
  emotionalImpact: { disappointment: 0.08, curiosity: 0.04 },
  consequences: ["重新选择一个可达的室内地点"],
  importance: 0.7,
  sharePotential: 0.75,
  randomSeed: "rain-fixture",
};

test("a persisted consequential event creates a replayable thought and share candidate", () => {
  const first = buildThoughtAndShareCandidate(event);
  const replay = buildThoughtAndShareCandidate(event);

  assert.ok(first);
  assert.deepEqual(first, replay);
  assert.equal(first.candidate.sourceId, first.thought.id);
  assert.match(first.candidate.contentSummary, /公园计划/);
  assert.equal(first.candidate.status, "pending");
});

test("low-value routine details do not create thought spam", () => {
  assert.equal(
    buildThoughtAndShareCandidate({ ...event, importance: 0.1, sharePotential: 0.1 }),
    null,
  );
});
