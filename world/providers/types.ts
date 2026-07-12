export type ProviderFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface ProviderCurrentWeather {
  provider: "open_meteo";
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
