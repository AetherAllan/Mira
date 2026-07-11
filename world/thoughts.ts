import { clamp01 } from "@/lib/time";
import { createWorldSeed, deterministicUuid } from "@/world/random";
import type { InnerThought, ShareCandidate, WorldEvent } from "@/world/types";

export function buildThoughtAndShareCandidate(
  event: WorldEvent,
): { thought: InnerThought; candidate: ShareCandidate } | null {
  if (event.importance < 0.3 && event.sharePotential < 0.28) return null;
  const thoughtKey = createWorldSeed(event.idempotencyKey, "inner-thought-v1");
  const thoughtId = deterministicUuid(thoughtKey);
  const strongestImpact = Math.max(
    0,
    ...Object.values(event.emotionalImpact).map((value) => Math.abs(value)),
  );
  const thought: InnerThought = {
    id: thoughtId,
    companionId: event.companionId,
    sourceType: "world_event",
    sourceId: event.id,
    content: `${event.title}。${event.consequences[0] ?? "这件小事暂时留在了今天里。"}`,
    topic: event.type,
    emotionalIntensity: clamp01(event.sharePotential * 0.6 + strongestImpact * 2),
    relevanceToUser: 0.35,
    novelty: clamp01(0.4 + event.importance * 0.3),
    intimacy: 0.2,
    createdAt: event.occurredAt,
    expiresAt: new Date(event.occurredAt.getTime() + 12 * 60 * 60_000),
    status: "active",
    correlationId: event.correlationId,
  };
  const candidateKey = createWorldSeed(thoughtKey, "share-candidate-v1");
  const candidate: ShareCandidate = {
    id: deterministicUuid(candidateKey),
    companionId: event.companionId,
    sourceType: "inner_thought",
    sourceId: thought.id,
    contentSummary: `${event.title}：${event.description}`,
    reasonToShare: "一个已经发生并留下后续影响的生活事件",
    emotionalIntensity: thought.emotionalIntensity,
    relevanceToUser: thought.relevanceToUser,
    novelty: thought.novelty,
    intimacy: thought.intimacy,
    urgency: clamp01(event.importance * 0.4),
    interruptionCost: 0.35,
    eventImportance: event.importance,
    priority: 60,
    score: 0,
    status: "pending",
    createdAt: event.occurredAt,
    expiresAt: thought.expiresAt,
  };
  return { thought, candidate };
}
