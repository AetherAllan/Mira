export interface TemporalContext {
  timeZone: string;
  observedAtUtc: string;
  localDateTime: string;
  localDate: string;
  localTime: string;
  weekday: string;
  dayPeriod: "late_night" | "morning" | "afternoon" | "evening";
  utcOffset: string;
  worldAdvancedThroughUtc: string;
  worldAdvancedThroughLocal: string;
  worldLagSeconds: number;
  worldStateFresh: boolean;
}

export const DEFAULT_WORLD_FRESHNESS_MS = 30 * 60_000;

export function weekdayAt(date: Date, timeZone: string) {
  return zonedParts(date, timeZone).weekday;
}

export function buildTemporalContext(input: {
  observedAt: Date;
  worldAdvancedThrough: Date;
  timeZone: string;
  freshnessMs?: number;
}): TemporalContext {
  const observed = zonedParts(input.observedAt, input.timeZone);
  const lagMs = Math.max(0, input.observedAt.getTime() - input.worldAdvancedThrough.getTime());
  const hour = Number(observed.hour);
  const dayPeriod =
    hour < 6 ? "late_night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  return {
    timeZone: input.timeZone,
    observedAtUtc: input.observedAt.toISOString(),
    localDateTime: zonedDateTime(input.observedAt, input.timeZone),
    localDate: localDateAt(input.observedAt, input.timeZone),
    localTime: localTimeAt(input.observedAt, input.timeZone),
    weekday: observed.weekday,
    dayPeriod,
    utcOffset: utcOffsetAt(input.observedAt, input.timeZone),
    worldAdvancedThroughUtc: input.worldAdvancedThrough.toISOString(),
    worldAdvancedThroughLocal: zonedDateTime(input.worldAdvancedThrough, input.timeZone),
    worldLagSeconds: Math.floor(lagMs / 1_000),
    worldStateFresh: lagMs <= (input.freshnessMs ?? DEFAULT_WORLD_FRESHNESS_MS),
  };
}
import {
  localDateAt,
  localTimeAt,
  utcOffsetAt,
  zonedDateTime,
  zonedParts,
} from "@/platform/time/zoned-time";

