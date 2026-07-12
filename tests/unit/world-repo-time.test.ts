import assert from "node:assert/strict";
import test from "node:test";
import { beijingDayBounds } from "@/db/worldRepo";

test("memory promotion uses the Beijing calendar day across UTC midnight", () => {
  const { start, end } = beijingDayBounds(new Date("2026-07-12T22:45:00.000Z"));
  assert.equal(start.toISOString(), "2026-07-12T16:00:00.000Z");
  assert.equal(end.toISOString(), "2026-07-13T16:00:00.000Z");
});
