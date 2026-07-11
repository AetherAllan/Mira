import { clamp01, zonedDateKey } from "@/lib/time";
import { createSeededRandom, createWorldSeed, deterministicUuid } from "@/world/random";
import type {
  ScheduleBlock,
  ScheduleBlockType,
  TripFeasibility,
  WorldAffect,
  WorldEvent,
  WorldState,
  WorldStateChange,
} from "@/world/types";

type OrdinaryEventType = Extract<WorldEvent["type"], "routine" | "work" | "social" | "travel">;

export interface OrdinaryEventDraft {
  type: OrdinaryEventType;
  title: string;
  description: string;
  emotionalImpact: Record<string, number>;
  consequences: string[];
  importance: number;
  sharePotential: number;
  characterIds?: string[];
}

interface OrdinaryEventTemplate extends OrdinaryEventDraft {
  id: string;
  scheduleTypes: ScheduleBlockType[];
}

const ORDINARY_EVENT_TEMPLATES: readonly OrdinaryEventTemplate[] = [
  {
    id: "work_waiting_feedback",
    scheduleTypes: ["work"],
    type: "work",
    title: "等反馈的十分钟",
    description: "手上的修改暂时做完了，反馈还没来，办公室安静了一小会儿。",
    emotionalImpact: { boredom: 0.02, curiosity: 0.01 },
    consequences: ["当前工作被短暂搁置，稍后继续确认反馈"],
    importance: 0.22,
    sharePotential: 0.2,
  },
  {
    id: "commute_slowdown",
    scheduleTypes: ["commute"],
    type: "travel",
    title: "地铁短暂停车",
    description: "列车在站间多停了几分钟，车厢里的人一起看了一眼时间。",
    emotionalImpact: { energy: -0.02, irritation: 0.025 },
    consequences: ["通勤进度比原计划略晚，需要重新确认下一段日程"],
    importance: 0.3,
    sharePotential: 0.28,
  },
  {
    id: "meal_too_salty",
    scheduleTypes: ["meal"],
    type: "routine",
    title: "午饭有点咸",
    description: "今天这份饭比平时咸了一点，于是多喝了半杯水。",
    emotionalImpact: { energy: 0.01, irritation: 0.01 },
    consequences: ["记住这家店今天的口味不太稳定"],
    importance: 0.16,
    sharePotential: 0.15,
  },
  {
    id: "street_poster_after_rain",
    scheduleTypes: ["leisure", "exploration", "errand"],
    type: "routine",
    title: "雨后的旧海报",
    description: "路边一张旧活动海报被雨水泡皱了，颜色反而比原来耐看。",
    emotionalImpact: { curiosity: 0.025, boredom: -0.02 },
    consequences: ["留下一个关于城市细节的短暂印象"],
    importance: 0.24,
    sharePotential: 0.32,
  },
  {
    id: "room_small_chore",
    scheduleTypes: ["leisure", "errand", "sleep"],
    type: "routine",
    title: "顺手收好了桌面",
    description: "把散在桌上的线和杯子收了一下，房间没有变漂亮，只是没那么碍眼了。",
    emotionalImpact: { boredom: -0.015, energy: -0.005 },
    consequences: ["居住空间恢复到可以安心坐下的状态"],
    importance: 0.14,
    sharePotential: 0.12,
  },
];

export interface GenerateOrdinaryEventInput {
  companionId: string;
  occurredAt: Date;
  locationId: string;
  scheduleType?: ScheduleBlockType;
  correlationId: string;
  seed: string;
  existingEvents: readonly WorldEvent[];
  nonTemplateDraft?: OrdinaryEventDraft;
  eventChance?: number;
}

function isOrdinaryEvent(event: WorldEvent) {
  return event.idempotencyKey.startsWith("ordinary:");
}

function ordinaryImpact(impact: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(impact)
      .filter(([, value]) => Number.isFinite(value))
      .map(([key, value]) => [key, Math.max(-0.2, Math.min(0.2, value))]),
  );
}

export function generateOrdinaryWorldEvent(
  input: GenerateOrdinaryEventInput,
): WorldEvent | null {
  if (!Number.isFinite(input.occurredAt.getTime())) throw new Error("Ordinary event time is invalid");
  if (!input.locationId.trim()) throw new Error("Ordinary physical event needs a location");
  const chance = input.eventChance ?? 0.025;
  if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
    throw new Error("Ordinary event chance must be between 0 and 1");
  }

  const dateKey = zonedDateKey(input.occurredAt);
  const today = input.existingEvents.filter(
    (event) => isOrdinaryEvent(event) && zonedDateKey(event.occurredAt) === dateKey,
  );
  if (today.length >= 2) return null;
  const random = createSeededRandom(input.seed);
  if (random() >= chance) return null;

  const nonTemplate = input.nonTemplateDraft;
  if (nonTemplate && today.some((event) => event.causeId === "ordinary:non-template")) {
    return null;
  }
  const templates = ORDINARY_EVENT_TEMPLATES.filter(
    (template) => !input.scheduleType || template.scheduleTypes.includes(input.scheduleType),
  );
  const draft = nonTemplate ?? templates[Math.floor(random() * templates.length)];
  if (!draft || !draft.title.trim() || !draft.description.trim()) return null;
  const candidateTemplateId = (draft as { id?: unknown }).id;
  const templateId = typeof candidateTemplateId === "string" ? candidateTemplateId : "non-template";
  const idempotencyKey = `ordinary:${createWorldSeed(input.companionId, dateKey, input.seed, templateId)}`;
  if (input.existingEvents.some((event) => event.idempotencyKey === idempotencyKey)) return null;

  return {
    id: deterministicUuid(idempotencyKey),
    companionId: input.companionId,
    realityLayer: "physical",
    idempotencyKey,
    correlationId: input.correlationId,
    characterIds: [...(draft.characterIds ?? [])],
    type: draft.type,
    title: draft.title.trim(),
    description: draft.description.trim(),
    occurredAt: new Date(input.occurredAt),
    locationId: input.locationId,
    causeType: "random",
    causeId: `ordinary:${templateId === "non-template" ? "non-template" : `template:${templateId}`}`,
    emotionalImpact: ordinaryImpact(draft.emotionalImpact),
    consequences: [...draft.consequences],
    importance: Math.min(0.65, clamp01(draft.importance)),
    sharePotential: Math.min(0.7, clamp01(draft.sharePotential)),
    randomSeed: input.seed,
  };
}

export interface PhysicalWorldEventValidationInput {
  authority: "world_engine" | "actor";
  event: WorldEvent;
  destinationLocationId: string;
  feasibility: TripFeasibility;
  scheduleBlock: ScheduleBlock;
  knownPlaceIds?: readonly string[];
  previousPhysicalEvent?: Pick<WorldEvent, "occurredAt" | "locationId" | "realityLayer">;
  travelMinutesFromPrevious?: number;
}

export interface WorldEventValidation {
  valid: boolean;
  reasons: string[];
}

export function validatePhysicalWorldEvent(
  input: PhysicalWorldEventValidationInput,
): WorldEventValidation {
  const reasons: string[] = [];
  if (input.authority !== "world_engine") reasons.push("world_engine_authority_required");
  if (input.event.realityLayer !== "physical") reasons.push("event_is_not_physical");
  if (!input.event.locationId) reasons.push("physical_location_required");
  if (input.event.locationId !== input.destinationLocationId) {
    reasons.push("destination_location_mismatch");
  }
  if (!input.feasibility.reachable) {
    reasons.push("trip_not_feasible", ...input.feasibility.rejectionReasons.map((reason) => `trip:${reason}`));
  }
  if (input.knownPlaceIds && !input.knownPlaceIds.includes(input.destinationLocationId)) {
    reasons.push("unknown_location");
  }
  const occurredAt = input.event.occurredAt.getTime();
  if (
    occurredAt < input.scheduleBlock.startAt.getTime() ||
    occurredAt >= input.scheduleBlock.endAt.getTime()
  ) {
    reasons.push("outside_schedule_block");
  }
  if (
    input.scheduleBlock.locationId &&
    input.scheduleBlock.locationId !== input.destinationLocationId
  ) {
    reasons.push("schedule_location_mismatch");
  }

  const previous = input.previousPhysicalEvent;
  if (previous?.realityLayer === "physical" && previous.locationId !== input.event.locationId) {
    const elapsedMinutes = (occurredAt - previous.occurredAt.getTime()) / 60_000;
    if (elapsedMinutes < 0) reasons.push("physical_event_time_regression");
    else if (elapsedMinutes === 0) reasons.push("simultaneous_physical_locations");
    else if (
      input.travelMinutesFromPrevious === undefined ||
      !Number.isFinite(input.travelMinutesFromPrevious)
    ) {
      reasons.push("previous_route_unavailable");
    } else if (elapsedMinutes < input.travelMinutesFromPrevious) {
      reasons.push("teleportation_risk");
    }
  }

  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

const WORLD_AFFECTS: readonly WorldAffect[] = [
  "energy",
  "boredom",
  "curiosity",
  "loneliness",
  "irritation",
  "disappointment",
  "attachment",
  "shareDesire",
];

export function applyEventConsequences(state: WorldState, event: WorldEvent) {
  const next: WorldState = { ...state, affectReasons: { ...state.affectReasons } };
  const stateChanges: WorldStateChange[] = [];
  const reason = `world_event:${event.id}:${event.title}`;

  for (const affect of WORLD_AFFECTS) {
    const delta = event.emotionalImpact[affect];
    if (!Number.isFinite(delta) || delta === 0) continue;
    const before = state[affect];
    const after = clamp01(before + delta);
    if (before === after) continue;
    next[affect] = after;
    next.affectReasons![affect] = [
      ...(state.affectReasons?.[affect] ?? []),
      {
        reason: event.title,
        sourceType: "world_event" as const,
        sourceId: event.id,
        correlationId: event.correlationId,
        occurredAt: event.occurredAt,
      },
    ].slice(-8);
    stateChanges.push({ targetPath: affect, before, after, reason });
  }

  if (stateChanges.length) {
    next.version = state.version + 1;
    next.lastChangeReason = reason;
    next.lastCorrelationId = event.correlationId;
  }
  return { state: next, stateChanges, pendingConsequences: [...event.consequences] };
}
