export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type MemoryKind =
  | "user_memory"
  | "relationship_memory"
  | "self_memory"
  | "world_experience";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface Traits {
  directness: number;
  warmth: number;
  sarcasm: number;
  curiosity: number;
  initiative: number;
  aestheticSensitivity: number;
  independence: number;
  emotionalVolatility: number;
}

export interface Mood {
  valence: number;
  energy: number;
  curiosity: number;
  concern: number;
  playfulness: number;
  boredom: number;
}

export interface Drives {
  curiosity: number;
  affection: number;
  playfulness: number;
  boredom: number;
  concern: number;
  aestheticUrge: number;
  noveltySeeking: number;
}

export interface Relationship {
  closeness: number;
  trust: number;
  familiarity: number;
  boundarySensitivity: number;
}

export interface ActiveArc {
  id: string;
  title: string;
  progress: number;
  currentQuestion: string;
}

export interface CompanionState {
  traits: Traits;
  mood: Mood;
  drives: Drives;
  relationship: Relationship;
  activeArcs: ActiveArc[];
}

export interface Topic {
  name: string;
  confidence: number;
}

export interface MessageAnalysis {
  topics: Topic[];
  emotion: string;
  intent: string;
  importance: number;
  novelty: number;
  summary: string;
}

export type ActionMode =
  | "technical_companion"
  | "weird_question"
  | "quiet_observation"
  | "project_nudge"
  | "inner_world_scene"
  | "photo_share"
  | "playful_challenge"
  | "emotional_support";

export interface SeedCard {
  id?: string;
  type: string;
  text: string;
  tags: string[];
  weight?: number;
  enabled?: boolean;
  usedCount?: number;
  lastUsedAt?: Date | string | null;
}

export interface ActionPlan {
  action: "reply" | "proactive_message" | "do_nothing";
  mode: ActionMode;
  memoryBudget: "none" | "light" | "medium" | "heavy";
  noveltyBudget: "none" | "light" | "medium";
  selectedSeed: SeedCard | null;
  toolAllowed: boolean;
  styleHints: string[];
  reason: string;
}

export interface ToolRequest {
  name: string;
  arguments: Record<string, JsonValue>;
}

export interface MemoryCandidate {
  kind: MemoryKind;
  content: string;
  tags: string[];
  importance: number;
}

export interface ActorOutput {
  message: string;
  toolCall: ToolRequest | null;
  memoryCandidate: MemoryCandidate | null;
}

export interface SelectedMemory {
  id: string;
  kind: MemoryKind;
  content: string;
  tags: string[];
  importance: number;
  confidence: number;
  useCount: number;
  cooldownUntil: Date | null;
}

export interface CharacterConfig {
  name: string;
  identity: string[];
  beliefs: string[];
  styleRules: string[];
  forbiddenStyles: string[];
  boundaries: string[];
}

export interface PolicyConfig {
  proactiveMaxPerDay: number;
  quietHours: { start: string; end: string; timeZone: string };
  minimumProactiveIntervalHours: number;
  memoryWriteThreshold: number;
  toolDailyLimit: number;
}

export interface RuntimeConfig {
  character: CharacterConfig;
  policy: PolicyConfig;
  model: string;
}

export interface TopicEntropy {
  entropyScore: number;
  top1Share: number;
  top3Share: number;
  collapseRisk: boolean;
  distribution: Array<{ topic: string; count: number; share: number }>;
}

export interface DailyReflection {
  summary: string;
  reflection: string;
  moodUpdates: Partial<Mood>;
  driveUpdates: Partial<Drives>;
  relationshipUpdates: Partial<Relationship>;
  traitUpdates: Partial<Traits>;
  arcUpdates: Array<{ id: string; progressDelta: number; currentQuestion?: string }>;
  tomorrowSeeds: SeedCard[];
}
