export const WORLD_TIME_ZONE = "Asia/Shanghai";
export const WORLD_TICK_MINUTES = 15;

export type ScheduleBlockType =
  | "sleep"
  | "commute"
  | "work"
  | "meal"
  | "leisure"
  | "social"
  | "errand"
  | "exploration";

export type ScheduleBlockStatus =
  | "planned"
  | "active"
  | "completed"
  | "changed"
  | "cancelled"
  | "delayed";

export type ScheduleBlockSource =
  | "routine"
  | "world_event"
  | "user_suggestion"
  | "mira_decision"
  | "external_information";

export type WorldAffect =
  | "energy"
  | "boredom"
  | "curiosity"
  | "loneliness"
  | "irritation"
  | "disappointment"
  | "attachment"
  | "shareDesire";

export interface AffectReason {
  reason: string;
  sourceType: "schedule" | "world_event" | "awaiting_reply" | "user_message" | "natural_decay";
  sourceId?: string;
  correlationId: string;
  occurredAt: Date;
}

export interface WorldState {
  companionId: string;
  currentTime: Date;
  currentLocationId?: string;
  currentActivityId?: string;
  currentScheduleBlockId?: string;
  energy: number;
  boredom: number;
  curiosity: number;
  loneliness: number;
  irritation: number;
  disappointment: number;
  attachment: number;
  shareDesire: number;
  affectReasons?: Partial<Record<WorldAffect, AffectReason[]>>;
  lastChangeReason?: string;
  lastCorrelationId?: string;
  lastWorldTickAt: Date;
  lastDailyPlanAt?: Date;
  version: number;
}

export interface ScheduleBlock {
  id: string;
  companionId: string;
  title: string;
  type: ScheduleBlockType;
  startAt: Date;
  endAt: Date;
  locationId?: string;
  flexibility: number;
  interruptionTolerance: number;
  status: ScheduleBlockStatus;
  source: ScheduleBlockSource;
  changeReason?: string;
  localDate?: string;
  idempotencyKey?: string;
  correlationId?: string;
}

export interface KnownPlace {
  id: string;
  companionId: string;
  canonicalKey: string;
  provider: "amap" | "baidu" | "manual";
  providerPoiId?: string;
  status: "known" | "want_to_visit" | "visited" | "avoided" | "archived";
  coordinateSystem: "gcj02" | "wgs84" | "bd09" | "unknown";
  name: string;
  category: string;
  district?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  firstDiscoveredAt: Date;
  firstVisitedAt?: Date;
  lastVisitedAt?: Date;
  visitCount: number;
  familiarity: number;
  miraImpression?: string;
  source: "world_search" | "user_recommendation" | "external_information" | "seed_data";
  lastVerifiedAt?: Date;
  metadata: Record<string, unknown>;
}

export interface TripFeasibility {
  reachable: boolean;
  travelMinutes?: number;
  estimatedCost?: number;
  openingStatus: "open" | "closed" | "unknown";
  weatherRisk: number;
  reservationRequired: boolean;
  availableVisitMinutes?: number;
  rejectionReasons: string[];
}

export interface WorldEvent {
  id: string;
  companionId: string;
  realityLayer: "physical" | "inner";
  idempotencyKey: string;
  correlationId: string;
  characterIds: string[];
  type:
    | "routine"
    | "work"
    | "social"
    | "external"
    | "weather"
    | "travel"
    | "accident"
    | "thought"
    | "user_influenced";
  title: string;
  description: string;
  occurredAt: Date;
  locationId?: string;
  causeType:
    | "schedule"
    | "random"
    | "external_information"
    | "user_suggestion"
    | "character_interaction"
    | "previous_event";
  causeId?: string;
  emotionalImpact: Record<string, number>;
  consequences: string[];
  importance: number;
  sharePotential: number;
  randomSeed?: string;
  expiresAt?: Date;
}

export interface WorldCharacter {
  id: string;
  companionId: string;
  stableKey: string;
  name: string;
  role: string;
  relationshipType: "coworker" | "roommate" | "friend" | "manager" | "acquaintance";
  personalityTraits: string[];
  relationshipScore: number;
  currentSituation?: string;
  lastInteractionAt?: Date;
  activeOpenLoops: string[];
  metadata?: Record<string, unknown>;
}

export interface OpenLoop {
  id: string;
  companionId: string;
  owner: "mira" | "user" | "shared";
  topic: string;
  description: string;
  createdAt: Date;
  expectedAt?: Date;
  emotionalWeight: number;
  status: "open" | "waiting" | "resolved" | "abandoned" | "expired";
  sourceType:
    | "conversation"
    | "world_event"
    | "schedule"
    | "user_commitment"
    | "mira_commitment";
  sourceId?: string;
  nextAction?: string;
  resolution?: string;
  idempotencyKey?: string;
  correlationId?: string;
}

export interface WorldTickRun {
  id: string;
  companionId: string;
  windowStart: Date;
  windowEnd: Date;
  status: "processing" | "completed" | "failed";
  randomSeed: string;
  correlationId: string;
  attempt: number;
  claimedAt: Date;
  leaseExpiresAt?: Date;
  completedAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProposedWorldMutation {
  type: string;
  payload: Record<string, unknown>;
  reason: string;
}

export interface ShareCandidate {
  id: string;
  companionId: string;
  sourceType:
    | "world_event"
    | "inner_thought"
    | "open_loop"
    | "external_information"
    | "user_follow_up";
  sourceId: string;
  contentSummary: string;
  reasonToShare: string;
  emotionalIntensity: number;
  relevanceToUser: number;
  novelty: number;
  intimacy: number;
  urgency: number;
  interruptionCost: number;
  score: number;
  status: "pending" | "approved" | "shared" | "suppressed" | "expired";
  createdAt: Date;
  expiresAt?: Date;
}

export interface AwaitingReply {
  id: string;
  companionId: string;
  messageId: string;
  startedAt: Date;
  expectedAt?: Date;
  expectation: number;
  emotionalWeight: number;
  explicitQuestion: boolean;
  vulnerableDisclosure: boolean;
  userCommitment?: boolean;
  userSaidBusy: boolean;
  status: "waiting" | "resolved" | "timed_out" | "dismissed";
  consequenceAppliedAt?: Date;
  dissatisfactionExpressedAt?: Date;
  resolvedAt?: Date;
}

export interface WorldStateChange {
  targetPath: string;
  before: number | string | null;
  after: number | string | null;
  reason: string;
}
