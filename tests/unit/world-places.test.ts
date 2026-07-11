import assert from "node:assert/strict";
import test from "node:test";
import { findCanonicalPlace, normalizePlaceName } from "@/world/places";
import type { KnownPlace } from "@/world/types";

function place(overrides: Partial<KnownPlace> = {}): KnownPlace {
  return {
    id: "place-1",
    companionId: "mira",
    canonicalKey: "osm:B001",
    provider: "osm",
    providerPoiId: "B001",
    status: "known",
    coordinateSystem: "gcj02",
    name: "三联韬奋书店（美术馆店）",
    category: "bookstore",
    latitude: 39.923124,
    longitude: 116.410886,
    firstDiscoveredAt: new Date("2026-07-10T00:00:00Z"),
    visitCount: 0,
    familiarity: 0.2,
    source: "world_search",
    metadata: {},
    ...overrides,
  };
}

test("place dedupe prioritizes provider POI identity", () => {
  const existing = place();
  const match = findCanonicalPlace(
    {
      companionId: "mira",
      provider: "osm",
      providerPoiId: "B001",
      name: "供应商改过的名字",
      latitude: 40.1,
      longitude: 116.6,
    },
    [existing],
  );

  assert.equal(match?.place.canonicalKey, existing.canonicalKey);
  assert.equal(match?.reason, "provider_poi_id");
});

test("place dedupe falls back to normalized name plus nearby coordinates", () => {
  const existing = place({ provider: "manual", providerPoiId: undefined });
  const match = findCanonicalPlace(
    {
      companionId: "mira",
      provider: "osm",
      providerPoiId: "osm-9",
      name: " 三联韬奋书店 (美术馆店) ",
      latitude: 39.9232,
      longitude: 116.4109,
    },
    [existing],
  );

  assert.equal(normalizePlaceName(" 三联韬奋书店 (美术馆店) "), "三联韬奋书店");
  assert.equal(match?.reason, "normalized_name_and_distance");
  assert.ok((match?.distanceMeters ?? 999) < 20);
});

test("place dedupe never merges same-name distant branches", () => {
  const match = findCanonicalPlace(
    {
      companionId: "mira",
      provider: "osm",
      name: "三联韬奋书店（美术馆店）",
      latitude: 40.05,
      longitude: 116.5,
    },
    [place()],
  );

  assert.equal(match, null);
});
