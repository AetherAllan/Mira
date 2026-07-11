import assert from "node:assert/strict";
import test from "node:test";
import { rankExternalInformation } from "@/core/externalRelevance";

const now = new Date("2026-07-11T08:00:00.000Z");
const base = {
  personalRelevance: 0.6,
  reliability: 0.8,
  novelty: 0.7,
  fetchedAt: now,
};

test("external facts are ranked for the current topic instead of only global relevance", () => {
  const ranked = rankExternalInformation(
    [
      { ...base, title: "北京游戏展消息", factualSummary: "本周有一场独立游戏活动", category: "events" },
      { ...base, personalRelevance: 0.68, title: "北京天气", factualSummary: "今天午后有降雨", category: "weather" },
    ],
    { queryText: "下午下雨吗", topics: ["weather"], now },
  );
  assert.equal(ranked[0]?.category, "weather");
});
