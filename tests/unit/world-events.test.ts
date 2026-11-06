import assert from "node:assert/strict";
import test from "node:test";
import {
  generateOrdinaryWorldEvent,
  validatePhysicalWorldEvent,
  type OrdinaryEventDraft,
} from "@/world/events";
import { ORDINARY_EVENT_TEMPLATES } from "@/world/ordinaryEventTemplates";
import type { ScheduleBlock, ScheduleBlockType, TripFeasibility, WorldEvent } from "@/world/types";
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
  assert.ok(
    Object.values(applied.state.stateReasons).some((reasons) => reasons?.at(-1)?.sourceId === first!.id),
    "a changed dimension should cite the event as its reason",
  );
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

function templateOf(event: WorldEvent) {
  return event.causeId!.replace("ordinary:template:", "");
}

function ordinaryRun(scheduleType: ScheduleBlockType, days: number, seedPrefix: string) {
  const events: WorldEvent[] = [];
  const dayIndexes: number[] = [];
  for (let day = 0; day < days; day += 1) {
    for (const hour of [1, 7]) {
      const event = generateOrdinaryWorldEvent({
        companionId: "mira",
        occurredAt: new Date(Date.UTC(2026, 6, 6 + day, hour)),
        locationId: "somewhere",
        scheduleType,
        correlationId: "00000000-0000-4000-8000-000000000001",
        seed: `${seedPrefix}:${day}:${hour}`,
        existingEvents: events,
        eventChance: 1,
      });
      assert.ok(event, `${scheduleType} produced nothing on day ${day}`);
      events.push(event);
      dayIndexes.push(day);
    }
  }
  return { events, dayIndexes };
}

test("ordinary events do not repeat a template within days, at the maximum density", () => {
  // The cap of two a day is the worst case; each type's pool sets how far apart repeats can be.
  const minimumGapDays: Partial<Record<ScheduleBlockType, number>> = {
    work: 4,
    commute: 3,
    meal: 3,
    leisure: 3,
    errand: 5,
    exploration: 5,
    social: 2,
  };
  for (const [scheduleType, gap] of Object.entries(minimumGapDays) as Array<[ScheduleBlockType, number]>) {
    for (const seedPrefix of ["a", "b", "c"]) {
      const { events, dayIndexes } = ordinaryRun(scheduleType, 21, seedPrefix);
      const lastSeen = new Map<string, number>();
      events.forEach((event, index) => {
        const id = templateOf(event);
        const previous = lastSeen.get(id);
        if (previous !== undefined) {
          assert.ok(
            dayIndexes[index]! - previous >= gap,
            `${scheduleType} reused ${id} after ${dayIndexes[index]! - previous} days`,
          );
        }
        lastSeen.set(id, dayIndexes[index]!);
      });
    }
  }
});

test("ordinary events rotate through the whole pool", () => {
  const { events } = ordinaryRun("work", 21, "rotation");
  assert.equal(new Set(events.map(templateOf)).size, 10);
});

test("recent-template avoidance stays deterministic and idempotent on replay", () => {
  const history = ordinaryRun("work", 3, "history").events;
  const generate = (existingEvents: readonly WorldEvent[]) => generateOrdinaryWorldEvent({
    companionId: "mira",
    occurredAt: new Date(Date.UTC(2026, 6, 20, 2)),
    locationId: "somewhere",
    scheduleType: "work",
    correlationId: "00000000-0000-4000-8000-000000000001",
    seed: "replayed-tick",
    existingEvents,
    eventChance: 1,
  });
  const first = generate(history)!;
  assert.deepEqual(generate(history), first);
  // A retry sees its own earlier result and must not pick a new template because of it.
  assert.equal(generate([...history, first]), null);
  // Events that happened later cannot change what this tick originally chose.
  const later = { ...history[0]!, occurredAt: new Date(Date.UTC(2026, 6, 25)), randomSeed: "later" };
  assert.deepEqual(generate([...history, later]), first);
});

test("templates exist for every schedule type and keep their ids unique", () => {
  const ids = ORDINARY_EVENT_TEMPLATES.map((template) => template.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const scheduleType of ["sleep", "commute", "work", "meal", "leisure", "social", "errand", "exploration"] as const) {
    assert.ok(ORDINARY_EVENT_TEMPLATES.some((template) => template.scheduleTypes.includes(scheduleType)), scheduleType);
  }
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
