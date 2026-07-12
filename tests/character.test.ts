import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RUNTIME_CONFIG } from "@/seed/character";
import { INITIAL_BEIJING_PLACES, INITIAL_WORLD_CHARACTERS } from "@/seed/world";

test("default character profile anchors Mira in Beijing without business-logic names", () => {
  const { character, policy, schemaVersion } = DEFAULT_RUNTIME_CONFIG;

  assert.equal(schemaVersion, 3);
  assert.equal(character.profile.city, "北京");
  assert.equal(character.profile.timeZone, "Asia/Shanghai");
  assert.equal(character.profile.company, "某某某工作室");
  assert.equal(character.profile.homePlaceKey, "seed:beijing:home:huilongguan");
  assert.equal(character.profile.workPlaceKey, "seed:beijing:work:wangjing-studio");
  assert.equal(policy.quietHours.timeZone, "Asia/Shanghai");
});

test("Beijing seed data has stable unique identities", () => {
  const placeKeys = INITIAL_BEIJING_PLACES.map((place) => place.canonicalKey);
  const characterKeys = INITIAL_WORLD_CHARACTERS.map((character) => character.stableKey);

  assert.equal(INITIAL_BEIJING_PLACES.length, 20);
  assert.equal(new Set(placeKeys).size, placeKeys.length);
  assert.equal(INITIAL_WORLD_CHARACTERS.length, 9);
  assert.equal(new Set(characterKeys).size, characterKeys.length);
  assert.ok(INITIAL_WORLD_CHARACTERS.every((character) => character.metadata?.fictional === true));
  assert.equal(INITIAL_WORLD_CHARACTERS.filter((character) => character.relationshipType === "roommate").length, 3);
  assert.equal(INITIAL_WORLD_CHARACTERS.filter((character) => ["friend", "coworker"].includes(character.relationshipType) && character.metadata?.gender === "female").length, 4);
});
