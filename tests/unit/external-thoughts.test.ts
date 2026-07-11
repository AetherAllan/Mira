import assert from "node:assert/strict";
import test from "node:test";
import { buildExternalThoughtAndCandidate } from "@/world/externalThoughts";

const fact = {
  id: "00000000-0000-4000-8000-000000000301",
  companionId: "00000000-0000-4000-8000-000000000302",
  title: "北京独立游戏活动公布新日程",
  factualSummary: "来源公布了一场北京独立游戏活动的新日程。",
  category: "beijing_news",
  personalRelevance: 0.8,
  reliability: 0.7,
  novelty: 0.75,
  fetchedAt: new Date("2026-07-11T08:00:00.000Z"),
  correlationId: "00000000-0000-4000-8000-000000000303",
};

test("a relevant sourced hot topic becomes thought before share candidate", () => {
  const first = buildExternalThoughtAndCandidate(fact);
  const replay = buildExternalThoughtAndCandidate(fact);
  assert.ok(first);
  assert.deepEqual(first, replay);
  assert.equal(first.thought.sourceType, "external_information");
  assert.equal(first.candidate.sourceId, fact.id);
  assert.match(first.thought.content, /热度不等于结论/);
  assert.equal(first.candidate.priority, 70);
});

test("low-reliability or irrelevant headlines do not manufacture thoughts", () => {
  assert.equal(buildExternalThoughtAndCandidate({ ...fact, reliability: 0.3 }), null);
  assert.equal(buildExternalThoughtAndCandidate({ ...fact, category: "weather" }), null);
});
