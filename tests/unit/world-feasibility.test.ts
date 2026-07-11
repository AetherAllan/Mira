import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTripFeasibility } from "@/world/feasibility";

test("trip feasibility accepts a reachable open place", () => {
  const result = evaluateTripFeasibility({
    currentLocationId: "studio",
    destinationLocationId: "bookstore",
    visitStartAt: new Date("2026-07-10T11:00:00.000Z"),
    travelMinutes: 25,
    estimatedCost: 4,
    availableWindowMinutes: 120,
    openingStatus: "open",
    weatherRisk: 0.2,
    reservationRequired: false,
    scheduleAllows: true,
  });

  assert.equal(result.reachable, true);
  assert.equal(result.availableVisitMinutes, 95);
  assert.deepEqual(result.rejectionReasons, []);
});

test("trip feasibility rejects missing routes and impossible timing", () => {
  const result = evaluateTripFeasibility({
    currentLocationId: "home",
    destinationLocationId: "far-place",
    visitStartAt: new Date("2026-07-10T11:00:00.000Z"),
    availableWindowMinutes: 20,
    openingStatus: "closed",
    weatherRisk: 0.95,
    reservationRequired: true,
    scheduleAllows: false,
  });

  assert.equal(result.reachable, false);
  assert.ok(result.rejectionReasons.includes("route_unavailable"));
  assert.ok(result.rejectionReasons.includes("schedule_conflict"));
  assert.ok(result.rejectionReasons.includes("place_closed"));
  assert.ok(result.rejectionReasons.includes("reservation_required"));
  assert.ok(result.rejectionReasons.includes("weather_risk_too_high"));
});

test("unknown opening hours use conservative Beijing hours", () => {
  const result = evaluateTripFeasibility({
    currentLocationId: "home",
    destinationLocationId: "unknown-shop",
    visitStartAt: new Date("2026-07-10T13:30:00.000Z"), // 21:30 Beijing.
    travelMinutes: 10,
    availableWindowMinutes: 90,
    openingStatus: "unknown",
    weatherRisk: 0,
    reservationRequired: false,
    scheduleAllows: true,
  });

  assert.equal(result.reachable, false);
  assert.ok(result.rejectionReasons.includes("opening_hours_unverified"));
});

test("trip feasibility rejects over-budget travel and impossible movement time", () => {
  const result = evaluateTripFeasibility({
    currentLocationId: "home",
    destinationLocationId: "gallery",
    currentTime: new Date("2026-07-10T10:00:00.000Z"),
    visitStartAt: new Date("2026-07-10T10:10:00.000Z"),
    travelMinutes: 35,
    estimatedCost: 48,
    maximumCost: 30,
    availableWindowMinutes: 120,
    openingStatus: "open",
    weatherRisk: 0.2,
    reservationRequired: false,
    scheduleAllows: true,
  });

  assert.equal(result.reachable, false);
  assert.ok(result.rejectionReasons.includes("insufficient_travel_time"));
  assert.ok(result.rejectionReasons.includes("over_budget"));
});

test("staying at the same place needs neither a route nor travel budget", () => {
  const result = evaluateTripFeasibility({
    currentLocationId: "home",
    destinationLocationId: "home",
    currentTime: new Date("2026-07-10T10:00:00.000Z"),
    visitStartAt: new Date("2026-07-10T10:00:00.000Z"),
    maximumCost: 0,
    availableWindowMinutes: 60,
    openingStatus: "open",
    weatherRisk: 0,
    reservationRequired: false,
    scheduleAllows: true,
  });

  assert.equal(result.reachable, true);
  assert.equal(result.travelMinutes, 0);
  assert.equal(result.estimatedCost, 0);
});
