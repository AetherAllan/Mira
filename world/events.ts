import { clamp01 } from "@/lib/number";
import { zonedDateKey } from "@/lib/time";
import { ORDINARY_EVENT_TEMPLATES, type OrdinaryEventTemplate } from "@/world/ordinaryEventTemplates";
import { createSeededRandom, createWorldSeed, deterministicUuid } from "@/world/random";
import type {
  ScheduleBlock,
  ScheduleBlockType,
  TripFeasibility,
  WorldEvent,
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

/** How long a used template stays out of rotation while another one is free. */
const ORDINARY_TEMPLATE_COOLDOWN_MS = 7 * 24 * 60 * 60_000;
const ORDINARY_TEMPLATE_CAUSE_PREFIX = "ordinary:template:";
/** History a caller must load for the daily cap and the cooldown to hold. */
export const ORDINARY_EVENT_LOOKBACK_MS = ORDINARY_TEMPLATE_COOLDOWN_MS;

/** Chance per 15-minute window, about one event a day while awake. */
const ORDINARY_EVENT_CHANCE = 0.025;
/** Sleep spans about 38 windows, so the waking rate would fill the daily cap overnight. */
const ORDINARY_SLEEP_EVENT_CHANCE = 0.005;

export interface GenerateOrdinaryEventInput {
  companionId: string;
  occurredAt: Date;
  /** Optional only for a commute, which happens between places. */
  locationId?: string;
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

/**
 * Templates this tick may draw from: those outside the cooldown, or the one
 * used longest ago when every template is cooling down.
 *
 * Events from the same seed and events after `occurredAt` are ignored so a
 * replay picks the same template as the original run, whatever has happened
 * since. The idempotency check then recognizes it as already generated.
 */
function freshTemplates(
  templates: readonly OrdinaryEventTemplate[],
  input: Pick<GenerateOrdinaryEventInput, "existingEvents" | "occurredAt" | "seed">,
) {
  const lastUsedAt = new Map<string, number>();
  for (const event of input.existingEvents) {
    if (!isOrdinaryEvent(event) || event.randomSeed === input.seed) continue;
    if (event.occurredAt > input.occurredAt) continue;
    if (!event.causeId?.startsWith(ORDINARY_TEMPLATE_CAUSE_PREFIX)) continue;
    const id = event.causeId.slice(ORDINARY_TEMPLATE_CAUSE_PREFIX.length);
    lastUsedAt.set(id, Math.max(lastUsedAt.get(id) ?? 0, event.occurredAt.getTime()));
  }
  const usedAt = (template: OrdinaryEventTemplate) => lastUsedAt.get(template.id) ?? 0;
  const cutoff = input.occurredAt.getTime() - ORDINARY_TEMPLATE_COOLDOWN_MS;
  const fresh = templates.filter((template) => usedAt(template) < cutoff);
  if (fresh.length > 0) return fresh;
  const oldest = Math.min(...templates.map(usedAt));
  return templates.filter((template) => usedAt(template) === oldest);
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
  if (!input.locationId?.trim() && input.scheduleType !== "commute") {
    throw new Error("Ordinary physical event needs a location");
  }
  const chance = input.eventChance ?? ORDINARY_EVENT_CHANCE;
  if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
    throw new Error("Ordinary event chance must be between 0 and 1");
  }

  // Roll first: nearly every window stops here, before any calendar conversion.
  const random = createSeededRandom(input.seed);
  if (random() >= chance) return null;
  const dateKey = zonedDateKey(input.occurredAt);
  const today = input.existingEvents.filter(
    (event) => isOrdinaryEvent(event) && zonedDateKey(event.occurredAt) === dateKey,
  );
  if (today.length >= 2) return null;

  const nonTemplate = input.nonTemplateDraft;
  if (nonTemplate && today.some((event) => event.causeId === "ordinary:non-template")) {
    return null;
  }
  const templates = freshTemplates(
    ORDINARY_EVENT_TEMPLATES.filter(
      (template) => !input.scheduleType || template.scheduleTypes.includes(input.scheduleType),
    ),
    input,
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

/**
 * The tick's chance of an ordinary event during `block`. The world tick and the
 * simulation both call this, so the simulated rate is the production rate.
 */
export function ordinaryEventForBlock(input: {
  companionId: string;
  block: Pick<ScheduleBlock, "type" | "locationId" | "status" | "source"> | undefined;
  occurredAt: Date;
  correlationId: string;
  tickSeed: string;
  existingEvents: readonly WorldEvent[];
}): WorldEvent | null {
  const { block } = input;
  if (!block || block.status === "cancelled") return null;
  if (!block.locationId && block.type !== "commute") return null;
  // Weather moves an outdoor block indoors without changing its type.
  const movedIndoors = block.type === "exploration" && block.source === "external_information";
  return generateOrdinaryWorldEvent({
    companionId: input.companionId,
    occurredAt: input.occurredAt,
    locationId: block.locationId,
    scheduleType: movedIndoors ? "leisure" : block.type,
    correlationId: input.correlationId,
    seed: createWorldSeed(input.tickSeed, "ordinary-event"),
    existingEvents: input.existingEvents,
    eventChance: block.type === "sleep" ? ORDINARY_SLEEP_EVENT_CHANCE : ORDINARY_EVENT_CHANCE,
  });
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
