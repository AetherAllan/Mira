export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function zonedDateKey(date = systemClock.now(), timeZone = "Asia/Shanghai") {
  return localDateAt(date, timeZone);
}

export function zonedMinutes(date = systemClock.now(), timeZone = "Asia/Shanghai") {
  return zonedMinutesAt(date, timeZone);
}

function parseClock(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

export function isQuietHours(
  date: Date,
  quiet: { start: string; end: string; timeZone: string },
) {
  const now = zonedMinutes(date, quiet.timeZone);
  const start = parseClock(quiet.start);
  const end = parseClock(quiet.end);
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

export function hoursSince(date: Date | string | null | undefined, now = new Date()) {
  if (!date) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - new Date(date).getTime()) / 3_600_000);
}

export function formatTimestamp(value: Date | string | null | undefined) {
  if (!value) return "—";
  return formatZonedTimestamp(new Date(value), "Asia/Shanghai");
}
import {
  formatZonedTimestamp,
  localDateAt,
  systemClock,
  zonedMinutesAt,
} from "@/platform/time";
