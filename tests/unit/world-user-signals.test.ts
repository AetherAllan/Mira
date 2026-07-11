import assert from "node:assert/strict";
import test from "node:test";
import type { MessageAnalysis } from "@/core/types";
import { applyInteractionGrowth } from "@/psyche/growthEngine";
import { INITIAL_STATE } from "@/seed/character";
import { inferWorldSignals } from "@/world/userSignals";

test("heuristic signals preserve recommendations, promises and busy context", () => {
  const now = new Date("2026-07-10T04:00:00.000Z");
  const signals = inferWorldSignals(
    "你周末可以去 UCCA 看看。我明天会告诉你比赛结果，不过我今天很忙，晚点回。",
    now,
  );

  assert.ok(signals.some((item) => item.type === "place_recommendation"));
  assert.ok(signals.some((item) => item.type === "mira_suggestion"));
  assert.ok(signals.some((item) => item.type === "user_commitment" && item.expectedAt));
  assert.ok(signals.some((item) => item.type === "user_busy"));
});

test("a romantic request influences affinity without forcing relationship state", () => {
  const worldSignals = inferWorldSignals("我喜欢你，和我谈恋爱吧");
  const analysis: MessageAnalysis = {
    topics: [{ name: "relationship", confidence: 0.9 }],
    emotion: "warm",
    intent: "relationship_discussion",
    importance: 0.8,
    novelty: 0.6,
    summary: "用户表达恋爱意向。",
    worldSignals,
  };
  const result = applyInteractionGrowth(structuredClone(INITIAL_STATE), analysis);

  assert.equal(result.state.relationship.stage, "new");
  assert.ok(
    result.state.relationship.romanticAffinity > INITIAL_STATE.relationship.romanticAffinity,
  );
  assert.ok(result.state.relationship.romanticAffinity < 0.1);
});
