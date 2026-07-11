import {
  asArray,
  asNumber,
  asObject,
  asString,
  fetchJson,
} from "@/world/providers/http";
import type {
  GeoPoint,
  ProviderFetch,
  ProviderPlace,
  ProviderRoute,
  ProviderRouteMode,
} from "@/world/providers/types";

const API_ORIGIN = "https://restapi.amap.com";

export interface AMapProviderOptions {
  apiKey: string;
  fetcher?: ProviderFetch;
  timeoutMs?: number;
}

export interface AMapPoiSearch {
  keywords?: string;
  category?: string;
  city?: string;
  page?: number;
  limit?: number;
  around?: GeoPoint;
  radiusMeters?: number;
}

export interface AMapRouteRequest {
  origin: GeoPoint;
  destination: GeoPoint;
  mode: ProviderRouteMode;
  originCityCode?: string;
  destinationCityCode?: string;
}

export interface AMapStaticMapOptions {
  center?: GeoPoint;
  markers?: GeoPoint[];
  zoom?: number;
  width?: number;
  height?: number;
  scale?: 1 | 2;
}

function assertPoint(point: GeoPoint): void {
  if (
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    point.latitude < -90 ||
    point.latitude > 90 ||
    point.longitude < -180 ||
    point.longitude > 180
  ) {
    throw new Error("Invalid geographic coordinate");
  }
}

function coordinate(point: GeoPoint): string {
  assertPoint(point);
  return `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`;
}

function parseCoordinate(value: unknown): GeoPoint | null {
  const raw = asString(value);
  if (!raw) return null;
  const [longitude, latitude] = raw.split(",").map(Number);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const point = { latitude: latitude!, longitude: longitude! };
  try {
    assertPoint(point);
    return point;
  } catch {
    return null;
  }
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = asNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

export class AMapProvider {
  private readonly apiKey: string;
  private readonly fetcher?: ProviderFetch;
  private readonly timeoutMs?: number;

  constructor(options: AMapProviderOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) throw new Error("AMap API key is required");
    this.fetcher = options.fetcher;
    this.timeoutMs = options.timeoutMs;
  }

  async searchPois(query: AMapPoiSearch): Promise<ProviderPlace[]> {
    const keywords = query.keywords?.trim();
    const category = query.category?.trim();
    if (!keywords && !category) {
      throw new Error("AMap POI search needs keywords or category");
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    if (!Number.isInteger(page) || page < 1) throw new Error("AMap POI page must be positive");
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
      throw new Error("AMap POI limit must be between 1 and 25");
    }

    const params = new URLSearchParams({
      key: this.apiKey,
      output: "JSON",
      city: query.city?.trim() || "110000",
      citylimit: "true",
      page: String(page),
      offset: String(limit),
    });
    if (keywords) params.set("keywords", keywords);
    if (category) params.set("types", category);

    const endpoint = query.around ? "/v3/place/around" : "/v3/place/text";
    if (query.around) {
      params.set("location", coordinate(query.around));
      params.set("radius", String(query.radiusMeters ?? 3_000));
      params.set("sortrule", "distance");
    }

    const body = await this.request(`${API_ORIGIN}${endpoint}?${params}`);
    return asArray(body.pois).flatMap((value): ProviderPlace[] => {
      const poi = asObject(value);
      const providerId = asString(poi?.id);
      const name = asString(poi?.name);
      if (!poi || !providerId || !name) return [];
      return [{
        provider: "amap",
        providerId,
        name,
        category: asString(poi.type) ?? "unknown",
        district: asString(poi.adname),
        address: asString(poi.address),
        coordinates: parseCoordinate(poi.location),
        distanceMeters: asNumber(poi.distance),
      }];
    });
  }

  async getRoute(request: AMapRouteRequest): Promise<ProviderRoute> {
    const endpoints: Record<ProviderRouteMode, string> = {
      walking: "/v5/direction/walking",
      bicycling: "/v5/direction/bicycling",
      transit: "/v5/direction/transit/integrated",
    };
    const params = new URLSearchParams({
      key: this.apiKey,
      origin: coordinate(request.origin),
      destination: coordinate(request.destination),
      show_fields: "cost",
    });
    if (request.mode === "transit") {
      params.set("city1", request.originCityCode?.trim() || "010");
      params.set("city2", request.destinationCityCode?.trim() || "010");
      params.set("AlternativeRoute", "1");
    } else {
      params.set("alternative_route", "1");
    }

    const body = await this.request(`${API_ORIGIN}${endpoints[request.mode]}?${params}`);
    const route = asObject(body.route);
    const candidates = asArray(
      request.mode === "transit" ? route?.transits : route?.paths,
    );
    const selected = asObject(candidates[0]);
    const distanceMeters = asNumber(selected?.distance);
    if (!selected || distanceMeters === null) {
      throw new Error("AMap returned no usable route");
    }

    const selectedCost = asObject(selected.cost);
    const routeCost = asObject(route?.cost);
    const durationSeconds = firstNumber(selectedCost?.duration, routeCost?.duration);
    const estimatedCostCny = firstNumber(
      selectedCost?.transit_fee,
      selectedCost?.tolls,
      routeCost?.transit_fee,
      routeCost?.taxi_fee,
    );

    return {
      provider: "amap",
      mode: request.mode,
      origin: request.origin,
      destination: request.destination,
      distanceMeters,
      durationMinutes: durationSeconds === null ? null : Math.ceil(durationSeconds / 60),
      estimatedCostCny,
    };
  }

  buildStaticMapUrl(options: AMapStaticMapOptions): string {
    const markers = options.markers ?? [];
    if (markers.length > 10) throw new Error("AMap static map supports at most 10 markers");
    const center = options.center ?? markers[0];
    if (!center) throw new Error("AMap static map needs a center or marker");

    const zoom = options.zoom ?? 13;
    const width = options.width ?? 750;
    const height = options.height ?? 420;
    if (!Number.isInteger(zoom) || zoom < 1 || zoom > 17) {
      throw new Error("AMap static map zoom must be between 1 and 17");
    }
    if (![width, height].every((size) => Number.isInteger(size) && size > 0 && size <= 1024)) {
      throw new Error("AMap static map size must be between 1 and 1024 pixels");
    }

    const params = new URLSearchParams({
      key: this.apiKey,
      location: coordinate(center),
      zoom: String(zoom),
      size: `${width}*${height}`,
      scale: String(options.scale ?? 2),
    });
    if (markers.length) {
      params.set("markers", `mid,0x4C8BF5,A:${markers.map(coordinate).join(";")}`);
    }
    return `${API_ORIGIN}/v3/staticmap?${params}`;
  }

  private async request(url: string): Promise<Record<string, unknown>> {
    const body = asObject(await fetchJson(url, {
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
    }));
    if (!body) throw new Error("AMap returned an invalid payload");
    if (asString(body.status) !== "1") {
      throw new Error(`AMap request failed: ${asString(body.info) ?? "unknown error"}`);
    }
    return body;
  }
}
