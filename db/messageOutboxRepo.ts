import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  eq,
  inArray,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import type { CompanionState, MemoryCandidate, MessageAnalysis } from "@/core/types";
import { getDb } from "@/db/client";
import {
  companionStates,
  events,
  memories,
  messageAnnotations,
  messageOutbox,
  messages,
  proactiveLogs,
  stateChanges,
  toolCalls,
} from "@/db/schema";
import { splitTelegramBubbles } from "@/telegram/client";

export type StateChangeInput = {
  targetPath: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  deltaJson?: unknown;
  reason: string;
  causedBy: string;
};

export type StateMutationInput = {
  expected: CompanionState;
  next: CompanionState;
  changes: StateChangeInput[];
};

export type ToolCallWrite = {
  toolName: string;
  argsJson: Record<string, unknown>;
  resultJson: Record<string, unknown>;
  reason?: string;
};

export interface EnqueueAssistantInput {
  userId: string;
  companionId: string;
  chatId: string;
  text: string;
  rawJson: Record<string, unknown>;
  correlationId: string;
  sourceType: "telegram_reply" | "proactive" | "safety";
  sourceId: string;
  idempotencyBase: string;
  replyToMessageId?: string;
  processing?: { messageId: string; leaseToken: string };
  annotation: MessageAnalysis;
  memoryCandidate?: MemoryCandidate | null;
  memoryConfidence?: number;
  stateMutation?: StateMutationInput;
  toolCall?: ToolCallWrite | null;
  selectedSeedId?: string | null;
  proactiveLogId?: string | null;
}

class StateConflictError extends Error {}

function stateMatches(expected: CompanionState) {
  return and(
    sql`${companionStates.traitsJson} = ${JSON.stringify(expected.traits)}::jsonb`,
    sql`${companionStates.moodJson} = ${JSON.stringify(expected.mood)}::jsonb`,
    sql`${companionStates.drivesJson} = ${JSON.stringify(expected.drives)}::jsonb`,
    sql`${companionStates.relationshipJson} = ${JSON.stringify(expected.relationship)}::jsonb`,
    sql`${companionStates.activeArcsJson} = ${JSON.stringify(expected.activeArcs)}::jsonb`,
  );
}

async function findExistingReply(replyToMessageId: string) {
  const rows = await getDb()
    .select()
    .from(messages)
    .where(eq(messages.replyToMessageId, replyToMessageId))
    .limit(1);
  return rows[0] ?? null;
}

async function findExistingOutboxMessage(idempotencyKey: string) {
  const rows = await getDb()
    .select({ message: messages })
    .from(messageOutbox)
    .innerJoin(messages, eq(messageOutbox.messageId, messages.id))
    .where(eq(messageOutbox.idempotencyKey, idempotencyKey))
    .limit(1);
  return rows[0]?.message ?? null;
}

/**
 * The logical reply, its state effects, audit rows and every Telegram bubble
 * share one commit boundary. External delivery only starts after this returns.
 */
export async function enqueueAssistantMessage(input: EnqueueAssistantInput) {
  const bubbles = splitTelegramBubbles(input.text);
  if (!bubbles.length) throw new Error("Cannot enqueue an empty Telegram message");

  if (input.replyToMessageId) {
    const existing = await findExistingReply(input.replyToMessageId);
    if (existing) return { message: existing, created: false, conflict: false };
  }
  const existingOutboxMessage = await findExistingOutboxMessage(`${input.idempotencyBase}:0`);
  if (existingOutboxMessage) {
    return { message: existingOutboxMessage, created: false, conflict: false };
  }

  try {
    return await getDb().transaction(async (tx) => {
      if (input.stateMutation) {
        const [updated] = await tx
          .update(companionStates)
          .set({
            traitsJson: input.stateMutation.next.traits,
            moodJson: input.stateMutation.next.mood,
            drivesJson: input.stateMutation.next.drives,
            relationshipJson: input.stateMutation.next.relationship,
            activeArcsJson: input.stateMutation.next.activeArcs,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(companionStates.companionId, input.companionId),
              stateMatches(input.stateMutation.expected),
            ),
          )
          .returning({ id: companionStates.id });
        if (!updated) throw new StateConflictError("Companion state changed before enqueue");
      }

      const [message] = await tx
        .insert(messages)
        .values({
          userId: input.userId,
          companionId: input.companionId,
          role: "assistant",
          text: input.text,
          rawJson: input.rawJson,
          chatId: input.chatId,
          replyToMessageId: input.replyToMessageId,
          correlationId: input.correlationId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          deliveryStatus: "pending",
          memoryCandidateJson: input.memoryCandidate ?? null,
        })
        .returning();
      if (!message) throw new Error("Failed to create logical assistant message");

      await tx.insert(messageOutbox).values(
        bubbles.map((body, bubbleIndex) => ({
          companionId: input.companionId,
          messageId: message.id,
          idempotencyKey: `${input.idempotencyBase}:${bubbleIndex}`,
          chatId: input.chatId,
          bubbleIndex,
          body,
        })),
      );

      await tx.insert(messageAnnotations).values({
        messageId: message.id,
        topicsJson: input.annotation.topics,
        emotion: input.annotation.emotion,
        intent: input.annotation.intent,
        importance: input.annotation.importance,
        novelty: input.annotation.novelty,
        summary: input.annotation.summary,
      });

      if (input.memoryCandidate) {
        const [memory] = await tx
          .insert(memories)
          .values({
            userId: input.userId,
            companionId: input.companionId,
            kind: input.memoryCandidate.kind,
            content: input.memoryCandidate.content,
            tagsJson: input.memoryCandidate.tags,
            importance: input.memoryCandidate.importance,
            confidence: input.memoryConfidence ?? 0.72,
          })
          .returning({ id: memories.id });
        if (memory) {
          await tx.insert(events).values({
            userId: input.userId,
            companionId: input.companionId,
            type: "memory.write",
            source: input.sourceType,
            correlationId: input.correlationId,
            payloadJson: {
              correlationId: input.correlationId,
              memoryId: memory.id,
              candidate: input.memoryCandidate,
            },
          });
        }
      }

      if (input.toolCall) {
        await tx.insert(toolCalls).values({
          companionId: input.companionId,
          messageId: message.id,
          toolName: input.toolCall.toolName,
          argsJson: input.toolCall.argsJson,
          resultJson: input.toolCall.resultJson,
          reason: input.toolCall.reason,
        });
        await tx.insert(events).values({
          userId: input.userId,
          companionId: input.companionId,
          type: "tool.call",
          source: input.sourceType,
          correlationId: input.correlationId,
          payloadJson: {
            correlationId: input.correlationId,
            messageId: message.id,
            ...input.toolCall,
          },
        });
      }

      if (input.selectedSeedId) {
        await tx.execute(sql`
          UPDATE event_seeds
          SET used_count = used_count + 1, last_used_at = NOW()
          WHERE id = ${input.selectedSeedId}::uuid
        `);
      }

      if (input.stateMutation?.changes.length) {
        await tx.insert(stateChanges).values(
          input.stateMutation.changes.map((change) => ({
            companionId: input.companionId,
            targetPath: change.targetPath,
            beforeJson: change.beforeJson,
            afterJson: change.afterJson,
            deltaJson: change.deltaJson,
            reason: change.reason,
            causedBy: change.causedBy,
            correlationId: input.correlationId,
          })),
        );
        await tx.insert(events).values(
          input.stateMutation.changes.map((change) => ({
            userId: input.userId,
            companionId: input.companionId,
            type: "state.change",
            source: change.causedBy,
            correlationId: input.correlationId,
            payloadJson: { correlationId: input.correlationId, ...change },
          })),
        );
      }

      await tx.insert(events).values({
        userId: input.userId,
        companionId: input.companionId,
        type: "assistant.message",
        source: input.sourceType,
        correlationId: input.correlationId,
        payloadJson: {
          correlationId: input.correlationId,
          messageId: message.id,
          deliveryStatus: "pending",
        },
      });

      if (input.proactiveLogId) {
        await tx
          .update(proactiveLogs)
          .set({
            sentMessageId: message.id,
            sentText: input.text,
            correlationId: input.correlationId,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
          })
          .where(eq(proactiveLogs.id, input.proactiveLogId));
      }

      if (input.processing) {
        const [completed] = await tx
          .update(messages)
          .set({
            processingStatus: "completed",
            processingCompletedAt: new Date(),
            processingLeaseExpiresAt: null,
          })
          .where(
            and(
              eq(messages.id, input.processing.messageId),
              eq(messages.processingStatus, "processing"),
              eq(messages.processingLeaseToken, input.processing.leaseToken),
            ),
          )
          .returning({ id: messages.id });
        if (!completed) throw new Error("Telegram processing lease was lost before enqueue");
      }

      return { message, created: true, conflict: false };
    });
  } catch (error) {
    if (error instanceof StateConflictError) {
      return { message: null, created: false, conflict: true };
    }
    if (input.replyToMessageId) {
      const existing = await findExistingReply(input.replyToMessageId);
      if (existing) return { message: existing, created: false, conflict: false };
    }
    const existing = await findExistingOutboxMessage(`${input.idempotencyBase}:0`);
    if (existing) return { message: existing, created: false, conflict: false };
    throw error;
  }
}

export async function listMessageOutbox(messageId: string) {
  return getDb()
    .select()
    .from(messageOutbox)
    .where(eq(messageOutbox.messageId, messageId))
    .orderBy(asc(messageOutbox.bubbleIndex));
}

export async function claimNextOutbox(messageId?: string) {
  const leaseToken = randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + 60_000);

  return getDb().transaction(async (tx) => {
    // A stale `sending` row has an ambiguous external outcome. Never turn it
    // back into pending automatically; doing so can duplicate a delivered text.
    await tx
      .update(messageOutbox)
      .set({ status: "delivery_unknown", leaseToken: null, leaseExpiresAt: null })
      .where(
        and(
          eq(messageOutbox.status, "sending"),
          lt(messageOutbox.leaseExpiresAt, now),
        ),
      );

    const candidates = await tx
      .select()
      .from(messageOutbox)
      .where(
        and(
          messageId ? eq(messageOutbox.messageId, messageId) : undefined,
          inArray(messageOutbox.status, ["pending", "failed"]),
          lte(messageOutbox.availableAt, now),
          lt(messageOutbox.attemptCount, 5),
          sql`NOT EXISTS (
            SELECT 1 FROM message_outbox previous
            WHERE previous.message_id = ${messageOutbox.messageId}
              AND previous.bubble_index < ${messageOutbox.bubbleIndex}
              AND previous.status <> 'delivered'
          )`,
        ),
      )
      .orderBy(asc(messageOutbox.createdAt), asc(messageOutbox.bubbleIndex))
      .limit(1)
      .for("update", { skipLocked: true });
    const candidate = candidates[0];
    if (!candidate) return null;

    const [claimed] = await tx
      .update(messageOutbox)
      .set({
        status: "sending",
        attemptCount: sql`${messageOutbox.attemptCount} + 1`,
        leaseToken,
        leaseExpiresAt,
        lastError: null,
      })
      .where(
        and(
          eq(messageOutbox.id, candidate.id),
          inArray(messageOutbox.status, ["pending", "failed"]),
        ),
      )
      .returning();
    return claimed ? { ...claimed, leaseToken } : null;
  });
}

async function refreshLogicalDelivery(messageId: string) {
  const rows = await listMessageOutbox(messageId);
  const status = rows.every((row) => row.status === "delivered")
    ? "delivered"
    : rows.some((row) => row.status === "delivery_unknown")
      ? "delivery_unknown"
      : rows.some((row) => row.status === "sending")
        ? "sending"
        : rows.some((row) => row.status === "failed")
          ? "failed"
          : "pending";
  const firstTelegramId = rows.find((row) => row.telegramMessageId)?.telegramMessageId ?? null;
  await getDb()
    .update(messages)
    .set({ deliveryStatus: status, telegramMessageId: firstTelegramId })
    .where(eq(messages.id, messageId));
  return status;
}

export async function markOutboxDelivered(input: {
  id: string;
  leaseToken: string;
  messageId: string;
  telegramMessageId: number | null;
  response: unknown;
}) {
  const [row] = await getDb()
    .update(messageOutbox)
    .set({
      status: "delivered",
      telegramMessageId: input.telegramMessageId,
      lastResponseJson: input.response,
      deliveredAt: new Date(),
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(
      and(eq(messageOutbox.id, input.id), eq(messageOutbox.leaseToken, input.leaseToken)),
    )
    .returning();
  if (!row) throw new Error("Outbox delivery lease was lost");
  await refreshLogicalDelivery(input.messageId);
  return row;
}

export async function markOutboxFailed(input: {
  id: string;
  leaseToken: string;
  messageId: string;
  error: string;
  unknown: boolean;
  retryable: boolean;
  retryAfterSeconds?: number;
}) {
  const retryDelay = Math.min(300, Math.max(5, input.retryAfterSeconds ?? 15));
  const [row] = await getDb()
    .update(messageOutbox)
    .set({
      status: input.unknown ? "delivery_unknown" : "failed",
      lastError: input.error.slice(0, 2_000),
      availableAt: input.retryable
        ? new Date(Date.now() + retryDelay * 1_000)
        : new Date("9999-12-31T00:00:00.000Z"),
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(
      and(eq(messageOutbox.id, input.id), eq(messageOutbox.leaseToken, input.leaseToken)),
    )
    .returning();
  if (!row) throw new Error("Outbox failure lease was lost");
  await refreshLogicalDelivery(input.messageId);
  return row;
}

export async function findOutboxByIdempotencyKey(idempotencyKey: string) {
  const rows = await getDb()
    .select()
    .from(messageOutbox)
    .where(eq(messageOutbox.idempotencyKey, idempotencyKey))
    .limit(1);
  return rows[0] ?? null;
}
