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

export function zonedDateKey(date = new Date(), timeZone = "Asia/Shanghai") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function zonedMinutes(date = new Date(), timeZone = "Asia/Shanghai") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
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
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
