import assert from "node:assert/strict";
import test from "node:test";
import {
  AMAP_POI_RESPONSE,
  AMAP_TRANSIT_RESPONSE,
} from "@/tests/fixtures/provider-responses";
import { AMapProvider } from "@/world/providers/amap";
import type { ProviderFetch } from "@/world/providers/types";

test("AMap maps POIs and routes into canonical DTOs", async () => {
  const requests: URL[] = [];
  const fetcher: ProviderFetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    return Response.json(
      url.pathname.includes("direction") ? AMAP_TRANSIT_RESPONSE : AMAP_POI_RESPONSE,
    );
  };
  const provider = new AMapProvider({ apiKey: "amap-test-key", fetcher });

  const places = await provider.searchPois({ keywords: "书店" });
  assert.deepEqual(places[0], {
    provider: "amap",
    providerId: "B000A7BD6C",
    name: "三联韬奋书店",
    category: "购物服务;文化用品店;书店",
    district: "东城区",
    address: "美术馆东街22号",
    coordinates: { longitude: 116.410886, latitude: 39.923124 },
    distanceMeters: 840,
  });
  assert.equal(requests[0]?.searchParams.get("city"), "110000");
  assert.equal(requests[0]?.searchParams.get("citylimit"), "true");

  const route = await provider.getRoute({
    mode: "transit",
    origin: { longitude: 116.3, latitude: 40.08 },
    destination: { longitude: 116.47, latitude: 39.99 },
  });
  assert.equal(requests[1]?.pathname, "/v5/direction/transit/integrated");
  assert.equal(requests[1]?.searchParams.get("city1"), "010");
  assert.equal(route.distanceMeters, 18_750);
  assert.equal(route.durationMinutes, 45);
  assert.equal(route.estimatedCostCny, 5);
});

test("AMap builds a bounded static map URL", () => {
  const provider = new AMapProvider({ apiKey: "amap-test-key" });
  const result = new URL(provider.buildStaticMapUrl({
    center: { longitude: 116.410886, latitude: 39.923124 },
    markers: [{ longitude: 116.410886, latitude: 39.923124 }],
    zoom: 14,
    width: 750,
    height: 420,
  }));

  assert.equal(result.pathname, "/v3/staticmap");
  assert.equal(result.searchParams.get("size"), "750*420");
  assert.match(result.searchParams.get("markers") ?? "", /116\.410886,39\.923124/);
});
