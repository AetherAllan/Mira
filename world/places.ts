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
  first: { latitude?: number; longitude?: number },
  second: { latitude?: number; longitude?: number },
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
