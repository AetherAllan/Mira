import assert from "node:assert/strict";
import test from "node:test";
import type { DailyReflection, SeedCard } from "@/core/types";
import { detectCrisis } from "@/psyche/analyzer";
import { applyDailyReflection } from "@/psyche/growthEngine";
import { selectNoveltySeed } from "@/psyche/noveltyEngine";
import { INITIAL_STATE } from "@/seed/character";
import { splitTelegramBubbles } from "@/telegram/client";
import { executeTool } from "@/tools/registry";

test("crisis detection does not depend on the model", () => {
  assert.equal(detectCrisis("我不想活下去了"), true);
  assert.equal(detectCrisis("这个 build 不想活了"), false);
});

test("telegram bubbles split on real and literal newlines", () => {
  assert.deepEqual(splitTelegramBubbles("嗨\n先歇一下"), ["嗨", "先歇一下"]);
  assert.deepEqual(splitTelegramBubbles("嗨\\n先歇一下"), ["嗨", "先歇一下"]);
  assert.deepEqual(splitTelegramBubbles("单条"), ["单条"]);
  assert.deepEqual(splitTelegramBubbles("a\n\n\nb"), ["a", "b"]);
});

test("daily reflection hard-clamps trait drift to 0.01", () => {
  const reflection: DailyReflection = {
    summary: "test",
    reflection: "test",
    moodUpdates: {},
    driveUpdates: {},
    relationshipUpdates: {},
    traitUpdates: { initiative: 0.9, warmth: -0.9 },
    arcUpdates: [],
    tomorrowSeeds: [],
  };
  const result = applyDailyReflection(INITIAL_STATE, reflection);

  assert.equal(result.state.traits.initiative, INITIAL_STATE.traits.initiative + 0.01);
  assert.equal(result.state.traits.warmth, INITIAL_STATE.traits.warmth - 0.01);
});

test("tool registry rejects model-invented tools", async () => {
  const result = await executeTool({ name: "shell", arguments: {} });
  assert.equal(result.ok, false);
  assert.equal(result.error, "Tool is not registered");
});

test("novelty engine prefers unused seeds over heavily used ones", () => {
  const seeds: SeedCard[] = [
    { type: "opinion_seed", text: "used a lot", tags: ["a"], weight: 1, usedCount: 20, lastUsedAt: null },
    { type: "opinion_seed", text: "fresh", tags: ["b"], weight: 1, usedCount: 0, lastUsedAt: null },
  ];
  const counts = { "used a lot": 0, fresh: 0 };
  for (let i = 0; i < 80; i++) {
    const picked = selectNoveltySeed(seeds, {
      state: INITIAL_STATE,
      required: true,
      now: new Date("2026-07-10T12:00:00Z"),
    });
    assert.ok(picked);
    counts[picked!.text as keyof typeof counts] += 1;
  }
  assert.ok(counts.fresh > counts["used a lot"]);
});
