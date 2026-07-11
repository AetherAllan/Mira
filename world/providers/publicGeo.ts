import { asArray, asNumber, asObject, asString, fetchJson } from "@/world/providers/http";
import type {
  ProviderFetch,
  ProviderPlace,
  ProviderRoute,
  ProviderRouteMode,
} from "@/world/providers/types";
import type { GooglePlaceSearch, GoogleRouteRequest } from "@/world/providers/googleMaps";

const USER_AGENT = "Mira/0.1 (https://mira-production-61c4.up.railway.app)";
let publicMapQueue = Promise.resolve();
let lastPublicMapRequestAt = 0;

function rateLimited<T>(request: () => Promise<T>) {
  const run = publicMapQueue.then(async () => {
    const waitMs = Math.max(0, 1_000 - (Date.now() - lastPublicMapRequestAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastPublicMapRequestAt = Date.now();
    return request();
  });
  publicMapQueue = run.then(() => undefined, () => undefined);
  return run;
}

export class NominatimProvider {
  constructor(private readonly fetcher?: ProviderFetch) {}

  searchPlaces(search: GooglePlaceSearch): Promise<ProviderPlace[]> {
    const query = search.textQuery.trim();
    if (!query) throw new Error("Nominatim query is required");
    const params = new URLSearchParams({
      q: /北京|Beijing/i.test(query) ? query : `北京 ${query}`,
      format: "jsonv2",
      limit: String(Math.min(20, Math.max(1, search.maxResults ?? 20))),
      addressdetails: "1",
      viewbox: "115.7,40.3,117.4,39.4",
      bounded: "1",
    });
    return rateLimited(async () => {
      const values = asArray(await fetchJson(`https://nominatim.openstreetmap.org/search?${params}`, {
        fetcher: this.fetcher,
        timeoutMs: 5_000,
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "zh-CN" },
      }));
      return values.flatMap((value): ProviderPlace[] => {
        const place = asObject(value);
        const address = asObject(place?.address);
        const rawProviderId = asNumber(place?.place_id) ?? asString(place?.place_id);
        const providerId = rawProviderId == null ? null : String(rawProviderId);
        const name = asString(place?.name) ?? asString(place?.display_name)?.split(",")[0]?.trim();
        const latitude = asNumber(place?.lat);
        const longitude = asNumber(place?.lon);
        if (!providerId || !name) return [];
        return [{
          provider: "osm",
          providerId,
          name,
          category: [asString(place?.category), asString(place?.type)].filter(Boolean).join(":") || "unknown",
          district: asString(address?.city_district) ?? asString(address?.suburb) ?? asString(address?.county),
          address: asString(place?.display_name),
          coordinates: latitude == null || longitude == null ? null : { latitude, longitude },
          distanceMeters: null,
        }];
      });
    });
  }
}

export class OsrmProvider {
  constructor(private readonly fetcher?: ProviderFetch) {}

  async getRoute(request: GoogleRouteRequest): Promise<ProviderRoute> {
    const mode = request.mode;
    if (mode === "transit") throw new Error("Public OSRM does not provide transit routes");
    const profile: Record<Exclude<ProviderRouteMode, "transit">, string> = {
      walking: "foot",
      bicycling: "bike",
    };
    const origin = `${request.origin.longitude},${request.origin.latitude}`;
    const destination = `${request.destination.longitude},${request.destination.latitude}`;
    return rateLimited(async () => {
      const body = asObject(await fetchJson(
        `https://routing.openstreetmap.de/routed-${profile[mode]}/route/v1/driving/${origin};${destination}?overview=false`,
        { fetcher: this.fetcher, timeoutMs: 5_000, headers: { "User-Agent": USER_AGENT } },
      ));
      const route = asObject(asArray(body?.routes)[0]);
      const distanceMeters = asNumber(route?.distance);
      const durationSeconds = asNumber(route?.duration);
      if (asString(body?.code) !== "Ok" || distanceMeters == null || durationSeconds == null) {
        throw new Error("OSRM returned no usable route");
      }
      return {
        provider: "osm",
        mode: request.mode,
        origin: request.origin,
        destination: request.destination,
        distanceMeters,
        durationMinutes: Math.ceil(durationSeconds / 60),
        estimatedCostCny: 0,
      };
    });
  }
}
