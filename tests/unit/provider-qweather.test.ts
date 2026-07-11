import assert from "node:assert/strict";
import test from "node:test";
import {
  QWEATHER_ALERT_RESPONSE,
  QWEATHER_CURRENT_RESPONSE,
  QWEATHER_FORECAST_RESPONSE,
} from "@/tests/fixtures/provider-responses";
import { QWeatherProvider } from "@/world/providers/qweather";
import type { ProviderFetch } from "@/world/providers/types";

test("QWeather maps current, forecast and alert responses", async () => {
  const requests: Array<{ url: URL; apiKey: string | null }> = [];
  const fetcher: ProviderFetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push({
      url,
      apiKey: new Headers(init?.headers).get("X-QW-Api-Key"),
    });
    if (url.pathname.includes("weatheralert")) return Response.json(QWEATHER_ALERT_RESPONSE);
    if (url.pathname.endsWith("/3d")) return Response.json(QWEATHER_FORECAST_RESPONSE);
    return Response.json(QWEATHER_CURRENT_RESPONSE);
  };
  const provider = new QWeatherProvider({
    apiKey: "qweather-test-key",
    apiHost: "weather.test",
    fetcher,
  });
  const beijing = { longitude: 116.41, latitude: 39.92 };

  const current = await provider.getCurrent(beijing);
  const forecast = await provider.getForecast(beijing, 3);
  const alerts = await provider.getAlerts(beijing);

  assert.equal(current.condition, "小雨");
  assert.equal(current.temperatureC, 27);
  assert.deepEqual(current.attributions, ["QWeather", "NMC"]);
  assert.equal(forecast[0]?.temperatureMinC, 22);
  assert.equal(alerts[0]?.eventName, "暴雨");
  assert.equal(alerts[0]?.expiresAt, "2026-07-11T06:00:00.000Z");
  assert.equal(requests[0]?.url.searchParams.get("location"), "116.41,39.92");
  assert.equal(requests[2]?.url.pathname, "/weatheralert/v1/current/39.92/116.41");
  assert.ok(requests.every((request) => request.apiKey === "qweather-test-key"));
});
