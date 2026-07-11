import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type {
  ActiveArc,
  Drives,
  Mood,
  Relationship,
  RuntimeConfig,
  Traits,
} from "@/core/types";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    telegramUserId: text("telegram_user_id").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("users_telegram_user_id_idx").on(table.telegramUserId)],
);

export const companions = pgTable(
  "companions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Mira"),
    configJson: jsonb("config_json").$type<RuntimeConfig>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("companions_user_id_idx").on(table.userId)],
);

export const companionStates = pgTable(
  "companion_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    traitsJson: jsonb("traits_json").$type<Traits>().notNull(),
    moodJson: jsonb("mood_json").$type<Mood>().notNull(),
    drivesJson: jsonb("drives_json").$type<Drives>().notNull(),
    relationshipJson: jsonb("relationship_json").$type<Relationship>().notNull(),
    activeArcsJson: jsonb("active_arcs_json").$type<ActiveArc[]>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("companion_states_companion_id_idx").on(table.companionId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
    text: text("text").notNull(),
    rawJson: jsonb("raw_json"),
    telegramMessageId: integer("telegram_message_id"),
    chatId: text("chat_id"),
    replyToMessageId: uuid("reply_to_message_id"),
    correlationId: uuid("correlation_id"),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    deliveryStatus: text("delivery_status", {
      enum: ["pending", "sending", "delivered", "failed", "delivery_unknown"],
    }),
    memoryCandidateJson: jsonb("memory_candidate_json"),
    processingStatus: text("processing_status", {
      enum: ["received", "processing", "completed", "failed"],
    }),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    processingLeaseToken: uuid("processing_lease_token"),
    processingLeaseExpiresAt: timestamp("processing_lease_expires_at", { withTimezone: true }),
    processingCompletedAt: timestamp("processing_completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("messages_companion_created_idx").on(table.companionId, table.createdAt),
    uniqueIndex("messages_telegram_idempotency_idx").on(
      table.companionId,
      table.role,
      table.telegramMessageId,
    ),
    uniqueIndex("messages_reply_to_message_idx").on(table.replyToMessageId),
  ],
);

export const messageOutbox = pgTable(
  "message_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    chatId: text("chat_id").notNull(),
    bubbleIndex: integer("bubble_index").notNull(),
    body: text("body").notNull(),
    status: text("status", {
      enum: ["pending", "sending", "delivered", "failed", "delivery_unknown"],
    })
      .notNull()
      .default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    telegramMessageId: integer("telegram_message_id"),
    lastError: text("last_error"),
    lastResponseJson: jsonb("last_response_json"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("message_outbox_idempotency_idx").on(table.idempotencyKey),
    uniqueIndex("message_outbox_message_bubble_idx").on(table.messageId, table.bubbleIndex),
    index("message_outbox_status_available_idx").on(table.status, table.availableAt),
    index("message_outbox_message_idx").on(table.messageId, table.bubbleIndex),
  ],
);

export const messageAnnotations = pgTable(
  "message_annotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    topicsJson: jsonb("topics_json").$type<Array<{ name: string; confidence: number }>>().notNull(),
    emotion: text("emotion").notNull(),
    intent: text("intent").notNull(),
    importance: real("importance").notNull(),
    novelty: real("novelty").notNull(),
    summary: text("summary").notNull().default(""),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("message_annotations_message_id_idx").on(table.messageId)],
);

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["user_memory", "relationship_memory", "self_memory", "world_experience"],
    }).notNull(),
    content: text("content").notNull(),
    tagsJson: jsonb("tags_json").$type<string[]>().notNull().default([]),
    importance: real("importance").notNull().default(0.5),
    confidence: real("confidence").notNull().default(0.7),
    useCount: integer("use_count").notNull().default(0),
    dailyUseCount: integer("daily_use_count").notNull().default(0),
    dailyUseDate: date("daily_use_date"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
    // pgvector column reserved; MVP ranks text and tags until an embedding endpoint is configured.
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("memories_companion_kind_idx").on(table.companionId, table.kind),
    index("memories_companion_importance_idx").on(table.companionId, table.importance),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    source: text("source").notNull(),
    correlationId: uuid("correlation_id"),
    payloadJson: jsonb("payload_json").notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("events_companion_created_idx").on(table.companionId, table.createdAt),
    index("events_companion_correlation_idx").on(table.companionId, table.correlationId),
    index("events_type_idx").on(table.type),
  ],
);

export const eventSeeds = pgTable(
  "event_seeds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    text: text("text").notNull(),
    tagsJson: jsonb("tags_json").$type<string[]>().notNull().default([]),
    weight: real("weight").notNull().default(1),
    enabled: boolean("enabled").notNull().default(true),
    usedCount: integer("used_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("event_seeds_companion_enabled_idx").on(table.companionId, table.enabled),
    uniqueIndex("event_seeds_companion_text_idx").on(table.companionId, table.text),
  ],
);

export const knownPlaces = pgTable(
  "known_places",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    canonicalKey: text("canonical_key").notNull(),
    provider: text("provider", { enum: ["amap", "baidu", "manual"] }).notNull(),
    providerPoiId: text("provider_poi_id"),
    status: text("status", {
      enum: ["known", "want_to_visit", "visited", "avoided", "archived"],
    })
      .notNull()
      .default("known"),
    coordinateSystem: text("coordinate_system", {
      enum: ["gcj02", "wgs84", "bd09", "unknown"],
    })
      .notNull()
      .default("unknown"),
    name: text("name").notNull(),
    category: text("category").notNull(),
    district: text("district"),
    address: text("address"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    firstDiscoveredAt: timestamp("first_discovered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    firstVisitedAt: timestamp("first_visited_at", { withTimezone: true }),
    lastVisitedAt: timestamp("last_visited_at", { withTimezone: true }),
    visitCount: integer("visit_count").notNull().default(0),
    familiarity: real("familiarity").notNull().default(0),
    miraImpression: text("mira_impression"),
    source: text("source", {
      enum: ["world_search", "user_recommendation", "external_information", "seed_data"],
    }).notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("known_places_companion_canonical_key_idx").on(
      table.companionId,
      table.canonicalKey,
    ),
    uniqueIndex("known_places_provider_poi_idx").on(
      table.companionId,
      table.provider,
      table.providerPoiId,
    ),
    index("known_places_companion_name_idx").on(table.companionId, table.name),
    index("known_places_companion_visited_idx").on(table.companionId, table.lastVisitedAt),
  ],
);

export const worldCharacters = pgTable(
  "world_characters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    stableKey: text("stable_key").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    relationshipType: text("relationship_type", {
      enum: ["coworker", "roommate", "friend", "manager", "acquaintance"],
    }).notNull(),
    personalityTraitsJson: jsonb("personality_traits_json").$type<string[]>().notNull().default([]),
    relationshipScore: real("relationship_score").notNull().default(0.5),
    currentSituation: text("current_situation"),
    lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
    activeOpenLoopsJson: jsonb("active_open_loops_json").$type<string[]>().notNull().default([]),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    isFictional: boolean("is_fictional").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("world_characters_companion_stable_key_idx").on(
      table.companionId,
      table.stableKey,
    ),
    index("world_characters_companion_type_idx").on(
      table.companionId,
      table.relationshipType,
    ),
  ],
);

export const scheduleBlocks = pgTable(
  "schedule_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    title: text("title").notNull(),
    type: text("type", {
      enum: ["sleep", "commute", "work", "meal", "leisure", "social", "errand", "exploration"],
    }).notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    localDate: date("local_date").notNull(),
    locationId: uuid("location_id").references(() => knownPlaces.id, { onDelete: "set null" }),
    flexibility: real("flexibility").notNull().default(0.5),
    interruptionTolerance: real("interruption_tolerance").notNull().default(0.5),
    status: text("status", {
      enum: ["planned", "active", "completed", "changed", "cancelled", "delayed"],
    })
      .notNull()
      .default("planned"),
    source: text("source", {
      enum: ["routine", "world_event", "user_suggestion", "mira_decision", "external_information"],
    }).notNull(),
    changeReason: text("change_reason"),
    correlationId: uuid("correlation_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("schedule_blocks_companion_idempotency_idx").on(
      table.companionId,
      table.idempotencyKey,
    ),
    index("schedule_blocks_companion_start_idx").on(table.companionId, table.startAt),
    index("schedule_blocks_companion_local_date_idx").on(table.companionId, table.localDate),
    index("schedule_blocks_companion_status_start_idx").on(
      table.companionId,
      table.status,
      table.startAt,
    ),
    check("schedule_blocks_valid_interval", sql`${table.endAt} > ${table.startAt}`),
  ],
);

export const worldStates = pgTable(
  "world_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    currentTime: timestamp("current_time", { withTimezone: true }).defaultNow().notNull(),
    currentLocationId: uuid("current_location_id").references(() => knownPlaces.id, {
      onDelete: "set null",
    }),
    currentActivityId: text("current_activity_id"),
    currentScheduleBlockId: uuid("current_schedule_block_id").references(() => scheduleBlocks.id, {
      onDelete: "set null",
    }),
    energy: real("energy").notNull().default(0.65),
    boredom: real("boredom").notNull().default(0.15),
    curiosity: real("curiosity").notNull().default(0.72),
    loneliness: real("loneliness").notNull().default(0.12),
    irritation: real("irritation").notNull().default(0),
    disappointment: real("disappointment").notNull().default(0),
    attachment: real("attachment").notNull().default(0.18),
    shareDesire: real("share_desire").notNull().default(0.3),
    emotionReasonsJson: jsonb("emotion_reasons_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastChangeReason: text("last_change_reason"),
    lastCorrelationId: uuid("last_correlation_id"),
    lastWorldTickAt: timestamp("last_world_tick_at", { withTimezone: true }).defaultNow().notNull(),
    lastDailyPlanAt: timestamp("last_daily_plan_at", { withTimezone: true }),
    version: integer("version").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("world_states_companion_id_idx").on(table.companionId),
    index("world_states_last_tick_idx").on(table.lastWorldTickAt),
  ],
);

export const openLoops = pgTable(
  "open_loops",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key"),
    owner: text("owner", { enum: ["mira", "user", "shared"] }).notNull(),
    topic: text("topic").notNull(),
    description: text("description").notNull(),
    expectedAt: timestamp("expected_at", { withTimezone: true }),
    emotionalWeight: real("emotional_weight").notNull().default(0.3),
    status: text("status", {
      enum: ["open", "waiting", "resolved", "abandoned", "expired"],
    })
      .notNull()
      .default("open"),
    sourceType: text("source_type", {
      enum: ["conversation", "world_event", "schedule", "user_commitment", "mira_commitment"],
    }).notNull(),
    sourceId: text("source_id"),
    nextAction: text("next_action"),
    resolution: text("resolution"),
    correlationId: uuid("correlation_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("open_loops_companion_idempotency_idx").on(
      table.companionId,
      table.idempotencyKey,
    ),
    index("open_loops_companion_status_expected_idx").on(
      table.companionId,
      table.status,
      table.expectedAt,
    ),
    index("open_loops_companion_topic_idx").on(table.companionId, table.topic),
  ],
);

export const worldTickRuns = pgTable(
  "world_tick_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["processing", "completed", "failed"] })
      .notNull()
      .default("processing"),
    randomSeed: text("random_seed").notNull(),
    engineVersion: text("engine_version").notNull().default("world-v1"),
    attemptCount: integer("attempt_count").notNull().default(1),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    correlationId: uuid("correlation_id").defaultRandom().notNull(),
    resultJson: jsonb("result_json").$type<Record<string, unknown>>().notNull().default({}),
    lastError: text("last_error"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("world_tick_runs_companion_window_idx").on(
      table.companionId,
      table.windowStart,
    ),
    index("world_tick_runs_status_lease_idx").on(table.status, table.leaseExpiresAt),
    index("world_tick_runs_companion_created_idx").on(table.companionId, table.createdAt),
    check("world_tick_runs_valid_interval", sql`${table.windowEnd} > ${table.windowStart}`),
  ],
);

export const proposedWorldMutations = pgTable(
  "proposed_world_mutations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key"),
    mutationType: text("mutation_type").notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    reason: text("reason").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    status: text("status", { enum: ["proposed", "approved", "rejected", "applied"] })
      .notNull()
      .default("proposed"),
    validationJson: jsonb("validation_json").$type<Record<string, unknown>>().notNull().default({}),
    rejectionReason: text("rejection_reason"),
    correlationId: uuid("correlation_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("proposed_world_mutations_companion_idempotency_idx").on(
      table.companionId,
      table.idempotencyKey,
    ),
    index("proposed_world_mutations_companion_status_idx").on(
      table.companionId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const worldEvents = pgTable(
  "world_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    seedId: uuid("seed_id").references(() => eventSeeds.id, { onDelete: "set null" }),
    type: text("type", {
      enum: ["routine", "work", "social", "external", "weather", "travel", "accident", "thought", "user_influenced"],
    })
      .notNull()
      .default("thought"),
    realityLayer: text("reality_layer", { enum: ["inner", "physical"] })
      .notNull()
      .default("inner"),
    title: text("title").notNull(),
    content: text("content").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    locationId: uuid("location_id").references(() => knownPlaces.id, { onDelete: "set null" }),
    causeType: text("cause_type", {
      enum: ["schedule", "random", "external_information", "user_suggestion", "character_interaction", "previous_event"],
    }),
    causeId: text("cause_id"),
    moodImpactJson: jsonb("mood_impact_json").notNull().default({}),
    arcImpactJson: jsonb("arc_impact_json").notNull().default({}),
    emotionalImpactJson: jsonb("emotional_impact_json")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    characterIdsJson: jsonb("character_ids_json").$type<string[]>().notNull().default([]),
    consequencesJson: jsonb("consequences_json").$type<string[]>().notNull().default([]),
    importance: real("importance").notNull().default(0.5),
    sharePotential: real("share_potential").notNull().default(0.5),
    randomSeed: text("random_seed"),
    idempotencyKey: text("idempotency_key"),
    correlationId: uuid("correlation_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("world_events_companion_created_idx").on(table.companionId, table.createdAt),
    index("world_events_companion_occurred_idx").on(table.companionId, table.occurredAt),
    index("world_events_location_occurred_idx").on(table.locationId, table.occurredAt),
    uniqueIndex("world_events_companion_idempotency_idx").on(
      table.companionId,
      table.idempotencyKey,
    ),
  ],
);

export const proactiveLogs = pgTable(
  "proactive_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    shouldSend: boolean("should_send").notNull(),
    reason: text("reason").notNull(),
    selectedMode: text("selected_mode"),
    selectedSeedJson: jsonb("selected_seed_json"),
    sentMessageId: uuid("sent_message_id").references(() => messages.id, { onDelete: "set null" }),
    sentText: text("sent_text"),
    quietHoursBlocked: boolean("quiet_hours_blocked").notNull().default(false),
    dailyLimitBlocked: boolean("daily_limit_blocked").notNull().default(false),
    intervalBlocked: boolean("interval_blocked").notNull().default(false),
    score: real("score"),
    idempotencyKey: text("idempotency_key"),
    correlationId: uuid("correlation_id"),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    createdAt: createdAt(),
  },
  (table) => [
    index("proactive_logs_companion_created_idx").on(table.companionId, table.createdAt),
    index("proactive_logs_companion_correlation_idx").on(
      table.companionId,
      table.correlationId,
    ),
    uniqueIndex("proactive_logs_idempotency_idx").on(table.idempotencyKey),
  ],
);

export const stateChanges = pgTable(
  "state_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    targetPath: text("target_path").notNull(),
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    deltaJson: jsonb("delta_json"),
    reason: text("reason").notNull(),
    causedBy: text("caused_by").notNull(),
    correlationId: uuid("correlation_id"),
    createdAt: createdAt(),
  },
  (table) => [
    index("state_changes_companion_created_idx").on(table.companionId, table.createdAt),
    index("state_changes_companion_correlation_idx").on(
      table.companionId,
      table.correlationId,
    ),
  ],
);

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    toolName: text("tool_name").notNull(),
    argsJson: jsonb("args_json").notNull(),
    resultJson: jsonb("result_json").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (table) => [index("tool_calls_companion_created_idx").on(table.companionId, table.createdAt)],
);

export const internalJournals = pgTable(
  "internal_journals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    summary: text("summary").notNull(),
    reflection: text("reflection").notNull(),
    traitUpdatesJson: jsonb("trait_updates_json").notNull().default({}),
    beliefUpdatesJson: jsonb("belief_updates_json").notNull().default({}),
    arcUpdatesJson: jsonb("arc_updates_json").notNull().default([]),
    correlationId: uuid("correlation_id"),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("internal_journals_companion_date_idx").on(table.companionId, table.date),
    index("internal_journals_companion_correlation_idx").on(
      table.companionId,
      table.correlationId,
    ),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type CompanionRow = typeof companions.$inferSelect;
export type CompanionStateRow = typeof companionStates.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type MemoryRow = typeof memories.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type KnownPlaceRow = typeof knownPlaces.$inferSelect;
export type WorldCharacterRow = typeof worldCharacters.$inferSelect;
export type ScheduleBlockRow = typeof scheduleBlocks.$inferSelect;
export type WorldStateRow = typeof worldStates.$inferSelect;
export type OpenLoopRow = typeof openLoops.$inferSelect;
export type WorldTickRunRow = typeof worldTickRuns.$inferSelect;
export type ProposedWorldMutationRow = typeof proposedWorldMutations.$inferSelect;
