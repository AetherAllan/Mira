import { placeDistanceMeters } from "@/world/places";
import type { ScheduleBlock } from "@/world/types";

export interface WeatherPlace {
  id: string;
  name: string;
  category: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface WeatherScheduleAdjustment {
  blockId: string;
  beforeLocationId: string;
  indoorPlaceId: string;
  indoorPlaceName: string;
  travelMinutes: number;
  reason: string;
}

const outdoor = /park|公园|outdoor|散步|城市漫步/i;
const indoor = /book|书店|library|图书馆|cafe|咖啡|museum|美术馆|展览|art/i;

export function planWeatherScheduleAdjustment(input: {
  schedule: readonly ScheduleBlock[];
  places: readonly WeatherPlace[];
  now: Date;
  weatherRisk: number;
  weatherSummary: string;
}): WeatherScheduleAdjustment | null {
  if (input.weatherRisk < 0.65) return null;
  const placeById = new Map(input.places.map((place) => [place.id, place]));
  const block = input.schedule.find((candidate) => {
    const place = candidate.locationId ? placeById.get(candidate.locationId) : undefined;
    return candidate.status === "planned" &&
      candidate.startAt > input.now &&
      candidate.startAt.getTime() <= input.now.getTime() + 12 * 60 * 60_000 &&
      Boolean(place && (outdoor.test(place.category) || outdoor.test(candidate.title)));
  });
  if (!block?.locationId) return null;
  const origin = placeById.get(block.locationId);
  if (!origin) return null;
  const candidates = input.places.flatMap((place) => {
    if (!indoor.test(place.category) || place.id === origin.id) return [];
    const distance = placeDistanceMeters(
      { latitude: origin.latitude ?? undefined, longitude: origin.longitude ?? undefined },
      { latitude: place.latitude ?? undefined, longitude: place.longitude ?? undefined },
    );
    if (distance == null) return [];
    const travelMinutes = Math.ceil(10 + distance / 350);
    const availableBeforeStart = (block.startAt.getTime() - input.now.getTime()) / 60_000;
    return travelMinutes <= 60 && travelMinutes <= availableBeforeStart
      ? [{ place, distance, travelMinutes }]
      : [];
  }).sort((left, right) => left.distance - right.distance);
  const selected = candidates[0];
  if (!selected) return null;
  return {
    blockId: block.id,
    beforeLocationId: block.locationId,
    indoorPlaceId: selected.place.id,
    indoorPlaceName: selected.place.name,
    travelMinutes: selected.travelMinutes,
    reason: `天气改变计划：${input.weatherSummary.slice(0, 240)}`,
  };
}
