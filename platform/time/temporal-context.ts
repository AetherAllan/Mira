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

const DEFAULT_FRESHNESS_MS = 30 * 60_000;

function parts(date: Date, timeZone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      weekday: "long",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function offsetAt(date: Date, timeZone: string) {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  if (!value || value === "GMT") return "+00:00";
  return value.replace("GMT", "");
}

export function zonedDateTime(date: Date, timeZone: string) {
  const value = parts(date, timeZone);
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:${value.second}${offsetAt(date, timeZone)}`;
}

export function localDateAt(date: Date, timeZone: string) {
  const value = parts(date, timeZone);
  return `${value.year}-${value.month}-${value.day}`;
}

export function weekdayAt(date: Date, timeZone: string) {
  return parts(date, timeZone).weekday;
}

export function buildTemporalContext(input: {
  observedAt: Date;
  worldAdvancedThrough: Date;
  timeZone: string;
  freshnessMs?: number;
}): TemporalContext {
  const observed = parts(input.observedAt, input.timeZone);
  const lagMs = Math.max(0, input.observedAt.getTime() - input.worldAdvancedThrough.getTime());
  const hour = Number(observed.hour);
  const dayPeriod =
    hour < 6 ? "late_night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  return {
    timeZone: input.timeZone,
    observedAtUtc: input.observedAt.toISOString(),
    localDateTime: zonedDateTime(input.observedAt, input.timeZone),
    localDate: `${observed.year}-${observed.month}-${observed.day}`,
    localTime: `${observed.hour}:${observed.minute}:${observed.second}`,
    weekday: observed.weekday,
    dayPeriod,
    utcOffset: offsetAt(input.observedAt, input.timeZone),
    worldAdvancedThroughUtc: input.worldAdvancedThrough.toISOString(),
    worldAdvancedThroughLocal: zonedDateTime(input.worldAdvancedThrough, input.timeZone),
    worldLagSeconds: Math.floor(lagMs / 1_000),
    worldStateFresh: lagMs <= (input.freshnessMs ?? DEFAULT_FRESHNESS_MS),
  };
}

