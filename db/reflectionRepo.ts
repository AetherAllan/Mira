import { and, eq, sql } from "drizzle-orm";
import type { DailyReflection } from "@/core/types";
import { getDb } from "@/db/client";
import {
  companions,
  events,
  internalJournals,
  knownPlaces,
  stateChanges,
  worldCharacters,
} from "@/db/schema";

export async function applyLongTermReflectionEvolution(input: {
  companionId: string;
  journalId: string;
  reflection: DailyReflection;
  correlationId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return getDb().transaction(async (tx) => {
    const [claimed] = await tx
      .update(internalJournals)
      .set({ evolutionAppliedAt: now })
      .where(
        and(
          eq(internalJournals.id, input.journalId),
          eq(internalJournals.companionId, input.companionId),
          sql`${internalJournals.evolutionAppliedAt} IS NULL`,
        ),
      )
      .returning({ id: internalJournals.id });
    if (!claimed) return { applied: false, placeUpdates: 0, characterUpdates: 0, interestsChanged: false };

    let placeUpdates = 0;
    for (const update of input.reflection.placePreferenceUpdates) {
      const [before] = await tx
        .select()
        .from(knownPlaces)
        .where(and(eq(knownPlaces.id, update.placeId), eq(knownPlaces.companionId, input.companionId)))
        .for("update");
      if (!before) continue;
      const boundedDelta = Math.min(0.03, Math.max(-0.03, update.familiarityDelta));
      const familiarity = Math.min(1, Math.max(0, before.familiarity + boundedDelta));
      await tx.update(knownPlaces).set({
        familiarity,
        miraImpression: update.impression?.slice(0, 500) ?? before.miraImpression,
        updatedAt: now,
      }).where(eq(knownPlaces.id, before.id));
      await tx.insert(stateChanges).values({
        companionId: input.companionId,
        targetPath: `knownPlace.${before.id}.familiarity`,
        beforeJson: before.familiarity,
        afterJson: familiarity,
        deltaJson: familiarity - before.familiarity,
        reason: "bounded daily place preference evolution",
        causedBy: "daily.reflection",
        correlationId: input.correlationId,
      });
      placeUpdates += 1;
    }

    let characterUpdates = 0;
    for (const update of input.reflection.characterUpdates) {
      const [before] = await tx
        .select()
        .from(worldCharacters)
        .where(
          and(
            eq(worldCharacters.companionId, input.companionId),
            eq(worldCharacters.stableKey, update.stableKey),
          ),
        )
        .for("update");
      if (!before) continue;
      const boundedDelta = Math.min(0.02, Math.max(-0.02, update.relationshipDelta));
      const relationshipScore = Math.min(1, Math.max(0, before.relationshipScore + boundedDelta));
      await tx.update(worldCharacters).set({
        relationshipScore,
        currentSituation: update.currentSituation?.slice(0, 500) ?? before.currentSituation,
        updatedAt: now,
      }).where(eq(worldCharacters.id, before.id));
      await tx.insert(stateChanges).values({
        companionId: input.companionId,
        targetPath: `worldCharacter.${before.stableKey}.relationshipScore`,
        beforeJson: before.relationshipScore,
        afterJson: relationshipScore,
        deltaJson: relationshipScore - before.relationshipScore,
        reason: "bounded daily fictional character relationship evolution",
        causedBy: "daily.reflection",
        correlationId: input.correlationId,
      });
      characterUpdates += 1;
    }

    const [companion] = await tx
      .select()
      .from(companions)
      .where(eq(companions.id, input.companionId))
      .for("update");
    let interestsChanged = false;
    if (companion) {
      const current = companion.configJson.character.profile.interests;
      const cooled = new Set(input.reflection.interestUpdates.cooled.slice(0, 2));
      const retained = current.length > 5 ? current.filter((interest) => !cooled.has(interest)) : current;
      const next = [...new Set([
        ...retained,
        ...input.reflection.interestUpdates.added.slice(0, 2).map((item) => item.slice(0, 80)),
      ])].slice(0, 20);
      interestsChanged = JSON.stringify(current) !== JSON.stringify(next);
      if (interestsChanged) {
        await tx.update(companions).set({
          configJson: {
            ...companion.configJson,
            character: {
              ...companion.configJson.character,
              profile: { ...companion.configJson.character.profile, interests: next },
            },
          },
          updatedAt: now,
        }).where(eq(companions.id, input.companionId));
        await tx.insert(stateChanges).values({
          companionId: input.companionId,
          targetPath: "character.profile.interests",
          beforeJson: current,
          afterJson: next,
          deltaJson: input.reflection.interestUpdates,
          reason: "daily reflection interest evolution",
          causedBy: "daily.reflection",
          correlationId: input.correlationId,
        });
      }
    }
    await tx.insert(events).values({
      companionId: input.companionId,
      type: "reflection.evolution.applied",
      source: "growth",
      correlationId: input.correlationId,
      payloadJson: { journalId: input.journalId, placeUpdates, characterUpdates, interestsChanged },
    });
    return { applied: true, placeUpdates, characterUpdates, interestsChanged };
  });
}
