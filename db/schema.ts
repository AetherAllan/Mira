import {
  boolean,
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
    memoryCandidateJson: jsonb("memory_candidate_json"),
    processingStatus: text("processing_status", {
      enum: ["received", "processing", "completed", "failed"],
    }),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
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
    payloadJson: jsonb("payload_json").notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("events_companion_created_idx").on(table.companionId, table.createdAt),
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

export const worldEvents = pgTable(
  "world_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),
    seedId: uuid("seed_id").references(() => eventSeeds.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    moodImpactJson: jsonb("mood_impact_json").notNull().default({}),
    arcImpactJson: jsonb("arc_impact_json").notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [index("world_events_companion_created_idx").on(table.companionId, table.createdAt)],
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
    createdAt: createdAt(),
  },
  (table) => [index("proactive_logs_companion_created_idx").on(table.companionId, table.createdAt)],
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
    createdAt: createdAt(),
  },
  (table) => [index("state_changes_companion_created_idx").on(table.companionId, table.createdAt)],
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
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("internal_journals_companion_date_idx").on(table.companionId, table.date)],
);

export type UserRow = typeof users.$inferSelect;
export type CompanionRow = typeof companions.$inferSelect;
export type CompanionStateRow = typeof companionStates.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type MemoryRow = typeof memories.$inferSelect;
export type EventRow = typeof events.$inferSelect;
