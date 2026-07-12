import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkday, WORK_CALENDAR_SOURCE } from "@/world/workCalendar";
import { buildDailySchedule } from "@/world/planner";

test("2026 official holiday overrides weekend and weekday defaults", () => {
  assert.deepEqual(resolveWorkday("2026-01-04"), { dayType: "workday", source: WORK_CALENDAR_SOURCE });
  assert.deepEqual(resolveWorkday("2026-10-02"), { dayType: "restday", source: WORK_CALENDAR_SOURCE });
  assert.equal(resolveWorkday("2026-07-13").dayType, "workday");
  assert.equal(resolveWorkday("2026-07-12").dayType, "restday");
});

test("official make-up workdays use a work schedule even on Sunday", () => {
  const schedule = buildDailySchedule({
    companionId: "mira",
    date: new Date("2026-01-04T04:00:00.000Z"),
    homeLocationId: "home",
    workLocationId: "work",
    dayType: "workday",
  });
  assert.ok(schedule.some((block) => block.type === "work"));
  assert.ok(schedule.some((block) => block.type === "commute"));
});
