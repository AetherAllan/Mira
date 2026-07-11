import assert from "node:assert/strict";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import {
  companions,
  messages,
  users,
  worldStates,
  worldTickRuns,
} from "@/db/schema";
import {
  applyUserWorldSignals,
  getConversationWorkingMemory,
} from "@/db/interactionRepo";
import {
  claimWorldTickRun,
  commitWorldTick,
  ensurePersistentWorld,
  failWorldTickRun,
  getWorldState,
  listScheduleBlocksForDate,
  WorldTickLeaseLostError,
  worldStateRowToDomain,
} from "@/db/worldRepo";
import { DEFAULT_RUNTIME_CONFIG } from "@/seed/character";
import { createWorldSeed } from "@/world/random";
import { reduceWorldTick } from "@/world/reducer";
import { runWorldTick } from "@/world/tick";
import { inferWorldSignals } from "@/world/userSignals";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const enabled = Boolean(testDatabaseUrl);

if (testDatabaseUrl) {
  const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ""));
  if (databaseName !== "mira_test") {
    throw new Error(`Integration tests refuse to use database ${databaseName || "<unknown>"}`);
  }
  // getDb intentionally reads DATABASE_URL like production. The explicit
  // safety check above prevents TEST_DATABASE_URL from being redirected to it.
  process.env.DATABASE_URL = testDatabaseUrl;
}

test(
  "world tick is idempotent across workers and rejects a stale lease",
  { skip: !enabled, timeout: 120_000 },
  async () => {
    const suffix = crypto.randomUUID();
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ telegramUserId: `integration-${suffix}`, displayName: "World Tick Test" })
      .returning();
    assert.ok(user);

    try {
      const [companion] = await db
        .insert(companions)
        .values({ userId: user.id, name: "Mira", configJson: DEFAULT_RUNTIME_CONFIG })
        .returning();
      assert.ok(companion);
      await ensurePersistentWorld(
        companion.id,
        DEFAULT_RUNTIME_CONFIG.character.profile,
        new Date("2026-07-10T02:07:00.000Z"),
      );

      const [message] = await db
        .insert(messages)
        .values({
          userId: user.id,
          companionId: companion.id,
          role: "user",
          text: "你周末可以去 UCCA 看看，我明天告诉你比赛结果。",
          correlationId: "00000000-0000-4000-8000-000000000101",
        })
        .returning();
      assert.ok(message);
      const analysis = {
        topics: [{ name: "beijing_activity", confidence: 0.9 }],
        emotion: "curious",
        intent: "recommendation",
        importance: 0.7,
        novelty: 0.6,
        summary: "用户推荐地点并承诺后续反馈。",
        worldSignals: inferWorldSignals(message.text, new Date("2026-07-10T04:00:00.000Z")),
      };
      const signalInput = {
        userId: user.id,
        companionId: companion.id,
        messageId: message.id,
        messageText: message.text,
        analysis,
        correlationId: "00000000-0000-4000-8000-000000000101",
        now: new Date("2026-07-10T04:00:00.000Z"),
      };
      const firstSignalWrite = await applyUserWorldSignals(signalInput);
      const repeatedSignalWrite = await applyUserWorldSignals(signalInput);
      assert.ok(firstSignalWrite.knowledgeWrites >= 2);
      assert.ok(firstSignalWrite.openLoopWrites >= 2);
      assert.ok(firstSignalWrite.proposalWrites >= 1);
      assert.deepEqual(repeatedSignalWrite, {
        knowledgeWrites: 0,
        openLoopWrites: 0,
        proposalWrites: 0,
      });
      const workingMemory = await getConversationWorkingMemory(companion.id);
      assert.ok(workingMemory?.userCommitmentsJson.length);

      const now = new Date("2026-07-10T02:16:00.000Z");
      const [firstWorker, secondWorker] = await Promise.all([
        runWorldTick(now),
        runWorldTick(now),
      ]);
      const outcomes = [firstWorker, secondWorker].flatMap((result) =>
        result.results.filter((item) => item.companionId === companion.id),
      );
      assert.equal(outcomes.length, 2);
      assert.equal(
        outcomes.filter((item) => item.status === "advanced").length,
        1,
        JSON.stringify(outcomes),
      );
      assert.ok(
        outcomes.some((item) => item.status === "busy" || item.status === "up_to_date"),
      );

      const state = await getWorldState(companion.id);
      assert.ok(state);
      assert.equal(state.lastWorldTickAt.toISOString(), "2026-07-10T02:15:00.000Z");
      // A deterministic ordinary event may add one more version increment for
      // its emotional consequence; the tick window itself still commits once.
      assert.ok(state.version === 1 || state.version === 2);
      const completedRuns = await db
        .select()
        .from(worldTickRuns)
        .where(eq(worldTickRuns.companionId, companion.id));
      assert.equal(completedRuns.length, 1);
      assert.equal(completedRuns[0]?.status, "completed");

      const windowStart = state.lastWorldTickAt;
      const windowEnd = new Date(windowStart.getTime() + 15 * 60_000);
      const claimInput = {
        companionId: companion.id,
        windowStart,
        windowEnd,
        randomSeed: createWorldSeed(companion.id, windowStart.toISOString(), "lease-test"),
        engineVersion: "world-v1",
        leaseMs: 1,
      };
      const firstClaim = await claimWorldTickRun({
        ...claimInput,
        leaseNow: new Date("2026-07-10T02:16:00.000Z"),
      });
      assert.equal(firstClaim.status, "claimed");
      if (firstClaim.status !== "claimed") return;
      const secondClaim = await claimWorldTickRun({
        ...claimInput,
        leaseNow: new Date("2026-07-10T02:16:01.000Z"),
      });
      assert.equal(secondClaim.status, "claimed");
      if (secondClaim.status !== "claimed") return;
      assert.notEqual(firstClaim.claim.leaseToken, secondClaim.claim.leaseToken);

      const schedule = await listScheduleBlocksForDate(companion.id, "2026-07-10");
      const reduced = reduceWorldTick({
        state: worldStateRowToDomain(state),
        schedule,
        windowStart,
        windowEnd,
        correlationId: firstClaim.claim.correlationId,
      });
      await assert.rejects(
        commitWorldTick({
          claim: firstClaim.claim,
          expectedState: state,
          result: reduced,
          mode: "detailed",
        }),
        WorldTickLeaseLostError,
      );
      assert.equal(await failWorldTickRun(firstClaim.claim, new Error("stale")), false);
      assert.equal(
        await failWorldTickRun(secondClaim.claim, new Error("simulated worker crash")),
        true,
      );

      const [failedRun] = await db
        .select()
        .from(worldTickRuns)
        .where(
          and(
            eq(worldTickRuns.companionId, companion.id),
            eq(worldTickRuns.windowStart, windowStart),
          ),
        );
      assert.equal(failedRun?.status, "failed");
      assert.equal(failedRun?.attemptCount, 2);
      const [unchanged] = await db
        .select()
        .from(worldStates)
        .where(eq(worldStates.companionId, companion.id));
      assert.equal(unchanged?.version, state.version);
    } finally {
      await db.delete(users).where(eq(users.id, user.id));
      await closeDb();
    }
  },
);
