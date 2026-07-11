import type { ActorOutput } from "@/core/types";
import type { ActorGroundedContext } from "@/core/promptBuilder";

export interface GroundingValidation {
  valid: boolean;
  reasons: string[];
}

function physicalExperienceClaim(text: string) {
  return /(?:我|今天|刚才|下午|晚上).{0,16}(?:去了|到过|到达|回到|下班|上班|通勤|出门|在.{0,10}(?:吃|喝|逛|看|待))/u.test(text);
}

export function validateActorGrounding(
  output: ActorOutput,
  context: ActorGroundedContext | undefined,
): GroundingValidation {
  const reasons: string[] = [];
  if (output.proposedWorldMutation) reasons.push("actor_cannot_propose_world_mutation");
  if (!context) return { valid: reasons.length === 0, reasons };

  const allowed = new Set(context.allowedReferenceIds);
  const worldRefs = new Set([
    ...(context.currentLocation ? [context.currentLocation.id] : []),
    ...(context.currentActivity ? [context.currentActivity.id] : []),
    ...context.schedule.flatMap((block) => [block.id, ...(block.locationId ? [block.locationId] : [])]),
    ...context.worldEvents.flatMap((event) => {
      const id = typeof event.id === "string" ? [event.id] : [];
      const locationId = typeof event.locationId === "string" ? [event.locationId] : [];
      const characterIds = Array.isArray(event.characterIds)
        ? event.characterIds.filter((value): value is string => typeof value === "string")
        : [];
      return [...id, ...locationId, ...characterIds];
    }),
    ...(context.shareCandidate?.sourceType === "world_event" &&
    typeof context.shareCandidate.sourceId === "string"
      ? [context.shareCandidate.sourceId]
      : []),
  ]);
  const externalRefs = new Set(
    context.externalInformation.flatMap((fact) => typeof fact.id === "string" ? [fact.id] : []),
  );
  if (
    context.shareCandidate?.sourceType === "external_information" &&
    typeof context.shareCandidate.sourceId === "string"
  ) {
    externalRefs.add(context.shareCandidate.sourceId);
  }

  for (const ref of output.groundingRefs) {
    if (!allowed.has(ref)) reasons.push(`unknown_grounding_ref:${ref}`);
  }
  for (const claim of output.factClaims) {
    if (claim.type === "opinion") continue;
    if (claim.sourceRefs.length === 0) {
      reasons.push(`${claim.type}_claim_has_no_source`);
      continue;
    }
    const typeRefs = claim.type === "world" ? worldRefs : externalRefs;
    for (const ref of claim.sourceRefs) {
      if (!typeRefs.has(ref)) reasons.push(`invalid_${claim.type}_ref:${ref}`);
    }
  }
  if (
    physicalExperienceClaim(output.message) &&
    !output.factClaims.some((claim) => claim.type === "world" && claim.sourceRefs.length > 0)
  ) {
    reasons.push("physical_experience_claim_is_ungrounded");
  }
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}
