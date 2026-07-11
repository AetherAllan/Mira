import { asNumber, asObject, asString, fetchJson } from "@/world/providers/http";
import type { GeoPoint, ProviderCurrentWeather, ProviderFetch } from "@/world/providers/types";

function condition(code: number | null) {
  if (code == null) return "未知";
  if (code === 0) return "晴";
  if (code <= 3) return "多云";
  if (code <= 48) return "雾";
  if (code <= 67 || (code >= 80 && code <= 82)) return "雨";
  if (code <= 77 || (code >= 85 && code <= 86)) return "雪";
  if (code >= 95) return "雷暴";
  return "天气变化";
}

export class OpenMeteoProvider {
  constructor(private readonly fetcher?: ProviderFetch) {}

  async getCurrent(location: GeoPoint): Promise<ProviderCurrentWeather> {
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
      timeformat: "unixtime",
      timezone: "GMT",
    });
    const body = asObject(await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`, {
      fetcher: this.fetcher,
      timeoutMs: 5_000,
    }));
    const current = asObject(body?.current);
    if (!current) throw new Error("Open-Meteo returned no current weather");
    const observedSeconds = asNumber(current.time);
    return {
      provider: "open_meteo",
      observedAt: observedSeconds == null ? null : new Date(observedSeconds * 1_000).toISOString(),
      updatedAt: null,
      condition: condition(asNumber(current.weather_code)),
      temperatureC: asNumber(current.temperature_2m),
      feelsLikeC: asNumber(current.apparent_temperature),
      humidityPercent: asNumber(current.relative_humidity_2m),
      precipitationMm: asNumber(current.precipitation),
      visibilityKm: null,
      windDirection: asNumber(current.wind_direction_10m) == null
        ? asString(current.wind_direction_10m)
        : `${asNumber(current.wind_direction_10m)}°`,
      windScale: null,
      windSpeedKph: asNumber(current.wind_speed_10m),
      sourceUrl: "https://open-meteo.com/",
      attributions: ["Open-Meteo (CC BY 4.0)"],
    };
  }
}
