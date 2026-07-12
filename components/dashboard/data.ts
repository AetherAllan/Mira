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
import { getDashboardSnapshot } from "@/db/repo";

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

export async function loadDashboardData(): Promise<DashboardData> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return JSON.parse(JSON.stringify(await getDashboardSnapshot())) as DashboardData;
}
