import type { KnownPlace } from "@/world/types";

export type PlaceCandidate = Pick<
  KnownPlace,
  | "companionId"
  | "provider"
  | "providerPoiId"
  | "name"
  | "latitude"
  | "longitude"
>;

export interface CanonicalPlaceMatch {
  place: KnownPlace;
  reason: "provider_poi_id" | "normalized_name_and_distance";
  distanceMeters?: number;
}

export function normalizePlaceName(name: string): string {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/\([^)]*\)/g, "")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function validCoordinate(latitude: number | undefined, longitude: number | undefined) {
  return (
    latitude !== undefined &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function placeDistanceMeters(
  first: Pick<PlaceCandidate, "latitude" | "longitude">,
  second: Pick<PlaceCandidate, "latitude" | "longitude">,
): number | undefined {
  if (
    !validCoordinate(first.latitude, first.longitude) ||
    !validCoordinate(second.latitude, second.longitude)
  ) {
    return undefined;
  }

  const radians = Math.PI / 180;
  const firstLatitude = first.latitude! * radians;
  const secondLatitude = second.latitude! * radians;
  const latitudeDelta = (second.latitude! - first.latitude!) * radians;
  const longitudeDelta = (second.longitude! - first.longitude!) * radians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

/**
 * Provider identity wins over fuzzy matching. Name-only matches are deliberately rejected:
 * Beijing has many branches with identical names, so coordinates are required for that fallback.
 */
export function findCanonicalPlace(
  candidate: PlaceCandidate,
  existingPlaces: readonly KnownPlace[],
  nearbyThresholdMeters = 150,
): CanonicalPlaceMatch | null {
  if (!Number.isFinite(nearbyThresholdMeters) || nearbyThresholdMeters < 0) {
    throw new Error("Place deduplication distance must be non-negative");
  }
  const sameCompanion = existingPlaces.filter(
    (place) => place.companionId === candidate.companionId,
  );
  const providerPoiId = candidate.providerPoiId?.trim();
  if (providerPoiId) {
    const exact = sameCompanion.find(
      (place) =>
        place.provider === candidate.provider && place.providerPoiId?.trim() === providerPoiId,
    );
    if (exact) return { place: exact, reason: "provider_poi_id" };
  }

  const normalizedName = normalizePlaceName(candidate.name);
  if (!normalizedName) return null;
  const nearby = sameCompanion
    .flatMap((place) => {
      if (normalizePlaceName(place.name) !== normalizedName) return [];
      const distanceMeters = placeDistanceMeters(candidate, place);
      return distanceMeters !== undefined && distanceMeters <= nearbyThresholdMeters
        ? [{ place, distanceMeters }]
        : [];
    })
    .sort((left, right) => left.distanceMeters - right.distanceMeters)[0];

  return nearby
    ? { ...nearby, reason: "normalized_name_and_distance" }
    : null;
}
