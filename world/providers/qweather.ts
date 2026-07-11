import {
  asArray,
  asNumber,
  asObject,
  asString,
  fetchJson,
  toIsoString,
} from "@/world/providers/http";
import type {
  GeoPoint,
  ProviderCurrentWeather,
  ProviderDailyForecast,
  ProviderFetch,
  ProviderWeatherAlert,
} from "@/world/providers/types";

export type QWeatherForecastDays = 3 | 7 | 10 | 15 | 30;

export interface QWeatherProviderOptions {
  apiKey: string;
  apiHost: string;
  fetcher?: ProviderFetch;
  timeoutMs?: number;
}

function strings(value: unknown): string[] {
  return asArray(value).flatMap((entry) => {
    const text = asString(entry);
    return text ? [text] : [];
  });
}

function locationValue(location: string | GeoPoint): string {
  if (typeof location === "string") {
    const value = location.trim();
    if (!value) throw new Error("QWeather location is required");
    return value;
  }
  if (
    !Number.isFinite(location.longitude) ||
    !Number.isFinite(location.latitude) ||
    location.longitude < -180 ||
    location.longitude > 180 ||
    location.latitude < -90 ||
    location.latitude > 90
  ) {
    throw new Error("Invalid geographic coordinate");
  }
  return `${location.longitude.toFixed(2)},${location.latitude.toFixed(2)}`;
}

export class QWeatherProvider {
  private readonly apiKey: string;
  private readonly apiOrigin: string;
  private readonly fetcher?: ProviderFetch;
  private readonly timeoutMs?: number;

  constructor(options: QWeatherProviderOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) throw new Error("QWeather API key is required");
    const rawHost = options.apiHost.trim();
    if (!rawHost) throw new Error("QWeather API host is required");
    const url = new URL(/^https?:\/\//i.test(rawHost) ? rawHost : `https://${rawHost}`);
    this.apiOrigin = url.origin;
    this.fetcher = options.fetcher;
    this.timeoutMs = options.timeoutMs;
  }

  async getCurrent(location: string | GeoPoint): Promise<ProviderCurrentWeather> {
    const params = new URLSearchParams({ location: locationValue(location), lang: "zh" });
    const body = await this.request(`/v7/weather/now?${params}`);
    this.assertSuccess(body);
    const now = asObject(body.now);
    if (!now || !asString(now.text)) throw new Error("QWeather returned no current weather");
    const refer = asObject(body.refer);

    return {
      provider: "qweather",
      observedAt: toIsoString(now.obsTime),
      updatedAt: toIsoString(body.updateTime),
      condition: asString(now.text)!,
      temperatureC: asNumber(now.temp),
      feelsLikeC: asNumber(now.feelsLike),
      humidityPercent: asNumber(now.humidity),
      precipitationMm: asNumber(now.precip),
      visibilityKm: asNumber(now.vis),
      windDirection: asString(now.windDir),
      windScale: asString(now.windScale),
      windSpeedKph: asNumber(now.windSpeed),
      sourceUrl: asString(body.fxLink),
      attributions: strings(refer?.sources),
    };
  }

  async getForecast(
    location: string | GeoPoint,
    days: QWeatherForecastDays = 3,
  ): Promise<ProviderDailyForecast[]> {
    const params = new URLSearchParams({ location: locationValue(location), lang: "zh" });
    const body = await this.request(`/v7/weather/${days}d?${params}`);
    this.assertSuccess(body);
    const sourceUrl = asString(body.fxLink);
    const refer = asObject(body.refer);
    const attributions = strings(refer?.sources);

    return asArray(body.daily).flatMap((value): ProviderDailyForecast[] => {
      const day = asObject(value);
      const forecastDate = asString(day?.fxDate);
      const conditionDay = asString(day?.textDay);
      const conditionNight = asString(day?.textNight);
      if (!day || !forecastDate || !conditionDay || !conditionNight) return [];
      return [{
        provider: "qweather",
        forecastDate,
        conditionDay,
        conditionNight,
        temperatureMinC: asNumber(day.tempMin),
        temperatureMaxC: asNumber(day.tempMax),
        precipitationMm: asNumber(day.precip),
        humidityPercent: asNumber(day.humidity),
        sunrise: asString(day.sunrise),
        sunset: asString(day.sunset),
        sourceUrl,
        attributions,
      }];
    });
  }

  async getAlerts(location: GeoPoint): Promise<ProviderWeatherAlert[]> {
    // The alert API uses latitude/longitude path segments, unlike other QWeather APIs.
    locationValue(location);
    const path = `/weatheralert/v1/current/${location.latitude.toFixed(2)}/${location.longitude.toFixed(2)}`;
    const body = await this.request(`${path}?localTime=true&lang=zh`);
    const metadata = asObject(body.metadata);
    const attributions = strings(metadata?.attributions);

    return asArray(body.alerts).flatMap((value): ProviderWeatherAlert[] => {
      const alert = asObject(value);
      const eventType = asObject(alert?.eventType);
      const providerId = asString(alert?.id);
      const eventName = asString(eventType?.name);
      if (!alert || !providerId || !eventName) return [];
      return [{
        provider: "qweather",
        providerId,
        senderName: asString(alert.senderName),
        eventName,
        headline: asString(alert.headline) ?? eventName,
        description: asString(alert.description),
        severity: asString(alert.severity),
        urgency: asString(alert.urgency),
        certainty: asString(alert.certainty),
        issuedAt: toIsoString(alert.issuedTime),
        effectiveAt: toIsoString(alert.effectiveTime),
        expiresAt: toIsoString(alert.expireTime),
        attributions,
      }];
    });
  }

  private async request(path: string): Promise<Record<string, unknown>> {
    const body = asObject(await fetchJson(`${this.apiOrigin}${path}`, {
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      headers: { "X-QW-Api-Key": this.apiKey },
    }));
    if (!body) throw new Error("QWeather returned an invalid payload");
    return body;
  }

  private assertSuccess(body: Record<string, unknown>): void {
    if (asString(body.code) !== "200") {
      throw new Error(`QWeather request failed: ${asString(body.code) ?? "unknown code"}`);
    }
  }
}
