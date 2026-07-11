import { and, desc, eq, ne, or, isNull, gt } from "drizzle-orm";
import type { CompanionState, RuntimeConfig, SelectedMemory } from "@/core/types";
import type { ActorGroundedContext } from "@/core/promptBuilder";
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
import { zonedDateKey } from "@/lib/time";
import { buildTemporalContext, zonedDateTime } from "@/platform/time";
import { catchUpCompanionWorld } from "@/world/tick";

export async function buildActorGroundedContext(input: {
  companionId: string;
  config: RuntimeConfig;
  state: CompanionState;
  currentMessageId?: string;
  shareCandidateId?: string;
  memories: SelectedMemory[];
  now?: Date;
}): Promise<ActorGroundedContext> {
  const now = input.now ?? new Date();
  const localDate = zonedDateKey(now, input.config.character.profile.timeZone);
  const db = getDb();
  const [initialWorld] = await db
    .select({ lastWorldTickAt: worldStates.lastWorldTickAt })
    .from(worldStates)
    .where(eq(worldStates.companionId, input.companionId))
    .limit(1);
  if (initialWorld && now.getTime() - initialWorld.lastWorldTickAt.getTime() > 30 * 60_000) {
    await catchUpCompanionWorld(input.companionId, now).catch(() => null);
  }
  const [worldRows, places, schedule, workingMemory, openLoops, eventRows, infoRows, recentRows, candidateRows] =
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
        .limit(8),
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
        : Promise.resolve([]),
    ]);
  const world = worldRows[0];
  if (!world) throw new Error("Actor grounding requires a persistent world state");
  const placeById = new Map(places.map((place) => [place.id, place]));
  const currentPlace = world.currentLocationId ? placeById.get(world.currentLocationId) : undefined;
  const temporal = buildTemporalContext({
    observedAt: now,
    worldAdvancedThrough: world.lastWorldTickAt,
    timeZone: input.config.character.profile.timeZone,
  });
  const confirmedActivity = schedule.find((block) => block.id === world.currentScheduleBlockId);
  const currentActivity = temporal.worldStateFresh ? confirmedActivity : undefined;
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
  const externalFacts = infoRows.map((info) => ({
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
    ...input.memories.map((memory) => memory.id),
    ...schedule.flatMap((block) => [block.id, ...(block.locationId ? [block.locationId] : [])]),
    ...worldFacts.flatMap((event) => [event.id, ...(event.locationId ? [event.locationId] : []), ...event.characterIds]),
    ...externalFacts.map((fact) => fact.id),
    ...(candidate ? [candidate.id, candidate.sourceId] : []),
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
          startAtLocal: zonedDateTime(currentActivity.startAt, temporal.timeZone),
          endAtUtc: currentActivity.endAt.toISOString(),
          endAtLocal: zonedDateTime(currentActivity.endAt, temporal.timeZone),
        }
      : null,
    lastConfirmedActivity:
      !temporal.worldStateFresh && confirmedActivity
        ? { id: confirmedActivity.id, title: confirmedActivity.title, type: confirmedActivity.type }
        : null,
    schedule: schedule.map((block) => ({
      id: block.id,
      title: block.title,
      type: block.type,
      startAtUtc: block.startAt.toISOString(),
      startAtLocal: zonedDateTime(block.startAt, temporal.timeZone),
      endAtUtc: block.endAt.toISOString(),
      endAtLocal: zonedDateTime(block.endAt, temporal.timeZone),
      locationId: block.locationId,
      status: block.status,
      changeReason: block.changeReason,
    })),
    emotionReasons: world.emotionReasonsJson,
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
    openLoops: openLoops.map((loop) => ({
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
