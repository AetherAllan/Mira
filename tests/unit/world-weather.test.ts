import assert from "node:assert/strict";
import test from "node:test";
import { planWeatherScheduleAdjustment } from "@/world/weather";
import type { ScheduleBlock } from "@/world/types";

const block: ScheduleBlock = {
  id: "park-plan",
  companionId: "mira",
  title: "下班后去公园",
  type: "exploration",
  startAt: new Date("2026-07-10T11:00:00.000Z"),
  endAt: new Date("2026-07-10T13:00:00.000Z"),
  locationId: "park",
  flexibility: 0.8,
  interruptionTolerance: 0.7,
  status: "planned",
  source: "mira_decision",
};

test("rain moves a future outdoor plan to a reachable indoor place", () => {
  const result = planWeatherScheduleAdjustment({
    schedule: [block],
    places: [
      { id: "park", name: "公园", category: "park", latitude: 39.9, longitude: 116.4 },
      { id: "bookstore", name: "书店", category: "bookstore", latitude: 39.91, longitude: 116.41 },
    ],
    now: new Date("2026-07-10T10:00:00.000Z"),
    weatherRisk: 0.8,
    weatherSummary: "北京有雨",
  });
  assert.equal(result?.indoorPlaceId, "bookstore");
  assert.match(result?.reason ?? "", /北京有雨/);
});

test("weather adjustment rejects low risk and missing route coordinates", () => {
  assert.equal(planWeatherScheduleAdjustment({
    schedule: [block],
    places: [{ id: "park", name: "公园", category: "park" }, { id: "bookstore", name: "书店", category: "bookstore" }],
    now: new Date("2026-07-10T10:00:00.000Z"),
    weatherRisk: 0.9,
    weatherSummary: "北京有雨",
  }), null);
  assert.equal(planWeatherScheduleAdjustment({
    schedule: [block],
    places: [],
    now: new Date("2026-07-10T10:00:00.000Z"),
    weatherRisk: 0.2,
    weatherSummary: "多云",
  }), null);
});

test("current rain never rewrites an outdoor plan more than twelve hours away", () => {
  const schedule = [{ ...block,
    startAt: new Date("2026-07-11T10:00:01.000Z"),
    endAt: new Date("2026-07-11T12:00:00.000Z"),
  }];
  assert.equal(planWeatherScheduleAdjustment({
    schedule,
    places: [
      { id: "park", name: "公园", category: "park", latitude: 39.9, longitude: 116.4 },
      { id: "bookstore", name: "书店", category: "bookstore", latitude: 39.91, longitude: 116.41 },
    ],
    now: new Date("2026-07-10T22:00:00.000Z"),
    weatherRisk: 0.9,
    weatherSummary: "当前有雨",
  }), null);
});
