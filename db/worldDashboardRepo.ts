import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  events,
  innerThoughts,
  messageOutbox,
  messages,
  proactiveLogs,
  promptContextSnapshots,
  shareCandidates,
  stateChanges,
  worldTickRuns,
} from "@/db/schema";

export async function getCorrelationTrace(companionId: string, correlationId: string) {
  const db = getDb();
  const [eventRows, changeRows, thoughtRows, candidateRows, messageRows, proactiveRows, promptRows, tickRows] =
    await Promise.all([
      db.select().from(events).where(and(eq(events.companionId, companionId), eq(events.correlationId, correlationId))),
      db.select().from(stateChanges).where(and(eq(stateChanges.companionId, companionId), eq(stateChanges.correlationId, correlationId))),
      db.select().from(innerThoughts).where(and(eq(innerThoughts.companionId, companionId), eq(innerThoughts.correlationId, correlationId))),
      db.select().from(shareCandidates).where(and(eq(shareCandidates.companionId, companionId), eq(shareCandidates.correlationId, correlationId))),
      db.select().from(messages).where(and(eq(messages.companionId, companionId), eq(messages.correlationId, correlationId))),
      db.select().from(proactiveLogs).where(and(eq(proactiveLogs.companionId, companionId), eq(proactiveLogs.correlationId, correlationId))),
      db.select().from(promptContextSnapshots).where(and(eq(promptContextSnapshots.companionId, companionId), eq(promptContextSnapshots.correlationId, correlationId))),
      db.select().from(worldTickRuns).where(and(eq(worldTickRuns.companionId, companionId), eq(worldTickRuns.correlationId, correlationId))),
    ]);
  const sourceIds = [...new Set(candidateRows.flatMap((candidate) => [candidate.id, candidate.sourceId]))];
  const linkedMessages = sourceIds.length
    ? await db.select().from(messages).where(and(eq(messages.companionId, companionId), inArray(messages.sourceId, sourceIds)))
    : [];
  const allMessages = [...new Map([...messageRows, ...linkedMessages].map((message) => [message.id, message])).values()];
  const messageIds = allMessages.map((message) => message.id);
  const outboxRows = messageIds.length
    ? await db.select().from(messageOutbox).where(and(eq(messageOutbox.companionId, companionId), inArray(messageOutbox.messageId, messageIds)))
    : [];
  const linkedProactive = sourceIds.length
    ? await db.select().from(proactiveLogs).where(and(
        eq(proactiveLogs.companionId, companionId),
        or(
          inArray(proactiveLogs.sourceId, sourceIds),
          messageIds.length ? inArray(proactiveLogs.sentMessageId, messageIds) : undefined,
        ),
      ))
    : [];
  return {
    correlationId,
    events: eventRows,
    stateChanges: changeRows,
    innerThoughts: thoughtRows,
    shareCandidates: candidateRows,
    proactiveLogs: [...new Map([...proactiveRows, ...linkedProactive].map((row) => [row.id, row])).values()],
    messages: allMessages,
    outbox: outboxRows,
    promptContexts: promptRows,
    tickRuns: tickRows,
  };
}
