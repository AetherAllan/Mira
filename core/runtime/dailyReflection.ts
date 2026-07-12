import { randomUUID } from "node:crypto";
import { logRuntimeEvent } from "@/core/eventLog";
import { getPrimaryRuntimeContext } from "@/core/runtime/context";
import {
  applyDailyReflectionTransaction,
  getCompanionState,
  listTodayActivity,
} from "@/db/repo";
import { applyLongTermReflectionEvolution } from "@/db/reflectionRepo";
import { zonedDateKey } from "@/lib/time";
import { systemClock, weekdayForLocalDate } from "@/platform/time";
import { addLocalDays, generateDailyLifePlan } from "@/world/dailyPlan";
import {
  applyDailyReflection,
  reflectOnDay,
} from "@/psyche/growthEngine";

export async function runDailyReflection(now = systemClock.now()) {
  const context = await getPrimaryRuntimeContext();
  const config = context.companion.configJson;
  const date = zonedDateKey(now, config.policy.quietHours.timeZone);
  const correlationId = randomUUID();
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "system.tick",
    source: "cron.daily",
    correlationId,
    payloadJson: { at: now.toISOString(), date },
  });
  const activity = await listTodayActivity(
    context.companion.id,
    date,
    config.policy.quietHours.timeZone,
  );
  const reflectionActivity = {
    ...activity,
    knownPlaces: context.world.places.map((place) => ({
      id: place.id,
      name: place.name,
      familiarity: place.familiarity,
      visitCount: place.visitCount,
      lastVisitedAt: place.lastVisitedAt,
    })),
    fictionalCharacters: context.world.characters.map((character) => ({
      stableKey: character.stableKey,
      name: character.name,
      relationshipScore: character.relationshipScore,
      currentSituation: character.currentSituation,
    })),
  };
  const generated = await reflectOnDay(
    reflectionActivity,
    context.state,
    config,
    {
      companionId: context.companion.id,
      correlationId,
      category: "reflection",
      metadata: { date },
    },
    weekdayForLocalDate(date) === "Sunday",
  );
  let growth: ReturnType<typeof applyDailyReflection> | null = null;
  let journalResult: Awaited<ReturnType<typeof applyDailyReflectionTransaction>> | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const latestState = await getCompanionState(context.companion.id);
    growth = applyDailyReflection(latestState, generated.reflection);
    // Journal, state and audit rows share one database commit.
    journalResult = await applyDailyReflectionTransaction({
      journalInput: {
        companionId: context.companion.id,
        date,
        summary: generated.reflection.summary,
        reflection: generated.reflection.reflection,
        traitUpdatesJson: generated.reflection.traitUpdates,
        beliefUpdatesJson: {},
        arcUpdatesJson: generated.reflection.arcUpdates,
        relationshipSummary: generated.reflection.relationshipSummary,
        placePreferenceUpdatesJson: generated.reflection.placePreferenceUpdates,
        interestUpdatesJson: generated.reflection.interestUpdates,
        characterUpdatesJson: generated.reflection.characterUpdates,
        weeklySummary: generated.reflection.weeklySummary,
        correlationId,
        sourceType: "daily_reflection",
      },
      expectedState: latestState,
      state: growth.state,
      changes: growth.changes,
      userId: context.user.id,
      eventPayload: {
        usedFallback: generated.usedFallback,
        error: generated.error,
        raw: generated.raw,
      },
    });
    if (!journalResult.conflict) break;
  }
  if (!growth || !journalResult || journalResult.conflict || !journalResult.row) {
    throw new Error("Companion state changed too often during daily reflection");
  }
  const evolution = await applyLongTermReflectionEvolution({
    companionId: context.companion.id,
    journalId: journalResult.row.id,
    reflection: generated.reflection,
    correlationId,
    now,
  });
  const tomorrowPlan = await generateDailyLifePlan(
    context.companion.id,
    addLocalDays(date, 1),
  );
  if (!journalResult.created) {
    return {
      reflected: false,
      reason: "already_reflected",
      date,
      journalId: journalResult.row.id,
      evolution,
      tomorrowPlanId: tomorrowPlan.id,
    };
  }
  return {
    reflected: true,
    date,
    journalId: journalResult.row.id,
    stateChanges: growth.changes.length,
    evolution,
    tomorrowPlanId: tomorrowPlan.id,
  };
}
