import { createWorldSeed, seededChoice } from "@/world/random";
import {
  WORLD_TIME_ZONE,
  type ScheduleBlock,
  type ScheduleBlockSource,
  type ScheduleBlockType,
} from "@/world/types";

export interface DailyScheduleInput {
  companionId: string;
  date: Date;
  homeLocationId?: string;
  workLocationId?: string;
  optionalLocationId?: string;
  seed?: string;
  correlationId?: string;
}

export interface ScheduleConflict {
  blockId: string;
  conflictingBlockId?: string;
  reason: "invalid_range" | "duplicate_id" | "overlap";
}

export interface ScheduleBlockChange {
  title?: string;
  type?: ScheduleBlockType;
  startAt?: Date;
  endAt?: Date;
  locationId?: string | null;
  flexibility?: number;
  interruptionTolerance?: number;
  source?: ScheduleBlockSource;
  status?: "changed" | "delayed";
}

interface LocalDay {
  key: string;
  year: number;
  month: number;
  day: number;
  weekDay: number;
}

interface BlockTemplate {
  title: string;
  type: ScheduleBlockType;
  startMinute: number;
  endMinute: number;
  location: "home" | "work" | "optional" | "transit";
  flexibility: number;
  interruptionTolerance: number;
  source?: ScheduleBlockSource;
}

const beijingDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: WORLD_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getLocalDay(date: Date): LocalDay {
  const values = Object.fromEntries(
    beijingDayFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const year = values.year;
  const month = values.month;
  const day = values.day;
  if (!year || !month || !day) throw new Error("Unable to resolve Beijing calendar day");

  return {
    key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year,
    month,
    day,
    weekDay: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

// Beijing has no daylight-saving transition, so local wall time is always UTC+8.
function localMinuteToDate(day: LocalDay, minute: number) {
  return new Date(Date.UTC(day.year, day.month - 1, day.day, 0, minute) - 8 * 60 * 60 * 1000);
}

function optionalBlock(dayType: "workday" | "weekend", seed: string): BlockTemplate {
  const choices: BlockTemplate[] =
    dayType === "workday"
      ? [
          template("在家休息，处理自己的事", "leisure", 1140, 1350, "home", 0.8, 0.9, "routine"),
          template("去附近咖啡店坐一会", "leisure", 1140, 1350, "optional", 0.65, 0.7),
          template("下班后散步", "exploration", 1140, 1350, "optional", 0.7, 0.65),
          template("处理个人计划", "errand", 1140, 1350, "home", 0.55, 0.6),
        ]
      : [
          template("在家玩游戏和看书", "leisure", 780, 1050, "home", 0.9, 0.9, "routine"),
          template("去书店或咖啡店", "exploration", 780, 1050, "optional", 0.7, 0.7),
          template("城市散步", "exploration", 780, 1050, "optional", 0.75, 0.65),
          template("见朋友", "social", 780, 1050, "optional", 0.6, 0.45),
        ];
  return seededChoice(choices, seed) ?? choices[0]!;
}

function template(
  title: string,
  type: ScheduleBlockType,
  startMinute: number,
  endMinute: number,
  location: BlockTemplate["location"],
  flexibility: number,
  interruptionTolerance: number,
  source: ScheduleBlockSource = "mira_decision",
): BlockTemplate {
  return { title, type, startMinute, endMinute, location, flexibility, interruptionTolerance, source };
}

function workdayTemplates(seed: string): BlockTemplate[] {
  const evening = optionalBlock("workday", seed);
  const goingOut = evening.location === "optional";
  return [
    template("睡觉", "sleep", 0, 465, "home", 0.15, 0.05, "routine"),
    template("起床、洗漱和早餐", "meal", 465, 525, "home", 0.45, 0.65, "routine"),
    template("通勤去工作室", "commute", 525, 600, "transit", 0.25, 0.25, "routine"),
    template("上午工作", "work", 600, 720, "work", 0.35, 0.35, "routine"),
    template("午饭", "meal", 720, 780, "work", 0.55, 0.75, "routine"),
    template("下午工作", "work", 780, 1080, "work", 0.4, 0.35, "routine"),
    template(goingOut ? "下班后前往晚间活动地点" : "下班回家", "commute", 1080, 1140, "transit", 0.35, 0.3, "routine"),
    evening,
    template(goingOut ? "回家和洗漱" : "洗漱和准备睡觉", goingOut ? "commute" : "leisure", 1350, 1380, goingOut ? "transit" : "home", 0.25, 0.25, "routine"),
    template("睡觉", "sleep", 1380, 1440, "home", 0.15, 0.05, "routine"),
  ];
}

function weekendTemplates(seed: string): BlockTemplate[] {
  const afternoon = optionalBlock("weekend", seed);
  const goingOut = afternoon.location === "optional";
  return [
    template("睡觉", "sleep", 0, 570, "home", 0.15, 0.05, "routine"),
    template("晚起床和早餐", "meal", 570, 630, "home", 0.75, 0.8, "routine"),
    template("慢慢收拾房间", "leisure", 630, 720, "home", 0.9, 0.9, "routine"),
    template("午饭", "meal", 720, 780, "home", 0.8, 0.85, "routine"),
    afternoon,
    template(goingOut ? "回家" : "晚饭前休息", goingOut ? "commute" : "leisure", 1050, 1080, goingOut ? "transit" : "home", 0.4, 0.4, "routine"),
    template("晚饭", "meal", 1080, 1140, "home", 0.8, 0.85, "routine"),
    template("晚上休息", "leisure", 1140, 1380, "home", 0.9, 0.9, "routine"),
    template("睡觉", "sleep", 1380, 1440, "home", 0.15, 0.05, "routine"),
  ];
}

export function buildDailySchedule(input: DailyScheduleInput): ScheduleBlock[] {
  const day = getLocalDay(input.date);
  const seed = input.seed ?? createWorldSeed(input.companionId, day.key, "daily-plan-v1");
  const correlationId = input.correlationId?.trim() || undefined;
  const isWeekend = day.weekDay === 0 || day.weekDay === 6;
  const templates = isWeekend ? weekendTemplates(seed) : workdayTemplates(seed);

  const schedule: ScheduleBlock[] = templates.map((block, index) => ({
    id: `${input.companionId}:${day.key}:${index}`,
    companionId: input.companionId,
    title: block.title,
    type: block.type,
    startAt: localMinuteToDate(day, block.startMinute),
    endAt: localMinuteToDate(day, block.endMinute),
    locationId:
      block.location === "home"
        ? input.homeLocationId
        : block.location === "work"
          ? input.workLocationId
          : block.location === "optional"
            ? (input.optionalLocationId ?? input.homeLocationId)
            : undefined,
    flexibility: block.flexibility,
    interruptionTolerance: block.interruptionTolerance,
    status: "planned",
    source: block.source ?? "routine",
    localDate: day.key,
    idempotencyKey: `${input.companionId}:schedule:${day.key}:${index}`,
    correlationId,
  }));
  assertScheduleHasNoConflicts(schedule);
  return schedule;
}

function requireReason(reason: string) {
  const value = reason.trim();
  if (!value) throw new Error("Schedule change requires a reason");
  return value;
}

export function findScheduleConflicts(schedule: readonly ScheduleBlock[]): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const ids = new Set<string>();
  for (const block of schedule) {
    if (ids.has(block.id)) conflicts.push({ blockId: block.id, reason: "duplicate_id" });
    ids.add(block.id);
    if (block.endAt.getTime() <= block.startAt.getTime()) {
      conflicts.push({ blockId: block.id, reason: "invalid_range" });
    }
  }

  const active = schedule.filter((block) => block.status !== "cancelled");
  for (let left = 0; left < active.length; left += 1) {
    for (let right = left + 1; right < active.length; right += 1) {
      const first = active[left]!;
      const second = active[right]!;
      if (first.companionId !== second.companionId) continue;
      if (first.startAt < second.endAt && second.startAt < first.endAt) {
        conflicts.push({ blockId: first.id, conflictingBlockId: second.id, reason: "overlap" });
      }
    }
  }
  return conflicts;
}

export function assertScheduleHasNoConflicts(schedule: readonly ScheduleBlock[]) {
  const conflict = findScheduleConflicts(schedule)[0];
  if (!conflict) return;
  throw new Error(
    conflict.conflictingBlockId
      ? `Schedule conflict: ${conflict.blockId} overlaps ${conflict.conflictingBlockId}`
      : `Schedule conflict: ${conflict.blockId} has ${conflict.reason}`,
  );
}

export function rescheduleScheduleBlock(
  schedule: readonly ScheduleBlock[],
  blockId: string,
  change: ScheduleBlockChange,
  reason: string,
  correlationId?: string,
): ScheduleBlock[] {
  const changeReason = requireReason(reason);
  let found = false;
  const next = schedule.map((block) => {
    if (block.id !== blockId) return { ...block };
    found = true;
    if (block.status === "completed" || block.status === "cancelled") {
      throw new Error("Completed or cancelled schedule blocks cannot be rescheduled");
    }
    const updated: ScheduleBlock = {
      ...block,
      ...change,
      locationId: change.locationId === null ? undefined : (change.locationId ?? block.locationId),
      status: change.status ?? "changed",
      changeReason,
      correlationId: correlationId?.trim() || block.correlationId,
    };
    if (updated.flexibility < 0 || updated.flexibility > 1) {
      throw new Error("Schedule flexibility must be between 0 and 1");
    }
    if (updated.interruptionTolerance < 0 || updated.interruptionTolerance > 1) {
      throw new Error("Schedule interruption tolerance must be between 0 and 1");
    }
    return updated;
  });
  if (!found) throw new Error(`Schedule block not found: ${blockId}`);
  assertScheduleHasNoConflicts(next);
  return next;
}

export function cancelScheduleBlock(
  schedule: readonly ScheduleBlock[],
  blockId: string,
  reason: string,
  correlationId?: string,
): ScheduleBlock[] {
  const changeReason = requireReason(reason);
  let found = false;
  const next = schedule.map((block) => {
    if (block.id !== blockId) return { ...block };
    found = true;
    if (block.status === "completed") throw new Error("Completed schedule blocks cannot be cancelled");
    return {
      ...block,
      status: "cancelled" as const,
      changeReason,
      correlationId: correlationId?.trim() || block.correlationId,
    };
  });
  if (!found) throw new Error(`Schedule block not found: ${blockId}`);
  return next;
}
