import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_STATE } from "@/seed/character";
import { applyWorldEventToCompanionState, reduceCompanionStateForTime } from "@/psyche/stateReducer";
import type { ScheduleBlock, WorldEvent } from "@/world/types";

const correlationId = "00000000-0000-4000-8000-000000000501";
const at = new Date("2026-07-12T04:00:00.000Z");
const work: ScheduleBlock = {
  id: "work-1", companionId: "mira", title: "上午工作", type: "work",
  startAt: new Date(at.getTime() - 60_000), endAt: new Date(at.getTime() + 60_000),
  flexibility: 0.3, interruptionTolerance: 0.3, status: "active", source: "mira_decision",
};

test("schedule and world events update the single psychological state with reasons", () => {
  const tick = reduceCompanionStateForTime({
    state: INITIAL_STATE, active: work, hours: 0.25, occurredAt: at, correlationId,
  });
  assert.ok(tick.state.mood.energy < INITIAL_STATE.mood.energy);
  assert.equal(tick.state.stateReasons.energy?.at(-1)?.sourceId, work.id);

  const event: WorldEvent = {
    id: "00000000-0000-4000-8000-000000000502",
    companionId: "mira",
    realityLayer: "physical",
    idempotencyKey: "planned:test",
    correlationId,
    characterIds: ["lin-xia"],
    type: "work",
    title: "和林夏把分歧说清楚",
    description: "两个人确认了实现边界。",
    occurredAt: at,
    causeType: "character_interaction",
    emotionalImpact: { valence: 0.08, irritation: -0.05, shareDesire: 0.1 },
    consequences: ["接口边界被确认"],
    importance: 0.8,
    sharePotential: 0.75,
  };
  const applied = applyWorldEventToCompanionState(tick.state, event);
  assert.ok(applied.state.mood.valence > tick.state.mood.valence);
  assert.ok(applied.state.drives.shareDesire > tick.state.drives.shareDesire);
  assert.equal(applied.state.stateReasons.valence?.at(-1)?.sourceId, event.id);
  assert.ok(applied.state.stateReasons.valence?.length <= 5);
});
