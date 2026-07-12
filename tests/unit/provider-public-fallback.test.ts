import assert from "node:assert/strict";
import test from "node:test";
import { OpenMeteoProvider } from "@/world/providers/openMeteo";
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
