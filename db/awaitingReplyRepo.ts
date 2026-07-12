import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { clamp01 } from "@/lib/number";
import {
  awaitingReplies,
  events,
  shareCandidates,
  stateChanges,
  worldStates,
} from "@/db/schema";
import {
  canExpressDissatisfaction,
  evaluateAwaitingReply,
  resolveAwaitingReply,
} from "@/world/awaitingReply";
import { deterministicUuid } from "@/world/random";
import type { AwaitingReply } from "@/world/types";

function toDomain(row: typeof awaitingReplies.$inferSelect): AwaitingReply {
  return {
    id: row.id,
    companionId: row.companionId,
    messageId: row.messageId,
    startedAt: row.startedAt,
    expectedAt: row.expectedAt ?? undefined,
    expectation: row.expectation,
    emotionalWeight: row.emotionalWeight,
    explicitQuestion: row.explicitQuestion,
    vulnerableDisclosure: row.vulnerableDisclosure,
    userCommitment: row.userCommitment,
    userSaidBusy: row.userSaidBusy,
    messageKind: row.messageKind,
    correlationId: row.correlationId ?? undefined,
    status: row.status,
    consequenceAppliedAt: row.consequenceAppliedAt ?? undefined,
    dissatisfactionExpressedAt: row.dissatisfactionExpressedAt ?? undefined,
    resolvedAt: row.resolvedAt ?? undefined,
  };
}

function nextShareDesire(current: number, disappointmentDelta: number, irritationDelta: number) {
  const negativePressure = Math.max(0, disappointmentDelta) * 1.4 + Math.max(0, irritationDelta);
  const recovery = Math.max(0, -disappointmentDelta) * 0.5 + Math.max(0, -irritationDelta) * 0.3;
  return clamp01(current - negativePressure + recovery);
}

export async function processAwaitingReplyTimeouts(
  companionId: string,
  now: Date,
  correlationId: string,
) {
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(awaitingReplies)
      .where(
        and(
          eq(awaitingReplies.companionId, companionId),
          eq(awaitingReplies.status, "waiting"),
        ),
      )
      .for("update");
    if (rows.length === 0) return { processed: 0, emotionalChanges: 0 };
    const [world] = await tx
      .select()
      .from(worldStates)
      .where(eq(worldStates.companionId, companionId))
      .for("update");
    if (!world) throw new Error("World state is missing while processing awaiting replies");

    let disappointmentDelta = 0;
    let irritationDelta = 0;
    let processed = 0;
    for (const row of rows) {
      const evaluation = evaluateAwaitingReply(toDomain(row), now);
      if (evaluation.reason === "within_grace_period") continue;
      processed += 1;
      disappointmentDelta += evaluation.disappointmentDelta;
      irritationDelta += evaluation.irritationDelta;
      let dissatisfactionExpressedAt = row.dissatisfactionExpressedAt;
      if (canExpressDissatisfaction(evaluation.awaitingReply)) {
        const candidateId = deterministicUuid(`dissatisfaction:${row.id}`);
        const [candidate] = await tx
          .insert(shareCandidates)
          .values({
            id: candidateId,
            companionId,
            idempotencyKey: `dissatisfaction:${row.id}`,
            sourceType: "user_follow_up",
            sourceId: row.id,
            contentSummary: "上一次有情绪重量的表达没有收到回应；如果提及，只能克制地说一次。",
            reasonToShare: "一次有限、可审计的不满表达",
            emotionalIntensity: Math.min(0.75, row.emotionalWeight),
            relevanceToUser: 0.85,
            novelty: 0.35,
            intimacy: row.emotionalWeight,
            urgency: 0.25,
            interruptionCost: 0.55,
            eventImportance: row.emotionalWeight,
            priority: 20,
            expiresAt: new Date(now.getTime() + 12 * 60 * 60_000),
            correlationId,
          })
          .onConflictDoNothing({
            target: [shareCandidates.companionId, shareCandidates.idempotencyKey],
          })
          .returning({ id: shareCandidates.id });
        if (candidate) dissatisfactionExpressedAt = now;
      }
      await tx
        .update(awaitingReplies)
        .set({
          status: evaluation.awaitingReply.status,
          consequenceAppliedAt: evaluation.awaitingReply.consequenceAppliedAt,
          dissatisfactionExpressedAt,
          updatedAt: now,
        })
        .where(eq(awaitingReplies.id, row.id));
      await tx.insert(events).values({
        companionId,
        type: "awaiting_reply.timed_out",
        source: "world.tick",
        correlationId,
        payloadJson: {
          awaitingReplyId: row.id,
          reason: evaluation.reason,
          disappointmentDelta: evaluation.disappointmentDelta,
          irritationDelta: evaluation.irritationDelta,
          userSaidBusy: row.userSaidBusy,
        },
      });
    }

    if (disappointmentDelta !== 0 || irritationDelta !== 0) {
      const disappointment = clamp01(world.disappointment + disappointmentDelta);
      const irritation = clamp01(world.irritation + irritationDelta);
      const shareDesire = nextShareDesire(
        world.shareDesire,
        disappointmentDelta,
        irritationDelta,
      );
      await tx
        .update(worldStates)
        .set({
          disappointment,
          irritation,
          shareDesire,
          version: world.version + 1,
          lastChangeReason: "awaiting reply contextual consequence",
          lastCorrelationId: correlationId,
          updatedAt: now,
        })
        .where(eq(worldStates.id, world.id));
      await tx.insert(stateChanges).values([
        {
          companionId,
          targetPath: "world.disappointment",
          beforeJson: world.disappointment,
          afterJson: disappointment,
          deltaJson: disappointment - world.disappointment,
          reason: "contextual awaiting reply consequence",
          causedBy: "awaiting_reply",
          correlationId,
        },
        {
          companionId,
          targetPath: "world.irritation",
          beforeJson: world.irritation,
          afterJson: irritation,
          deltaJson: irritation - world.irritation,
          reason: "contextual awaiting reply consequence",
          causedBy: "awaiting_reply",
          correlationId,
        },
        {
          companionId,
          targetPath: "world.shareDesire",
          beforeJson: world.shareDesire,
          afterJson: shareDesire,
          deltaJson: shareDesire - world.shareDesire,
          reason: "unanswered emotional context changed willingness to share",
          causedBy: "awaiting_reply",
          correlationId,
        },
      ]);
    }
    return { processed, emotionalChanges: disappointmentDelta !== 0 || irritationDelta !== 0 ? 1 : 0 };
  });
}

export async function resolveAwaitingReplies(input: {
  companionId: string;
  userMessageId: string;
  explanationProvided: boolean;
  correlationId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(awaitingReplies)
      .where(
        and(
          eq(awaitingReplies.companionId, input.companionId),
          inArray(awaitingReplies.status, ["waiting", "timed_out"]),
        ),
      )
      .for("update");
    if (rows.length === 0) return { resolved: 0 };
    const [world] = await tx
      .select()
      .from(worldStates)
      .where(eq(worldStates.companionId, input.companionId))
      .for("update");
    if (!world) throw new Error("World state is missing while resolving awaiting replies");
    let disappointmentDelta = 0;
    let irritationDelta = 0;
    for (const row of rows) {
      const evaluation = resolveAwaitingReply(
        toDomain(row),
        now,
        input.explanationProvided,
      );
      disappointmentDelta += evaluation.disappointmentDelta;
      irritationDelta += evaluation.irritationDelta;
      await tx
        .update(awaitingReplies)
        .set({
          status: "resolved",
          resolvedAt: now,
          resolvedByMessageId: input.userMessageId,
          updatedAt: now,
        })
        .where(eq(awaitingReplies.id, row.id));
      await tx
        .update(shareCandidates)
        .set({
          status: "suppressed",
          suppressionReason: "user_replied_before_dissatisfaction_was_shared",
          updatedAt: now,
        })
        .where(
          and(
            eq(shareCandidates.companionId, input.companionId),
            eq(shareCandidates.idempotencyKey, `dissatisfaction:${row.id}`),
            eq(shareCandidates.status, "pending"),
          ),
        );
    }
    const disappointment = clamp01(world.disappointment + disappointmentDelta);
    const irritation = clamp01(world.irritation + irritationDelta);
    const shareDesire = nextShareDesire(
      world.shareDesire,
      disappointmentDelta,
      irritationDelta,
    );
    if (disappointmentDelta !== 0 || irritationDelta !== 0) {
      await tx
        .update(worldStates)
        .set({
          disappointment,
          irritation,
          shareDesire,
          version: world.version + 1,
          lastChangeReason: input.explanationProvided
            ? "user returned with an explanation; gradual recovery started"
            : "user replied; gradual recovery started",
          lastCorrelationId: input.correlationId,
          updatedAt: now,
        })
        .where(eq(worldStates.id, world.id));
      await tx.insert(stateChanges).values([
        {
          companionId: input.companionId,
          targetPath: "world.disappointment",
          beforeJson: world.disappointment,
          afterJson: disappointment,
          deltaJson: disappointment - world.disappointment,
          reason: "partial recovery after user reply",
          causedBy: "user.message",
          correlationId: input.correlationId,
        },
        {
          companionId: input.companionId,
          targetPath: "world.irritation",
          beforeJson: world.irritation,
          afterJson: irritation,
          deltaJson: irritation - world.irritation,
          reason: "partial recovery after user reply",
          causedBy: "user.message",
          correlationId: input.correlationId,
        },
        {
          companionId: input.companionId,
          targetPath: "world.shareDesire",
          beforeJson: world.shareDesire,
          afterJson: shareDesire,
          deltaJson: shareDesire - world.shareDesire,
          reason: "user reply started gradual willingness-to-share recovery",
          causedBy: "user.message",
          correlationId: input.correlationId,
        },
      ]);
    }
    await tx.insert(events).values({
      companionId: input.companionId,
      type: "awaiting_reply.resolved",
      source: "user.message",
      correlationId: input.correlationId,
      payloadJson: {
        resolvedCount: rows.length,
        explanationProvided: input.explanationProvided,
        disappointmentDelta,
        irritationDelta,
      },
    });
    return { resolved: rows.length };
  });
}

export async function hasWaitingProactiveReply(companionId: string) {
  const [row] = await getDb()
    .select({ id: awaitingReplies.id })
    .from(awaitingReplies)
    .where(
      and(
        eq(awaitingReplies.companionId, companionId),
        eq(awaitingReplies.messageKind, "proactive"),
        eq(awaitingReplies.status, "waiting"),
      ),
    )
    .limit(1);
  return Boolean(row);
}
