import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import type { MessageAnalysis, WorldSignal } from "@/core/types";
import { getDb } from "@/db/client";
import {
  conversationWorkingMemories,
  events,
  openLoops,
  proposedWorldMutations,
  sharedKnowledge,
} from "@/db/schema";

function uniqueRecent(values: string[], limit = 12) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(-limit);
}

function signalExpiry(signal: WorldSignal, now: Date) {
  if (signal.type === "user_busy") return new Date(now.getTime() + 24 * 60 * 60_000);
  if (signal.type === "external_information_candidate") {
    return new Date(now.getTime() + 48 * 60 * 60_000);
  }
  return signal.expectedAt ? new Date(signal.expectedAt) : undefined;
}

function openLoopDraft(signal: WorldSignal) {
  if (signal.type === "user_commitment") {
    return {
      owner: "user" as const,
      topic: signal.subject,
      description: signal.content,
      expectedAt: signal.expectedAt ? new Date(signal.expectedAt) : undefined,
      emotionalWeight: 0.55,
      status: "waiting" as const,
      sourceType: "user_commitment" as const,
      nextAction: "到期后最多自然追问一次，未回复时不要重复责备",
    };
  }
  if (signal.type === "place_recommendation" || signal.type === "mira_suggestion") {
    return {
      owner: "mira" as const,
      topic: signal.subject,
      description: signal.content,
      expectedAt: undefined,
      emotionalWeight: 0.35,
      status: "open" as const,
      sourceType: "conversation" as const,
      nextAction: "由 World Planner 独立评估，不能直接修改日程",
    };
  }
  if (signal.type === "user_schedule") {
    return {
      owner: "shared" as const,
      topic: signal.subject,
      description: signal.content,
      expectedAt: signal.expectedAt ? new Date(signal.expectedAt) : undefined,
      emotionalWeight: 0.25,
      status: "open" as const,
      sourceType: "conversation" as const,
      nextAction: "只在相关时自然提及，不把用户日程当作控制指令",
    };
  }
  return null;
}

export async function applyUserWorldSignals(input: {
  userId: string;
  companionId: string;
  messageId: string;
  messageText: string;
  analysis: MessageAnalysis;
  correlationId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return getDb().transaction(async (tx) => {
    await tx
      .insert(conversationWorkingMemories)
      .values({ companionId: input.companionId })
      .onConflictDoNothing({ target: conversationWorkingMemories.companionId });
    const [working] = await tx
      .select()
      .from(conversationWorkingMemories)
      .where(eq(conversationWorkingMemories.companionId, input.companionId))
      .for("update");
    if (!working) throw new Error("Conversation working memory was not created");

    let knowledgeWrites = 0;
    let openLoopWrites = 0;
    let proposalWrites = 0;
    for (const signal of input.analysis.worldSignals) {
      const signalDigest = createHash("sha256")
        .update(`${signal.type}\0${signal.subject}\0${signal.content}`)
        .digest("hex")
        .slice(0, 20);
      const idempotencyKey = `signal:${input.messageId}:${signalDigest}`;
      const [knowledge] = await tx
        .insert(sharedKnowledge)
        .values({
          companionId: input.companionId,
          idempotencyKey,
          subject: signal.subject,
          content: signal.content,
          source: "user",
          sourceMessageId: input.messageId,
          confidence: signal.confidence,
          // User information remains a claim until Mira or an external source verifies it.
          verificationStatus: "unverified",
          expiresAt: signalExpiry(signal, now),
          correlationId: input.correlationId,
        })
        .onConflictDoNothing({
          target: [sharedKnowledge.companionId, sharedKnowledge.idempotencyKey],
        })
        .returning({ id: sharedKnowledge.id });
      if (knowledge) {
        knowledgeWrites += 1;
        await tx.insert(events).values({
          userId: input.userId,
          companionId: input.companionId,
          type: "shared_knowledge.write",
          source: "user.message",
          correlationId: input.correlationId,
          payloadJson: {
            sharedKnowledgeId: knowledge.id,
            signalType: signal.type,
            verificationStatus: "unverified",
          },
        });
      }

      const loop = openLoopDraft(signal);
      if (loop) {
        const [createdLoop] = await tx
          .insert(openLoops)
          .values({
            companionId: input.companionId,
            idempotencyKey: `loop:${input.messageId}:${signalDigest}`,
            ...loop,
            sourceId: input.messageId,
            correlationId: input.correlationId,
          })
          .onConflictDoNothing({
            target: [openLoops.companionId, openLoops.idempotencyKey],
          })
          .returning({ id: openLoops.id });
        if (createdLoop) {
          openLoopWrites += 1;
          await tx.insert(events).values({
            userId: input.userId,
            companionId: input.companionId,
            type: "open_loop.created",
            source: "user.message",
            correlationId: input.correlationId,
            payloadJson: { openLoopId: createdLoop.id, signalType: signal.type },
          });
        }
      }

      if (signal.type === "place_recommendation" || signal.type === "mira_suggestion") {
        const [proposal] = await tx
          .insert(proposedWorldMutations)
          .values({
            companionId: input.companionId,
            idempotencyKey: `proposal:${input.messageId}:${signalDigest}`,
            mutationType: "evaluate_user_suggestion",
            payloadJson: { signal },
            reason: "用户建议需要由 Mira 自主评估，不能直接修改日程",
            sourceType: "user_message",
            sourceId: input.messageId,
            correlationId: input.correlationId,
          })
          .onConflictDoNothing({
            target: [
              proposedWorldMutations.companionId,
              proposedWorldMutations.idempotencyKey,
            ],
          })
          .returning({ id: proposedWorldMutations.id });
        if (proposal) proposalWrites += 1;
      }
    }

    const commitments = input.analysis.worldSignals
      .filter((signal) => signal.type === "user_commitment")
      .map((signal) => signal.content);
    const question = /[?？]/.test(input.messageText)
      ? input.messageText.trim().slice(0, 240)
      : null;
    const nextWorking = {
      currentTopic: input.analysis.topics[0]?.name ?? working.currentTopic,
      recentSummary: input.analysis.summary || working.recentSummary,
      unresolvedQuestionsJson: uniqueRecent([
        ...working.unresolvedQuestionsJson,
        ...(question ? [question] : []),
      ]),
      userCommitmentsJson: uniqueRecent([
        ...working.userCommitmentsJson,
        ...commitments,
      ]),
      emotionalContext: input.analysis.emotion,
      lastCorrelationId: input.correlationId,
    };
    const workingChanged =
      nextWorking.currentTopic !== working.currentTopic ||
      nextWorking.recentSummary !== working.recentSummary ||
      nextWorking.emotionalContext !== working.emotionalContext ||
      nextWorking.lastCorrelationId !== working.lastCorrelationId ||
      JSON.stringify(nextWorking.unresolvedQuestionsJson) !==
        JSON.stringify(working.unresolvedQuestionsJson) ||
      JSON.stringify(nextWorking.userCommitmentsJson) !==
        JSON.stringify(working.userCommitmentsJson);
    if (workingChanged) {
      await tx
        .update(conversationWorkingMemories)
        .set({ ...nextWorking, lastUpdatedAt: now, updatedAt: now })
        .where(eq(conversationWorkingMemories.id, working.id));
      await tx.insert(events).values({
        userId: input.userId,
        companionId: input.companionId,
        type: "working_memory.updated",
        source: "user.message",
        correlationId: input.correlationId,
        payloadJson: {
          messageId: input.messageId,
          signalCount: input.analysis.worldSignals.length,
        },
      });
    }

    return { knowledgeWrites, openLoopWrites, proposalWrites };
  });
}

export async function getConversationWorkingMemory(companionId: string) {
  const [row] = await getDb()
    .select()
    .from(conversationWorkingMemories)
    .where(eq(conversationWorkingMemories.companionId, companionId))
    .limit(1);
  return row ?? null;
}

export function listRelevantOpenLoops(companionId: string, limit = 20) {
  return getDb()
    .select()
    .from(openLoops)
    .where(
      and(
        eq(openLoops.companionId, companionId),
        inArray(openLoops.status, ["open", "waiting"]),
      ),
    )
    .orderBy(asc(openLoops.expectedAt), desc(openLoops.createdAt))
    .limit(Math.max(1, Math.min(limit, 100)));
}

export function listActiveSharedKnowledge(companionId: string, now = new Date(), limit = 30) {
  return getDb()
    .select()
    .from(sharedKnowledge)
    .where(
      and(
        eq(sharedKnowledge.companionId, companionId),
        inArray(sharedKnowledge.verificationStatus, ["unverified", "verified"]),
        or(isNull(sharedKnowledge.expiresAt), gt(sharedKnowledge.expiresAt, now)),
      ),
    )
    .orderBy(desc(sharedKnowledge.updatedAt))
    .limit(Math.max(1, Math.min(limit, 100)));
}
