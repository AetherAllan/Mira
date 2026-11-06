import assert from "node:assert/strict";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import {
  companionStates,
  companions,
  dailyLifePlans,
  innerThoughts,
  knownPlaces,
  plannedWorldEvents,
  shareCandidates,
  users,
  worldEvents,
} from "@/db/schema";
import { ensurePersistentWorld } from "@/db/worldRepo";
import { zonedDateKey } from "@/lib/time";
import { DEFAULT_RUNTIME_CONFIG, INITIAL_STATE } from "@/seed/character";
import { ORDINARY_EVENT_TEMPLATES } from "@/world/ordinaryEventTemplates";
import { catchUpCompanionWorld } from "@/world/tick";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const enabled = Boolean(testDatabaseUrl);

if (testDatabaseUrl) {
  const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ""));
  if (databaseName !== "mira_test") {
    throw new Error(`Integration tests refuse to use database ${databaseName || "<unknown>"}`);
  }
  process.env.DATABASE_URL = testDatabaseUrl;
}

// Monday 00:00 in Beijing. Exactly seven days stays on the detailed catch-up path.
const START = new Date("2026-07-05T16:00:00.000Z");
const END = new Date(START.getTime() + 7 * 24 * 60 * 60_000);

test(
  "seven days without a model run planned and ordinary events through the real tick",
  { skip: !enabled, timeout: 300_000 },
  async () => {
    // Every plan must come from the fallback, even if the machine has a real key.
    const savedApiKey = process.env.API_KEY;
    delete process.env.API_KEY;
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ telegramUserId: `ordinary-${crypto.randomUUID()}`, displayName: "Ordinary Events Test" })
      .returning();
    assert.ok(user);

    try {
      const [companion] = await db
        .insert(companions)
        .values({ userId: user.id, name: "Mira", configJson: DEFAULT_RUNTIME_CONFIG })
        .returning();
      assert.ok(companion);
      await db.insert(companionStates).values({
        companionId: companion.id,
        traitsJson: INITIAL_STATE.traits,
        moodJson: INITIAL_STATE.mood,
        drivesJson: INITIAL_STATE.drives,
        relationshipJson: INITIAL_STATE.relationship,
        activeArcsJson: INITIAL_STATE.activeArcs,
        stateReasonsJson: INITIAL_STATE.stateReasons,
        version: INITIAL_STATE.version,
      });
      // The world starts at the last completed window, so this places it exactly at START.
      await ensurePersistentWorld(
        companion.id,
        DEFAULT_RUNTIME_CONFIG.character.profile,
        new Date(START.getTime() + 15 * 60_000),
      );

      let remaining = Number.POSITIVE_INFINITY;
      for (let call = 0; remaining > 0 && call < 12; call += 1) {
        const result = await catchUpCompanionWorld(companion.id, END);
        assert.equal(result.status, "advanced", JSON.stringify(result));
        assert.equal(result.aggregated, false, "the run must stay on the detailed path");
        remaining = result.remainingWindows;
      }
      assert.equal(remaining, 0);

      const plans = await db.select().from(dailyLifePlans).where(eq(dailyLifePlans.companionId, companion.id));
      assert.equal(plans.length, 7);
      for (const plan of plans) {
        assert.equal(plan.status, "fallback");
        // The missing key is the only complaint: the fallback passed every plan rule.
        assert.deepEqual(plan.validationJson.errors, ["API_KEY is not configured"], plan.localDate);
      }
      assert.equal(new Set(plans.map((plan) => plan.theme)).size, 7);
      assert.equal(new Set(plans.flatMap((plan) => plan.fingerprintJson)).size, 70);

      const rows = await db.select().from(worldEvents).where(eq(worldEvents.companionId, companion.id));
      const ordinary = rows.filter((row) => row.idempotencyKey?.startsWith("ordinary:"));
      const planned = rows.filter((row) => !row.idempotencyKey?.startsWith("ordinary:"));
      assert.ok(ordinary.length > 0, "seven days should produce an ordinary event");
      assert.equal(new Set(rows.map((row) => row.occurredAt.getTime())).size, rows.length, "one event per window");

      const dayOf = (at: Date) => zonedDateKey(at, DEFAULT_RUNTIME_CONFIG.character.profile.timeZone);
      const count = (items: typeof rows) => {
        const counts = new Map<string, number>();
        for (const item of items) counts.set(dayOf(item.occurredAt), (counts.get(dayOf(item.occurredAt)) ?? 0) + 1);
        return counts;
      };
      assert.equal(count(rows).size, 7);
      for (const [day, total] of count(rows)) assert.ok(total >= 6 && total <= 10, `${day} has ${total} events`);
      for (const [day, total] of count(planned)) assert.ok(total >= 6 && total <= 8, `${day} has ${total} planned events`);
      for (const [day, total] of count(ordinary)) assert.ok(total <= 2, `${day} has ${total} ordinary events`);

      // Ordinary events are grounded in the schedule and never claim a planned slot.
      const places = new Set(
        (await db.select({ id: knownPlaces.id }).from(knownPlaces).where(eq(knownPlaces.companionId, companion.id)))
          .map((place) => place.id),
      );
      const templateOf = (row: (typeof rows)[number]) => {
        const id = row.causeId?.replace("ordinary:template:", "");
        const template = ORDINARY_EVENT_TEMPLATES.find((item) => item.id === id);
        assert.ok(template, `${row.title} does not name a template`);
        return template;
      };
      for (const row of ordinary) {
        assert.equal(row.causeType, "random");
        assert.equal(row.realityLayer, "physical");
        const template = templateOf(row);
        if (row.locationId) assert.ok(places.has(row.locationId), `${row.title} is at an unknown place`);
        else assert.ok(template.scheduleTypes.includes("commute"), `${row.title} has no place`);
      }
      const awake = ordinary.map(templateOf).filter((template) => !template.scheduleTypes.includes("sleep"));
      assert.equal(new Set(awake.map((template) => template.id)).size, awake.length, "a template repeated within a week");

      const plannedRows = await db.select().from(plannedWorldEvents)
        .where(eq(plannedWorldEvents.companionId, companion.id));
      const ordinaryIds = new Set(ordinary.map((row) => row.id));
      assert.equal(plannedRows.filter((row) => row.occurredEventId && ordinaryIds.has(row.occurredEventId)).length, 0);
      assert.equal(plannedRows.filter((row) => row.status === "occurred").length, planned.length);

      // A small detail may become a thought, never something Mira proactively brings up.
      const thoughts = await db.select().from(innerThoughts)
        .where(inArray(innerThoughts.sourceId, ordinary.map((row) => row.id)));
      for (const thought of thoughts) assert.doesNotMatch(thought.content, /undefined/);
      if (thoughts.length > 0) {
        const candidates = await db.select().from(shareCandidates)
          .where(inArray(shareCandidates.sourceId, thoughts.map((thought) => thought.id)));
        assert.equal(candidates.length, 0);
      }

      // The tick is finished, so running it again must change nothing.
      const rerun = await catchUpCompanionWorld(companion.id, END);
      assert.equal(rerun.status, "up_to_date");
      const after = await db.select({ id: worldEvents.id }).from(worldEvents)
        .where(eq(worldEvents.companionId, companion.id));
      assert.equal(after.length, rows.length);
    } finally {
      await db.delete(users).where(eq(users.id, user.id));
      await closeDb();
      if (savedApiKey === undefined) delete process.env.API_KEY;
      else process.env.API_KEY = savedApiKey;
    }
  },
);
