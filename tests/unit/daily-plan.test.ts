import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeGeneratedDay,
  type GeneratedDay,
  type GeneratedEvent,
} from "@/world/dailyPlan";

function event(index: number): GeneratedEvent {
  return {
    slot: index < 2 ? "required" : "candidate",
    eventType: index === 0 ? "work" : "routine",
    title: `AI 生活事件 ${index}`,
    description: `具体生活内容 ${index}`,
    startMinute: index === 0 ? 100 : 600 + index * 45,
    endMinute: index === 0 ? 90 : 630 + index * 45,
    placeKey: index === 0 ? "invented-place" : "home",
    characterKeys: index === 1 ? ["known", "invented-person"] : [],
    impacts: [{ dimension: "valence", delta: 0.03 }],
    consequences: ["留下后续影响"],
    innerNarrative: `只属于 Mira 的观察 ${index}`,
    loop: { action: "none", topic: "", description: "", nextAction: "" },
    importance: 0.9 - index * 0.08,
    sharePotential: 0.4,
    weight: 0.5,
  };
}

const fallback: GeneratedDay = {
  theme: "规则兜底",
  summary: "只提供合法骨架",
  weekendMode: null,
  schedule: [
    { title: "睡觉", type: "sleep", startMinute: 0, endMinute: 480, placeKey: "home" },
    { title: "上班", type: "work", startMinute: 600, endMinute: 1080, placeKey: "work" },
  ],
  events: Array.from({ length: 10 }, (_, index) => ({
    ...event(index),
    startMinute: 720 + index * 30,
    endMinute: 750 + index * 30,
    placeKey: "home",
  })),
};

test("AI content is retained while hard counts, references and schedule are normalized", () => {
  const generated: GeneratedDay = {
    theme: "AI 生成的具体一天",
    summary: "保留生活内容，不保留错误的硬约束",
    weekendMode: null,
    schedule: [{ title: "错误日程", type: "work", startMinute: 700, endMinute: 710, placeKey: "invented-place" }],
    events: Array.from({ length: 8 }, (_, index) => event(index)),
  };

  const normalized = normalizeGeneratedDay({
    generated,
    fallback,
    knownPlaceKeys: new Set(["home", "work", "transit"]),
    characterKeys: new Set(["known"]),
    notBeforeMinute: 700,
  });

  assert.ok(normalized);
  assert.equal(normalized.theme, generated.theme);
  assert.equal(normalized.weekendMode, null);
  assert.deepEqual(normalized.schedule, fallback.schedule);
  assert.equal(normalized.events.filter((item) => item.slot === "required").length, 4);
  assert.equal(normalized.events.filter((item) => item.slot === "candidate").length, 4);
  assert.equal(normalized.events.filter((item) => item.slot === "required" && item.importance >= 0.65).length, 2);
  assert.equal(normalized.events[0]?.placeKey, "work");
  assert.deepEqual(normalized.events[1]?.characterKeys, ["known"]);
  assert.ok(normalized.events.every((item) => item.startMinute >= 700 && item.endMinute > item.startMinute));
});

test("normalization rejects a day padded with repeated events", () => {
  const repeated = event(0);
  const generated: GeneratedDay = {
    theme: "看起来完整但实际重复",
    summary: "同一件事被复制多次",
    weekendMode: "flexible",
    schedule: fallback.schedule,
    events: Array.from({ length: 10 }, () => ({ ...repeated })),
  };
  assert.equal(normalizeGeneratedDay({
    generated,
    fallback,
    knownPlaceKeys: new Set(["home", "work", "transit"]),
    characterKeys: new Set(),
  }), null);
});
