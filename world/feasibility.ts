import { WORLD_TIME_ZONE, type TripFeasibility } from "@/world/types";

export interface TripFeasibilityInput {
  currentLocationId?: string;
  destinationLocationId: string;
  currentTime?: Date;
  visitStartAt: Date;
  travelMinutes?: number;
  estimatedCost?: number;
  maximumCost?: number;
  availableWindowMinutes?: number;
  minimumVisitMinutes?: number;
  openingStatus: TripFeasibility["openingStatus"];
  weatherRisk: number;
  maximumWeatherRisk?: number;
  reservationRequired: boolean;
  reservationConfirmed?: boolean;
  scheduleAllows: boolean;
}

function beijingHour(date: Date) {
  if (!Number.isFinite(date.getTime())) return Number.NaN;
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: WORLD_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .find((part) => part.type === "hour")?.value;
  return Number(hour);
}

export function evaluateTripFeasibility(input: TripFeasibilityInput): TripFeasibility {
  const reasons: string[] = [];
  const reject = (reason: string) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  const samePlace = input.currentLocationId === input.destinationLocationId;
  const travelMinutes = samePlace ? 0 : input.travelMinutes;
  const estimatedCost = samePlace ? 0 : input.estimatedCost;
  const minimumVisitMinutes = input.minimumVisitMinutes ?? 30;
  const weatherRisk = Number.isFinite(input.weatherRisk)
    ? Math.min(1, Math.max(0, input.weatherRisk))
    : 1;

  if (!input.scheduleAllows) reject("schedule_conflict");
  if (!Number.isFinite(input.visitStartAt.getTime())) reject("invalid_visit_time");
  if (!Number.isFinite(input.weatherRisk)) reject("invalid_weather_risk");
  if (input.openingStatus === "closed") reject("place_closed");
  if (input.openingStatus === "unknown") {
    const hour = beijingHour(input.visitStartAt);
    if (!Number.isFinite(hour) || hour < 10 || hour >= 20) {
      reject("opening_hours_unverified");
    }
  }
  if (input.reservationRequired && !input.reservationConfirmed) reject("reservation_required");
  if (travelMinutes === undefined) reject("route_unavailable");
  else if (!Number.isFinite(travelMinutes) || travelMinutes < 0) reject("invalid_travel_time");

  if (input.currentTime) {
    const availableTravelMinutes =
      (input.visitStartAt.getTime() - input.currentTime.getTime()) / 60_000;
    if (!Number.isFinite(input.currentTime.getTime()) || availableTravelMinutes < 0) {
      reject("visit_time_in_past");
    } else if (
      !samePlace &&
      travelMinutes !== undefined &&
      Number.isFinite(travelMinutes) &&
      availableTravelMinutes < travelMinutes
    ) {
      reject("insufficient_travel_time");
    }
  }

  if (estimatedCost !== undefined && (!Number.isFinite(estimatedCost) || estimatedCost < 0)) {
    reject("invalid_estimated_cost");
  }
  if (input.maximumCost !== undefined) {
    if (!Number.isFinite(input.maximumCost) || input.maximumCost < 0) {
      reject("invalid_budget_limit");
    } else if (estimatedCost === undefined) {
      reject("cost_unavailable");
    } else if (estimatedCost > input.maximumCost) {
      reject("over_budget");
    }
  }

  if (
    input.availableWindowMinutes !== undefined &&
    (!Number.isFinite(input.availableWindowMinutes) || input.availableWindowMinutes < 0)
  ) {
    reject("invalid_available_window");
  }
  if (!Number.isFinite(minimumVisitMinutes) || minimumVisitMinutes < 0) {
    reject("invalid_minimum_visit_time");
  }

  const availableVisitMinutes =
    input.availableWindowMinutes === undefined ||
    travelMinutes === undefined ||
    !Number.isFinite(input.availableWindowMinutes) ||
    !Number.isFinite(travelMinutes)
      ? undefined
      : Math.max(0, input.availableWindowMinutes - travelMinutes);
  if (availableVisitMinutes !== undefined && availableVisitMinutes < minimumVisitMinutes) {
    reject("insufficient_time");
  }
  if (weatherRisk > (input.maximumWeatherRisk ?? 0.8)) reject("weather_risk_too_high");

  return {
    reachable: reasons.length === 0,
    travelMinutes,
    estimatedCost,
    openingStatus: input.openingStatus,
    weatherRisk,
    reservationRequired: input.reservationRequired,
    availableVisitMinutes,
    rejectionReasons: reasons,
  };
}
