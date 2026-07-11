import assert from "node:assert/strict";
import test from "node:test";
import {
  activeIntervalAt,
  buildTemporalContext,
  localDateAt,
  weekdayAt,
  weekdayForLocalDate,
} from "@/platform/time";
import { optionalPlaceOriginRole } from "@/world/placeOrigin";

test("TemporalContext exposes Beijing wall time while retaining UTC evidence", () => {
  const context = buildTemporalContext({
    observedAt: new Date("2026-07-11T08:30:45.000Z"),
    worldAdvancedThrough: new Date("2026-07-11T08:15:00.000Z"),
    timeZone: "Asia/Shanghai",
  });

  assert.equal(context.localDateTime, "2026-07-11T16:30:45+08:00");
  assert.equal(context.localTime, "16:30:45");
  assert.equal(context.weekday, "Saturday");
  assert.equal(context.dayPeriod, "afternoon");
  assert.equal(context.worldLagSeconds, 945);
  assert.equal(context.worldStateFresh, true);
  assert.equal(weekdayAt(new Date("2026-07-12T00:30:00.000Z"), "Asia/Shanghai"), "Sunday");
});

test("world freshness expires after thirty minutes", () => {
  const context = buildTemporalContext({
    observedAt: new Date("2026-07-11T09:00:01.000Z"),
    worldAdvancedThrough: new Date("2026-07-11T08:30:00.000Z"),
    timeZone: "Asia/Shanghai",
  });
  assert.equal(context.worldStateFresh, false);
});

test("schedule lookup uses an exact half-open interval", () => {
  const first = {
    id: "first",
    startAt: new Date("2026-07-11T08:00:00.000Z"),
    endAt: new Date("2026-07-11T09:00:00.000Z"),
  };
  const second = {
    id: "second",
    startAt: first.endAt,
    endAt: new Date("2026-07-11T10:00:00.000Z"),
  };
  assert.equal(activeIntervalAt([first, second], new Date("2026-07-11T08:59:59.000Z"))?.id, "first");
  assert.equal(activeIntervalAt([first, second], new Date("2026-07-11T09:00:00.000Z"))?.id, "second");
  assert.equal(activeIntervalAt([first, second], new Date("2026-07-11T09:00:01.000Z"))?.id, "second");
  assert.equal(activeIntervalAt([first, second], second.endAt), undefined);
});

test("local calendar weekday never shifts through UTC midnight", () => {
  assert.equal(weekdayForLocalDate("2026-07-10"), "Friday");
  assert.equal(weekdayForLocalDate("2026-07-11"), "Saturday");
  assert.equal(weekdayForLocalDate("2026-07-12"), "Sunday");
  assert.equal(weekdayForLocalDate("2026-07-13"), "Monday");
  assert.equal(optionalPlaceOriginRole("2026-07-10"), "work");
  assert.equal(optionalPlaceOriginRole("2026-07-11"), "home");
  assert.equal(optionalPlaceOriginRole("2026-07-12"), "home");
  assert.equal(optionalPlaceOriginRole("2026-07-13"), "work");
});

test("Beijing local date switches at its own midnight", () => {
  assert.equal(localDateAt(new Date("2026-07-11T15:59:59.000Z"), "Asia/Shanghai"), "2026-07-11");
  assert.equal(localDateAt(new Date("2026-07-11T16:00:00.000Z"), "Asia/Shanghai"), "2026-07-12");
});
