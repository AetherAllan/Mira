import assert from "node:assert/strict";
import test from "node:test";
import {
  generateOrdinaryWorldEvent,
  validatePhysicalWorldEvent,
  type OrdinaryEventDraft,
} from "@/world/events";
import type { ScheduleBlock, TripFeasibility, WorldEvent } from "@/world/types";
import { applyWorldEventToCompanionState } from "@/psyche/stateReducer";
import { INITIAL_STATE } from "@/seed/character";

const occurredAt = new Date("2026-07-10T04:30:00.000Z");

function generated(seed: string, existingEvents: readonly WorldEvent[] = [], draft?: OrdinaryEventDraft) {
  return generateOrdinaryWorldEvent({
    companionId: "mira",
    occurredAt,
    locationId: "studio",
    scheduleType: "work",
    correlationId: "00000000-0000-4000-8000-000000000001",
    seed,
    existingEvents,
    nonTemplateDraft: draft,
    eventChance: 1,
  });
}

const scheduleBlock: ScheduleBlock = {
  id: "work-block",
  companionId: "mira",
  title: "下午工作",
  type: "work",
  startAt: new Date("2026-07-10T02:00:00.000Z"),
  endAt: new Date("2026-07-10T10:00:00.000Z"),
  locationId: "studio",
  flexibility: 0.4,
  interruptionTolerance: 0.5,
  status: "active",
  source: "routine",
};

const feasible: TripFeasibility = {
  reachable: true,
  travelMinutes: 0,
  estimatedCost: 0,
  openingStatus: "open",
  weatherRisk: 0,
  reservationRequired: false,
  availableVisitMinutes: 120,
  rejectionReasons: [],
};

test("ordinary events replay from seed and apply bounded consequences", () => {
  const first = generated("ordinary-seed");
  const replay = generated("ordinary-seed");
  assert.ok(first);
  assert.deepEqual(first, replay);

  const applied = applyWorldEventToCompanionState(INITIAL_STATE, first!);
  assert.equal(applied.state.version, 1);
  assert.ok(applied.changes.length > 0);
  assert.equal(applied.state.stateReasons.boredom?.at(-1)?.sourceId, first!.id);
});

test("ordinary event density is capped at two and non-template at one per Beijing day", () => {
  const first = generated("seed-1")!;
  const second = generated("seed-2", [first])!;
  assert.equal(generated("seed-3", [first, second]), null);

  const draft: OrdinaryEventDraft = {
    type: "work",
    title: "临时换了一个接口字段名",
    description: "改动不大，但需要把相邻调用重新检查一遍。",
    emotionalImpact: { irritation: 0.02 },
    consequences: ["稍后重新运行相关检查"],
    importance: 0.3,
    sharePotential: 0.25,
  };
  const nonTemplate = generated("free-1", [], draft)!;
  assert.equal(generated("free-2", [nonTemplate], draft), null);
});

test("physical events require World Engine authority, schedule grounding and non-teleportation", () => {
  const event = generated("physical")!;
  const valid = validatePhysicalWorldEvent({
    authority: "world_engine",
    event,
    destinationLocationId: "studio",
    feasibility: feasible,
    scheduleBlock,
    knownPlaceIds: ["studio"],
  });
  assert.equal(valid.valid, true);

  const invalid = validatePhysicalWorldEvent({
    authority: "actor",
    event,
    destinationLocationId: "studio",
    feasibility: feasible,
    scheduleBlock,
    previousPhysicalEvent: {
      occurredAt: new Date("2026-07-10T04:20:00.000Z"),
      locationId: "home",
      realityLayer: "physical",
    },
    travelMinutesFromPrevious: 45,
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.reasons.includes("world_engine_authority_required"));
  assert.ok(invalid.reasons.includes("teleportation_risk"));
});
