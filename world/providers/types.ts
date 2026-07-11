export type ProviderFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface ProviderPlace {
  provider: "amap";
  providerId: string;
  name: string;
  category: string;
  district: string | null;
  address: string | null;
  coordinates: GeoPoint | null;
  distanceMeters: number | null;
}

export type ProviderRouteMode = "walking" | "bicycling" | "transit";

export interface ProviderRoute {
  provider: "amap";
  mode: ProviderRouteMode;
  origin: GeoPoint;
  destination: GeoPoint;
  distanceMeters: number;
  durationMinutes: number | null;
  estimatedCostCny: number | null;
}

export interface ProviderCurrentWeather {
  provider: "qweather";
  observedAt: string | null;
  updatedAt: string | null;
  condition: string;
  temperatureC: number | null;
  feelsLikeC: number | null;
  humidityPercent: number | null;
  precipitationMm: number | null;
  visibilityKm: number | null;
  windDirection: string | null;
  windScale: string | null;
  windSpeedKph: number | null;
  sourceUrl: string | null;
  attributions: string[];
}

export interface ProviderDailyForecast {
  provider: "qweather";
  forecastDate: string;
  conditionDay: string;
  conditionNight: string;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  precipitationMm: number | null;
  humidityPercent: number | null;
  sunrise: string | null;
  sunset: string | null;
  sourceUrl: string | null;
  attributions: string[];
}

export interface ProviderWeatherAlert {
  provider: "qweather";
  providerId: string;
  senderName: string | null;
  eventName: string;
  headline: string;
  description: string | null;
  severity: string | null;
  urgency: string | null;
  certainty: string | null;
  issuedAt: string | null;
  effectiveAt: string | null;
  expiresAt: string | null;
  attributions: string[];
}

export interface ProviderArticle {
  provider: "gdelt";
  sourceUrl: string;
  title: string;
  sourceDomain: string;
  publishedAt: string | null;
  language: string | null;
  sourceCountry: string | null;
  imageUrl: string | null;
}
