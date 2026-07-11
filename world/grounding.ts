import type { ActorOutput } from "@/core/types";
import type { ActorGroundedContext } from "@/core/promptBuilder";

export interface GroundingValidation {
  valid: boolean;
  reasons: string[];
}

const FUTURE_OR_HYPOTHETICAL = /(?:如果|假如|要是|想(?:要)?|打算|准备|计划|希望|可能|也许|应该|要不要)/u;
const ABSTRACT_AFTER_AT = /^(?:想|考虑|看法|意|乎|觉得|琢磨|处理|研究|写|改|看这个|看问题)/u;

function clauseClaimsPhysicalExperience(clause: string) {
  const current = /(?:^|我)(?:现在|这会儿|此刻|还|正)?(?:人)?(?:在|待在|坐在|站在|到了|走到|来到|回到)(.{1,18})/u.exec(clause);
  if (current?.[1] && !ABSTRACT_AFTER_AT.test(current[1].trim())) return true;
  if (FUTURE_OR_HYPOTHETICAL.test(clause)) return false;

  return (
    /(?:^|我|刚|刚才|今天|早上|中午|下午|晚上).{0,18}(?:去过|去了|到过|到达了|到了|路过|出门了|上班了|下班了|回家了|通勤了)/u.test(clause) ||
    /(?:^|我|刚|刚才).{0,12}从.{1,14}(?:出来|离开|回来)/u.test(clause) ||
    /(?:^|我|刚|刚才|今天).{0,18}(?:吃了|喝了|点了|买了|逛了|参加了|见了|坐完(?:地铁|公交)|骑车去了)/u.test(clause)
  );
}

export function physicalExperienceClaim(text: string) {
  return text
    .split(/[，。！？!?；;\n]/u)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .some(clauseClaimsPhysicalExperience);
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
