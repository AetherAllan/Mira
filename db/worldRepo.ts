import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { CharacterProfile } from "@/core/types";
import { getDb } from "@/db/client";
import {
  companions,
  events,
  knownPlaces,
  scheduleBlocks,
  stateChanges,
  worldCharacters,
  worldStates,
  worldTickRuns,
  type KnownPlaceRow,
  type WorldCharacterRow,
  type WorldStateRow,
  type WorldTickRunRow,
} from "@/db/schema";
import { zonedDateKey } from "@/lib/time";
import {
  DEFAULT_CHARACTER_PROFILE,
  INITIAL_BEIJING_PLACES,
  INITIAL_WORLD_CHARACTERS,
} from "@/seed/world";
import { getTickWindow } from "@/world/reducer";
import type { WorldTickResult } from "@/world/reducer";
import type { ScheduleBlock, WorldState } from "@/world/types";

type NewKnownPlace = typeof knownPlaces.$inferInsert;
type NewWorldCharacter = typeof worldCharacters.$inferInsert;

export const WORLD_TICK_LEASE_MS = 2 * 60 * 1000;

export class WorldTickLeaseLostError extends Error {}
export class WorldStateConflictError extends Error {}

export type ClaimedWorldTick = WorldTickRunRow & { leaseToken: string };
export type WorldTickClaimResult =
  | { status: "claimed"; claim: ClaimedWorldTick }
  | { status: "busy" }
  | { status: "completed" };

export type PersistentWorldContext = {
  state: WorldStateRow;
  homePlace: KnownPlaceRow;
  workPlace: KnownPlaceRow;
  places: KnownPlaceRow[];
  characters: WorldCharacterRow[];
};

export function buildPersistentWorldSeedRows(companionId: string, discoveredAt: Date) {
  const places: NewKnownPlace[] = INITIAL_BEIJING_PLACES.map((place) => {
    const visitedAt = place.status === "visited" ? discoveredAt : undefined;
    return {
      companionId,
      canonicalKey: place.canonicalKey,
      provider: place.provider,
      providerPoiId: place.providerPoiId,
      status: place.status,
      coordinateSystem: place.coordinateSystem,
      name: place.name,
      category: place.category,
      district: place.district,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      firstDiscoveredAt: discoveredAt,
      firstVisitedAt: visitedAt,
      lastVisitedAt: visitedAt,
      visitCount: place.visitCount,
      familiarity: place.familiarity,
      miraImpression: place.miraImpression,
      source: place.source,
      metadataJson: place.metadata,
    };
  });

  const characters: NewWorldCharacter[] = INITIAL_WORLD_CHARACTERS.map((character) => ({
    companionId,
    stableKey: character.stableKey,
    name: character.name,
    role: character.role,
    relationshipType: character.relationshipType,
    personalityTraitsJson: character.personalityTraits,
    relationshipScore: character.relationshipScore,
    currentSituation: character.currentSituation,
    activeOpenLoopsJson: character.activeOpenLoops,
    metadataJson: character.metadata ?? {},
    isFictional: true,
  }));

  return { places, characters };
}

export async function getWorldState(companionId: string) {
  const [state] = await getDb()
    .select()
    .from(worldStates)
    .where(eq(worldStates.companionId, companionId))
    .limit(1);
  return state;
}

export function listKnownPlaces(companionId: string) {
  return getDb()
    .select()
    .from(knownPlaces)
    .where(eq(knownPlaces.companionId, companionId))
    .orderBy(asc(knownPlaces.canonicalKey));
}

export function listWorldCharacters(companionId: string) {
  return getDb()
    .select()
    .from(worldCharacters)
    .where(eq(worldCharacters.companionId, companionId))
    .orderBy(asc(worldCharacters.stableKey));
}

export async function getPersistentWorldContext(
  companionId: string,
  profile: CharacterProfile = DEFAULT_CHARACTER_PROFILE,
): Promise<PersistentWorldContext> {
  const [state, places, characters] = await Promise.all([
    getWorldState(companionId),
    listKnownPlaces(companionId),
    listWorldCharacters(companionId),
  ]);
  const homePlace = places.find(
    (place) => place.canonicalKey === profile.homePlaceKey,
  );
  const workPlace = places.find(
    (place) => place.canonicalKey === profile.workPlaceKey,
  );

  if (!state || !homePlace || !workPlace) {
    throw new Error(`Persistent world is incomplete for companion ${companionId}`);
  }
  return { state, homePlace, workPlace, places, characters };
}

export async function ensurePersistentWorld(
  companionId: string,
  profile: CharacterProfile = DEFAULT_CHARACTER_PROFILE,
  now = new Date(),
) {
  // Bootstrap is on the hot webhook path. Once the unique world_state exists,
  // avoid turning every incoming message into 24 no-op upserts.
  if (await getWorldState(companionId)) {
    return getPersistentWorldContext(companionId, profile);
  }

  const db = getDb();
  const seedRows = buildPersistentWorldSeedRows(companionId, now);
  const { windowStart } = getTickWindow(now);

  await db.transaction(async (tx) => {
    await tx
      .insert(knownPlaces)
      .values(seedRows.places)
      .onConflictDoNothing({ target: [knownPlaces.companionId, knownPlaces.canonicalKey] });

    await tx
      .insert(worldCharacters)
      .values(seedRows.characters)
      .onConflictDoNothing({
        target: [worldCharacters.companionId, worldCharacters.stableKey],
      });

    const profilePlaces = await tx
      .select({ id: knownPlaces.id, canonicalKey: knownPlaces.canonicalKey })
      .from(knownPlaces)
      .where(
        and(
          eq(knownPlaces.companionId, companionId),
          inArray(knownPlaces.canonicalKey, [
            profile.homePlaceKey,
            profile.workPlaceKey,
          ]),
        ),
      );
    const homePlace = profilePlaces.find(
      (place) => place.canonicalKey === profile.homePlaceKey,
    );
    const workPlace = profilePlaces.find(
      (place) => place.canonicalKey === profile.workPlaceKey,
    );
    if (!homePlace || !workPlace) throw new Error("World profile places were not seeded");

    await tx
      .insert(worldStates)
      .values({
        companionId,
        currentTime: windowStart,
        currentLocationId: homePlace.id,
        lastWorldTickAt: windowStart,
        lastChangeReason: "persistent_world_bootstrap",
      })
      .onConflictDoNothing({ target: worldStates.companionId });
  });

  return getPersistentWorldContext(companionId, profile);
}

export function listWorldCompanions() {
  return getDb()
    .select({ id: companions.id, configJson: companions.configJson })
    .from(companions)
    .orderBy(asc(companions.createdAt));
}

export function worldStateRowToDomain(row: WorldStateRow): WorldState {
  return {
    companionId: row.companionId,
    currentTime: row.currentTime,
    currentLocationId: row.currentLocationId ?? undefined,
    currentActivityId: row.currentActivityId ?? undefined,
    currentScheduleBlockId: row.currentScheduleBlockId ?? undefined,
    energy: row.energy,
    boredom: row.boredom,
    curiosity: row.curiosity,
    loneliness: row.loneliness,
    irritation: row.irritation,
    disappointment: row.disappointment,
    attachment: row.attachment,
    shareDesire: row.shareDesire,
    lastChangeReason: row.lastChangeReason ?? undefined,
    lastCorrelationId: row.lastCorrelationId ?? undefined,
    lastWorldTickAt: row.lastWorldTickAt,
    lastDailyPlanAt: row.lastDailyPlanAt ?? undefined,
    version: row.version,
  };
}

function scheduleRowToDomain(row: typeof scheduleBlocks.$inferSelect): ScheduleBlock {
  return {
    id: row.id,
    companionId: row.companionId,
    title: row.title,
    type: row.type,
    startAt: row.startAt,
    endAt: row.endAt,
    locationId: row.locationId ?? undefined,
    flexibility: row.flexibility,
    interruptionTolerance: row.interruptionTolerance,
    status: row.status,
    source: row.source,
    changeReason: row.changeReason ?? undefined,
    localDate: row.localDate,
    idempotencyKey: row.idempotencyKey,
    correlationId: row.correlationId ?? undefined,
  };
}

export async function ensureScheduleBlocks(
  companionId: string,
  schedule: readonly ScheduleBlock[],
  correlationId: string,
) {
  if (schedule.length === 0) return [];
  await getDb()
    .insert(scheduleBlocks)
    .values(
      schedule.map((block) => ({
        companionId,
        idempotencyKey: block.idempotencyKey ?? block.id,
        title: block.title,
        type: block.type,
        startAt: block.startAt,
        endAt: block.endAt,
        localDate: block.localDate ?? zonedDateKey(block.startAt),
        locationId: block.locationId,
        flexibility: block.flexibility,
        interruptionTolerance: block.interruptionTolerance,
        status: block.status,
        source: block.source,
        changeReason: block.changeReason,
        correlationId,
      })),
    )
    .onConflictDoNothing({
      target: [scheduleBlocks.companionId, scheduleBlocks.idempotencyKey],
    });

  return listScheduleBlocksForDate(companionId, zonedDateKey(schedule[0]!.startAt));
}

export async function listScheduleBlocksForDate(companionId: string, localDate: string) {
  const rows = await getDb()
    .select()
    .from(scheduleBlocks)
    .where(
      and(
        eq(scheduleBlocks.companionId, companionId),
        eq(scheduleBlocks.localDate, localDate),
      ),
    )
    .orderBy(asc(scheduleBlocks.startAt));
  return rows.map(scheduleRowToDomain);
}

function claimedRow(row: WorldTickRunRow): ClaimedWorldTick {
  if (!row.leaseToken) throw new Error("Claimed world tick has no lease token");
  return { ...row, leaseToken: row.leaseToken };
}

export async function claimWorldTickRun(input: {
  companionId: string;
  windowStart: Date;
  windowEnd: Date;
  randomSeed: string;
  engineVersion: string;
  leaseNow?: Date;
  leaseMs?: number;
}): Promise<WorldTickClaimResult> {
  const leaseNow = input.leaseNow ?? new Date();
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(leaseNow.getTime() + (input.leaseMs ?? WORLD_TICK_LEASE_MS));
  const correlationId = randomUUID();
  const db = getDb();

  const [inserted] = await db
    .insert(worldTickRuns)
    .values({
      companionId: input.companionId,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      status: "processing",
      randomSeed: input.randomSeed,
      engineVersion: input.engineVersion,
      leaseToken,
      leaseExpiresAt,
      correlationId,
      startedAt: leaseNow,
    })
    .onConflictDoNothing({
      target: [worldTickRuns.companionId, worldTickRuns.windowStart],
    })
    .returning();
  if (inserted) return { status: "claimed", claim: claimedRow(inserted) };

  const [reclaimed] = await db
    .update(worldTickRuns)
    .set({
      windowEnd: input.windowEnd,
      status: "processing",
      randomSeed: input.randomSeed,
      engineVersion: input.engineVersion,
      attemptCount: sql`${worldTickRuns.attemptCount} + 1`,
      leaseToken,
      leaseExpiresAt,
      lastError: null,
      startedAt: leaseNow,
      completedAt: null,
      updatedAt: leaseNow,
    })
    .where(
      and(
        eq(worldTickRuns.companionId, input.companionId),
        eq(worldTickRuns.windowStart, input.windowStart),
        or(
          eq(worldTickRuns.status, "failed"),
          and(
            eq(worldTickRuns.status, "processing"),
            or(
              isNull(worldTickRuns.leaseExpiresAt),
              lte(worldTickRuns.leaseExpiresAt, leaseNow),
            ),
          ),
        ),
      ),
    )
    .returning();
  if (reclaimed) return { status: "claimed", claim: claimedRow(reclaimed) };

  const [existing] = await db
    .select({ status: worldTickRuns.status })
    .from(worldTickRuns)
    .where(
      and(
        eq(worldTickRuns.companionId, input.companionId),
        eq(worldTickRuns.windowStart, input.windowStart),
      ),
    )
    .limit(1);
  return { status: existing?.status === "completed" ? "completed" : "busy" };
}

export async function failWorldTickRun(
  claim: ClaimedWorldTick,
  error: unknown,
  failedAt = new Date(),
) {
  const message = error instanceof Error ? error.message : String(error);
  const [failed] = await getDb()
    .update(worldTickRuns)
    .set({
      status: "failed",
      lastError: message.slice(0, 1_000),
      leaseExpiresAt: null,
      updatedAt: failedAt,
    })
    .where(
      and(
        eq(worldTickRuns.id, claim.id),
        eq(worldTickRuns.status, "processing"),
        eq(worldTickRuns.leaseToken, claim.leaseToken),
      ),
    )
    .returning({ id: worldTickRuns.id });
  return Boolean(failed);
}

export async function commitWorldTick(input: {
  claim: ClaimedWorldTick;
  expectedState: WorldStateRow;
  result: WorldTickResult;
  mode: "detailed" | "aggregate";
  committedAt?: Date;
}) {
  const committedAt = input.committedAt ?? new Date();
  return getDb().transaction(async (tx) => {
    const [lockedRun] = await tx
      .select()
      .from(worldTickRuns)
      .where(
        and(
          eq(worldTickRuns.id, input.claim.id),
          eq(worldTickRuns.status, "processing"),
          eq(worldTickRuns.leaseToken, input.claim.leaseToken),
          gt(worldTickRuns.leaseExpiresAt, committedAt),
        ),
      )
      .for("update");
    if (!lockedRun) throw new WorldTickLeaseLostError("World tick lease was replaced");

    const [lockedState] = await tx
      .select()
      .from(worldStates)
      .where(eq(worldStates.companionId, input.claim.companionId))
      .for("update");
    if (
      !lockedState ||
      lockedState.version !== input.expectedState.version ||
      lockedState.lastWorldTickAt.getTime() !== input.expectedState.lastWorldTickAt.getTime()
    ) {
      throw new WorldStateConflictError("World state changed after tick planning");
    }
    if (lockedState.lastWorldTickAt.getTime() !== input.claim.windowStart.getTime()) {
      throw new WorldStateConflictError("World state is not at the claimed window start");
    }

    for (const transition of input.result.scheduleTransitions) {
      const [updatedBlock] = await tx
        .update(scheduleBlocks)
        .set({
          status: transition.after,
          changeReason: transition.reason,
          correlationId: input.claim.correlationId,
          updatedAt: committedAt,
        })
        .where(
          and(
            eq(scheduleBlocks.id, transition.blockId),
            eq(scheduleBlocks.companionId, input.claim.companionId),
            eq(scheduleBlocks.status, transition.before),
          ),
        )
        .returning({ id: scheduleBlocks.id });
      if (!updatedBlock) throw new WorldStateConflictError("Schedule changed during world tick");
    }

    const next = input.result.state;
    const [updatedState] = await tx
      .update(worldStates)
      .set({
        currentTime: next.currentTime,
        currentLocationId: next.currentLocationId ?? null,
        currentActivityId: next.currentActivityId ?? null,
        currentScheduleBlockId: next.currentScheduleBlockId ?? null,
        energy: next.energy,
        boredom: next.boredom,
        curiosity: next.curiosity,
        loneliness: next.loneliness,
        irritation: next.irritation,
        disappointment: next.disappointment,
        attachment: next.attachment,
        shareDesire: next.shareDesire,
        lastChangeReason:
          input.mode === "aggregate" ? "aggregated offline world progression" : "world tick",
        lastCorrelationId: input.claim.correlationId,
        lastWorldTickAt: next.lastWorldTickAt,
        lastDailyPlanAt: next.lastDailyPlanAt,
        version: next.version,
        updatedAt: committedAt,
      })
      .where(
        and(
          eq(worldStates.id, lockedState.id),
          eq(worldStates.version, input.expectedState.version),
          eq(worldStates.lastWorldTickAt, input.expectedState.lastWorldTickAt),
        ),
      )
      .returning();
    if (!updatedState) throw new WorldStateConflictError("World state update lost its version race");

    if (input.result.stateChanges.length > 0) {
      await tx.insert(stateChanges).values(
        input.result.stateChanges.map((change) => ({
          companionId: input.claim.companionId,
          targetPath: `world.${change.targetPath}`,
          beforeJson: change.before,
          afterJson: change.after,
          deltaJson:
            typeof change.before === "number" && typeof change.after === "number"
              ? change.after - change.before
              : null,
          reason: change.reason,
          causedBy: "world.tick",
          correlationId: input.claim.correlationId,
        })),
      );
    }

    await tx.insert(events).values({
      companionId: input.claim.companionId,
      type: "system.tick",
      source: "world.tick",
      correlationId: input.claim.correlationId,
      payloadJson: {
        tickRunId: input.claim.id,
        mode: input.mode,
        windowStart: input.claim.windowStart.toISOString(),
        windowEnd: input.claim.windowEnd.toISOString(),
        stateVersionBefore: input.expectedState.version,
        stateVersionAfter: next.version,
        scheduleTransitions: input.result.scheduleTransitions,
      },
    });

    const [completed] = await tx
      .update(worldTickRuns)
      .set({
        status: "completed",
        resultJson: {
          mode: input.mode,
          stateVersion: next.version,
          stateChangeCount: input.result.stateChanges.length,
          scheduleTransitionCount: input.result.scheduleTransitions.length,
        },
        lastError: null,
        leaseExpiresAt: null,
        completedAt: committedAt,
        updatedAt: committedAt,
      })
      .where(
        and(
          eq(worldTickRuns.id, input.claim.id),
          eq(worldTickRuns.status, "processing"),
          eq(worldTickRuns.leaseToken, input.claim.leaseToken),
        ),
      )
      .returning({ id: worldTickRuns.id });
    if (!completed) throw new WorldTickLeaseLostError("World tick lease was replaced before commit");

    return updatedState;
  });
}
