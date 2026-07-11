export type ProviderFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface ProviderPlace {
  provider: "osm";
  providerId: string;
  name: string;
  category: string;
  district: string | null;
  address: string | null;
  coordinates: GeoPoint | null;
  distanceMeters: number | null;
}

export type ProviderRouteMode = "walking" | "bicycling" | "transit";

export interface PlaceSearchRequest {
  textQuery: string;
  locationBias?: GeoPoint;
  radiusMeters?: number;
  maxResults?: number;
}

export interface RouteRequest {
  origin: GeoPoint;
  destination: GeoPoint;
  mode: ProviderRouteMode;
}

export interface ProviderRoute {
  provider: "osm";
  mode: ProviderRouteMode;
  origin: GeoPoint;
  destination: GeoPoint;
  distanceMeters: number;
  durationMinutes: number | null;
  estimatedCostCny: number | null;
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
