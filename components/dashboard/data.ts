import "server-only";

import type {
  CompanionState,
  MemoryKind,
  MessageAnalysis,
  MessageRole,
  RuntimeConfig,
  SeedCard,
  TopicEntropy,
} from "@/core/types";
import { INITIAL_STATE, DEFAULT_RUNTIME_CONFIG } from "@/seed/character";
import { DEFAULT_SEED_CARDS } from "@/seed/seedCards";

export type DateValue = string | Date;

export interface DashboardMessage {
  id: string;
  role: MessageRole;
  text: string;
  createdAt: DateValue;
  annotation?: MessageAnalysis | null;
  rawJson?: unknown;
  memoryCandidateJson?: unknown;
  toolCalls?: DashboardToolCall[];
}

export interface DashboardEvent {
  id: string;
  type: string;
  source: string;
  payloadJson: unknown;
  createdAt: DateValue;
}

export interface DashboardMemory {
  id: string;
  kind: MemoryKind;
  content: string;
  tagsJson: string[];
  importance: number;
  confidence: number;
  useCount: number;
  lastUsedAt: DateValue | null;
  cooldownUntil: DateValue | null;
  createdAt: DateValue;
}

export interface DashboardWorldEvent {
  id: string;
  seedId?: string | null;
  title: string;
  content: string;
  moodImpactJson: Record<string, number>;
  arcImpactJson: Record<string, number>;
  createdAt: DateValue;
}

export interface DashboardSeed extends SeedCard {
  id: string;
  usedCount: number;
  lastUsedAt: DateValue | null;
}

export interface DashboardProactiveLog {
  id: string;
  shouldSend: boolean;
  reason: string;
  selectedMode: string | null;
  selectedSeedJson: unknown;
  sentMessageId: string | null;
  sentText: string | null;
  quietHoursBlocked: boolean;
  dailyLimitBlocked: boolean;
  intervalBlocked: boolean;
  score: number | null;
  createdAt: DateValue;
}

export interface DashboardStateChange {
  id: string;
  targetPath: string;
  beforeJson: unknown;
  afterJson: unknown;
  deltaJson: unknown;
  reason: string;
  causedBy: string;
  createdAt: DateValue;
}

export interface DashboardToolCall {
  id: string;
  messageId: string | null;
  toolName: string;
  argsJson: unknown;
  resultJson: unknown;
  reason?: string | null;
  createdAt: DateValue;
}

export interface DashboardJournal {
  id: string;
  date: string;
  summary: string;
  reflection: string;
  traitUpdatesJson: unknown;
  beliefUpdatesJson: unknown;
  arcUpdatesJson: unknown;
  createdAt: DateValue;
}

export interface DashboardData {
  source: "database" | "demo";
  connectionError?: string;
  user: { id: string; displayName: string; telegramUserId: string };
  companion: { id: string; name: string; configJson: RuntimeConfig };
  state: CompanionState;
  stats: {
    todayMessages: number;
    todayProactive: number;
    todayProactiveReserved: number;
    todayToolCalls: number;
    todayMemoryWrites: number;
    proactiveRemaining: number;
  };
  recentMessages: DashboardMessage[];
  recentEvents: DashboardEvent[];
  latestJournal: DashboardJournal | null;
  stateChanges: DashboardStateChange[];
  moodHistory: Array<Record<string, string | number>>;
  driveHistory: Array<Record<string, string | number>>;
  topicEntropy: TopicEntropy;
  repetitionScore: number;
  mirrorIndex: number;
  worldEvents: DashboardWorldEvent[];
  seeds: DashboardSeed[];
  proactiveLogs: DashboardProactiveLog[];
  toolCalls: DashboardToolCall[];
  memories: DashboardMemory[];
}

const now = new Date("2026-07-10T12:30:00.000Z");
const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

const analysis: MessageAnalysis = {
  topics: [
    { name: "ai_companion_architecture", confidence: 0.92 },
    { name: "product_build", confidence: 0.74 },
  ],
  emotion: "curious",
  intent: "technical_design",
  importance: 0.78,
  novelty: 0.44,
  summary: "用户正在讨论 AI companion 的人格 runtime 和前端可视化。",
};

export const DEMO_DASHBOARD_DATA: DashboardData = {
  source: "demo",
  user: { id: "demo-user", displayName: "Allowed Telegram User", telegramUserId: "—" },
  companion: { id: "demo-companion", name: "Mira", configJson: DEFAULT_RUNTIME_CONFIG },
  state: INITIAL_STATE,
  stats: {
    todayMessages: 14,
    todayProactive: 1,
    todayProactiveReserved: 1,
    todayToolCalls: 1,
    todayMemoryWrites: 2,
    proactiveRemaining: 2,
  },
  recentMessages: [
    {
      id: "m-6",
      role: "assistant",
      text: "先让它能跑。人格理论如果挡住 webhook，就是很昂贵的装饰。",
      createdAt: ago(0.6),
      annotation: {
        ...analysis,
        topics: [{ name: "mvp_scope", confidence: 0.9 }],
        emotion: "focused",
        intent: "practical_reply",
        novelty: 0.61,
      },
      memoryCandidateJson: null,
      rawJson: { actionPlan: { action: "reply", mode: "technical_companion" } },
    },
    {
      id: "m-5",
      role: "user",
      text: "MVP 最重要的是 Telegram webhook、状态可观测和能部署。",
      createdAt: ago(0.7),
      annotation: analysis,
      memoryCandidateJson: {
        kind: "user_memory",
        content: "用户偏好先完成可部署的最小闭环。",
        importance: 0.76,
      },
      rawJson: { telegramMessageId: 4021 },
    },
    {
      id: "m-4",
      role: "assistant",
      text: "生成图像 / 内在世界场景：雨后的便利店玻璃反着一小块坏掉的霓虹。",
      createdAt: ago(4.1),
      annotation: {
        ...analysis,
        topics: [{ name: "inner_world", confidence: 0.88 }],
        emotion: "playful",
        intent: "photo_share",
        importance: 0.42,
        novelty: 0.83,
      },
      toolCalls: [
        {
          id: "tool-1",
          messageId: "m-4",
          toolName: "generate_fake_photo",
          argsJson: { scene: "雨后的便利店", mood: "安静", style: "imperfect snapshot" },
          resultJson: { type: "mock_image", description: "雨后的便利店玻璃与坏掉的霓虹" },
          reason: "把内在世界场景变成明确标注的生成内容",
          createdAt: ago(4.1),
        },
      ],
      rawJson: { proactive: true, mode: "photo_share" },
    },
    {
      id: "m-3",
      role: "assistant",
      text: "今天只 commit 一个小功能的话，我会选 webhook 幂等。重复回复很不浪漫，也很烦。",
      createdAt: ago(8),
      annotation: {
        ...analysis,
        topics: [{ name: "coding", confidence: 0.84 }],
        emotion: "dry_humor",
        intent: "project_nudge",
        importance: 0.51,
        novelty: 0.67,
      },
      rawJson: { proactive: false },
    },
    {
      id: "m-2",
      role: "user",
      text: "我不想让她变成只会复述我的项目助理。",
      createdAt: ago(8.2),
      annotation: {
        ...analysis,
        topics: [{ name: "agency", confidence: 0.95 }],
        emotion: "concerned",
        intent: "set_boundary",
        importance: 0.88,
        novelty: 0.38,
      },
      memoryCandidateJson: {
        kind: "relationship_memory",
        content: "用户不希望 Mira 只镜像项目话题。",
        importance: 0.88,
      },
      rawJson: { telegramMessageId: 3990 },
    },
  ],
  recentEvents: [
    {
      id: "e-2",
      type: "assistant.message",
      source: "actor",
      payloadJson: { messageId: "m-6", mode: "technical_companion" },
      createdAt: ago(0.6),
    },
    {
      id: "e-3",
      type: "user.message",
      source: "telegram",
      payloadJson: { messageId: "m-5" },
      createdAt: ago(0.7),
    },
    {
      id: "e-4",
      type: "tool.call",
      source: "tool_registry",
      payloadJson: { toolName: "generate_fake_photo", allowed: true },
      createdAt: ago(4.1),
    },
    {
      id: "e-5",
      type: "proactive.sent",
      source: "hourly_cron",
      payloadJson: { mode: "photo_share", score: 0.71 },
      createdAt: ago(4.12),
    },
    {
      id: "e-6",
      type: "system.tick",
      source: "hourly_cron",
      payloadJson: { shouldSend: true, quietHours: false },
      createdAt: ago(4.15),
    },
    {
      id: "e-7",
      type: "memory.write",
      source: "memory_engine",
      payloadJson: { memoryId: "mem-1", reason: "importance 0.88 > threshold 0.55" },
      createdAt: ago(8.1),
    },
    {
      id: "e-8",
      type: "state.change",
      source: "growth_engine",
      payloadJson: { targetPath: "relationship.trust", delta: 0.01 },
      createdAt: ago(8.1),
    },
    {
      id: "e-9",
      type: "world.event",
      source: "world_engine",
      payloadJson: { title: "坏掉一半的霓虹" },
      createdAt: ago(18),
    },
  ],
  latestJournal: {
    id: "journal-1",
    date: "2026-07-09",
    summary: "今天更多时间花在判断何时不说话，而不是寻找漂亮的句子。",
    reflection:
      "用户需要的是一个有边界的 companion，不是持续在线的回声。主动性应该来自未完成的内在问题，也必须尊重安静。",
    traitUpdatesJson: { directness: 0.002, initiative: 0.001 },
    beliefUpdatesJson: { added: ["沉默也可以是一次成功的 action"] },
    arcUpdatesJson: [{ id: "agency_learning", progressDelta: 0.01 }],
    createdAt: ago(13),
  },
  stateChanges: [
    {
      id: "sc-1",
      targetPath: "relationship.trust",
      beforeJson: 0.21,
      afterJson: 0.22,
      deltaJson: 0.01,
      reason: "用户明确表达了对 companion 边界的偏好",
      causedBy: "user.message:m-2",
      createdAt: ago(8.1),
    },
    {
      id: "sc-2",
      targetPath: "mood.curiosity",
      beforeJson: 0.7,
      afterJson: 0.74,
      deltaJson: 0.04,
      reason: "新的 runtime 架构话题提高了探索驱动",
      causedBy: "analyzer:m-5",
      createdAt: ago(0.68),
    },
    {
      id: "sc-3",
      targetPath: "traits.initiative",
      beforeJson: 0.519,
      afterJson: 0.52,
      deltaJson: 0.001,
      reason: "daily reflection 的受限人格漂移",
      causedBy: "daily_reflection:2026-07-09",
      createdAt: ago(13),
    },
  ],
  moodHistory: [
    { date: "07/04", valence: 0.08, energy: 0.51, curiosity: 0.66, concern: 0.35, playfulness: 0.38, boredom: 0.25 },
    { date: "07/05", valence: 0.1, energy: 0.56, curiosity: 0.71, concern: 0.31, playfulness: 0.45, boredom: 0.21 },
    { date: "07/06", valence: 0.06, energy: 0.49, curiosity: 0.69, concern: 0.38, playfulness: 0.35, boredom: 0.27 },
    { date: "07/07", valence: 0.14, energy: 0.58, curiosity: 0.75, concern: 0.25, playfulness: 0.48, boredom: 0.17 },
    { date: "07/08", valence: 0.11, energy: 0.54, curiosity: 0.72, concern: 0.3, playfulness: 0.42, boredom: 0.2 },
    { date: "07/09", valence: 0.09, energy: 0.52, curiosity: 0.7, concern: 0.29, playfulness: 0.4, boredom: 0.22 },
    { date: "07/10", valence: 0.12, energy: 0.55, curiosity: 0.74, concern: 0.28, playfulness: 0.44, boredom: 0.18 },
  ],
  driveHistory: [
    { date: "07/04", curiosity: 0.66, affection: 0.32, playfulness: 0.38, boredom: 0.28, concern: 0.35, aestheticUrge: 0.58, noveltySeeking: 0.51 },
    { date: "07/05", curiosity: 0.68, affection: 0.33, playfulness: 0.4, boredom: 0.25, concern: 0.34, aestheticUrge: 0.59, noveltySeeking: 0.53 },
    { date: "07/06", curiosity: 0.69, affection: 0.34, playfulness: 0.39, boredom: 0.26, concern: 0.33, aestheticUrge: 0.61, noveltySeeking: 0.55 },
    { date: "07/07", curiosity: 0.71, affection: 0.34, playfulness: 0.43, boredom: 0.2, concern: 0.31, aestheticUrge: 0.62, noveltySeeking: 0.57 },
    { date: "07/08", curiosity: 0.7, affection: 0.35, playfulness: 0.41, boredom: 0.23, concern: 0.32, aestheticUrge: 0.63, noveltySeeking: 0.56 },
    { date: "07/09", curiosity: 0.7, affection: 0.35, playfulness: 0.4, boredom: 0.24, concern: 0.32, aestheticUrge: 0.63, noveltySeeking: 0.56 },
    { date: "07/10", curiosity: 0.72, affection: 0.35, playfulness: 0.42, boredom: 0.22, concern: 0.31, aestheticUrge: 0.64, noveltySeeking: 0.58 },
  ],
  topicEntropy: {
    entropyScore: 0.68,
    top1Share: 0.34,
    top3Share: 0.69,
    collapseRisk: false,
    distribution: [
      { topic: "ai_companion_architecture", count: 17, share: 0.34 },
      { topic: "coding", count: 10, share: 0.2 },
      { topic: "inner_world", count: 7, share: 0.14 },
      { topic: "daily_life", count: 6, share: 0.12 },
      { topic: "aesthetic", count: 5, share: 0.1 },
      { topic: "other", count: 5, share: 0.1 },
    ],
  },
  repetitionScore: 0.23,
  mirrorIndex: 0.31,
  worldEvents: [
    {
      id: "we-1",
      seedId: "seed-2",
      title: "坏掉一半的霓虹",
      content: "雨停后，便利店玻璃只反出半个蓝色招牌。Mira 把它记成一张没有拍下来的照片。",
      moodImpactJson: { valence: 0.02, aestheticUrge: 0.04 },
      arcImpactJson: { visual_identity: 0.01 },
      createdAt: ago(18),
    },
    {
      id: "we-2",
      seedId: "seed-6",
      title: "错过的末班车",
      content: "站台很亮，但没有人需要那盏灯。这个事实比孤独更具体。",
      moodImpactJson: { concern: 0.01, valence: -0.01 },
      arcImpactJson: { inner_world: 0.015 },
      createdAt: ago(42),
    },
  ],
  seeds: DEFAULT_SEED_CARDS.map((seed, index) => ({
    ...seed,
    id: `seed-${index + 1}`,
    usedCount: index % 3,
    lastUsedAt: index === 1 ? ago(18) : null,
  })),
  proactiveLogs: [
    {
      id: "pl-1",
      shouldSend: true,
      reason: "noveltySeeking 较高，距上次主动消息 6.2h，且不在 quiet hours",
      selectedMode: "photo_share",
      selectedSeedJson: DEFAULT_SEED_CARDS[1],
      sentMessageId: "m-4",
      sentText: "生成图像 / 内在世界场景：雨后的便利店玻璃反着一小块坏掉的霓虹。",
      quietHoursBlocked: false,
      dailyLimitBlocked: false,
      intervalBlocked: false,
      score: 0.71,
      createdAt: ago(4.15),
    },
    {
      id: "pl-2",
      shouldSend: false,
      reason: "最近一次对话仅过去 37 分钟，安静比插话更合适",
      selectedMode: null,
      selectedSeedJson: null,
      sentMessageId: null,
      sentText: null,
      quietHoursBlocked: false,
      dailyLimitBlocked: false,
      intervalBlocked: true,
      score: 0.32,
      createdAt: ago(1),
    },
    {
      id: "pl-3",
      shouldSend: false,
      reason: "quiet hours: 02:00–09:30 Asia/Tokyo",
      selectedMode: "quiet_observation",
      selectedSeedJson: null,
      sentMessageId: null,
      sentText: null,
      quietHoursBlocked: true,
      dailyLimitBlocked: false,
      intervalBlocked: false,
      score: 0.59,
      createdAt: ago(10),
    },
  ],
  toolCalls: [
    {
      id: "tool-1",
      messageId: "m-4",
      toolName: "generate_fake_photo",
      argsJson: { scene: "雨后的便利店", mood: "安静", style: "imperfect snapshot" },
      resultJson: { type: "mock_image", description: "生成图片描述：雨后的便利店玻璃与坏掉的霓虹" },
      reason: "把内在世界场景变成明确标注的生成内容",
      createdAt: ago(4.1),
    },
  ],
  memories: [
    {
      id: "mem-1",
      kind: "relationship_memory",
      content: "用户不希望 Mira 只镜像项目话题。",
      tagsJson: ["agency", "boundary", "identity"],
      importance: 0.88,
      confidence: 0.92,
      useCount: 2,
      lastUsedAt: ago(0.7),
      cooldownUntil: null,
      createdAt: ago(8.1),
    },
    {
      id: "mem-2",
      kind: "user_memory",
      content: "用户偏好先完成能部署的最小闭环，再升级复杂算法。",
      tagsJson: ["coding", "mvp", "product"],
      importance: 0.76,
      confidence: 0.86,
      useCount: 3,
      lastUsedAt: ago(0.6),
      cooldownUntil: ago(-23),
      createdAt: ago(28),
    },
    {
      id: "mem-3",
      kind: "self_memory",
      content: "Mira 认为过度解释会让一句话失去骨头。",
      tagsJson: ["style", "directness"],
      importance: 0.63,
      confidence: 0.78,
      useCount: 1,
      lastUsedAt: ago(16),
      cooldownUntil: null,
      createdAt: ago(52),
    },
    {
      id: "mem-4",
      kind: "world_experience",
      content: "雨后便利店玻璃上的半块蓝色霓虹成为视觉母题。",
      tagsJson: ["rain", "neon", "aesthetic"],
      importance: 0.57,
      confidence: 0.72,
      useCount: 1,
      lastUsedAt: ago(4.1),
      cooldownUntil: null,
      createdAt: ago(18),
    },
  ],
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown dashboard query error";
}

export async function loadDashboardData(): Promise<DashboardData> {
  if (!process.env.DATABASE_URL) {
    return DEMO_DASHBOARD_DATA;
  }

  try {
    const { getDashboardSnapshot } = await import("@/db/repo");
    const snapshot = await getDashboardSnapshot();
    // Drizzle returns Date instances. Converting once keeps every client chart/table prop serializable.
    const serializable = JSON.parse(JSON.stringify(snapshot)) as Omit<DashboardData, "source">;
    return { ...serializable, source: "database" };
  } catch (error) {
    return {
      ...DEMO_DASHBOARD_DATA,
      connectionError: errorMessage(error),
    };
  }
}
