import { and, asc, eq, inArray } from "drizzle-orm";
import type { CharacterProfile } from "@/core/types";
import { getDb } from "@/db/client";
import {
  knownPlaces,
  worldCharacters,
  worldStates,
  type KnownPlaceRow,
  type WorldCharacterRow,
  type WorldStateRow,
} from "@/db/schema";
import {
  DEFAULT_CHARACTER_PROFILE,
  INITIAL_BEIJING_PLACES,
  INITIAL_WORLD_CHARACTERS,
} from "@/seed/world";
import { getTickWindow } from "@/world/reducer";

type NewKnownPlace = typeof knownPlaces.$inferInsert;
type NewWorldCharacter = typeof worldCharacters.$inferInsert;

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
