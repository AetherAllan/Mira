import assert from "node:assert/strict";
import test from "node:test";
import { OpenMeteoProvider } from "@/world/providers/openMeteo";
import { NominatimProvider, OsrmProvider } from "@/world/providers/publicGeo";
import type { ProviderFetch } from "@/world/providers/types";

test("Open-Meteo maps public current weather without a key", async () => {
  const fetcher: ProviderFetch = async () => Response.json({
    current: {
      time: 1_788_000_000,
      temperature_2m: 24,
      apparent_temperature: 26,
      relative_humidity_2m: 72,
      precipitation: 1.2,
      weather_code: 61,
      wind_speed_10m: 8,
      wind_direction_10m: 120,
    },
  });
  const weather = await new OpenMeteoProvider(fetcher).getCurrent({ latitude: 39.9, longitude: 116.4 });
  assert.equal(weather.provider, "open_meteo");
  assert.equal(weather.condition, "雨");
  assert.equal(weather.windDirection, "120°");
});

test("Nominatim and OSRM map public Beijing place and walking route responses", async () => {
  const nominatimFetch: ProviderFetch = async (_input, init) => {
    assert.match(new Headers(init?.headers).get("User-Agent") ?? "", /^Mira\//);
    return Response.json([{
      place_id: 123,
      name: "三联韬奋书店",
      display_name: "三联韬奋书店, 东城区, 北京市",
      category: "shop",
      type: "books",
      lat: "39.923",
      lon: "116.411",
      address: { city_district: "东城区" },
    }]);
  };
  const places = await new NominatimProvider(nominatimFetch).searchPlaces({ textQuery: "北京书店", maxResults: 1 });
  assert.equal(places[0]?.provider, "osm");
  assert.equal(places[0]?.district, "东城区");

  const osrmFetch: ProviderFetch = async () => Response.json({
    code: "Ok",
    routes: [{ distance: 1_800, duration: 1_200 }],
  });
  const route = await new OsrmProvider(osrmFetch).getRoute({
    mode: "walking",
    origin: { latitude: 39.9, longitude: 116.4 },
    destination: { latitude: 39.91, longitude: 116.41 },
  });
  assert.equal(route.provider, "osm");
  assert.equal(route.durationMinutes, 20);
  await assert.rejects(
    new OsrmProvider(osrmFetch).getRoute({
      mode: "transit",
      origin: { latitude: 39.9, longitude: 116.4 },
      destination: { latitude: 39.91, longitude: 116.41 },
    }),
    /does not provide transit/,
  );
});
