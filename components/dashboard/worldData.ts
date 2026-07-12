import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { ensureCompanionContext } from "@/db/repo";
import {
  awaitingReplies,
  externalInformation,
  innerThoughts,
  llmUsageLogs,
  openLoops,
  promptContextSnapshots,
  scheduleBlocks,
  shareCandidates,
  stateChanges,
  worldEvents,
  worldTickRuns,
} from "@/db/schema";
import { localDateAt, systemClock } from "@/platform/time";
import { getWorldHealth } from "@/world/health";
import { buildTodayWorldView } from "@/world/todayView";

function publicEmotion(world: Awaited<ReturnType<typeof ensureCompanionContext>>["world"]["state"]) {
  const descriptions: string[] = [];
  if (world.energy < 0.35) descriptions.push("有点累，行动节奏偏慢");
  else if (world.energy > 0.72) descriptions.push("精力不错");
  if (world.disappointment > 0.2) descriptions.push("对一件尚未得到回应的事有些失落");
  if (world.irritation > 0.2) descriptions.push("耐心比平时少一点");
  if (world.curiosity > 0.65) descriptions.push("对今天接下来会发生什么保持好奇");
  return descriptions.length ? descriptions : ["状态平稳，没有明显情绪波动"];
}

export async function loadWorldDashboardData(now = systemClock.now()) {
  const context = await ensureCompanionContext();
  const companionId = context.companion.id;
  const timeZone = context.companion.configJson.character.profile.timeZone;
  const localDate = localDateAt(now, timeZone);
  const db = getDb();
  const [schedule, events, loops, thoughts, candidates, awaiting, external, ticks, snapshots, changes, usage, health] =
    await Promise.all([
      db.select().from(scheduleBlocks).where(eq(scheduleBlocks.companionId, companionId)).orderBy(asc(scheduleBlocks.startAt)).limit(40),
      db.select().from(worldEvents).where(eq(worldEvents.companionId, companionId)).orderBy(desc(worldEvents.occurredAt)).limit(100),
      db.select().from(openLoops).where(eq(openLoops.companionId, companionId)).orderBy(desc(openLoops.createdAt)).limit(50),
      db.select().from(innerThoughts).where(eq(innerThoughts.companionId, companionId)).orderBy(desc(innerThoughts.createdAt)).limit(50),
      db.select().from(shareCandidates).where(eq(shareCandidates.companionId, companionId)).orderBy(desc(shareCandidates.createdAt)).limit(50),
      db.select().from(awaitingReplies).where(eq(awaitingReplies.companionId, companionId)).orderBy(desc(awaitingReplies.startedAt)).limit(50),
      db.select().from(externalInformation).where(eq(externalInformation.companionId, companionId)).orderBy(desc(externalInformation.fetchedAt)).limit(50),
      db.select().from(worldTickRuns).where(eq(worldTickRuns.companionId, companionId)).orderBy(desc(worldTickRuns.windowStart)).limit(50),
      db.select().from(promptContextSnapshots).where(eq(promptContextSnapshots.companionId, companionId)).orderBy(desc(promptContextSnapshots.createdAt)).limit(20),
      db.select().from(stateChanges).where(eq(stateChanges.companionId, companionId)).orderBy(desc(stateChanges.createdAt)).limit(100),
      db.select().from(llmUsageLogs).where(eq(llmUsageLogs.companionId, companionId)).orderBy(desc(llmUsageLogs.createdAt)).limit(50),
      getWorldHealth(companionId, timeZone, now),
    ]);
  const placeById = new Map(context.world.places.map((place) => [place.id, place]));
  const characterById = new Map(context.world.characters.map((character) => [character.id, character]));
  const todaySchedule = schedule.filter((block) => block.localDate === localDate);
  const today = buildTodayWorldView({
    observedAt: now,
    timeZone,
    lastWorldTickAt: context.world.state.lastWorldTickAt,
    currentScheduleBlockId: context.world.state.currentScheduleBlockId,
    currentLocationId: context.world.state.currentLocationId,
    schedule: todaySchedule,
    places: context.world.places,
    health,
  });
  return {
    companion: context.companion,
    temporal: today.temporal,
    localDate,
    currentPlace: today.currentPlace,
    lastConfirmedPlace: today.lastConfirmedPlace,
    currentBlock: today.currentBlock,
    publicEmotion: publicEmotion(context.world.state),
    schedule: todaySchedule,
    places: context.world.places,
    characters: context.world.characters,
    timeline: events.map((event) => ({
      ...event,
      place: event.locationId ? placeById.get(event.locationId) ?? null : null,
      characters: event.characterIdsJson
        .map((id) => characterById.get(id))
        .filter((character): character is NonNullable<typeof character> => Boolean(character)),
      userInfluenced: event.causeType === "user_suggestion" || event.type === "user_influenced",
      hasConsequences: event.consequencesJson.length > 0,
    })),
    debug: {
      worldHealth: health,
      worldState: context.world.state,
      schedule,
      characters: context.world.characters,
      openLoops: loops,
      innerThoughts: thoughts,
      shareCandidates: candidates,
      awaitingReplies: awaiting,
      externalInformation: external,
      tickRuns: ticks,
      promptContexts: snapshots,
      stateChanges: changes,
      llmUsage: usage,
    },
  };
}
