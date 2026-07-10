import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type {
  CompanionState,
  MemoryKind,
  MessageRole,
  RuntimeConfig,
  SeedCard,
} from "@/core/types";
import {
  computeMirrorIndex,
  computeRepetitionScore,
  computeTopicEntropy,
} from "@/core/metrics";
import { getDb } from "@/db/client";
import {
  companions,
  companionStates,
  events,
  eventSeeds,
  internalJournals,
  memories,
  messageAnnotations,
  messages,
  proactiveLogs,
  stateChanges,
  toolCalls,
  users,
  worldEvents,
} from "@/db/schema";
import { DEFAULT_RUNTIME_CONFIG, INITIAL_STATE } from "@/seed/character";
import { DEFAULT_SEED_CARDS } from "@/seed/seedCards";
import { isValidTimeZone } from "@/lib/time";

type NewMessage = Omit<typeof messages.$inferInsert, "id" | "createdAt">;
type NewAnnotation = Omit<typeof messageAnnotations.$inferInsert, "id" | "createdAt">;
type NewEvent = Omit<typeof events.$inferInsert, "id" | "createdAt">;
type NewStateChange = Omit<typeof stateChanges.$inferInsert, "id" | "createdAt">;
type NewToolCall = Omit<typeof toolCalls.$inferInsert, "id" | "createdAt">;
type NewProactiveLog = Omit<typeof proactiveLogs.$inferInsert, "id" | "createdAt">;
type NewJournal = Omit<typeof internalJournals.$inferInsert, "id" | "createdAt">;
type NewWorldEvent = Omit<typeof worldEvents.$inferInsert, "id" | "createdAt">;

export type MemoryCreateInput = {
  userId: string;
  companionId: string;
  kind: MemoryKind;
  content: string;
  tags?: string[];
  tagsJson?: string[];
  importance?: number;
  confidence?: number;
};

export type AdminListFilters = {
  from?: Date;
  to?: Date;
  limit?: number;
};

export type MessageFilters = AdminListFilters & {
  role?: MessageRole;
  topic?: string;
};

export type MemoryFilters = {
  kind?: MemoryKind;
  tag?: string;
  search?: string;
  limit?: number;
};

export type EventFilters = AdminListFilters & {
  type?: string;
  source?: string;
};

function clampLimit(value: number | undefined, fallback = 100) {
  return Math.max(1, Math.min(value ?? fallback, 500));
}

function stateFromRow(row: typeof companionStates.$inferSelect): CompanionState {
  return {
    traits: row.traitsJson,
    mood: row.moodJson,
    drives: row.drivesJson,
    relationship: row.relationshipJson,
    activeArcs: row.activeArcsJson,
  };
}

function zonedDateParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function zonedMidnight(year: number, month: number, day: number, timeZone: string) {
  const target = Date.UTC(year, month - 1, day);
  let candidate = target;
  // Two passes account for a DST offset change close to the requested boundary.
  for (let pass = 0; pass < 2; pass += 1) {
    const local = zonedDateParts(new Date(candidate), timeZone);
    const localAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    candidate = target - (localAsUtc - candidate);
  }
  return new Date(candidate);
}

function dayBounds(date?: string, timeZone = "Asia/Tokyo") {
  let year: number;
  let month: number;
  let day: number;
  if (date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) throw new Error("Invalid date");
    [, year, month, day] = match.map(Number);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day
    ) {
      throw new Error("Invalid date");
    }
  } else {
    ({ year, month, day } = zonedDateParts(new Date(), timeZone));
  }

  const nextCalendarDay = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: zonedMidnight(year, month, day, timeZone),
    end: zonedMidnight(
      nextCalendarDay.getUTCFullYear(),
      nextCalendarDay.getUTCMonth() + 1,
      nextCalendarDay.getUTCDate(),
      timeZone,
    ),
  };
}

export async function ensureCompanionContext(
  input: { telegramUserId?: string; displayName?: string } = {},
) {
  const telegramUserId = input.telegramUserId ?? process.env.TELEGRAM_ALLOWED_USER_ID;
  if (!telegramUserId) throw new Error("TELEGRAM_ALLOWED_USER_ID is not configured");

  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      telegramUserId,
      displayName: input.displayName?.trim() || "Mira user",
    })
    .onConflictDoUpdate({
      target: users.telegramUserId,
      set: input.displayName?.trim()
        ? { displayName: input.displayName.trim(), updatedAt: new Date() }
        : { updatedAt: new Date() },
    })
    .returning();

  let [companion] = await db
    .select()
    .from(companions)
    .where(eq(companions.userId, user.id))
    .limit(1);

  if (!companion) {
    [companion] = await db
      .insert(companions)
      .values({
        userId: user.id,
        name: DEFAULT_RUNTIME_CONFIG.character.name,
        configJson: DEFAULT_RUNTIME_CONFIG,
      })
      .onConflictDoNothing({ target: companions.userId })
      .returning();

    // Another webhook may have won the insert race. Read the canonical row.
    if (!companion) {
      [companion] = await db
        .select()
        .from(companions)
        .where(eq(companions.userId, user.id))
        .limit(1);
    }
  }

  if (!companion) throw new Error("Failed to create companion");

  await db
    .insert(companionStates)
    .values({
      companionId: companion.id,
      traitsJson: INITIAL_STATE.traits,
      moodJson: INITIAL_STATE.mood,
      drivesJson: INITIAL_STATE.drives,
      relationshipJson: INITIAL_STATE.relationship,
      activeArcsJson: INITIAL_STATE.activeArcs,
    })
    .onConflictDoNothing({ target: companionStates.companionId });

  await createEventSeeds(companion.id, DEFAULT_SEED_CARDS);

  const [stateRow, seeds] = await Promise.all([
    db
      .select()
      .from(companionStates)
      .where(eq(companionStates.companionId, companion.id))
      .limit(1)
      .then((rows) => rows[0]),
    listSeeds(companion.id),
  ]);

  if (!stateRow) throw new Error("Failed to create companion state");
  return { user, companion, state: stateFromRow(stateRow), stateRow, seeds };
}

export const bootstrapCompanion = ensureCompanionContext;

export async function getRuntimeContext(telegramUserId?: string) {
  return ensureCompanionContext({ telegramUserId });
}

export async function getCompanionState(companionId: string) {
  const rows = await getDb()
    .select()
    .from(companionStates)
    .where(eq(companionStates.companionId, companionId))
    .limit(1);
  if (!rows[0]) throw new Error("Companion state not found");
  return stateFromRow(rows[0]);
}

export async function findMessageByTelegramId(
  companionId: string,
  role: MessageRole,
  telegramMessageId: number,
) {
  const rows = await getDb()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.companionId, companionId),
        eq(messages.role, role),
        eq(messages.telegramMessageId, telegramMessageId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createMessage(input: NewMessage) {
  const inserted = await getDb().insert(messages).values(input).onConflictDoNothing().returning();
  if (inserted[0]) return { row: inserted[0], created: true };

  if (input.telegramMessageId == null) {
    throw new Error("Message insert conflicted without a Telegram message id");
  }

  const existing = await findMessageByTelegramId(
    input.companionId,
    input.role,
    input.telegramMessageId,
  );
  if (!existing) throw new Error("Message insert conflicted but no existing row was found");
  return { row: existing, created: false };
}

export async function findAssistantReply(
  companionId: string,
  chatId: string,
  telegramMessageId: number,
) {
  const rows = await getDb()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.companionId, companionId),
        eq(messages.role, "assistant"),
        eq(messages.chatId, chatId),
        sql`${messages.rawJson}->>'replyToTelegramMessageId' = ${String(telegramMessageId)}`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function claimMessageProcessing(messageId: string) {
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  const processingStartedAt = new Date();
  const rows = await getDb()
    .update(messages)
    .set({
      processingStatus: "processing",
      processingStartedAt,
      processingCompletedAt: null,
    })
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.role, "user"),
        or(
          isNull(messages.processingStatus),
          eq(messages.processingStatus, "received"),
          eq(messages.processingStatus, "failed"),
          and(
            eq(messages.processingStatus, "processing"),
            or(
              isNull(messages.processingStartedAt),
              lt(messages.processingStartedAt, staleBefore),
            ),
          ),
        ),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function finishMessageProcessing(
  messageId: string,
  processingStartedAt: Date,
  status: "completed" | "failed",
) {
  const rows = await getDb()
    .update(messages)
    .set({
      processingStatus: status,
      processingCompletedAt: new Date(),
    })
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.processingStartedAt, processingStartedAt),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function completeMessageProcessing(messageId: string) {
  const rows = await getDb()
    .update(messages)
    .set({
      processingStatus: "completed",
      processingCompletedAt: new Date(),
    })
    .where(eq(messages.id, messageId))
    .returning();
  return rows[0] ?? null;
}

export async function hasMessageProcessingClaim(
  messageId: string,
  processingStartedAt: Date,
) {
  const rows = await getDb()
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.processingStatus, "processing"),
        eq(messages.processingStartedAt, processingStartedAt),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

export async function createAnnotation(input: NewAnnotation) {
  const rows = await getDb()
    .insert(messageAnnotations)
    .values(input)
    .onConflictDoUpdate({
      target: messageAnnotations.messageId,
      set: {
        topicsJson: input.topicsJson,
        emotion: input.emotion,
        intent: input.intent,
        importance: input.importance,
        novelty: input.novelty,
        summary: input.summary ?? "",
      },
    })
    .returning();
  return rows[0];
}

export async function createEvent(input: NewEvent) {
  const rows = await getDb().insert(events).values(input).returning();
  return rows[0];
}

export async function listRecentMessages(
  companionId: string,
  limit = 20,
  role?: MessageRole,
) {
  return getDb()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.companionId, companionId),
        role ? eq(messages.role, role) : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(clampLimit(limit, 20));
}

export async function listRecentAnnotations(companionId: string, limit = 50) {
  return getDb()
    .select({
      id: messageAnnotations.id,
      messageId: messageAnnotations.messageId,
      topicsJson: messageAnnotations.topicsJson,
      emotion: messageAnnotations.emotion,
      intent: messageAnnotations.intent,
      importance: messageAnnotations.importance,
      novelty: messageAnnotations.novelty,
      summary: messageAnnotations.summary,
      createdAt: messageAnnotations.createdAt,
      messageRole: messages.role,
      messageCreatedAt: messages.createdAt,
    })
    .from(messageAnnotations)
    .innerJoin(messages, eq(messageAnnotations.messageId, messages.id))
    .where(eq(messages.companionId, companionId))
    .orderBy(desc(messageAnnotations.createdAt))
    .limit(clampLimit(limit, 50));
}

export async function listAvailableMemories(companionId: string, limit = 12) {
  const now = new Date();
  return getDb()
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.companionId, companionId),
        or(isNull(memories.cooldownUntil), lte(memories.cooldownUntil, now)),
      ),
    )
    .orderBy(desc(memories.importance), desc(memories.createdAt))
    .limit(clampLimit(limit, 12));
}

export async function useMemories(ids: string[], timeZone = "Asia/Tokyo") {
  if (ids.length === 0) return [];

  // A fourth use on the same UTC day starts a 24-hour cooldown. Keeping this in
  // one UPDATE prevents concurrent webhooks from losing usage increments.
  const localDate = sql`(NOW() AT TIME ZONE ${timeZone})::date`;
  const nextDailyCount = sql<number>`CASE
    WHEN ${memories.dailyUseDate} = ${localDate} THEN ${memories.dailyUseCount} + 1
    ELSE 1
  END`;
  return getDb()
    .update(memories)
    .set({
      useCount: sql`${memories.useCount} + 1`,
      dailyUseCount: nextDailyCount,
      dailyUseDate: localDate,
      lastUsedAt: new Date(),
      cooldownUntil: sql`CASE
        WHEN ${nextDailyCount} > 3 THEN GREATEST(
          COALESCE(${memories.cooldownUntil}, NOW()),
          NOW() + INTERVAL '24 hours'
        )
        ELSE ${memories.cooldownUntil}
      END`,
    })
    .where(inArray(memories.id, ids))
    .returning();
}

export async function createMemory(input: MemoryCreateInput) {
  const rows = await getDb()
    .insert(memories)
    .values({
      userId: input.userId,
      companionId: input.companionId,
      kind: input.kind,
      content: input.content,
      tagsJson: input.tagsJson ?? input.tags ?? [],
      importance: input.importance ?? 0.5,
      confidence: input.confidence ?? 0.7,
    })
    .returning();
  return rows[0];
}

export async function deleteMemory(id: string, companionId?: string) {
  const rows = await getDb()
    .delete(memories)
    .where(
      and(eq(memories.id, id), companionId ? eq(memories.companionId, companionId) : undefined),
    )
    .returning({ id: memories.id });
  return rows[0] ?? null;
}

export async function setMemoryCooldown(
  id: string,
  cooldownUntil: Date | null,
  companionId?: string,
) {
  const rows = await getDb()
    .update(memories)
    .set({ cooldownUntil, updatedAt: new Date() })
    .where(
      and(eq(memories.id, id), companionId ? eq(memories.companionId, companionId) : undefined),
    )
    .returning();
  return rows[0] ?? null;
}

export async function createEventSeeds(companionId: string, seeds: SeedCard[]) {
  if (seeds.length === 0) return [];
  return getDb()
    .insert(eventSeeds)
    .values(
      seeds.map((seed) => ({
        companionId,
        type: seed.type,
        text: seed.text,
        tagsJson: seed.tags,
        weight: seed.weight ?? 1,
        enabled: seed.enabled ?? true,
      })),
    )
    .onConflictDoNothing({ target: [eventSeeds.companionId, eventSeeds.text] })
    .returning();
}

export async function listSeeds(companionId: string, enabled?: boolean) {
  return getDb()
    .select()
    .from(eventSeeds)
    .where(
      and(
        eq(eventSeeds.companionId, companionId),
        enabled === undefined ? undefined : eq(eventSeeds.enabled, enabled),
      ),
    )
    .orderBy(desc(eventSeeds.weight), desc(eventSeeds.createdAt));
}

export function listEnabledSeeds(companionId: string) {
  return listSeeds(companionId, true);
}

export async function markSeedUsed(id: string) {
  const rows = await getDb()
    .update(eventSeeds)
    .set({
      usedCount: sql`${eventSeeds.usedCount} + 1`,
      lastUsedAt: new Date(),
    })
    .where(eq(eventSeeds.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function setSeedEnabled(id: string, enabled: boolean, companionId?: string) {
  const rows = await getDb()
    .update(eventSeeds)
    .set({ enabled })
    .where(
      and(
        eq(eventSeeds.id, id),
        companionId ? eq(eventSeeds.companionId, companionId) : undefined,
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function updateCompanionStateIfCurrent(
  companionId: string,
  expected: CompanionState,
  state: CompanionState,
) {
  const rows = await getDb()
    .update(companionStates)
    .set({
      traitsJson: state.traits,
      moodJson: state.mood,
      drivesJson: state.drives,
      relationshipJson: state.relationship,
      activeArcsJson: state.activeArcs,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(companionStates.companionId, companionId),
        sql`${companionStates.traitsJson} = ${JSON.stringify(expected.traits)}::jsonb`,
        sql`${companionStates.moodJson} = ${JSON.stringify(expected.mood)}::jsonb`,
        sql`${companionStates.drivesJson} = ${JSON.stringify(expected.drives)}::jsonb`,
        sql`${companionStates.relationshipJson} = ${JSON.stringify(expected.relationship)}::jsonb`,
        sql`${companionStates.activeArcsJson} = ${JSON.stringify(expected.activeArcs)}::jsonb`,
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function createStateChange(input: NewStateChange) {
  const rows = await getDb().insert(stateChanges).values(input).returning();
  return rows[0];
}

export async function createToolCall(input: NewToolCall) {
  const rows = await getDb().insert(toolCalls).values(input).returning();
  return rows[0];
}

export async function countTodayToolCalls(companionId: string, timeZone = "Asia/Tokyo") {
  const { start, end } = dayBounds(undefined, timeZone);
  const rows = await getDb()
    .select({ value: count() })
    .from(toolCalls)
    .where(
      and(
        eq(toolCalls.companionId, companionId),
        gte(toolCalls.createdAt, start),
        lt(toolCalls.createdAt, end),
      ),
    );
  return rows[0]?.value ?? 0;
}

export async function getToolStats(
  companionId: string,
  toolName: string,
  timeZone = "Asia/Tokyo",
) {
  const { start, end } = dayBounds(undefined, timeZone);
  const [todayRows, lastRows] = await Promise.all([
    getDb()
      .select({ value: count() })
      .from(toolCalls)
      .where(
        and(
          eq(toolCalls.companionId, companionId),
          eq(toolCalls.toolName, toolName),
          gte(toolCalls.createdAt, start),
          lt(toolCalls.createdAt, end),
        ),
      ),
    getDb()
      .select({ createdAt: toolCalls.createdAt })
      .from(toolCalls)
      .where(
        and(eq(toolCalls.companionId, companionId), eq(toolCalls.toolName, toolName)),
      )
      .orderBy(desc(toolCalls.createdAt))
      .limit(1),
  ]);
  return {
    usedToday: todayRows[0]?.value ?? 0,
    lastUsedAt: lastRows[0]?.createdAt ?? null,
  };
}

export async function getProactiveStats(companionId: string, timeZone = "Asia/Tokyo") {
  const { start, end } = dayBounds(undefined, timeZone);
  const [todayRows, lastRows] = await Promise.all([
    getDb()
      .select({ value: count() })
      .from(proactiveLogs)
      .where(
        and(
          eq(proactiveLogs.companionId, companionId),
          eq(proactiveLogs.shouldSend, true),
          gte(proactiveLogs.createdAt, start),
          lt(proactiveLogs.createdAt, end),
        ),
      ),
    getDb()
      .select({ createdAt: proactiveLogs.createdAt })
      .from(proactiveLogs)
      .where(
        and(
          eq(proactiveLogs.companionId, companionId),
          eq(proactiveLogs.shouldSend, true),
        ),
      )
      .orderBy(desc(proactiveLogs.createdAt))
      .limit(1),
  ]);
  return {
    sentToday: todayRows[0]?.value ?? 0,
    lastSentAt: lastRows[0]?.createdAt ?? null,
  };
}

export async function createProactiveLog(input: NewProactiveLog) {
  const rows = await getDb().insert(proactiveLogs).values(input).returning();
  return rows[0];
}

export async function updateProactiveLog(
  id: string,
  values: Partial<typeof proactiveLogs.$inferInsert>,
) {
  const rows = await getDb()
    .update(proactiveLogs)
    .set(values)
    .where(eq(proactiveLogs.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function createInternalJournal(input: NewJournal) {
  const rows = await getDb()
    .insert(internalJournals)
    .values(input)
    .onConflictDoNothing({
      target: [internalJournals.companionId, internalJournals.date],
    })
    .returning();
  if (rows[0]) return { row: rows[0], created: true };

  const existing = await getDb()
    .select()
    .from(internalJournals)
    .where(
      and(
        eq(internalJournals.companionId, input.companionId),
        eq(internalJournals.date, input.date),
      ),
    )
    .limit(1);
  if (!existing[0]) throw new Error("Journal insert conflicted but no existing row was found");
  return { row: existing[0], created: false };
}

export type DailyReflectionChangeInput = {
  targetPath: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  deltaJson?: unknown;
  reason: string;
  causedBy: string;
};

export async function applyDailyReflectionTransaction(input: {
  journalInput: NewJournal;
  expectedState: CompanionState;
  state: CompanionState;
  changes: DailyReflectionChangeInput[];
  seeds?: SeedCard[];
  userId?: string;
  eventPayload?: unknown;
}) {
  const { journalInput, expectedState, state } = input;
  const changesJson = JSON.stringify(
    input.changes.map((change) => ({
      ...change,
      beforeJson: change.beforeJson ?? null,
      afterJson: change.afterJson ?? null,
      deltaJson: change.deltaJson ?? null,
    })),
  );
  const seedsJson = JSON.stringify(
    (input.seeds ?? []).map((seed) => ({
      type: seed.type,
      text: seed.text,
      tags: seed.tags,
      weight: seed.weight ?? 1,
      enabled: seed.enabled ?? true,
    })),
  );

  // neon-http cannot run callback transactions. One CTE statement gives the
  // daily reflection a single commit boundary. Locking and comparing the full
  // state prevents a separate Railway cron process from overwriting an
  // interaction that committed while the reflection LLM call was running.
  const result = await getDb().execute(sql`
    WITH locked_state AS MATERIALIZED (
      SELECT id
      FROM companion_states
      WHERE companion_id = ${journalInput.companionId}::uuid
        AND traits_json = ${JSON.stringify(expectedState.traits)}::jsonb
        AND mood_json = ${JSON.stringify(expectedState.mood)}::jsonb
        AND drives_json = ${JSON.stringify(expectedState.drives)}::jsonb
        AND relationship_json = ${JSON.stringify(expectedState.relationship)}::jsonb
        AND active_arcs_json = ${JSON.stringify(expectedState.activeArcs)}::jsonb
      FOR UPDATE
    ),
    inserted_journal AS (
      INSERT INTO internal_journals (
        companion_id, date, summary, reflection,
        trait_updates_json, belief_updates_json, arc_updates_json
      )
      SELECT
        ${journalInput.companionId}::uuid,
        ${journalInput.date}::date,
        ${journalInput.summary},
        ${journalInput.reflection},
        ${JSON.stringify(journalInput.traitUpdatesJson ?? {})}::jsonb,
        ${JSON.stringify(journalInput.beliefUpdatesJson ?? {})}::jsonb,
        ${JSON.stringify(journalInput.arcUpdatesJson ?? [])}::jsonb
      WHERE EXISTS (SELECT 1 FROM locked_state)
      ON CONFLICT (companion_id, date) DO NOTHING
      RETURNING id
    ),
    updated_state AS (
      UPDATE companion_states
      SET
        traits_json = ${JSON.stringify(state.traits)}::jsonb,
        mood_json = ${JSON.stringify(state.mood)}::jsonb,
        drives_json = ${JSON.stringify(state.drives)}::jsonb,
        relationship_json = ${JSON.stringify(state.relationship)}::jsonb,
        active_arcs_json = ${JSON.stringify(state.activeArcs)}::jsonb,
        updated_at = NOW()
      WHERE companion_id = ${journalInput.companionId}::uuid
        AND EXISTS (SELECT 1 FROM inserted_journal)
      RETURNING id
    ),
    inserted_changes AS (
      INSERT INTO state_changes (
        companion_id, target_path, before_json, after_json,
        delta_json, reason, caused_by
      )
      SELECT
        ${journalInput.companionId}::uuid,
        item->>'targetPath',
        item->'beforeJson',
        item->'afterJson',
        item->'deltaJson',
        item->>'reason',
        item->>'causedBy'
      FROM jsonb_array_elements(${changesJson}::jsonb) AS item
      WHERE EXISTS (SELECT 1 FROM inserted_journal)
      RETURNING id
    ),
    inserted_seeds AS (
      INSERT INTO event_seeds (
        companion_id, type, text, tags_json, weight, enabled
      )
      SELECT
        ${journalInput.companionId}::uuid,
        item->>'type',
        item->>'text',
        item->'tags',
        (item->>'weight')::real,
        (item->>'enabled')::boolean
      FROM jsonb_array_elements(${seedsJson}::jsonb) AS item
      WHERE EXISTS (SELECT 1 FROM inserted_journal)
      ON CONFLICT (companion_id, text) DO NOTHING
      RETURNING id
    ),
    inserted_change_events AS (
      INSERT INTO events (user_id, companion_id, type, source, payload_json)
      SELECT
        ${input.userId ?? null}::uuid,
        ${journalInput.companionId}::uuid,
        'state.change',
        item->>'causedBy',
        jsonb_build_object(
          'targetPath', item->>'targetPath',
          'before', item->'beforeJson',
          'after', item->'afterJson',
          'delta', item->'deltaJson',
          'reason', item->>'reason'
        )
      FROM jsonb_array_elements(${changesJson}::jsonb) AS item
      WHERE EXISTS (SELECT 1 FROM inserted_journal)
      RETURNING id
    ),
    inserted_event AS (
      INSERT INTO events (user_id, companion_id, type, source, payload_json)
      SELECT
        ${input.userId ?? null}::uuid,
        ${journalInput.companionId}::uuid,
        'daily.reflection',
        'daily_cron',
        ${JSON.stringify({
          date: journalInput.date,
          summary: journalInput.summary,
          reflection: journalInput.reflection,
          traitUpdates: journalInput.traitUpdatesJson ?? {},
          arcUpdates: journalInput.arcUpdatesJson ?? [],
        })}::jsonb
          || ${JSON.stringify(input.eventPayload ?? {})}::jsonb
          || jsonb_build_object('journalId', (SELECT id FROM inserted_journal LIMIT 1))
      WHERE EXISTS (SELECT 1 FROM inserted_journal)
      RETURNING id
    )
    SELECT
      EXISTS (SELECT 1 FROM inserted_journal) AS created,
      EXISTS (SELECT 1 FROM locked_state) AS state_matched
  `);
  const status = result.rows[0] as
    | { created?: boolean; state_matched?: boolean }
    | undefined;
  const created = Boolean(status?.created);
  const stateMatched = Boolean(status?.state_matched);
  const rows = await getDb()
    .select()
    .from(internalJournals)
    .where(
      and(
        eq(internalJournals.companionId, journalInput.companionId),
        eq(internalJournals.date, journalInput.date),
      ),
    )
    .limit(1);
  if (!rows[0] && !stateMatched) {
    return { row: null, created: false, conflict: true };
  }
  if (!rows[0]) throw new Error("Daily reflection transaction did not persist a journal");
  return { row: rows[0], created, conflict: false };
}

export async function createWorldEvent(input: NewWorldEvent) {
  const rows = await getDb().insert(worldEvents).values(input).returning();
  return rows[0];
}

export async function generateWorldEventFromSeed(companionId: string, requestedSeedId?: string) {
  const available = await listEnabledSeeds(companionId);
  const candidates = requestedSeedId
    ? available.filter((seed) => seed.id === requestedSeedId)
    : available;
  if (candidates.length === 0) throw new Error("No enabled seed card found");

  const totalWeight = candidates.reduce((sum, seed) => sum + Math.max(seed.weight, 0), 0);
  let roll = Math.random() * (totalWeight || candidates.length);
  let selected = candidates[0];
  for (const seed of candidates) {
    roll -= totalWeight ? Math.max(seed.weight, 0) : 1;
    if (roll <= 0) {
      selected = seed;
      break;
    }
  }

  const labels: Record<string, string> = {
    inner_question: "一个没有急着回答的问题",
    imagined_scene: "内在世界场景",
    micro_challenge: "微型挑战",
    opinion_seed: "今天保留的意见",
    inner_conflict: "没有立刻解决的冲突",
  };
  const worldEvent = await createWorldEvent({
    companionId,
    seedId: selected.id,
    title: labels[selected.type] ?? "内在世界片段",
    content: `想象记录：${selected.text}`,
    moodImpactJson: {},
    arcImpactJson: {},
  });
  await Promise.all([
    markSeedUsed(selected.id),
    createEvent({
      companionId,
      type: "world.event",
      source: "admin",
      payloadJson: { worldEventId: worldEvent.id, seedId: selected.id },
    }),
  ]);
  return { worldEvent, seed: selected };
}

export async function listTodayActivity(
  companionId: string,
  date?: string,
  timeZone = "Asia/Tokyo",
) {
  const { start, end } = dayBounds(date, timeZone);
  const [messageRows, annotationRows, worldEventRows, proactiveRows] =
    await Promise.all([
      getDb()
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.companionId, companionId),
            gte(messages.createdAt, start),
            lt(messages.createdAt, end),
          ),
        )
        .orderBy(desc(messages.createdAt)),
      getDb()
        .select({ annotation: messageAnnotations, message: messages })
        .from(messageAnnotations)
        .innerJoin(messages, eq(messageAnnotations.messageId, messages.id))
        .where(
          and(
            eq(messages.companionId, companionId),
            gte(messageAnnotations.createdAt, start),
            lt(messageAnnotations.createdAt, end),
          ),
        )
        .orderBy(desc(messageAnnotations.createdAt)),
      getDb()
        .select()
        .from(worldEvents)
        .where(
          and(
            eq(worldEvents.companionId, companionId),
            gte(worldEvents.createdAt, start),
            lt(worldEvents.createdAt, end),
          ),
        )
        .orderBy(desc(worldEvents.createdAt)),
      getDb()
        .select()
        .from(proactiveLogs)
        .where(
          and(
            eq(proactiveLogs.companionId, companionId),
            gte(proactiveLogs.createdAt, start),
            lt(proactiveLogs.createdAt, end),
          ),
        )
        .orderBy(desc(proactiveLogs.createdAt)),
    ]);
  return {
    messages: messageRows,
    annotations: annotationRows,
    worldEvents: worldEventRows,
    proactiveLogs: proactiveRows,
  };
}

export async function listAdminMessages(companionId: string, filters: MessageFilters = {}) {
  const messageRows = await getDb()
    .select({ message: messages })
    .from(messages)
    .leftJoin(messageAnnotations, eq(messageAnnotations.messageId, messages.id))
    .where(
      and(
        eq(messages.companionId, companionId),
        filters.role ? eq(messages.role, filters.role) : undefined,
        filters.from ? gte(messages.createdAt, filters.from) : undefined,
        filters.to ? lt(messages.createdAt, filters.to) : undefined,
        filters.topic
          ? sql`EXISTS (
              SELECT 1 FROM jsonb_array_elements(${messageAnnotations.topicsJson}) AS topic
              WHERE topic->>'name' = ${filters.topic}
            )`
          : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(clampLimit(filters.limit));
  const ids = messageRows.map(({ message }) => message.id);
  if (ids.length === 0) return [];

  const [annotationRows, callRows] = await Promise.all([
    getDb().select().from(messageAnnotations).where(inArray(messageAnnotations.messageId, ids)),
    getDb()
      .select()
      .from(toolCalls)
      .where(inArray(toolCalls.messageId, ids))
      .orderBy(desc(toolCalls.createdAt)),
  ]);
  const annotationByMessage = new Map(annotationRows.map((row) => [row.messageId, row]));
  const callsByMessage = new Map<string, typeof callRows>();
  for (const call of callRows) {
    if (!call.messageId) continue;
    const existing = callsByMessage.get(call.messageId) ?? [];
    existing.push(call);
    callsByMessage.set(call.messageId, existing);
  }

  return messageRows.map(({ message }) => {
    const annotation = annotationByMessage.get(message.id);
    return {
      ...message,
      annotation: annotation
        ? {
            topics: annotation.topicsJson,
            emotion: annotation.emotion,
            intent: annotation.intent,
            importance: annotation.importance,
            novelty: annotation.novelty,
            summary: annotation.summary,
          }
        : null,
      toolCalls: callsByMessage.get(message.id) ?? [],
    };
  });
}

export async function listAdminMemories(companionId: string, filters: MemoryFilters = {}) {
  return getDb()
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.companionId, companionId),
        filters.kind ? eq(memories.kind, filters.kind) : undefined,
        filters.search ? ilike(memories.content, `%${filters.search}%`) : undefined,
        filters.tag
          ? sql`${memories.tagsJson} @> ${JSON.stringify([filters.tag])}::jsonb`
          : undefined,
      ),
    )
    .orderBy(desc(memories.importance), desc(memories.createdAt))
    .limit(clampLimit(filters.limit));
}

export async function listAdminEvents(companionId: string, filters: EventFilters = {}) {
  return getDb()
    .select()
    .from(events)
    .where(
      and(
        eq(events.companionId, companionId),
        filters.type ? eq(events.type, filters.type) : undefined,
        filters.source ? eq(events.source, filters.source) : undefined,
        filters.from ? gte(events.createdAt, filters.from) : undefined,
        filters.to ? lt(events.createdAt, filters.to) : undefined,
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(clampLimit(filters.limit, 200));
}

export async function listStateChanges(companionId: string, limit = 100, since?: Date) {
  return getDb()
    .select()
    .from(stateChanges)
    .where(
      and(
        eq(stateChanges.companionId, companionId),
        since ? gte(stateChanges.createdAt, since) : undefined,
      ),
    )
    .orderBy(desc(stateChanges.createdAt))
    .limit(clampLimit(limit));
}

export async function listWorldEvents(companionId: string, limit = 100) {
  return getDb()
    .select()
    .from(worldEvents)
    .where(eq(worldEvents.companionId, companionId))
    .orderBy(desc(worldEvents.createdAt))
    .limit(clampLimit(limit));
}

export async function listProactiveLogs(companionId: string, limit = 100) {
  return getDb()
    .select()
    .from(proactiveLogs)
    .where(eq(proactiveLogs.companionId, companionId))
    .orderBy(desc(proactiveLogs.createdAt))
    .limit(clampLimit(limit));
}

export async function listToolCalls(companionId: string, limit = 100) {
  return getDb()
    .select()
    .from(toolCalls)
    .where(eq(toolCalls.companionId, companionId))
    .orderBy(desc(toolCalls.createdAt))
    .limit(clampLimit(limit));
}

export async function listInternalJournals(companionId: string, limit = 30) {
  return getDb()
    .select()
    .from(internalJournals)
    .where(eq(internalJournals.companionId, companionId))
    .orderBy(desc(internalJournals.date))
    .limit(clampLimit(limit, 30));
}

export async function getAdminSettings(companionId: string) {
  const companionRows = await getDb()
    .select()
    .from(companions)
    .where(eq(companions.id, companionId))
    .limit(1);
  if (!companionRows[0]) throw new Error("Companion not found");
  return {
    companion: companionRows[0],
    config: companionRows[0].configJson,
    seeds: await listSeeds(companionId),
  };
}

function stringList(value: unknown, fallback: string[]) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : fallback;
}

function finiteNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(value, maximum))
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function updateRuntimeConfig(companionId: string, patchValue: unknown) {
  const currentRows = await getDb()
    .select({ config: companions.configJson })
    .from(companions)
    .where(eq(companions.id, companionId))
    .limit(1);
  if (!currentRows[0]) throw new Error("Companion not found");

  const current = currentRows[0].config;
  const patch = isRecord(patchValue) ? patchValue : {};
  const characterPatch = isRecord(patch.character) ? patch.character : {};
  const policyPatch = isRecord(patch.policy) ? patch.policy : {};
  const quietPatch = isRecord(policyPatch.quietHours) ? policyPatch.quietHours : {};
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  const requestedTimeZone = typeof quietPatch.timeZone === "string"
    ? quietPatch.timeZone.trim()
    : "";
  if (requestedTimeZone && !isValidTimeZone(requestedTimeZone)) {
    throw new Error("Invalid time zone");
  }

  const next: RuntimeConfig = {
    character: {
      name:
        typeof characterPatch.name === "string" && characterPatch.name.trim()
          ? characterPatch.name.trim()
          : current.character.name,
      identity: stringList(characterPatch.identity, current.character.identity),
      beliefs: stringList(characterPatch.beliefs, current.character.beliefs),
      styleRules: stringList(characterPatch.styleRules, current.character.styleRules),
      forbiddenStyles: stringList(
        characterPatch.forbiddenStyles,
        current.character.forbiddenStyles,
      ),
      boundaries: stringList(characterPatch.boundaries, current.character.boundaries),
    },
    policy: {
      proactiveMaxPerDay: finiteNumber(
        policyPatch.proactiveMaxPerDay,
        current.policy.proactiveMaxPerDay,
        0,
        24,
      ),
      quietHours: {
        start:
          typeof quietPatch.start === "string" && timePattern.test(quietPatch.start)
            ? quietPatch.start
            : current.policy.quietHours.start,
        end:
          typeof quietPatch.end === "string" && timePattern.test(quietPatch.end)
            ? quietPatch.end
            : current.policy.quietHours.end,
        timeZone:
          requestedTimeZone
            ? requestedTimeZone
            : current.policy.quietHours.timeZone,
      },
      minimumProactiveIntervalHours: finiteNumber(
        policyPatch.minimumProactiveIntervalHours,
        current.policy.minimumProactiveIntervalHours,
        0,
        168,
      ),
      memoryWriteThreshold: finiteNumber(
        policyPatch.memoryWriteThreshold,
        current.policy.memoryWriteThreshold,
        0,
        1,
      ),
      toolDailyLimit: finiteNumber(
        policyPatch.toolDailyLimit,
        current.policy.toolDailyLimit,
        0,
        100,
      ),
    },
    model:
      typeof patch.model === "string" && patch.model.trim() ? patch.model.trim() : current.model,
  };

  const rows = await getDb()
    .update(companions)
    .set({ name: next.character.name, configJson: next, updatedAt: new Date() })
    .where(eq(companions.id, companionId))
    .returning();
  return rows[0];
}

function dashboardMirrorIndex(
  annotations: Array<{
    messageRole: MessageRole;
    topicsJson: Array<{ name: string; confidence: number }>;
  }>,
  logs: Array<{ selectedSeedJson: unknown }>,
) {
  const userTopics = new Set(
    annotations
      .filter((item) => item.messageRole === "user")
      .flatMap((item) => item.topicsJson.map((topic) => topic.name)),
  );
  const proactiveTags = new Set<string>();
  for (const log of logs) {
    if (!isRecord(log.selectedSeedJson) || !Array.isArray(log.selectedSeedJson.tags)) continue;
    for (const tag of log.selectedSeedJson.tags) {
      if (typeof tag === "string") proactiveTags.add(tag);
    }
  }
  return computeMirrorIndex([...userTopics], [...proactiveTags]);
}

function stateSeries(
  changes: Array<typeof stateChanges.$inferSelect>,
  target: "mood" | "drives",
  current: Record<string, number>,
) {
  const points: Array<Record<string, string | number>> = [];
  for (const change of [...changes].reverse()) {
    if (change.targetPath === target && isRecord(change.afterJson)) {
      const values = Object.fromEntries(
        Object.entries(change.afterJson).filter(
          (entry): entry is [string, number] => typeof entry[1] === "number",
        ),
      );
      points.push({ date: change.createdAt.toISOString(), ...values });
      continue;
    }
    if (change.targetPath.startsWith(`${target}.`) && typeof change.afterJson === "number") {
      points.push({
        date: change.createdAt.toISOString(),
        [change.targetPath.slice(target.length + 1)]: change.afterJson,
      });
    }
  }
  // A fresh installation has no state_changes yet; the current point keeps the
  // chart honest and useful without inventing historical samples.
  points.push({ date: new Date().toISOString(), ...current });
  return points;
}

export async function getDashboardSnapshot() {
  const context = await ensureCompanionContext();
  const companionId = context.companion.id;
  const timeZone = context.companion.configJson.policy.quietHours.timeZone;
  const { start, end } = dayBounds(undefined, timeZone);
  const sevenDaysAgo = new Date(start);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

  const [
    recentMessages,
    recentEvents,
    journals,
    recentStateChanges,
    annotations,
    assistantMessages,
    worldEventRows,
    seedRows,
    proactiveRows,
    toolRows,
    memoryRows,
    messageCountRows,
    proactiveCountRows,
    proactiveBudgetCountRows,
    toolCountRows,
    memoryCountRows,
  ] = await Promise.all([
    listAdminMessages(companionId, { limit: 100 }),
    listAdminEvents(companionId, { limit: 200 }),
    listInternalJournals(companionId, 1),
    listStateChanges(companionId, 100, sevenDaysAgo),
    listRecentAnnotations(companionId, 50),
    listRecentMessages(companionId, 10, "assistant"),
    listWorldEvents(companionId, 50),
    listSeeds(companionId),
    listProactiveLogs(companionId, 100),
    listToolCalls(companionId, 100),
    listAdminMemories(companionId, { limit: 100 }),
    getDb()
      .select({ value: count() })
      .from(messages)
      .where(
        and(
          eq(messages.companionId, companionId),
          gte(messages.createdAt, start),
          lt(messages.createdAt, end),
        ),
      ),
    getDb()
      .select({ value: count() })
      .from(proactiveLogs)
      .where(
        and(
          eq(proactiveLogs.companionId, companionId),
          isNotNull(proactiveLogs.sentMessageId),
          gte(proactiveLogs.createdAt, start),
          lt(proactiveLogs.createdAt, end),
        ),
      ),
    getDb()
      .select({ value: count() })
      .from(proactiveLogs)
      .where(
        and(
          eq(proactiveLogs.companionId, companionId),
          eq(proactiveLogs.shouldSend, true),
          gte(proactiveLogs.createdAt, start),
          lt(proactiveLogs.createdAt, end),
        ),
      ),
    getDb()
      .select({ value: count() })
      .from(toolCalls)
      .where(
        and(
          eq(toolCalls.companionId, companionId),
          gte(toolCalls.createdAt, start),
          lt(toolCalls.createdAt, end),
        ),
      ),
    getDb()
      .select({ value: count() })
      .from(memories)
      .where(
        and(
          eq(memories.companionId, companionId),
          gte(memories.createdAt, start),
          lt(memories.createdAt, end),
        ),
      ),
  ]);

  const proactiveToday = proactiveCountRows[0]?.value ?? 0;
  const proactiveBudgetUsed = proactiveBudgetCountRows[0]?.value ?? 0;
  return {
    user: context.user,
    companion: context.companion,
    state: context.state,
    stats: {
      todayMessages: messageCountRows[0]?.value ?? 0,
      todayProactive: proactiveToday,
      todayProactiveReserved: proactiveBudgetUsed,
      todayToolCalls: toolCountRows[0]?.value ?? 0,
      todayMemoryWrites: memoryCountRows[0]?.value ?? 0,
      proactiveRemaining: Math.max(
        0,
        context.companion.configJson.policy.proactiveMaxPerDay - proactiveBudgetUsed,
      ),
    },
    recentMessages,
    recentEvents,
    latestJournal: journals[0] ?? null,
    stateChanges: recentStateChanges,
    moodHistory: stateSeries(
      recentStateChanges,
      "mood",
      context.state.mood as unknown as Record<string, number>,
    ),
    driveHistory: stateSeries(
      recentStateChanges,
      "drives",
      context.state.drives as unknown as Record<string, number>,
    ),
    topicEntropy: computeTopicEntropy(annotations),
    repetitionScore: computeRepetitionScore(assistantMessages),
    mirrorIndex: dashboardMirrorIndex(annotations, proactiveRows),
    worldEvents: worldEventRows,
    seeds: seedRows.map(({ tagsJson, ...seed }) => ({ ...seed, tags: tagsJson })),
    proactiveLogs: proactiveRows,
    toolCalls: toolRows,
    memories: memoryRows,
  };
}
