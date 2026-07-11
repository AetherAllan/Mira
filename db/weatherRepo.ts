import { and, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  events,
  externalInformation,
  knownPlaces,
  scheduleBlocks,
  stateChanges,
  worldEvents,
} from "@/db/schema";
import { createWorldSeed, deterministicUuid } from "@/world/random";
import { planWeatherScheduleAdjustment } from "@/world/weather";
import type { ScheduleBlock } from "@/world/types";

function scheduleDomain(row: typeof scheduleBlocks.$inferSelect): ScheduleBlock {
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
  };
}

export async function applyWeatherScheduleAdjustment(input: {
  companionId: string;
  now: Date;
  weatherRisk: number;
  weatherSummary: string;
}) {
  if (input.weatherRisk < 0.65) return { adjusted: false, reason: "low_weather_risk" };
  const db = getDb();
  const [schedule, places, weatherRows] = await Promise.all([
    db
      .select()
      .from(scheduleBlocks)
      .where(
        and(
          eq(scheduleBlocks.companionId, input.companionId),
          gt(scheduleBlocks.startAt, input.now),
          // Current weather is a short-lived fact. It must not rewrite a plan
          // tomorrow just because that is the next outdoor block in the DB.
          lte(scheduleBlocks.startAt, new Date(input.now.getTime() + 12 * 60 * 60_000)),
          inArray(scheduleBlocks.status, ["planned", "changed"]),
        ),
      )
      .orderBy(scheduleBlocks.startAt)
      .limit(20),
    db.select().from(knownPlaces).where(eq(knownPlaces.companionId, input.companionId)),
    db
      .select()
      .from(externalInformation)
      .where(
        and(
          eq(externalInformation.companionId, input.companionId),
          inArray(externalInformation.category, ["weather", "weather_warning"]),
        ),
      )
      .orderBy(desc(externalInformation.fetchedAt))
      .limit(1),
  ]);
  const adjustment = planWeatherScheduleAdjustment({
    schedule: schedule.map(scheduleDomain),
    places,
    now: input.now,
    weatherRisk: input.weatherRisk,
    weatherSummary: input.weatherSummary,
  });
  if (!adjustment) return { adjusted: false, reason: "no_feasible_outdoor_replacement" };
  const source = weatherRows[0];
  const seed = createWorldSeed(
    input.companionId,
    adjustment.blockId,
    source?.id ?? input.weatherSummary,
    "weather-schedule-v1",
  );
  const eventId = deterministicUuid(seed);
  const correlationId = deterministicUuid(createWorldSeed(seed, "correlation"));
  return db.transaction(async (tx) => {
    const [insertedEvent] = await tx
      .insert(worldEvents)
      .values({
        id: eventId,
        companionId: input.companionId,
        type: "weather",
        realityLayer: "physical",
        title: "降雨改变了下班后的计划",
        content: `原来的室外安排改成了${adjustment.indoorPlaceName}。`,
        occurredAt: input.now,
        causeType: "external_information",
        causeId: source?.id,
        consequencesJson: [
          `schedule:${adjustment.blockId}:changed`,
          `destination:${adjustment.indoorPlaceId}`,
        ],
        importance: 0.62,
        sharePotential: 0.5,
        randomSeed: seed,
        idempotencyKey: `weather-adjustment:${adjustment.blockId}:${source?.id ?? seed}`,
        correlationId,
      })
      .onConflictDoNothing({ target: [worldEvents.companionId, worldEvents.idempotencyKey] })
      .returning({ id: worldEvents.id });
    if (!insertedEvent) return { adjusted: false, reason: "already_adjusted" };
    const [updated] = await tx
      .update(scheduleBlocks)
      .set({
        title: `改去${adjustment.indoorPlaceName}`,
        locationId: adjustment.indoorPlaceId,
        status: "changed",
        source: "external_information",
        changeReason: adjustment.reason,
        correlationId,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(scheduleBlocks.id, adjustment.blockId),
          eq(scheduleBlocks.companionId, input.companionId),
          eq(scheduleBlocks.locationId, adjustment.beforeLocationId),
          eq(scheduleBlocks.status, "planned"),
        ),
      )
      .returning({ id: scheduleBlocks.id });
    if (!updated) throw new Error("Weather schedule block changed concurrently");
    await tx.insert(stateChanges).values({
      companionId: input.companionId,
      targetPath: `schedule.${adjustment.blockId}.locationId`,
      beforeJson: adjustment.beforeLocationId,
      afterJson: adjustment.indoorPlaceId,
      deltaJson: { travelMinutes: adjustment.travelMinutes },
      reason: adjustment.reason,
      causedBy: "external_information",
      correlationId,
    });
    await tx.insert(events).values({
      companionId: input.companionId,
      type: "schedule.changed",
      source: "weather.provider",
      correlationId,
      payloadJson: {
        worldEventId: eventId,
        scheduleBlockId: adjustment.blockId,
        beforeLocationId: adjustment.beforeLocationId,
        afterLocationId: adjustment.indoorPlaceId,
        travelMinutes: adjustment.travelMinutes,
        externalInformationId: source?.id,
      },
    });
    return { adjusted: true, reason: adjustment.reason, worldEventId: eventId };
  });
}
