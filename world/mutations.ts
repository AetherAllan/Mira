import {
  validatePhysicalWorldEvent,
  type PhysicalWorldEventValidationInput,
} from "@/world/events";
import type { ProposedWorldMutation } from "@/world/types";

export interface WorldMutationValidationContext {
  /** Actor is the safe default: callers must explicitly opt into World Engine authority. */
  authority?: "actor" | "world_engine";
  physicalEvent?: Omit<PhysicalWorldEventValidationInput, "authority">;
}

export interface WorldMutationValidationResult {
  approved: boolean;
  reasons: string[];
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function instant(value: unknown): Date | null {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function validatePhysicalPayload(
  mutation: ProposedWorldMutation,
  context: WorldMutationValidationContext,
  reasons: string[],
) {
  if (!context.physicalEvent) {
    reasons.push("physical_validation_context_required");
    return;
  }
  const locationId = text(mutation.payload.locationId);
  const occurredAt = instant(mutation.payload.occurredAt);
  if (!locationId) reasons.push("location_id_required");
  if (!occurredAt) reasons.push("occurred_at_required");
  if (locationId && locationId !== context.physicalEvent.event.locationId) {
    reasons.push("payload_location_mismatch");
  }
  if (
    occurredAt &&
    occurredAt.getTime() !== context.physicalEvent.event.occurredAt.getTime()
  ) {
    reasons.push("payload_time_mismatch");
  }
  const validation = validatePhysicalWorldEvent({
    ...context.physicalEvent,
    authority: context.authority ?? "actor",
  });
  reasons.push(...validation.reasons);
}

export function validateProposedWorldMutation(
  mutation: ProposedWorldMutation,
  context: WorldMutationValidationContext = {},
): WorldMutationValidationResult {
  const reasons: string[] = [];
  const type = text(mutation.type);
  const payload = object(mutation.payload) ?? {};
  const safeMutation = { ...mutation, payload };
  if (!type) reasons.push("mutation_type_required");
  if (!text(mutation.reason)) reasons.push("mutation_reason_required");

  const authority = context.authority ?? "actor";
  if (authority !== "world_engine") {
    reasons.push("actor_mutation_forbidden");
    return { approved: false, reasons: [...new Set(reasons)] };
  }

  if (type === "record_physical_visit") {
    validatePhysicalPayload(safeMutation, context, reasons);
  } else if (type === "create_world_event") {
    const eventPayload = object(payload.event) ?? payload;
    const realityLayer = text(eventPayload.realityLayer);
    if (!text(eventPayload.title)) reasons.push("event_title_required");
    if (!text(eventPayload.description)) reasons.push("event_description_required");
    if (realityLayer === "physical") {
      validatePhysicalPayload(
        { ...safeMutation, payload: { ...payload, ...eventPayload } },
        context,
        reasons,
      );
    } else if (realityLayer !== "inner") {
      reasons.push("event_reality_layer_required");
    }
  } else if (type === "create_world_character") {
    if (!text(payload.stableKey)) reasons.push("character_stable_key_required");
    if (!text(payload.name)) reasons.push("character_name_required");
    if (!text(payload.role)) reasons.push("character_role_required");
    const metadata = object(payload.metadata);
    if (metadata?.fictional !== true) reasons.push("fictional_character_metadata_required");
  } else {
    reasons.push("unsupported_mutation_type");
  }

  return { approved: reasons.length === 0, reasons: [...new Set(reasons)] };
}
