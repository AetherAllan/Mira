import assert from "node:assert/strict";
import test from "node:test";
import { createSeededRandom, createWorldSeed, seededChoice } from "@/world/random";

test("world seeds and random streams are replayable", () => {
  const seed = createWorldSeed("mira", "2026-07-10T02:00:00.000Z", "routine-event");
  const first = createSeededRandom(seed);
  const second = createSeededRandom(seed);
  const sequence = [first(), first(), first(), first()];

  assert.deepEqual(sequence, [second(), second(), second(), second()]);
  assert.ok(sequence.every((value) => value >= 0 && value < 1));
  assert.notEqual(seed, createWorldSeed("mira", "2026-07-10T02:15:00.000Z", "routine-event"));
  assert.equal(seededChoice(["a", "b", "c"], seed), seededChoice(["a", "b", "c"], seed));
  assert.equal(seededChoice([], seed), undefined);
});
