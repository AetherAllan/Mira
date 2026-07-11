export interface ZonedParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  weekday: string;
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const values = Object.fromEntries(
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
  return values as unknown as ZonedParts;
}

export function utcOffsetAt(date: Date, timeZone: string) {
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
  const value = zonedParts(date, timeZone);
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:${value.second}${utcOffsetAt(date, timeZone)}`;
}

export function localDateAt(date: Date, timeZone: string) {
  const value = zonedParts(date, timeZone);
  return `${value.year}-${value.month}-${value.day}`;
}

export function localTimeAt(date: Date, timeZone: string, includeSeconds = true) {
  const value = zonedParts(date, timeZone);
  return includeSeconds
    ? `${value.hour}:${value.minute}:${value.second}`
    : `${value.hour}:${value.minute}`;
}

export function zonedMinutesAt(date: Date, timeZone: string) {
  const value = zonedParts(date, timeZone);
  return Number(value.hour) * 60 + Number(value.minute);
}

export function formatZonedTimestamp(
  date: Date,
  timeZone: string,
  options: { includeYear?: boolean } = {},
) {
  return new Intl.DateTimeFormat("zh-CN", {
    ...(options.includeYear === false ? {} : { year: "numeric" as const }),
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
}
