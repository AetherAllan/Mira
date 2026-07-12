import { randomInt, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import type { CompanionState } from "@/core/types";
import { getDb } from "@/db/client";
import {
  companionStates,
  companions,
  dailyLifePlans,
  externalInformation,
  innerThoughts,
  knownPlaces,
  openLoops,
  plannedWorldEvents,
  scheduleBlocks,
  worldCharacters,
} from "@/db/schema";
import { callJson } from "@/llm/client";
import { asObject, asString, asStringArray, type JsonObject } from "@/llm/json";
import { clamp01 } from "@/lib/number";
import { buildDailySchedule, findScheduleConflicts } from "@/world/planner";
import { createSeededRandom, createWorldSeed } from "@/world/random";
import type {
  DailyLifePlan,
  DailyPlanDayType,
  PlannedWorldEvent,
  ScheduleBlock,
  ScheduleBlockType,
  WeekendMode,
} from "@/world/types";
import { resolveWorkday } from "@/world/workCalendar";

const SCHEDULE_TYPES: ScheduleBlockType[] = [
  "sleep", "commute", "work", "meal", "leisure", "social", "errand", "exploration",
];
const EVENT_TYPES = [
  "routine", "work", "social", "external", "weather", "travel", "accident", "thought", "user_influenced",
] as const;
const IMPACT_KEYS = [
  "valence", "energy", "curiosity", "concern", "playfulness", "boredom",
  "loneliness", "irritation", "disappointment", "affection", "aestheticUrge",
  "noveltySeeking", "shareDesire",
] as const;

export type GeneratedSchedule = {
  title: string;
  type: ScheduleBlockType;
  startMinute: number;
  endMinute: number;
  placeKey: string;
};

export type GeneratedEvent = {
  slot: "required" | "candidate";
  eventType: typeof EVENT_TYPES[number];
  title: string;
  description: string;
  startMinute: number;
  endMinute: number;
  placeKey: string;
  characterKeys: string[];
  impacts: Array<{ dimension: typeof IMPACT_KEYS[number]; delta: number }>;
  consequences: string[];
  innerNarrative: string;
  loop: { action: "none" | "create" | "resolve"; topic: string; description: string; nextAction: string };
  importance: number;
  sharePotential: number;
  weight: number;
};

export type GeneratedDay = {
  theme: string;
  summary: string;
  weekendMode: WeekendMode | null;
  schedule: GeneratedSchedule[];
  events: GeneratedEvent[];
};

const PLAN_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["theme", "summary", "weekendMode", "schedule", "events"],
  properties: {
    theme: { type: "string" },
    summary: { type: "string" },
    weekendMode: { type: ["string", "null"], enum: ["outing", "flexible", null] },
    schedule: {
      type: "array",
      minItems: 6,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "type", "startMinute", "endMinute", "placeKey"],
        properties: {
          title: { type: "string" },
          type: { type: "string", enum: SCHEDULE_TYPES },
          startMinute: { type: "integer", minimum: 0, maximum: 1439 },
          endMinute: { type: "integer", minimum: 1, maximum: 1440 },
          placeKey: { type: "string" },
        },
      },
    },
    events: {
      type: "array",
      minItems: 8,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "slot", "eventType", "title", "description", "startMinute", "endMinute",
          "placeKey", "characterKeys", "impacts", "consequences", "innerNarrative",
          "loop", "importance", "sharePotential", "weight",
        ],
        properties: {
          slot: { type: "string", enum: ["required", "candidate"] },
          eventType: { type: "string", enum: EVENT_TYPES },
          title: { type: "string" },
          description: { type: "string" },
          startMinute: { type: "integer", minimum: 0, maximum: 1439 },
          endMinute: { type: "integer", minimum: 1, maximum: 1440 },
          placeKey: { type: "string" },
          characterKeys: { type: "array", maxItems: 3, items: { type: "string" } },
          impacts: {
            type: "array",
            maxItems: 6,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["dimension", "delta"],
              properties: {
                dimension: { type: "string", enum: IMPACT_KEYS },
                delta: { type: "number", minimum: -0.2, maximum: 0.2 },
              },
            },
          },
          consequences: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
          innerNarrative: { type: "string" },
          loop: {
            type: "object",
            additionalProperties: false,
            required: ["action", "topic", "description", "nextAction"],
            properties: {
              action: { type: "string", enum: ["none", "create", "resolve"] },
              topic: { type: "string" },
              description: { type: "string" },
              nextAction: { type: "string" },
            },
          },
          importance: { type: "number", minimum: 0, maximum: 1 },
          sharePotential: { type: "number", minimum: 0, maximum: 1 },
          weight: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
};

function localMinute(localDate: string, minute: number) {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!, 0, minute) - 8 * 60 * 60_000);
}

export function addLocalDays(localDate: string, days: number) {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

function finite(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : null;
}

function parseGeneratedDay(value: JsonObject): GeneratedDay | null {
  const schedule = Array.isArray(value.schedule)
    ? value.schedule.flatMap((item) => {
        const row = asObject(item);
        const type = asString(row?.type) as ScheduleBlockType;
        const startMinute = finite(row?.startMinute, 0, 1439);
        const endMinute = finite(row?.endMinute, 1, 1440);
        if (!row || !SCHEDULE_TYPES.includes(type) || startMinute === null || endMinute === null) return [];
        return [{
          title: asString(row.title).slice(0, 120),
          type,
          startMinute: Math.round(startMinute),
          endMinute: Math.round(endMinute),
          placeKey: asString(row.placeKey),
        }];
      })
    : [];
  const events = Array.isArray(value.events)
    ? value.events.flatMap((item) => {
        const row = asObject(item);
        const slot = asString(row?.slot) as GeneratedEvent["slot"];
        const eventType = asString(row?.eventType) as GeneratedEvent["eventType"];
        const startMinute = finite(row?.startMinute, 0, 1439);
        const endMinute = finite(row?.endMinute, 1, 1440);
        const importance = finite(row?.importance, 0, 1);
        const sharePotential = finite(row?.sharePotential, 0, 1);
        const weight = finite(row?.weight, 0, 1);
        if (
          !row || !["required", "candidate"].includes(slot) || !EVENT_TYPES.includes(eventType) ||
          startMinute === null || endMinute === null || importance === null ||
          sharePotential === null || weight === null
        ) return [];
        const impacts = Array.isArray(row.impacts) ? row.impacts.flatMap((item) => {
          const impact = asObject(item);
          const dimension = asString(impact?.dimension) as GeneratedEvent["impacts"][number]["dimension"];
          const delta = finite(impact?.delta, -0.2, 0.2);
          return impact && IMPACT_KEYS.includes(dimension) && delta !== null ? [{ dimension, delta }] : [];
        }) : [];
        const loop = asObject(row.loop);
        const action = asString(loop?.action) as GeneratedEvent["loop"]["action"];
        return [{
          slot,
          eventType,
          title: asString(row.title).slice(0, 160),
          description: asString(row.description).slice(0, 700),
          startMinute: Math.round(startMinute),
          endMinute: Math.round(endMinute),
          placeKey: asString(row.placeKey),
          characterKeys: asStringArray(row.characterKeys).slice(0, 3),
          impacts,
          consequences: asStringArray(row.consequences).slice(0, 3),
          innerNarrative: asString(row.innerNarrative).slice(0, 700),
          loop: {
            action: ["create", "resolve"].includes(action) ? action : "none",
            topic: asString(loop?.topic).slice(0, 160),
            description: asString(loop?.description).slice(0, 500),
            nextAction: asString(loop?.nextAction).slice(0, 300),
          },
          importance,
          sharePotential,
          weight,
        }];
      })
    : [];
  const theme = asString(value.theme).slice(0, 160);
  const summary = asString(value.summary).slice(0, 700);
  const weekendMode = value.weekendMode === "outing" || value.weekendMode === "flexible"
    ? value.weekendMode
    : null;
  return theme && summary ? { theme, summary, weekendMode, schedule, events } : null;
}

function scheduleDomain(
  companionId: string,
  localDate: string,
  generated: GeneratedSchedule[],
  placeIdByKey: Map<string, string>,
  correlationId: string,
): ScheduleBlock[] {
  return generated.map((block, index) => ({
    id: `${companionId}:${localDate}:ai:${index}`,
    companionId,
    title: block.title,
    type: block.type,
    startAt: localMinute(localDate, block.startMinute),
    endAt: localMinute(localDate, block.endMinute),
    locationId: block.placeKey === "transit" ? undefined : placeIdByKey.get(block.placeKey),
    flexibility: block.type === "work" || block.type === "commute" ? 0.35 : 0.75,
    interruptionTolerance: block.type === "sleep" ? 0.05 : block.type === "work" ? 0.35 : 0.75,
    status: "planned",
    source: "mira_decision",
    localDate,
    idempotencyKey: `${companionId}:schedule:${localDate}:${index}`,
    correlationId,
  }));
}

function fingerprints(events: GeneratedEvent[]) {
  return events.map((event) =>
    [
      event.eventType,
      event.placeKey,
      [...event.characterKeys].sort().join("+") || "solo",
      event.title.replace(/[\s，。！？、]/g, "").slice(0, 12),
    ].join(":"),
  );
}

function overlap(left: string[], right: string[]) {
  const a = new Set(left);
  const b = new Set(right);
  let hits = 0;
  for (const value of a) if (b.has(value)) hits += 1;
  return hits / Math.max(1, Math.min(a.size, b.size));
}

function validatePlan(input: {
  generated: GeneratedDay;
  dayType: DailyPlanDayType;
  weekendMode: WeekendMode | null;
  localDate: string;
  companionId: string;
  placeIdByKey: Map<string, string>;
  characterKeys: Set<string>;
  recentPlans: Array<{ theme: string; fingerprintJson: string[] }>;
  correlationId: string;
  notBeforeMinute?: number;
}) {
  const errors: string[] = [];
  const required = input.generated.events.filter((event) => event.slot === "required");
  const candidates = input.generated.events.filter((event) => event.slot === "candidate");
  if (required.length !== 4) errors.push("required_event_count_must_be_4");
  if (candidates.length < 4 || candidates.length > 6) errors.push("candidate_event_count_must_be_4_to_6");
  if (required.filter((event) => event.importance >= 0.65).length !== 2) {
    errors.push("exactly_2_required_events_must_be_major");
  }
  const knownPlaceKeys = new Set([...input.placeIdByKey.keys(), "transit"]);
  for (const block of input.generated.schedule) {
    if (!block.title || block.endMinute <= block.startMinute) errors.push("invalid_schedule_range");
    if (!knownPlaceKeys.has(block.placeKey)) errors.push(`unknown_schedule_place:${block.placeKey}`);
  }
  for (const event of input.generated.events) {
    if (!event.title || !event.description || !event.innerNarrative || event.endMinute <= event.startMinute) {
      errors.push("invalid_event_content_or_range");
    }
    if (!knownPlaceKeys.has(event.placeKey)) errors.push(`unknown_event_place:${event.placeKey}`);
    for (const key of event.characterKeys) {
      if (!input.characterKeys.has(key)) errors.push(`unknown_character:${key}`);
    }
    if (input.notBeforeMinute !== undefined && event.startMinute < input.notBeforeMinute) {
      errors.push("event_before_bootstrap_time");
    }
  }
  const schedule = scheduleDomain(
    input.companionId,
    input.localDate,
    input.generated.schedule,
    input.placeIdByKey,
    input.correlationId,
  );
  if (findScheduleConflicts(schedule).length) errors.push("schedule_overlap");
  const sleepMinutes = input.generated.schedule
    .filter((block) => block.type === "sleep")
    .reduce((sum, block) => sum + block.endMinute - block.startMinute, 0);
  if (sleepMinutes < 420) errors.push("sleep_must_be_at_least_7_hours");
  if (input.dayType === "workday") {
    const work = input.generated.schedule.filter((block) => block.type === "work");
    const coveredMinutes = work.reduce((sum, block) => sum + block.endMinute - block.startMinute, 0);
    if (
      !work.some((block) => block.startMinute <= 600) ||
      !work.some((block) => block.endMinute >= 1080) ||
      coveredMinutes < 420
    ) {
      errors.push("workday_must_cover_10_to_18");
    }
    if (!input.generated.schedule.some((block) => block.type === "commute")) errors.push("workday_needs_commute");
  }
  if (input.weekendMode && input.generated.weekendMode !== input.weekendMode) {
    errors.push(`weekend_mode_must_be_${input.weekendMode}`);
  }
  if (input.dayType === "workday" && input.generated.weekendMode !== null) {
    errors.push("workday_weekend_mode_must_be_null");
  }
  const nextFingerprints = fingerprints(input.generated.events);
  if (new Set(nextFingerprints).size !== nextFingerprints.length) {
    errors.push("events_must_be_unique_within_day");
  }
  const normalizedTheme = input.generated.theme.trim().toLocaleLowerCase();
  if (input.recentPlans.slice(0, 3).some((plan) => plan.theme.trim().toLocaleLowerCase() === normalizedTheme)) {
    errors.push("theme_repeated_within_3_days");
  }
  if (input.recentPlans.slice(0, 7).some((plan) => overlap(nextFingerprints, plan.fingerprintJson) > 0.5)) {
    errors.push("event_fingerprint_overlap_above_50_percent");
  }
  return { errors: [...new Set(errors)], schedule, fingerprints: nextFingerprints };
}

/**
 * The model owns the content, while deterministic code owns hard invariants.
 * Free models often return good life material with the wrong required/candidate
 * labels or an incomplete work/sleep schedule. After the required retry, keep
 * that material and replace only those mechanical parts instead of throwing the
 * entire day away for a generic fallback story.
 */
export function normalizeGeneratedDay(input: {
  generated: GeneratedDay;
  fallback: GeneratedDay;
  knownPlaceKeys: Set<string>;
  characterKeys: Set<string>;
  notBeforeMinute?: number;
}) {
  const seen = new Set<string>();
  const usable = input.generated.events
    .filter((event) => {
      if (!event.title || !event.description || !event.innerNarrative) return false;
      const key = fingerprints([event])[0]!;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);
  if (usable.length < 8) return null;

  const ranked = usable
    .map((event, index) => ({ index, importance: event.importance }))
    .sort((left, right) => right.importance - left.importance);
  const majorIndexes = new Set(ranked.slice(0, 2).map((item) => item.index));
  const sliceIndexes = new Set(
    ranked.slice(2)
      .sort((left, right) => left.importance - right.importance)
      .slice(0, 2)
      .map((item) => item.index),
  );

  const events = usable.map((event, index) => {
    const major = majorIndexes.has(index);
    const required = major || sliceIndexes.has(index);
    const fallbackWindow = input.fallback.events[index % input.fallback.events.length]!;
    const rangeIsUsable = event.endMinute > event.startMinute &&
      (input.notBeforeMinute === undefined || event.startMinute >= input.notBeforeMinute);
    const placeKey = input.knownPlaceKeys.has(event.placeKey)
      ? event.placeKey
      : event.eventType === "work"
        ? "work"
        : event.eventType === "travel"
          ? "transit"
          : "home";
    return {
      ...event,
      slot: required ? "required" as const : "candidate" as const,
      importance: major ? Math.max(0.65, event.importance) : required ? Math.min(0.64, event.importance) : event.importance,
      startMinute: rangeIsUsable ? event.startMinute : fallbackWindow.startMinute,
      endMinute: rangeIsUsable ? event.endMinute : fallbackWindow.endMinute,
      placeKey,
      characterKeys: event.characterKeys.filter((key) => input.characterKeys.has(key)),
    };
  });

  return {
    ...input.generated,
    weekendMode: input.fallback.weekendMode,
    // Calendar, commute and sleep are factual constraints, not creative text.
    schedule: input.fallback.schedule,
    events,
  } satisfies GeneratedDay;
}

function fallbackPlan(input: {
  companionId: string;
  localDate: string;
  dayType: DailyPlanDayType;
  weekendMode: WeekendMode | null;
  homePlaceId: string;
  workPlaceId: string;
  optionalPlaceId?: string;
  characters: Array<{ stableKey: string; relationshipType: string }>;
  correlationId: string;
  samplingSeed: number;
  notBeforeMinute?: number;
}) {
  const at = localMinute(input.localDate, 720);
  const schedule = buildDailySchedule({
    companionId: input.companionId,
    date: at,
    homeLocationId: input.homePlaceId,
    workLocationId: input.workPlaceId,
    optionalLocationId: input.optionalPlaceId,
    weekendMode: input.weekendMode ?? undefined,
    dayType: input.dayType,
    seed: createWorldSeed(String(input.samplingSeed), input.weekendMode ?? input.dayType),
    correlationId: input.correlationId,
  });
  const roommateKeys = input.characters.filter((c) => c.relationshipType === "roommate").map((c) => c.stableKey);
  const friendKeys = input.characters.filter((c) => c.relationshipType === "friend" || c.relationshipType === "coworker").map((c) => c.stableKey);
  const random = createSeededRandom(String(input.samplingSeed));
  const roommate = roommateKeys[Math.floor(random() * roommateKeys.length)] ?? "tang_rui";
  const friend = friendKeys[Math.floor(random() * friendKeys.length)] ?? "lin_xia";
  const homeKey = "home";
  const workKey = "work";
  const outingKey = input.optionalPlaceId ? "optional" : homeKey;
  const event = (
    slot: GeneratedEvent["slot"], eventType: GeneratedEvent["eventType"], title: string,
    description: string, startMinute: number, placeKey: string, characterKeys: string[],
    importance: number, innerNarrative: string,
  ): GeneratedEvent => ({
    slot, eventType, title, description, startMinute, endMinute: startMinute + 45,
    placeKey, characterKeys, impacts: [{ dimension: "valence", delta: importance >= 0.65 ? 0.06 : 0.02 }],
    consequences: ["这件事会进入今天后续的判断"], innerNarrative,
    loop: { action: importance >= 0.65 ? "create" : "none", topic: title, description, nextAction: "之后看看它有没有后续" },
    importance, sharePotential: importance >= 0.65 ? 0.72 : 0.32, weight: 0.55,
  });
  const workday = input.dayType === "workday";
  const generatedEvents: GeneratedEvent[] = workday
    ? [
        event("required", "work", "项目里出现了一个真正需要判断的问题", "林夏带着一处视觉和实现冲突来找 Mira，两个人没有立刻同意。", 660, workKey, ["lin_xia"], 0.78, "我在意的不是谁说服谁，而是我终于有了自己的技术判断。"),
        event("required", "social", "晚饭后的室友聊天没有停在寒暄", "回家后和室友聊到各自最近卡住的事情，留下一个还没有答案的话题。", 1230, homeKey, [roommate], 0.7, "别人的生活不是背景板，她说的那句话让我重新看了一眼自己的处境。"),
        event("required", "travel", "通勤里重新排了一遍今天", "地铁换乘时把今天真正要完成的事情重新排了顺序。", 570, "transit", [], 0.3, "还没到公司，我已经知道哪件事不能再拖。"),
        event("required", "routine", "午饭没有继续盯着工作", "午饭时短暂离开屏幕，注意到自己上午一直绷着。", 750, workKey, [], 0.28, "停下来以后才发现，身体比脑子更早知道我累了。"),
      ]
    : [
        event("required", "social", "和朋友见面后改变了原来的安排", "见面以后临时换了去处，谈话也从近况转到一个更具体的问题。", 870, outingKey, [friend], 0.78, "计划被改掉没有让我烦，反而像今天终于开始自己生长。"),
        event("required", "social", "室友之间完成了一件共同的小事", "几个人一起处理了合租生活里拖着没做的事情，顺便聊出新的周末想法。", 1140, homeKey, [roommate], 0.7, "共同生活不是自动发生的，关系藏在这些没人拍照的小事里。"),
        event("required", "routine", "睡到自然醒以后慢慢收拾", "没有赶时间，先把房间和自己都恢复到舒服的状态。", 630, homeKey, [], 0.3, "空出来的上午不是浪费，它让我重新有自己的节奏。"),
        event("required", "routine", "在熟悉的城市里换了一条路", "没有追求打卡，只是选了一条平时不会走的路线。", 960, outingKey, [], 0.3, "新鲜感不一定来自远方，有时候只是没有照旧。"),
      ];
  generatedEvents.push(
    event("candidate", "routine", "早餐时发现冰箱里少了一样东西", "原本顺手的早餐被一个小缺口打断。", 510, homeKey, [roommate], 0.24, "小麻烦让我意识到合租生活也有自己的协作节奏。"),
    event("candidate", workday ? "work" : "social", workday ? "同事临时问了一个接口细节" : "朋友发来一个临时邀约", "事情不大，但需要当下做一个选择。", workday ? 930 : 780, workday ? workKey : homeKey, [friend], 0.38, "我没有立刻顺着别人，而是先问自己今天想不想。"),
    event("candidate", "routine", "一杯饮料的味道和上次不一样", "很小的感官差异让注意力从屏幕和计划里出来。", 990, workday ? workKey : outingKey, [], 0.2, "这种细节不会改变人生，但会让一天不只是时间表。"),
    event("candidate", "social", "室友在门口多停了几分钟", "一句原本随口的话变成了短短的认真交流。", 1290, homeKey, [roommate], 0.42, "我差点把它当成闲聊，但她其实在试着告诉我一件重要的事。"),
    event("candidate", "thought", "一个旧问题换了新的问法", "今天的经历让一个开放问题出现了更具体的角度。", 1320, homeKey, [], 0.36, "答案还没有，但问题终于不再只是抽象句子。"),
    event("candidate", "routine", "睡前决定不再继续刷屏", "在疲惫变成烦躁前停下来，给明天留一点余量。", 1365, homeKey, [], 0.22, "结束一天也是一种主动选择。"),
  );
  if (input.notBeforeMinute !== undefined) {
    const first = Math.ceil(Math.max(input.notBeforeMinute, 570) / 15) * 15;
    const last = 1365;
    const step = Math.max(15, Math.floor((last - first) / Math.max(1, generatedEvents.length - 1) / 15) * 15);
    generatedEvents.forEach((item, index) => {
      item.startMinute = Math.min(last, first + index * step);
      item.endMinute = Math.min(1440, item.startMinute + 30);
    });
  }
  const placeKeyById = new Map([[input.homePlaceId, "home"], [input.workPlaceId, "work"]]);
  if (input.optionalPlaceId) placeKeyById.set(input.optionalPlaceId, "optional");
  const generated: GeneratedDay = {
    theme: workday ? "在工作判断与合租生活之间找回自己的节奏" : "让周末在朋友、城市和独处之间自然展开",
    summary: workday ? "正常上班，也让下班后的生活继续发生。" : "不追求打卡，让真实关系和临时变化推动这一天。",
    weekendMode: input.weekendMode,
    schedule: schedule.map((block) => ({
      title: block.title,
      type: block.type,
      startMinute: Math.round((block.startAt.getTime() - localMinute(input.localDate, 0).getTime()) / 60_000),
      endMinute: Math.round((block.endAt.getTime() - localMinute(input.localDate, 0).getTime()) / 60_000),
      placeKey: block.locationId ? (placeKeyById.get(block.locationId) ?? "home") : "transit",
    })),
    events: generatedEvents,
  };
  return { generated, schedule, fingerprints: fingerprints(generatedEvents) };
}

function stateFromRow(row: typeof companionStates.$inferSelect): CompanionState {
  return {
    traits: row.traitsJson,
    mood: row.moodJson,
    drives: row.drivesJson,
    relationship: row.relationshipJson,
    activeArcs: row.activeArcsJson,
    stateReasons: row.stateReasonsJson,
    version: row.version,
  };
}

export async function generateDailyLifePlan(
  companionId: string,
  localDate: string,
  options: { notBefore?: Date } = {},
) {
  const db = getDb();
  const [existing] = await db.select().from(dailyLifePlans)
    .where(and(eq(dailyLifePlans.companionId, companionId), eq(dailyLifePlans.localDate, localDate)))
    .limit(1);
  if (existing && ["ready", "fallback", "completed"].includes(existing.status)) return existing;

  const since = addLocalDays(localDate, -14);
  const [companionRows, stateRows, places, characters, loops, recentPlans, info] = await Promise.all([
    db.select().from(companions).where(eq(companions.id, companionId)).limit(1),
    db.select().from(companionStates).where(eq(companionStates.companionId, companionId)).limit(1),
    db.select().from(knownPlaces).where(eq(knownPlaces.companionId, companionId)),
    db.select().from(worldCharacters).where(eq(worldCharacters.companionId, companionId)),
    db.select().from(openLoops).where(and(eq(openLoops.companionId, companionId), inArray(openLoops.status, ["open", "waiting"]))).limit(10),
    db.select({ theme: dailyLifePlans.theme, fingerprintJson: dailyLifePlans.fingerprintJson, localDate: dailyLifePlans.localDate })
      .from(dailyLifePlans)
      .where(and(eq(dailyLifePlans.companionId, companionId), gte(dailyLifePlans.localDate, since)))
      .orderBy(desc(dailyLifePlans.localDate)),
    db.select({ title: externalInformation.title, summary: externalInformation.factualSummary })
      .from(externalInformation)
      .where(and(eq(externalInformation.companionId, companionId), eq(externalInformation.status, "new")))
      .orderBy(desc(externalInformation.fetchedAt)).limit(5),
  ]);
  const companion = companionRows[0];
  const stateRow = stateRows[0];
  if (!companion || !stateRow) throw new Error("Daily planning requires companion state");
  const profile = companion.configJson.character.profile;
  const home = places.find((place) => place.canonicalKey === profile.homePlaceKey);
  const work = places.find((place) => place.canonicalKey === profile.workPlaceKey);
  if (!home || !work) throw new Error("Daily planning requires home and work places");
  const optional = places.find((place) => place.status === "want_to_visit") ?? places.find((place) => place.id !== home.id && place.id !== work.id);
  const placeIdByKey = new Map(places.map((place) => [place.canonicalKey, place.id]));
  placeIdByKey.set("home", home.id);
  placeIdByKey.set("work", work.id);
  if (optional) placeIdByKey.set("optional", optional.id);
  const { dayType, source: calendarSource } = resolveWorkday(localDate);
  const weekday = new Date(`${localDate}T12:00:00+08:00`).getUTCDay();
  let weekendMode: WeekendMode | null = null;
  if (dayType === "restday" && (weekday === 0 || weekday === 6)) {
    if (weekday === 0) {
      const saturday = recentPlans.find((plan) => plan.localDate === addLocalDays(localDate, -1));
      const saturdayRow = saturday
        ? await db.select({ weekendMode: dailyLifePlans.weekendMode }).from(dailyLifePlans)
          .where(and(eq(dailyLifePlans.companionId, companionId), eq(dailyLifePlans.localDate, saturday.localDate))).limit(1)
        : [];
      weekendMode = saturdayRow[0]?.weekendMode === "outing" ? "flexible" : "outing";
    } else {
      weekendMode = createSeededRandom(createWorldSeed(companionId, localDate, "weekend-mode"))() < 0.5 ? "outing" : "flexible";
    }
  }
  const correlationId = randomUUID();
  let samplingSeed = randomInt(1, 2_147_483_647);
  const notBeforeMinute = options.notBefore && new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(options.notBefore) === localDate
    ? Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(options.notBefore).replace(":", ""))
    : undefined;
  const normalizedNotBeforeMinute = notBeforeMinute === undefined
    ? undefined
    : Math.floor(notBeforeMinute / 100) * 60 + notBeforeMinute % 100;
  const fallback = fallbackPlan({
    companionId, localDate, dayType, weekendMode, homePlaceId: home.id, workPlaceId: work.id,
    optionalPlaceId: optional?.id, characters, correlationId, samplingSeed,
    notBeforeMinute: normalizedNotBeforeMinute,
  });
  const state = stateFromRow(stateRow);
  const promptContext = {
    localDate,
    dayType,
    calendarSource,
    weekendMode,
    hardRules: [
      "exactly 4 required events, exactly 2 of them importance >= 0.65",
      "4 to 6 candidate events",
      "friendship only; no romance or flirting",
      "events must fit the schedule and use only provided placeKey/characterKey",
      "workday schedule must cover work from 10:00 through 18:00 and include commute",
      "at least 7 hours of sleep",
      "all minutes are Beijing minutes since local midnight; every endMinute must be greater than startMinute",
      "never create a block that crosses midnight; split sleep into 00:00-to-morning and late-evening-to-24:00 blocks",
      "use placeKey aliases or canonical keys exactly; never put a human-readable place name in placeKey",
      "make work, roommates, friends, solitude and interests all capable of affecting state",
      "impact delta is a direct state change: positive raises a dimension and negative lowers it; pleasant or interesting experiences normally raise valence or curiosity, while relief lowers boredom, loneliness, concern, irritation or disappointment",
    ],
    state,
    activeLoops: loops.map((loop) => ({ id: loop.id, topic: loop.topic, description: loop.description, nextAction: loop.nextAction })),
    places: places.map((place) => ({ placeKey: place.canonicalKey, name: place.name, category: place.category, status: place.status })),
    aliases: { home: home.canonicalKey, work: work.canonicalKey, optional: optional?.canonicalKey ?? home.canonicalKey, transit: "no physical place id" },
    characters: characters.map((character) => ({ characterKey: character.stableKey, name: character.name, role: character.role, relationship: character.relationshipType, situation: character.currentSituation })),
    recentPlans,
    externalInformation: info,
    notBeforeMinute: normalizedNotBeforeMinute ?? null,
  };
  let generated = fallback.generated;
  let schedule = fallback.schedule;
  let generatedFingerprints = fallback.fingerprints;
  let status: DailyLifePlan["status"] = "fallback";
  let validationSource: "fallback" | "llm" | "llm_normalized" = "fallback";
  let validationErrors: string[] = [];
  const validationAttempts: Array<{ attempt: number; errors: string[]; usedFallback: boolean }> = [];
  const aiCandidates: Array<{ generated: GeneratedDay; seed: number }> = [];
  let generationAttempt = 0;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    generationAttempt = attempt;
    if (attempt === 2) samplingSeed = randomInt(1, 2_147_483_647);
    const result = await callJson({
      messages: [
        { role: "system", content: "你是 Mira 的每日生活规划器。生成具体、可执行、有连续性但不重复的北京生活。只输出 schema 要求的 JSON。" },
        { role: "user", content: JSON.stringify({ ...promptContext, previousValidationErrors: validationErrors }).slice(0, 28_000) },
      ],
      fallback: fallback.generated,
      validate: parseGeneratedDay,
      model: companion.configJson.model,
      temperature: 1,
      topP: 0.95,
      seed: samplingSeed,
      maxTokens: 4_500,
      // Free structured-output models regularly need just over 45 seconds for
      // ten detailed events. This is a background job; chat keeps its shorter
      // default timeout.
      timeoutMs: 90_000,
      responseSchema: { name: "mira_daily_life_plan", schema: PLAN_SCHEMA },
      usageContext: { companionId, correlationId, category: "world_planning", metadata: { localDate, attempt } },
    });
    const validation = validatePlan({
      generated: result.data, dayType, weekendMode, localDate, companionId, placeIdByKey,
      characterKeys: new Set(characters.map((character) => character.stableKey)),
      recentPlans, correlationId, notBeforeMinute: normalizedNotBeforeMinute,
    });
    validationErrors = [...validation.errors, ...(result.usedFallback ? [result.error ?? "llm_fallback"] : [])];
    validationAttempts.push({ attempt, errors: validationErrors, usedFallback: result.usedFallback });
    if (!result.usedFallback) {
      aiCandidates.push({ generated: result.data, seed: samplingSeed });
    }
    if (!result.usedFallback && validation.errors.length === 0) {
      generated = result.data;
      schedule = validation.schedule;
      generatedFingerprints = validation.fingerprints;
      status = "ready";
      validationSource = "llm";
      break;
    }
  }

  if (status === "fallback") {
    // Prefer the retry, but keep the first answer available when the retry is
    // structurally worse. Both raw responses remain in the LLM audit table.
    for (const candidate of aiCandidates.toReversed()) {
      const normalized = normalizeGeneratedDay({
        generated: candidate.generated,
        fallback: fallback.generated,
        knownPlaceKeys: new Set([...placeIdByKey.keys(), "transit"]),
        characterKeys: new Set(characters.map((character) => character.stableKey)),
        notBeforeMinute: normalizedNotBeforeMinute,
      });
      if (!normalized) continue;
      const validation = validatePlan({
        generated: normalized, dayType, weekendMode, localDate, companionId, placeIdByKey,
        characterKeys: new Set(characters.map((character) => character.stableKey)),
        recentPlans, correlationId, notBeforeMinute: normalizedNotBeforeMinute,
      });
      if (validation.errors.length === 0) {
        generated = normalized;
        schedule = validation.schedule;
        generatedFingerprints = validation.fingerprints;
        samplingSeed = candidate.seed;
        status = "ready";
        validationSource = "llm_normalized";
        validationErrors = [];
        break;
      }
      validationErrors = validation.errors;
    }
  }

  const inserted = await db.transaction(async (tx) => {
    const [plan] = await tx.insert(dailyLifePlans).values({
      companionId,
      localDate,
      dayType,
      weekendMode: generated.weekendMode ?? weekendMode,
      theme: generated.theme,
      summary: generated.summary,
      samplingSeed,
      fingerprintJson: generatedFingerprints,
      validationJson: {
        errors: validationErrors,
        attempts: validationAttempts,
        calendarSource,
        source: validationSource,
        fallbackValidated: status === "fallback",
      },
      status,
      generationAttempt,
      correlationId,
    }).onConflictDoNothing({ target: [dailyLifePlans.companionId, dailyLifePlans.localDate] }).returning();
    if (!plan) return null;
    await tx.insert(scheduleBlocks).values(schedule.map((block) => ({
      companionId,
      idempotencyKey: block.idempotencyKey!,
      title: block.title,
      type: block.type,
      startAt: block.startAt,
      endAt: block.endAt,
      localDate,
      locationId: block.locationId,
      flexibility: block.flexibility,
      interruptionTolerance: block.interruptionTolerance,
      status: block.status,
      source: block.source,
      correlationId,
    }))).onConflictDoNothing({ target: [scheduleBlocks.companionId, scheduleBlocks.idempotencyKey] });
    await tx.insert(plannedWorldEvents).values(generated.events.map((event, index) => ({
      planId: plan.id,
      companionId,
      idempotencyKey: `${companionId}:planned:${localDate}:${index}`,
      slot: event.slot,
      weight: event.weight,
      eventType: event.eventType,
      title: event.title,
      description: event.description,
      windowStart: localMinute(localDate, event.startMinute),
      windowEnd: localMinute(localDate, event.endMinute),
      locationId: event.placeKey === "transit" ? null : (placeIdByKey.get(event.placeKey) ?? null),
      characterIdsJson: event.characterKeys.flatMap((key) => {
        const character = characters.find((candidate) => candidate.stableKey === key);
        return character ? [character.id] : [];
      }),
      emotionalImpactJson: Object.fromEntries(event.impacts.map((impact) => [impact.dimension, impact.delta])),
      consequencesJson: event.consequences,
      innerNarrative: event.innerNarrative,
      loopJson: event.loop,
      importance: clamp01(event.importance),
      sharePotential: clamp01(event.sharePotential),
      status: "planned" as const,
      correlationId,
    })));
    return plan;
  });
  if (inserted) return inserted;
  const [canonical] = await db.select().from(dailyLifePlans)
    .where(and(eq(dailyLifePlans.companionId, companionId), eq(dailyLifePlans.localDate, localDate))).limit(1);
  if (!canonical) throw new Error("Daily plan lost its insert race without a canonical row");
  return canonical;
}

export function planRowToDomain(row: typeof dailyLifePlans.$inferSelect): DailyLifePlan {
  return {
    id: row.id,
    companionId: row.companionId,
    localDate: row.localDate,
    dayType: row.dayType,
    weekendMode: row.weekendMode ?? undefined,
    theme: row.theme,
    summary: row.summary,
    samplingSeed: row.samplingSeed,
    fingerprints: row.fingerprintJson,
    validation: row.validationJson,
    status: row.status,
    generationAttempt: row.generationAttempt,
    correlationId: row.correlationId ?? undefined,
  };
}

export function plannedEventRowToDomain(row: typeof plannedWorldEvents.$inferSelect): PlannedWorldEvent {
  return {
    id: row.id,
    planId: row.planId,
    companionId: row.companionId,
    idempotencyKey: row.idempotencyKey,
    slot: row.slot,
    weight: row.weight,
    eventType: row.eventType,
    title: row.title,
    description: row.description,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    locationId: row.locationId ?? undefined,
    characterIds: row.characterIdsJson,
    emotionalImpact: row.emotionalImpactJson,
    consequences: row.consequencesJson,
    innerNarrative: row.innerNarrative,
    loop: row.loopJson,
    importance: row.importance,
    sharePotential: row.sharePotential,
    status: row.status,
    selectionReason: row.selectionReason ?? undefined,
    occurredEventId: row.occurredEventId ?? undefined,
    correlationId: row.correlationId ?? undefined,
  };
}

export async function selectPlannedEventForTick(input: {
  companionId: string;
  occurredAt: Date;
  mood: CompanionState["mood"];
  drives: CompanionState["drives"];
}) {
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(input.occurredAt);
  const db = getDb();
  const [plan] = await db.select().from(dailyLifePlans)
    .where(and(eq(dailyLifePlans.companionId, input.companionId), eq(dailyLifePlans.localDate, localDate)))
    .limit(1);
  if (!plan) return null;
  const rows = await db.select().from(plannedWorldEvents).where(and(
    eq(plannedWorldEvents.planId, plan.id),
    eq(plannedWorldEvents.status, "planned"),
    lte(plannedWorldEvents.windowStart, input.occurredAt),
  )).orderBy(asc(plannedWorldEvents.windowStart));
  const due = rows.find((row) => row.windowEnd > input.occurredAt) ?? rows.find((row) => row.slot === "required");
  if (!due) return null;
  const event = plannedEventRowToDomain(due);
  if (event.slot === "required") {
    return { event: { ...event, status: "selected" as const, selectionReason: "required_time_window" }, createThought: true };
  }
  const candidateStatuses = await db.select({ status: plannedWorldEvents.status })
    .from(plannedWorldEvents)
    .where(and(
      eq(plannedWorldEvents.planId, plan.id),
      eq(plannedWorldEvents.slot, "candidate"),
    ));
  const occurred = candidateStatuses.filter((row) => row.status === "occurred").length;
  const remaining = candidateStatuses.filter((row) => row.status === "planned").length;
  const needed = Math.max(0, 2 - occurred);
  const force = remaining <= needed;
  const localHour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", hour: "2-digit", hourCycle: "h23",
  }).format(input.occurredAt));
  const probability = Math.min(
    0.92,
    0.18 + event.weight * 0.4 + input.drives.noveltySeeking * 0.22 +
      input.mood.boredom * 0.12 + (localHour >= 18 ? 0.12 : 0),
  );
  const selected = occurred < 4 && (force || createSeededRandom(createWorldSeed(
    String(plan.samplingSeed), event.id, "candidate-selection",
  ))() < probability);
  if (!selected) {
    return {
      event: { ...event, status: "skipped" as const, selectionReason: occurred >= 4 ? "candidate_daily_cap" : `probability_rejected:${probability.toFixed(3)}` },
      createThought: false,
    };
  }
  const thoughtRows = await db.select({ id: innerThoughts.id }).from(innerThoughts).where(and(
    eq(innerThoughts.companionId, input.companionId),
    gte(innerThoughts.createdAt, localMinute(localDate, 0)),
    lt(innerThoughts.createdAt, localMinute(addLocalDays(localDate, 1), 0)),
  ));
  const thoughtCount = thoughtRows.length;
  const createThought = thoughtCount < 3 || (
    thoughtCount < 5 && createSeededRandom(createWorldSeed(event.id, "thought-selection"))() < 0.55
  );
  return {
    event: { ...event, status: "selected" as const, selectionReason: force ? "minimum_candidate_floor" : `probability_selected:${probability.toFixed(3)}` },
    createThought,
  };
}

export async function listDailyPlanContext(companionId: string, localDate: string) {
  const db = getDb();
  const [plan] = await db.select().from(dailyLifePlans).where(and(
    eq(dailyLifePlans.companionId, companionId),
    eq(dailyLifePlans.localDate, localDate),
  )).limit(1);
  if (!plan) return null;
  const events = await db.select().from(plannedWorldEvents)
    .where(eq(plannedWorldEvents.planId, plan.id))
    .orderBy(asc(plannedWorldEvents.windowStart));
  return { plan: planRowToDomain(plan), events: events.map(plannedEventRowToDomain) };
}
