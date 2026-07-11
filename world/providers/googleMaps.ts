import { asArray, asNumber, asObject, asString, fetchJson } from "@/world/providers/http";
import type {
  GeoPoint,
  ProviderFetch,
  ProviderPlace,
  ProviderRoute,
  ProviderRouteMode,
} from "@/world/providers/types";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap";

export interface GoogleMapsProviderOptions {
  apiKey: string;
  fetcher?: ProviderFetch;
  timeoutMs?: number;
}

export interface GooglePlaceSearch {
  textQuery: string;
  includedType?: string;
  maxResults?: number;
  center?: GeoPoint;
  radiusMeters?: number;
}

export interface GoogleRouteRequest {
  origin: GeoPoint;
  destination: GeoPoint;
  mode: ProviderRouteMode;
}

export interface GoogleStaticMapOptions {
  center?: GeoPoint;
  markers?: GeoPoint[];
  zoom?: number;
  width?: number;
  height?: number;
  scale?: 1 | 2;
}

function assertPoint(point: GeoPoint) {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) ||
      point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180) {
    throw new Error("Invalid geographic coordinate");
  }
}

function waypoint(point: GeoPoint) {
  assertPoint(point);
  return { location: { latLng: { latitude: point.latitude, longitude: point.longitude } } };
}

function durationMinutes(value: unknown) {
  const raw = asString(value);
  const seconds = raw && /^(\d+(?:\.\d+)?)s$/.exec(raw)?.[1];
  return seconds ? Math.ceil(Number(seconds) / 60) : null;
}

export class GoogleMapsProvider {
  private readonly apiKey: string;
  private readonly fetcher?: ProviderFetch;
  private readonly timeoutMs?: number;

  constructor(options: GoogleMapsProviderOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) throw new Error("Google Maps API key is required");
    this.fetcher = options.fetcher;
    this.timeoutMs = options.timeoutMs;
  }

  async searchPlaces(search: GooglePlaceSearch): Promise<ProviderPlace[]> {
    const textQuery = search.textQuery.trim();
    if (!textQuery) throw new Error("Google Places textQuery is required");
    const maxResults = search.maxResults ?? 20;
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 20) {
      throw new Error("Google Places maxResults must be between 1 and 20");
    }
    const body: Record<string, unknown> = {
      textQuery,
      languageCode: "zh-CN",
      regionCode: "CN",
      pageSize: maxResults,
    };
    if (search.includedType) body.includedType = search.includedType;
    if (search.center) {
      assertPoint(search.center);
      body.locationBias = {
        circle: {
          center: search.center,
          radius: Math.min(50_000, Math.max(1, search.radiusMeters ?? 5_000)),
        },
      };
    }
    const response = asObject(await fetchJson(PLACES_URL, {
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType",
      },
      body: JSON.stringify(body),
    }));
    if (!response) throw new Error("Google Places returned an invalid payload");
    return asArray(response.places).flatMap((value): ProviderPlace[] => {
      const place = asObject(value);
      const displayName = asObject(place?.displayName);
      const location = asObject(place?.location);
      const providerId = asString(place?.id);
      const name = asString(displayName?.text);
      const latitude = asNumber(location?.latitude);
      const longitude = asNumber(location?.longitude);
      if (!place || !providerId || !name) return [];
      return [{
        provider: "google",
        providerId,
        name,
        category: asString(place.primaryType) ?? "unknown",
        district: null,
        address: asString(place.formattedAddress),
        coordinates: latitude == null || longitude == null ? null : { latitude, longitude },
        distanceMeters: null,
      }];
    });
  }

  async getRoute(request: GoogleRouteRequest): Promise<ProviderRoute> {
    const travelMode: Record<ProviderRouteMode, string> = {
      walking: "WALK",
      bicycling: "BICYCLE",
      transit: "TRANSIT",
    };
    const response = asObject(await fetchJson(ROUTES_URL, {
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.travelAdvisory.transitFare",
      },
      body: JSON.stringify({
        origin: waypoint(request.origin),
        destination: waypoint(request.destination),
        travelMode: travelMode[request.mode],
        languageCode: "zh-CN",
        units: "METRIC",
      }),
    }));
    const route = asObject(asArray(response?.routes)[0]);
    const distanceMeters = asNumber(route?.distanceMeters);
    if (!route || distanceMeters == null) throw new Error("Google Routes returned no usable route");
    const advisory = asObject(route.travelAdvisory);
    const fare = asObject(advisory?.transitFare);
    const units = asNumber(fare?.units) ?? 0;
    const nanos = asNumber(fare?.nanos) ?? 0;
    return {
      provider: "google",
      mode: request.mode,
      origin: request.origin,
      destination: request.destination,
      distanceMeters,
      durationMinutes: durationMinutes(route.duration),
      estimatedCostCny: fare ? units + nanos / 1_000_000_000 : null,
    };
  }

  buildStaticMapUrl(options: GoogleStaticMapOptions) {
    const markers = options.markers ?? [];
    if (markers.length > 20) throw new Error("Google static map is limited to 20 Mira markers");
    const center = options.center ?? markers[0];
    if (!center) throw new Error("Google static map needs a center or marker");
    assertPoint(center);
    const width = options.width ?? 640;
    const height = options.height ?? 420;
    if (![width, height].every((size) => Number.isInteger(size) && size > 0 && size <= 640)) {
      throw new Error("Google static map size must be between 1 and 640 pixels");
    }
    const params = new URLSearchParams({
      key: this.apiKey,
      center: `${center.latitude.toFixed(6)},${center.longitude.toFixed(6)}`,
      zoom: String(options.zoom ?? 11),
      size: `${width}x${height}`,
      scale: String(options.scale ?? 2),
      maptype: "roadmap",
    });
    for (const marker of markers) {
      assertPoint(marker);
      params.append("markers", `color:0x4C8BF5|${marker.latitude.toFixed(6)},${marker.longitude.toFixed(6)}`);
    }
    return `${STATIC_MAP_URL}?${params}`;
  }
}
