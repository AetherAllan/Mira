import assert from "node:assert/strict";
import test from "node:test";
import {
  generateOrdinaryWorldEvent,
  ordinaryEventForBlock,
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

test("only a commute may happen without a place", () => {
  const input = {
    companionId: "mira",
    occurredAt,
    correlationId: "00000000-0000-4000-8000-000000000001",
    seed: "no-place",
    existingEvents: [],
    eventChance: 1,
  };
  const commute = generateOrdinaryWorldEvent({ ...input, scheduleType: "commute" });
  assert.ok(commute);
  assert.equal(commute.locationId, undefined);
  assert.throws(() => generateOrdinaryWorldEvent({ ...input, scheduleType: "work" }), /needs a location/);
  assert.throws(() => generateOrdinaryWorldEvent({ ...input, scheduleType: "work", locationId: " " }), /needs a location/);
});

function blockOutcomes(block: Parameters<typeof ordinaryEventForBlock>[0]["block"], windows = 4000) {
  return Array.from({ length: windows }, (_, index) => ordinaryEventForBlock({
    companionId: "mira",
    block,
    occurredAt,
    correlationId: "00000000-0000-4000-8000-000000000001",
    tickSeed: `tick-${index}`,
    existingEvents: [],
  })).filter((event) => event !== null);
}

test("a window's chance of an ordinary event depends on the active block", () => {
  const awake = blockOutcomes({ type: "work", locationId: "studio", status: "active", source: "routine" }).length / 4000;
  const asleep = blockOutcomes({ type: "sleep", locationId: "home", status: "active", source: "routine" }).length / 4000;
  assert.ok(awake > 0.015 && awake < 0.035, `awake rate ${awake}`);
  assert.ok(asleep > 0.001 && asleep < 0.012, `sleep rate ${asleep}`);
  assert.ok(asleep * 2 < awake);
});

test("ordinary events keep to blocks that can ground them", () => {
  assert.equal(blockOutcomes(undefined).length, 0);
  assert.equal(blockOutcomes({ type: "work", locationId: "studio", status: "cancelled", source: "routine" }).length, 0);
  assert.equal(blockOutcomes({ type: "leisure", locationId: undefined, status: "active", source: "routine" }).length, 0);
  const commutes = blockOutcomes({ type: "commute", locationId: undefined, status: "active", source: "routine" });
  assert.ok(commutes.length > 0);
  assert.ok(commutes.every((event) => event.type === "travel" && event.locationId === undefined));
  const asleep = blockOutcomes({ type: "sleep", locationId: "home", status: "active", source: "routine" }, 8000);
  assert.ok(asleep.every((event) => event.causeId?.startsWith("ordinary:template:sleep_")));
});

test("a block the weather moved indoors no longer draws outdoor templates", () => {
  const outdoors = blockOutcomes({ type: "exploration", locationId: "park", status: "active", source: "routine" });
  assert.ok(outdoors.some((event) => event.causeId?.startsWith("ordinary:template:street_")));
  const moved = blockOutcomes({ type: "exploration", locationId: "library", status: "active", source: "external_information" });
  assert.ok(moved.length > 0);
  assert.equal(moved.filter((event) => event.causeId?.startsWith("ordinary:template:street_")).length, 0);
});

test("sleep templates suit every hour of the sleep block", () => {
  const sleep = ORDINARY_EVENT_TEMPLATES.filter((template) => template.scheduleTypes.includes("sleep"));
  assert.ok(sleep.length > 0);
  for (const template of sleep) {
    assert.doesNotMatch(`${template.title}${template.description}`, /半夜|深夜|凌晨|摸黑/, template.id);
  }
});

test("a window replays to the same ordinary event", () => {
  const block = { type: "work", locationId: "studio", status: "active", source: "routine" } as const;
  const [first] = blockOutcomes(block);
  assert.ok(first);
  const tickSeed = Array.from({ length: 4000 }, (_, index) => `tick-${index}`).find((seed) =>
    ordinaryEventForBlock({
      companionId: "mira",
      block,
      occurredAt,
      correlationId: "00000000-0000-4000-8000-000000000001",
      tickSeed: seed,
      existingEvents: [],
    }));
  const replay = () => ordinaryEventForBlock({
    companionId: "mira",
    block,
    occurredAt,
    correlationId: "00000000-0000-4000-8000-000000000001",
    tickSeed: tickSeed!,
    existingEvents: [],
  });
  assert.deepEqual(replay(), first);
  assert.deepEqual(replay(), replay());
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
