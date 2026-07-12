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
  loneliness: number;
  irritation: number;
  disappointment: number;
}

export interface Drives {
  affection: number;
  aestheticUrge: number;
  noveltySeeking: number;
  shareDesire: number;
}

export type StateDimension = keyof Mood | keyof Drives;

export interface StateReason {
  reason: string;
  sourceType: "schedule" | "world_event" | "awaiting_reply" | "user_message" | "reflection";
  sourceId?: string;
  correlationId: string;
  impact: number;
  occurredAt: string;
  expiresAt: string;
}

export type StateReasons = Partial<Record<StateDimension, StateReason[]>>;

export interface Relationship {
  closeness: number;
  trust: number;
  familiarity: number;
  boundarySensitivity: number;
  friendshipAffinity: number;
  romanticAffinity: number;
  stage: "new" | "friendship" | "close_friendship" | "ambiguous" | "romantic";
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
  stateReasons: StateReasons;
  version: number;
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
  worldSignals: WorldSignal[];
}

export type WorldSignalType =
  | "place_recommendation"
  | "user_schedule"
  | "user_commitment"
  | "mira_suggestion"
  | "correction"
  | "external_information_candidate"
  | "user_busy"
  | "relationship_intent";

export interface WorldSignal {
  type: WorldSignalType;
  subject: string;
  content: string;
  confidence: number;
  expectedAt?: string;
  metadata?: Record<string, JsonValue>;
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

export interface ActionPlan {
  action: "reply" | "proactive_message" | "do_nothing";
  mode: ActionMode;
  memoryBudget: "none" | "light" | "medium" | "heavy";
  toolAllowed: boolean;
  webAccess?: "none" | "search";
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
  factClaims: Array<{
    type: "world" | "external" | "opinion";
    sourceRefs: string[];
  }>;
  groundingRefs: string[];
  proposedWorldMutation: import("@/world/types").ProposedWorldMutation | null;
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
  profile: CharacterProfile;
}

export interface CharacterProfile {
  city: string;
  timeZone: string;
  education: string;
  lifeStage: string;
  housing: string;
  company: string;
  jobTitle: string;
  workHours: { start: string; end: string; flexible: boolean };
  workPressure: string;
  incomeLevel: string;
  commuteModes: string[];
  interests: string[];
  homePlaceKey: string;
  workPlaceKey: string;
}

export interface PolicyConfig {
  proactiveMaxPerDay: number;
  quietHours: { start: string; end: string; timeZone: string };
  minimumProactiveIntervalHours: number;
  memoryWriteThreshold: number;
  toolDailyLimit: number;
}

export interface RuntimeConfig {
  schemaVersion: 3;
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
  relationshipSummary: string;
  placePreferenceUpdates: Array<{
    placeId: string;
    familiarityDelta: number;
    impression?: string;
  }>;
  interestUpdates: { added: string[]; cooled: string[] };
  characterUpdates: Array<{
    stableKey: string;
    relationshipDelta: number;
    currentSituation?: string;
  }>;
  weeklySummary: string | null;
}
