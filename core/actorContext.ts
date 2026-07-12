import { and, desc, eq, ne, or, isNull, gt } from "drizzle-orm";
import type { CompanionState, RuntimeConfig, SelectedMemory } from "@/core/types";
import type { ActorGroundedContext } from "@/core/promptBuilder";
import { resolveActivityFreshness } from "@/core/actorContextPolicy";
import { getDb } from "@/db/client";
import {
  externalInformation,
  knownPlaces,
  messages,
  promptContextSnapshots,
  scheduleBlocks,
  shareCandidates,
  worldEvents,
  worldStates,
} from "@/db/schema";
import {
  getConversationWorkingMemory,
  listRelevantOpenLoops,
} from "@/db/interactionRepo";
import { buildTemporalContext, localDateAt, systemClock, zonedDateTime } from "@/platform/time";
import { catchUpCompanionWorld } from "@/world/tick";
import { rankExternalInformation } from "@/core/externalRelevance";
import { listDailyPlanContext } from "@/world/dailyPlan";

export async function buildActorGroundedContext(input: {
  companionId: string;
  config: RuntimeConfig;
  state: CompanionState;
  currentMessageId?: string;
  shareCandidateId?: string;
  memories: SelectedMemory[];
  relevanceText?: string;
  relevantTopics?: string[];
  now?: Date;
}): Promise<ActorGroundedContext> {
  const now = input.now ?? systemClock.now();
  const timeZone = input.config.character.profile.timeZone;
  const localDate = localDateAt(now, timeZone);
  const db = getDb();
  const [initialWorld] = await db
    .select({ lastWorldTickAt: worldStates.lastWorldTickAt })
    .from(worldStates)
    .where(eq(worldStates.companionId, input.companionId))
    .limit(1);
  if (initialWorld && now.getTime() - initialWorld.lastWorldTickAt.getTime() > 30 * 60_000) {
    await catchUpCompanionWorld(input.companionId, now).catch(() => null);
  }
  const [worldRows, places, schedule, workingMemory, openLoops, eventRows, infoRows, recentRows, candidateRows, dailyPlan] =
    await Promise.all([
      db.select().from(worldStates).where(eq(worldStates.companionId, input.companionId)).limit(1),
      db.select().from(knownPlaces).where(eq(knownPlaces.companionId, input.companionId)),
      db
        .select()
        .from(scheduleBlocks)
        .where(and(eq(scheduleBlocks.companionId, input.companionId), eq(scheduleBlocks.localDate, localDate)))
        .orderBy(scheduleBlocks.startAt),
      getConversationWorkingMemory(input.companionId),
      listRelevantOpenLoops(input.companionId, 10),
      db
        .select()
        .from(worldEvents)
        .where(eq(worldEvents.companionId, input.companionId))
        .orderBy(desc(worldEvents.occurredAt))
        .limit(32),
      db
        .select()
        .from(externalInformation)
        .where(
          and(
            eq(externalInformation.companionId, input.companionId),
            eq(externalInformation.status, "new"),
            or(isNull(externalInformation.expiresAt), gt(externalInformation.expiresAt, now)),
          ),
        )
        .orderBy(desc(externalInformation.personalRelevance), desc(externalInformation.fetchedAt))
        .limit(8),
      db
        .select({
          id: messages.id,
          role: messages.role,
          text: messages.text,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(
          and(
            eq(messages.companionId, input.companionId),
            input.currentMessageId ? ne(messages.id, input.currentMessageId) : undefined,
          ),
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(24),
      input.shareCandidateId
        ? db
            .select()
            .from(shareCandidates)
            .where(
              and(
                eq(shareCandidates.companionId, input.companionId),
                eq(shareCandidates.id, input.shareCandidateId),
              ),
            )
            .limit(1)
        : db
            .select()
            .from(shareCandidates)
            .where(and(
              eq(shareCandidates.companionId, input.companionId),
              eq(shareCandidates.status, "pending"),
              or(isNull(shareCandidates.expiresAt), gt(shareCandidates.expiresAt, now)),
            ))
            .orderBy(shareCandidates.priority, desc(shareCandidates.eventImportance), desc(shareCandidates.createdAt))
            .limit(1),
      listDailyPlanContext(input.companionId, localDate),
    ]);
  const world = worldRows[0];
  if (!world) throw new Error("Actor grounding requires a persistent world state");
  const placeById = new Map(places.map((place) => [place.id, place]));
  const currentPlace = world.currentLocationId ? placeById.get(world.currentLocationId) : undefined;
  const temporal = buildTemporalContext({
    observedAt: now,
    worldAdvancedThrough: world.lastWorldTickAt,
    timeZone,
  });
  const { currentActivity, lastConfirmedActivity } = resolveActivityFreshness({
    schedule,
    currentScheduleBlockId: world.currentScheduleBlockId,
    worldStateFresh: temporal.worldStateFresh,
  });
  const worldFacts = eventRows.reverse().map((event) => ({
    id: event.id,
    realityLayer: event.realityLayer,
    type: event.type,
    title: event.title,
    description: event.content.slice(0, 600),
    occurredAt: event.occurredAt.toISOString(),
    locationId: event.locationId,
    characterIds: event.characterIdsJson,
    causeType: event.causeType,
    causeId: event.causeId,
  }));
  const selectedInfoRows = rankExternalInformation(infoRows, {
    queryText: input.relevanceText,
    topics: input.relevantTopics,
    now,
  }).slice(0, 8);
  const externalFacts = selectedInfoRows.map((info) => ({
    id: info.id,
    sourceName: info.sourceName,
    sourceUrl: info.sourceUrl,
    title: info.title,
    factualSummary: info.factualSummary.slice(0, 600),
    category: info.category,
    publishedAt: info.publishedAt?.toISOString() ?? null,
    reliability: info.reliability,
  }));
  const candidate = candidateRows[0];
  const allowedReferenceIds = new Set<string>([
    "temporal:observed",
    ...input.memories.map((memory) => memory.id),
    ...schedule.flatMap((block) => [block.id, ...(block.locationId ? [block.locationId] : [])]),
    ...worldFacts.flatMap((event) => [event.id, ...(event.locationId ? [event.locationId] : []), ...event.characterIds]),
    ...externalFacts.map((fact) => fact.id),
    ...(candidate ? [candidate.id, candidate.sourceId] : []),
    ...(dailyPlan ? [dailyPlan.plan.id, ...dailyPlan.events.map((event) => event.id)] : []),
  ]);
  if (currentPlace) allowedReferenceIds.add(currentPlace.id);

  return {
    temporal,
    currentLocation: currentPlace
      ? { id: currentPlace.id, name: currentPlace.name, category: currentPlace.category }
      : null,
    currentActivity: currentActivity
      ? {
          id: currentActivity.id,
          title: currentActivity.title,
          type: currentActivity.type,
          startAtUtc: currentActivity.startAt.toISOString(),
          startLocal: zonedDateTime(currentActivity.startAt, temporal.timeZone),
          endAtUtc: currentActivity.endAt.toISOString(),
          endLocal: zonedDateTime(currentActivity.endAt, temporal.timeZone),
          localDate: currentActivity.localDate,
          timeZone: temporal.timeZone,
        }
      : null,
    lastConfirmedActivity:
      lastConfirmedActivity
        ? { id: lastConfirmedActivity.id, title: lastConfirmedActivity.title, type: lastConfirmedActivity.type }
        : null,
    schedule: schedule.map((block) => ({
      id: block.id,
      title: block.title,
      type: block.type,
      startAtUtc: block.startAt.toISOString(),
      startLocal: zonedDateTime(block.startAt, temporal.timeZone),
      endAtUtc: block.endAt.toISOString(),
      endLocal: zonedDateTime(block.endAt, temporal.timeZone),
      localDate: block.localDate,
      timeZone: temporal.timeZone,
      locationId: block.locationId,
      status: block.status,
      changeReason: block.changeReason,
    })),
    emotionReasons: input.state.stateReasons,
    dailyPlan: dailyPlan
      ? {
          id: dailyPlan.plan.id,
          date: dailyPlan.plan.localDate,
          dayType: dailyPlan.plan.dayType,
          weekendMode: dailyPlan.plan.weekendMode ?? null,
          theme: dailyPlan.plan.theme,
          summary: dailyPlan.plan.summary,
          events: dailyPlan.events.map((event) => ({
            id: event.id,
            slot: event.slot,
            type: event.eventType,
            title: event.title,
            windowStart: event.windowStart.toISOString(),
            windowEnd: event.windowEnd.toISOString(),
            status: event.status,
            selectionReason: event.selectionReason ?? null,
          })),
        }
      : null,
    workingMemory: workingMemory
      ? {
          currentTopic: workingMemory.currentTopic,
          recentSummary: workingMemory.recentSummary,
          unresolvedQuestions: workingMemory.unresolvedQuestionsJson,
          userCommitments: workingMemory.userCommitmentsJson,
          miraCommitments: workingMemory.miraCommitmentsJson,
          emotionalContext: workingMemory.emotionalContext,
          lastUpdatedAt: workingMemory.lastUpdatedAt.toISOString(),
        }
      : null,
    openLoops: [
      ...openLoops.filter((loop) => loop.owner !== "user"),
      ...openLoops.filter((loop) => loop.owner === "user").slice(0, 2),
    ].map((loop) => ({
      id: loop.id,
      owner: loop.owner,
      topic: loop.topic,
      description: loop.description.slice(0, 400),
      expectedAt: loop.expectedAt?.toISOString() ?? null,
      status: loop.status,
      nextAction: loop.nextAction,
    })),
    worldEvents: worldFacts,
    externalInformation: externalFacts,
    shareCandidate: candidate
      ? {
          id: candidate.id,
          sourceType: candidate.sourceType,
          sourceId: candidate.sourceId,
          contentSummary: candidate.contentSummary,
          reasonToShare: candidate.reasonToShare,
        }
      : null,
    recentMessages: recentRows.reverse().map((message) => ({
      ...message,
      text: message.text.slice(0, 800),
      createdAt: message.createdAt.toISOString(),
    })),
    allowedReferenceIds: [...allowedReferenceIds],
  };
}

export async function savePromptContextSnapshot(input: {
  companionId: string;
  correlationId: string;
  messageId?: string;
  purpose: "reply" | "proactive";
  context: ActorGroundedContext | null;
  estimatedTokens: number;
  tokenBudget: number;
  contextHash: string;
}) {
  if (!input.context) return;
  await getDb()
    .insert(promptContextSnapshots)
    .values({
      companionId: input.companionId,
      correlationId: input.correlationId,
      messageId: input.messageId,
      purpose: input.purpose,
      contextJson: input.context,
      selectedIdsJson: input.context.allowedReferenceIds,
      estimatedTokens: input.estimatedTokens,
      tokenBudget: input.tokenBudget,
      contextHash: input.contextHash,
    })
    .onConflictDoUpdate({
      target: [promptContextSnapshots.correlationId, promptContextSnapshots.purpose],
      set: {
        contextJson: input.context,
        selectedIdsJson: input.context.allowedReferenceIds,
        estimatedTokens: input.estimatedTokens,
        tokenBudget: input.tokenBudget,
        contextHash: input.contextHash,
      },
    });
}
