import assert from "node:assert/strict";
import test from "node:test";
import { generateOrdinaryWorldEvent } from "@/world/events";
import { validateProposedWorldMutation } from "@/world/mutations";
import type { ScheduleBlock, TripFeasibility } from "@/world/types";

const occurredAt = new Date("2026-07-10T04:30:00.000Z");
const event = generateOrdinaryWorldEvent({
  companionId: "mira",
  occurredAt,
  locationId: "studio",
  scheduleType: "work",
  correlationId: "00000000-0000-4000-8000-000000000001",
  seed: "mutation-event",
  existingEvents: [],
  eventChance: 1,
})!;
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
const feasibility: TripFeasibility = {
  reachable: true,
  travelMinutes: 0,
  estimatedCost: 0,
  openingStatus: "open",
  weatherRisk: 0,
  reservationRequired: false,
  rejectionReasons: [],
};
const physicalEvent = {
  event,
  destinationLocationId: "studio",
  feasibility,
  scheduleBlock,
  knownPlaceIds: ["studio"],
};

test("Actor mutations are rejected by default", () => {
  const result = validateProposedWorldMutation({
    type: "record_physical_visit",
    payload: { locationId: "studio", occurredAt: occurredAt.toISOString() },
    reason: "Actor claimed a visit",
  }, { physicalEvent });

  assert.equal(result.approved, false);
  assert.ok(result.reasons.includes("actor_mutation_forbidden"));
});

test("only a grounded World Engine mutation can confirm a physical visit", () => {
  const result = validateProposedWorldMutation({
    type: "record_physical_visit",
    payload: { locationId: "studio", occurredAt: occurredAt.toISOString() },
    reason: "Schedule and route checks passed",
  }, { authority: "world_engine", physicalEvent });

  assert.deepEqual(result, { approved: true, reasons: [] });
});

test("new world characters require explicit fictional metadata", () => {
  const base = {
    type: "create_world_character",
    reason: "A recurring fictional acquaintance is needed by an event",
  } as const;
  const rejected = validateProposedWorldMutation({
    ...base,
    payload: { stableKey: "new_friend", name: "许宁", role: "展览认识的人" },
  }, { authority: "world_engine" });
  const approved = validateProposedWorldMutation({
    ...base,
    payload: {
      stableKey: "new_friend",
      name: "许宁",
      role: "展览认识的人",
      metadata: { fictional: true },
    },
  }, { authority: "world_engine" });

  assert.ok(rejected.reasons.includes("fictional_character_metadata_required"));
  assert.equal(approved.approved, true);
});
