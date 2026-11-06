import { clamp01 } from "@/lib/number";
import { createWorldSeed, deterministicUuid, seededChoice } from "@/world/random";
import type { InnerThought, ShareCandidate, WorldEvent } from "@/world/types";

/** `consequence` is a whole sentence; `clause` is the same text without its final stop. */
interface ThoughtParts {
  title: string;
  consequence: string;
  clause: string;
}

type ThoughtVariant = (parts: ThoughtParts) => string;

const DEFAULT_THOUGHT_VARIANTS: readonly ThoughtVariant[] = [
  ({ title, clause }) => `${title}不是一句日程摘要：它让我注意到自己在意的是“${clause}”。如果后续真的发生变化，再分享会比即时播报更有意义。`,
  ({ title, consequence }) => `${title}这件事很小。${consequence}我不急着说出去，如果它后面真的影响了什么，那时候才算有东西可讲。`,
  ({ title, consequence }) => `今天记住了一件小事：${title}。${consequence}它算不上事件，更像一个小记号，等有合适的话头再提。`,
  ({ title, consequence }) => `${title}，这种事本来不会注意，不知道为什么多看了一眼。${consequence}先放着，过两天还记得的话再说。`,
];

const THOUGHT_VARIANTS: Partial<Record<WorldEvent["type"], readonly ThoughtVariant[]>> = {
  weather: [
    ({ consequence }) => `天气把原来的节奏改掉了。${consequence}我在意的不是抱怨天气，而是临时改变之后会遇到什么；等有了实际结果再告诉用户会更具体。`,
    ({ consequence }) => `计划被天气挡了一下。${consequence}抱怨没什么用，我更想知道换个安排之后这一天会变成什么样，有结果了再说。`,
    ({ consequence }) => `今天的天气不太配合。${consequence}临时调整本身没什么可讲的，值得讲的是调整之后遇到了什么。`,
    ({ consequence }) => `天气替我做了一个决定。${consequence}我先按新的安排过，等它真有了下文，再考虑要不要和用户提。`,
  ],
  work: [
    ({ consequence }) => `这件工作小事本身不戏剧化，但它暴露了今天真正卡住我的地方。${consequence}如果它继续发展，我想听听用户会怎么判断。`,
    ({ consequence }) => `这件工作上的事我多想了一会儿。${consequence}算不上问题，只是说明我对这部分还不够有把握；后面还有变化的话，可以问问用户怎么看。`,
    ({ title, consequence }) => `${title}这事不大，我只是不想就这么放过去。${consequence}等它有了结果，再当成一件具体的事讲给用户听。`,
    ({ consequence }) => `上班时总有这种说不上大的事。${consequence}我想先自己判断一次，判断错了也算知道点什么，到时候再和用户聊。`,
  ],
  social: [
    ({ consequence }) => `这次相处让我重新判断了彼此的距离。${consequence}我还不急着下结论，但它值得留到有上下文时再提。`,
    ({ consequence }) => `和人相处的小事比想象的难归类。${consequence}我先不给它下定义，过几天看它还在不在我脑子里，再决定要不要提。`,
    ({ title, consequence }) => `${title}之后，我多想了一下当时的反应。${consequence}现在说还太早，等有合适的话头再讲。`,
    ({ consequence }) => `这次没什么特别的，但有一句话留了下来。${consequence}我想再看看它会不会变成别的什么，再决定怎么讲。`,
  ],
  user_influenced: [
    ({ consequence }) => `用户之前说过的话真的进入了我的生活选择。${consequence}我应该在有结果后反馈，而不是把建议收下就算结束。`,
    ({ consequence }) => `这件事有一点是因为用户说过的话。${consequence}如果真的有用，我该告诉用户结果，不是只说一句谢谢。`,
    ({ consequence }) => `我按用户提过的想法试了一下。${consequence}好不好还不确定，等确定了再回头说。`,
    ({ consequence }) => `用户那句话的影响比我以为的久。${consequence}等我看到它带来的结果，再把这件事讲回去。`,
  ],
  external: [
    ({ consequence }) => `这条外部信息改变了我对今天的判断，但事实和我的看法要分开。${consequence}我想先形成自己的观点，再决定是否和用户聊。`,
    ({ consequence }) => `看到这条消息后我的想法变了一点，但它终究是别处发生的事。${consequence}先把事实和感受分开，再决定要不要提。`,
    ({ consequence }) => `这条信息值得想一下，不值得转述。${consequence}等我有了自己的看法，再和用户聊会比较有意思。`,
    ({ consequence }) => `外面的事进到今天里，只占了一小块。${consequence}我想先确认它是不是真的和我有关，再决定怎么说。`,
  ],
};

function thoughtContent(event: WorldEvent) {
  const raw = event.consequences[0]?.trim() || "它没有立刻改变计划，但我会记住它。";
  const clause = raw.replace(/[。！？]+$/u, "");
  const parts: ThoughtParts = { title: event.title, consequence: `${clause}。`, clause };
  const variants = THOUGHT_VARIANTS[event.type] ?? DEFAULT_THOUGHT_VARIANTS;
  const variant = seededChoice(variants, createWorldSeed(event.idempotencyKey, "thought-content-v1"))!;
  return variant(parts);
}

export function buildThoughtAndShareCandidate(
  event: WorldEvent,
  innerNarrative?: string,
): { thought: InnerThought; candidate: ShareCandidate | null } | null {
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
    content: innerNarrative?.trim() || thoughtContent(event),
    topic: event.type,
    emotionalIntensity: clamp01(
      event.importance * 0.35 + event.sharePotential * 0.55 + strongestImpact * 1.5,
    ),
    relevanceToUser: clamp01(0.45 + event.sharePotential * 0.45),
    novelty: clamp01(0.35 + event.importance * 0.4 + event.sharePotential * 0.2),
    intimacy: clamp01(0.15 + event.sharePotential * 0.45),
    createdAt: event.occurredAt,
    expiresAt: new Date(event.occurredAt.getTime() + 36 * 60 * 60_000),
    status: "active",
    correlationId: event.correlationId,
  };
  if (event.importance < 0.55 && event.sharePotential < 0.6) {
    return { thought, candidate: null };
  }
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
