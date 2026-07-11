import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailySchedule,
  cancelScheduleBlock,
  rescheduleScheduleBlock,
} from "@/world/planner";

test("weekday schedule follows Beijing work hours without overlaps", () => {
  const schedule = buildDailySchedule({
    companionId: "mira",
    date: new Date("2026-07-10T04:00:00.000Z"), // Friday noon in Beijing.
    homeLocationId: "home",
    workLocationId: "studio",
    optionalLocationId: "cafe",
    seed: "weekday-fixture",
    correlationId: "123e4567-e89b-42d3-a456-426614174000",
  });

  assert.equal(schedule[0]?.startAt.toISOString(), "2026-07-09T16:00:00.000Z");
  assert.equal(schedule.at(-1)?.endAt.toISOString(), "2026-07-10T16:00:00.000Z");
  assert.ok(schedule.some((block) => block.type === "work" && block.locationId === "studio"));
  assert.ok(schedule.some((block) => block.type === "commute" && block.locationId === undefined));
  assert.ok(schedule.every((block) => block.localDate === "2026-07-10"));
  assert.equal(new Set(schedule.map((block) => block.idempotencyKey)).size, schedule.length);
  assert.ok(
    schedule.every((block) => block.correlationId === "123e4567-e89b-42d3-a456-426614174000"),
  );
  for (let index = 1; index < schedule.length; index += 1) {
    assert.equal(schedule[index - 1]?.endAt.getTime(), schedule[index]?.startAt.getTime());
  }
});

test("weekend schedule starts later and has no work block", () => {
  const input = {
    companionId: "mira",
    date: new Date("2026-07-11T04:00:00.000Z"), // Saturday noon in Beijing.
    homeLocationId: "home",
    seed: "weekend-fixture",
  };
  const first = buildDailySchedule(input);
  const replay = buildDailySchedule(input);

  assert.deepEqual(first, replay);
  assert.equal(first[0]?.endAt.toISOString(), "2026-07-11T01:30:00.000Z"); // 09:30 CST.
  assert.equal(first.some((block) => block.type === "work"), false);
  assert.ok(first.some((block) => block.type === "leisure" || block.type === "exploration"));
  assert.ok(first.every((block) => block.correlationId === undefined));
});

test("schedule changes require a reason and reject overlaps", () => {
  const schedule = buildDailySchedule({
    companionId: "mira",
    date: new Date("2026-07-10T04:00:00.000Z"),
    seed: "change-fixture",
  });
  const first = schedule[0]!;
  const second = schedule[1]!;

  assert.throws(
    () => rescheduleScheduleBlock(schedule, first.id, { endAt: second.endAt }, ""),
    /requires a reason/,
  );
  assert.throws(
    () =>
      rescheduleScheduleBlock(
        schedule,
        first.id,
        { endAt: new Date(second.startAt.getTime() + 60_000) },
        "睡过头",
      ),
    /overlaps/,
  );
  assert.throws(() => cancelScheduleBlock(schedule, second.id, "  "), /requires a reason/);

  const changed = rescheduleScheduleBlock(
    schedule,
    first.id,
    { endAt: new Date(first.endAt.getTime() - 15 * 60_000) },
    "提前醒了",
  );
  assert.equal(changed[0]?.status, "changed");
  assert.equal(changed[0]?.changeReason, "提前醒了");
});
