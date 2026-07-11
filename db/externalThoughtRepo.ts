import { getDb } from "@/db/client";
import { events, innerThoughts, shareCandidates } from "@/db/schema";
import {
  buildExternalThoughtAndCandidate,
  type ExternalThoughtFact,
} from "@/world/externalThoughts";

export async function persistExternalThoughtCandidates(facts: ExternalThoughtFact[]) {
  const bundles = facts
    .map(buildExternalThoughtAndCandidate)
    .filter((bundle): bundle is NonNullable<typeof bundle> => Boolean(bundle))
    .sort(
      (left, right) =>
        right.candidate.eventImportance - left.candidate.eventImportance ||
        left.candidate.createdAt.getTime() - right.candidate.createdAt.getTime(),
    )
    .slice(0, 2);
  let inserted = 0;
  for (const { thought, candidate } of bundles) {
    const created = await getDb().transaction(async (tx) => {
      const [thoughtRow] = await tx
        .insert(innerThoughts)
        .values({
          id: thought.id,
          companionId: thought.companionId,
          idempotencyKey: `external-thought:${thought.sourceId}`,
          sourceType: thought.sourceType,
          sourceId: thought.sourceId,
          content: thought.content,
          topic: thought.topic,
          emotionalIntensity: thought.emotionalIntensity,
          relevanceToUser: thought.relevanceToUser,
          novelty: thought.novelty,
          intimacy: thought.intimacy,
          status: thought.status,
          expiresAt: thought.expiresAt,
          correlationId: thought.correlationId,
          createdAt: thought.createdAt,
        })
        .onConflictDoNothing({
          target: [innerThoughts.companionId, innerThoughts.idempotencyKey],
        })
        .returning({ id: innerThoughts.id });
      if (!thoughtRow) return false;
      await tx.insert(shareCandidates).values({
        id: candidate.id,
        companionId: candidate.companionId,
        idempotencyKey: `external-candidate:${candidate.sourceId}`,
        sourceType: candidate.sourceType,
        sourceId: candidate.sourceId,
        contentSummary: candidate.contentSummary,
        reasonToShare: candidate.reasonToShare,
        emotionalIntensity: candidate.emotionalIntensity,
        relevanceToUser: candidate.relevanceToUser,
        novelty: candidate.novelty,
        intimacy: candidate.intimacy,
        urgency: candidate.urgency,
        interruptionCost: candidate.interruptionCost,
        eventImportance: candidate.eventImportance,
        priority: candidate.priority,
        score: candidate.score,
        status: candidate.status,
        expiresAt: candidate.expiresAt,
        correlationId: thought.correlationId,
        createdAt: candidate.createdAt,
      });
      await tx.insert(events).values({
        companionId: thought.companionId,
        type: "inner_thought.created",
        source: "external_information",
        correlationId: thought.correlationId,
        payloadJson: {
          externalInformationId: candidate.sourceId,
          innerThoughtId: thought.id,
          shareCandidateId: candidate.id,
        },
      });
      return true;
    });
    if (created) inserted += 1;
  }
  return { inserted };
}

