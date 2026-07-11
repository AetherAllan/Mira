import { clamp01 } from "@/lib/time";
import { deterministicUuid } from "@/world/random";
import type { InnerThought, ShareCandidate } from "@/world/types";

export interface ExternalThoughtFact {
  id: string;
  companionId: string;
  title: string;
  factualSummary: string;
  category: string;
  personalRelevance: number;
  reliability: number;
  novelty: number;
  fetchedAt: Date;
  expiresAt?: Date;
  correlationId: string;
}

export function buildExternalThoughtAndCandidate(
  fact: ExternalThoughtFact,
): { thought: InnerThought; candidate: ShareCandidate } | null {
  if (
    !["beijing_news", "social_news"].includes(fact.category) ||
    fact.personalRelevance < 0.65 ||
    fact.reliability < 0.58 ||
    fact.novelty < 0.5
  ) {
    return null;
  }

  const thoughtId = deterministicUuid(`external-thought:${fact.id}`);
  const expiresAt = fact.expiresAt ?? new Date(fact.fetchedAt.getTime() + 36 * 60 * 60_000);
  const thought: InnerThought = {
    id: thoughtId,
    companionId: fact.companionId,
    sourceType: "external_information",
    sourceId: fact.id,
    // The first sentence is explicitly the persisted fact. The second is an
    // internal stance, so later Actor grounding can keep evidence and opinion
    // separate instead of turning a headline into lived experience.
    content: `目前能确认的事实是：${fact.factualSummary}。它碰到了我的兴趣，但热度不等于结论；我想先看看它为什么会让我在意，再决定要不要和用户聊。`,
    topic: fact.category,
    emotionalIntensity: clamp01(0.2 + fact.novelty * 0.35),
    relevanceToUser: clamp01(0.25 + fact.personalRelevance * 0.35),
    novelty: fact.novelty,
    intimacy: 0.16,
    createdAt: fact.fetchedAt,
    expiresAt,
    status: "active",
    correlationId: fact.correlationId,
  };
  const candidate: ShareCandidate = {
    id: deterministicUuid(`external-candidate:${fact.id}`),
    companionId: fact.companionId,
    sourceType: "external_information",
    sourceId: fact.id,
    contentSummary: `${fact.title}：${fact.factualSummary}`,
    reasonToShare: "一条有来源的外部事实触发了 Mira 自己的观点，但不应被当成新闻播报",
    emotionalIntensity: thought.emotionalIntensity,
    relevanceToUser: thought.relevanceToUser,
    novelty: thought.novelty,
    intimacy: thought.intimacy,
    urgency: 0.2,
    interruptionCost: 0.5,
    eventImportance: clamp01(fact.personalRelevance * fact.reliability),
    priority: 70,
    score: 0,
    status: "pending",
    createdAt: fact.fetchedAt,
    expiresAt,
  };
  return { thought, candidate };
}

