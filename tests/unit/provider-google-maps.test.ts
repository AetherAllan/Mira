import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_PLACES_RESPONSE,
  GOOGLE_ROUTES_RESPONSE,
} from "@/tests/fixtures/provider-responses";
import { GoogleMapsProvider } from "@/world/providers/googleMaps";
import type { ProviderFetch } from "@/world/providers/types";

test("Google Maps maps Places and Routes into canonical DTOs", async () => {
  const requests: Array<{ url: URL; headers: Headers; body: Record<string, unknown> }> = [];
  const fetcher: ProviderFetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push({
      url,
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return Response.json(
      url.hostname.startsWith("routes") ? GOOGLE_ROUTES_RESPONSE : GOOGLE_PLACES_RESPONSE,
    );
  };
  const provider = new GoogleMapsProvider({ apiKey: "google-test-key", fetcher });
  const places = await provider.searchPlaces({
    textQuery: "北京书店",
    center: { longitude: 116.41, latitude: 39.92 },
  });
  assert.deepEqual(places[0], {
    provider: "google",
    providerId: "ChIJbeijingbookstore",
    name: "三联韬奋书店",
    category: "book_store",
    district: null,
    address: "北京市东城区美术馆东街22号",
    coordinates: { longitude: 116.410886, latitude: 39.923124 },
    distanceMeters: null,
  });
  assert.equal(requests[0]?.url.pathname, "/v1/places:searchText");
  assert.equal(requests[0]?.headers.get("X-Goog-Api-Key"), "google-test-key");
  assert.equal(requests[0]?.body.textQuery, "北京书店");

  const route = await provider.getRoute({
    mode: "transit",
    origin: { longitude: 116.3, latitude: 40.08 },
    destination: { longitude: 116.47, latitude: 39.99 },
  });
  assert.equal(requests[1]?.url.pathname, "/directions/v2:computeRoutes");
  assert.equal(requests[1]?.body.travelMode, "TRANSIT");
  assert.equal(route.durationMinutes, 45);
  assert.equal(route.estimatedCostCny, 5);
});

test("Google Maps builds a server-side static map URL", () => {
  const provider = new GoogleMapsProvider({ apiKey: "google-test-key" });
  const url = new URL(provider.buildStaticMapUrl({
    center: { longitude: 116.410886, latitude: 39.923124 },
    markers: [{ longitude: 116.410886, latitude: 39.923124 }],
  }));
  assert.equal(url.hostname, "maps.googleapis.com");
  assert.equal(url.pathname, "/maps/api/staticmap");
  assert.equal(url.searchParams.get("key"), "google-test-key");
  assert.equal(url.searchParams.get("size"), "640x420");
  assert.equal(url.searchParams.getAll("markers").length, 1);
});
