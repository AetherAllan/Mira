import assert from "node:assert/strict";
import test from "node:test";
import { buildPersistentWorldSeedRows } from "@/db/worldRepo";
import { DEFAULT_CHARACTER_PROFILE } from "@/seed/world";

test("persistent world seed rows preserve stable place and character identities", () => {
  const now = new Date("2026-07-11T02:07:00.000Z");
  const rows = buildPersistentWorldSeedRows("companion-1", now);

  assert.equal(rows.places.length, 20);
  assert.equal(rows.characters.length, 4);
  assert.equal(new Set(rows.places.map((place) => place.canonicalKey)).size, 20);
  assert.equal(new Set(rows.characters.map((character) => character.stableKey)).size, 4);
  assert.ok(
    rows.places.some((place) => place.canonicalKey === DEFAULT_CHARACTER_PROFILE.homePlaceKey),
  );
  assert.ok(
    rows.places.some((place) => place.canonicalKey === DEFAULT_CHARACTER_PROFILE.workPlaceKey),
  );
  assert.ok(rows.places.every((place) => place.companionId === "companion-1"));
  assert.ok(rows.characters.every((character) => character.isFictional));
  assert.ok(
    rows.places
      .filter((place) => place.status === "visited")
      .every((place) => place.firstVisitedAt === now && place.lastVisitedAt === now),
  );
});
