import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { innerThoughts, proactiveLogs, shareCandidates } from "@/db/schema";
import type { ShareCandidate } from "@/world/types";

export function shareCandidateRowToDomain(
  row: typeof shareCandidates.$inferSelect,
): ShareCandidate {
  return {
    id: row.id,
    companionId: row.companionId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    contentSummary: row.contentSummary,
    reasonToShare: row.reasonToShare,
    emotionalIntensity: row.emotionalIntensity,
    relevanceToUser: row.relevanceToUser,
    novelty: row.novelty,
    intimacy: row.intimacy,
    urgency: row.urgency,
    interruptionCost: row.interruptionCost,
    eventImportance: row.eventImportance,
    priority: row.priority,
    score: row.score,
    status: row.status,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt ?? undefined,
  };
}

export async function listPendingShareCandidates(
  companionId: string,
  now = new Date(),
  limit = 50,
) {
  await getDb()
    .update(shareCandidates)
    .set({ status: "pending", leaseToken: null, leaseExpiresAt: null, updatedAt: now })
    .where(
      and(
        eq(shareCandidates.companionId, companionId),
        eq(shareCandidates.status, "approved"),
        lte(shareCandidates.leaseExpiresAt, now),
        or(isNull(shareCandidates.expiresAt), gt(shareCandidates.expiresAt, now)),
      ),
    );
  await getDb()
    .update(innerThoughts)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(innerThoughts.companionId, companionId),
        eq(innerThoughts.status, "active"),
        lte(innerThoughts.expiresAt, now),
      ),
    );
  await getDb()
    .update(shareCandidates)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(shareCandidates.companionId, companionId),
        inArray(shareCandidates.status, ["pending", "approved"]),
        lte(shareCandidates.expiresAt, now),
      ),
    );
  const rows = await getDb()
    .select()
    .from(shareCandidates)
    .where(
      and(
        eq(shareCandidates.companionId, companionId),
        eq(shareCandidates.status, "pending"),
        or(isNull(shareCandidates.expiresAt), gt(shareCandidates.expiresAt, now)),
      ),
    )
    .orderBy(asc(shareCandidates.priority), desc(shareCandidates.createdAt))
    .limit(Math.max(1, Math.min(limit, 100)));
  return rows.map(shareCandidateRowToDomain);
}

export async function countTodayLifeShares(
  companionId: string,
  timeZone = "Asia/Shanghai",
) {
  const [row] = await getDb()
    .select({ value: count() })
    .from(proactiveLogs)
    .innerJoin(shareCandidates, eq(proactiveLogs.sourceId, shareCandidates.id))
    .where(and(
      eq(proactiveLogs.companionId, companionId),
      inArray(shareCandidates.sourceType, ["inner_thought", "world_event", "open_loop"]),
      sql`(${proactiveLogs.createdAt} AT TIME ZONE ${timeZone})::date = (NOW() AT TIME ZONE ${timeZone})::date`,
      sql`${proactiveLogs.sentMessageId} IS NOT NULL`,
    ));
  return row?.value ?? 0;
}

export async function updateShareCandidateScore(id: string, score: number) {
  await getDb()
    .update(shareCandidates)
    .set({ score, updatedAt: new Date() })
    .where(and(eq(shareCandidates.id, id), eq(shareCandidates.status, "pending")));
}

export async function claimShareCandidate(id: string, score: number, now = new Date()) {
  const leaseToken = randomUUID();
  const [row] = await getDb()
    .update(shareCandidates)
    .set({
      status: "approved",
      score,
      leaseToken,
      leaseExpiresAt: new Date(now.getTime() + 10 * 60_000),
      updatedAt: now,
    })
    .where(
      and(
        eq(shareCandidates.id, id),
        eq(shareCandidates.status, "pending"),
        or(isNull(shareCandidates.expiresAt), gt(shareCandidates.expiresAt, now)),
      ),
    )
    .returning();
  return row ? { row, leaseToken } : null;
}

export async function releaseShareCandidate(
  id: string,
  leaseToken: string,
  reason: string,
  now = new Date(),
) {
  const [row] = await getDb()
    .update(shareCandidates)
    .set({
      status: "pending",
      leaseToken: null,
      leaseExpiresAt: null,
      suppressionReason: reason,
      updatedAt: now,
    })
    .where(
      and(
        eq(shareCandidates.id, id),
        eq(shareCandidates.status, "approved"),
        eq(shareCandidates.leaseToken, leaseToken),
      ),
    )
    .returning({ id: shareCandidates.id });
  return Boolean(row);
}

export async function markShareCandidateShared(input: {
  id: string;
  leaseToken: string;
  messageId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(shareCandidates)
      .set({
        status: "shared",
        sharedMessageId: input.messageId,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(shareCandidates.id, input.id),
          eq(shareCandidates.status, "approved"),
          eq(shareCandidates.leaseToken, input.leaseToken),
        ),
      )
      .returning();
    if (!row) return false;
    if (row.sourceType === "inner_thought") {
      await tx
        .update(innerThoughts)
        .set({ status: "shared", updatedAt: now })
        .where(eq(innerThoughts.id, row.sourceId));
    }
    return true;
  });
}

export async function markPendingCandidateSharedInReply(
  id: string,
  messageId: string,
  now = new Date(),
) {
  return getDb().transaction(async (tx) => {
    const [row] = await tx.update(shareCandidates).set({
      status: "shared",
      sharedMessageId: messageId,
      updatedAt: now,
    }).where(and(
      eq(shareCandidates.id, id),
      eq(shareCandidates.status, "pending"),
    )).returning();
    if (!row) return false;
    if (row.sourceType === "inner_thought") {
      await tx.update(innerThoughts).set({ status: "shared", updatedAt: now })
        .where(eq(innerThoughts.id, row.sourceId));
    }
    return true;
  });
}
