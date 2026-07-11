import { clamp01 } from "@/lib/time";
import { createWorldSeed, deterministicUuid } from "@/world/random";
import type { InnerThought, ShareCandidate, WorldEvent } from "@/world/types";

function thoughtContent(event: WorldEvent) {
  const consequence = event.consequences[0] ?? "它没有立刻改变计划，但我会记住它。";
  switch (event.type) {
    case "weather":
      return `天气把原来的节奏改掉了。${consequence}我在意的不是抱怨天气，而是临时改变之后会遇到什么；等有了实际结果再告诉用户会更具体。`;
    case "work":
      return `这件工作小事本身不戏剧化，但它暴露了今天真正卡住我的地方。${consequence}如果它继续发展，我想听听用户会怎么判断。`;
    case "social":
      return `这次相处让我重新判断了彼此的距离。${consequence}我还不急着下结论，但它值得留到有上下文时再提。`;
    case "user_influenced":
      return `用户之前说过的话真的进入了我的生活选择。${consequence}我应该在有结果后反馈，而不是把建议收下就算结束。`;
    case "external":
      return `这条外部信息改变了我对今天的判断，但事实和我的看法要分开。${consequence}我想先形成自己的观点，再决定是否和用户聊。`;
    default:
      return `${event.title}不是一句日程摘要：它让我注意到自己在意的是“${consequence}”。如果后续真的发生变化，再分享会比即时播报更有意义。`;
  }
}

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
    content: thoughtContent(event),
    topic: event.type,
    emotionalIntensity: clamp01(
      event.importance * 0.35 + event.sharePotential * 0.55 + strongestImpact * 1.5,
    ),
    relevanceToUser: clamp01(0.45 + event.sharePotential * 0.45),
    novelty: clamp01(0.35 + event.importance * 0.4 + event.sharePotential * 0.2),
    intimacy: clamp01(0.15 + event.sharePotential * 0.45),
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
    reasonToShare: "这个已发生事件改变了后续选择，并形成了一个想和用户交换的判断",
    emotionalIntensity: thought.emotionalIntensity,
    relevanceToUser: thought.relevanceToUser,
    novelty: thought.novelty,
    intimacy: thought.intimacy,
    urgency: clamp01(0.15 + event.importance * 0.6 + event.sharePotential * 0.15),
    interruptionCost: clamp01(0.35 - event.sharePotential * 0.15),
    eventImportance: event.importance,
    priority: 60,
    score: 0,
    status: "pending",
    createdAt: event.occurredAt,
    expiresAt: thought.expiresAt,
  };
  return { thought, candidate };
}
