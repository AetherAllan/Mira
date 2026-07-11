const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/**
 * A YYYY-MM-DD value is already a local calendar label. Converting midnight
 * with an offset and then asking for UTC weekday shifts Beijing to yesterday.
 */
export function weekdayForLocalDate(localDate: string): Weekday {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) throw new Error(`Invalid local date: ${localDate}`);
  const [, year, month, day] = match;
  const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay();
  return WEEKDAYS[weekday]!;
}

export function isWeekendLocalDate(localDate: string) {
  const weekday = weekdayForLocalDate(localDate);
  return weekday === "Saturday" || weekday === "Sunday";
}
