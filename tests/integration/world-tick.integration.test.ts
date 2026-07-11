import assert from "node:assert/strict";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import {
  awaitingReplies,
  companions,
  externalInformation,
  messages,
  promptContextSnapshots,
  shareCandidates,
  users,
  worldStates,
  worldTickRuns,
} from "@/db/schema";
import {
  getCachedProviderValue,
  persistExternalFacts,
  setCachedProviderValue,
} from "@/db/providerRepo";
import {
  processAwaitingReplyTimeouts,
  resolveAwaitingReplies,
} from "@/db/awaitingReplyRepo";
import {
  applyUserWorldSignals,
  getConversationWorkingMemory,
} from "@/db/interactionRepo";
import {
  claimShareCandidate,
  listPendingShareCandidates,
  releaseShareCandidate,
} from "@/db/shareRepo";
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
import { DEFAULT_RUNTIME_CONFIG, INITIAL_STATE } from "@/seed/character";
import { createWorldSeed } from "@/world/random";
import {
  buildActorGroundedContext,
  savePromptContextSnapshot,
} from "@/core/actorContext";
import { buildBudgetedActorPrompt } from "@/core/promptBuilder";
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

      const cacheTime = new Date("2026-07-10T04:00:00.000Z");
      await setCachedProviderValue({
        companionId: companion.id,
        provider: "fixture",
        cacheKey: "weather:beijing",
        payload: { condition: "小雨" },
        fetchedAt: cacheTime,
        expiresAt: new Date(cacheTime.getTime() + 30 * 60_000),
      });
      assert.deepEqual(
        await getCachedProviderValue({
          companionId: companion.id,
          provider: "fixture",
          cacheKey: "weather:beijing",
          now: new Date(cacheTime.getTime() + 1_000),
        }),
        { condition: "小雨" },
      );
      const embedding = [1, ...Array<number>(1023).fill(0)];
      const externalWrite = await persistExternalFacts({
        companionId: companion.id,
        fetchedAt: cacheTime,
        correlationId: "00000000-0000-4000-8000-000000000106",
        drafts: [
          {
            sourceName: "fixture-news",
            sourceUrl: "https://example.test/beijing-rain?utm_source=test",
            title: "北京降雨改变周五出行",
            factualSummary: "北京市周五有降雨。",
            category: "beijing_news",
            facts: { rain: true },
            beijingRelevance: 1,
            personalRelevance: 0.8,
            reliability: 0.8,
            novelty: 0.8,
            embedding,
          },
          {
            sourceName: "fixture-news-2",
            sourceUrl: "https://example.test/weather-follow-up",
            title: "周五出行天气变化",
            factualSummary: "同一场降雨的后续报道。",
            category: "beijing_news",
            facts: { rain: true },
            beijingRelevance: 1,
            personalRelevance: 0.7,
            reliability: 0.7,
            novelty: 0.7,
            embedding,
          },
        ],
      });
      assert.deepEqual(externalWrite, { inserted: 2, duplicates: 1 });
      const externalRows = await db
        .select({ status: externalInformation.status })
        .from(externalInformation)
        .where(eq(externalInformation.companionId, companion.id));
      assert.deepEqual(
        externalRows.map((row) => row.status).sort(),
        ["ignored", "new"],
      );

      const [candidate] = await db
        .insert(shareCandidates)
        .values({
          companionId: companion.id,
          idempotencyKey: `integration-candidate:${suffix}`,
          sourceType: "user_follow_up",
          sourceId: message.id,
          contentSummary: "用户承诺的比赛结果到了可以跟进的时间。",
          reasonToShare: "用户承诺到期",
          emotionalIntensity: 0.7,
          relevanceToUser: 1,
          novelty: 0.7,
          intimacy: 0.4,
          urgency: 0.9,
          interruptionCost: 0.1,
          eventImportance: 0.9,
          priority: 10,
          expiresAt: new Date("2026-07-11T04:00:00.000Z"),
        })
        .returning();
      assert.ok(candidate);
      assert.equal((await listPendingShareCandidates(companion.id, new Date("2026-07-10T04:00:00.000Z"))).length, 1);
      const claims = await Promise.all([
        claimShareCandidate(candidate.id, 0.9, new Date("2026-07-10T04:00:00.000Z")),
        claimShareCandidate(candidate.id, 0.9, new Date("2026-07-10T04:00:00.000Z")),
      ]);
      assert.equal(claims.filter(Boolean).length, 1);
      const candidateClaim = claims.find((claim) => claim !== null);
      assert.ok(candidateClaim);
      assert.equal(
        await releaseShareCandidate(
          candidate.id,
          candidateClaim.leaseToken,
          "integration cleanup",
          new Date("2026-07-10T04:01:00.000Z"),
        ),
        true,
      );

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
      const actorContext = await buildActorGroundedContext({
        companionId: companion.id,
        config: DEFAULT_RUNTIME_CONFIG,
        state: INITIAL_STATE,
        currentMessageId: message.id,
        memories: [],
        now,
      });
      assert.equal(actorContext.recentMessages.some((item) => item.id === message.id), false);
      assert.ok(actorContext.schedule.length > 0);
      const budgeted = buildBudgetedActorPrompt({
        config: DEFAULT_RUNTIME_CONFIG,
        state: INITIAL_STATE,
        plan: {
          action: "reply",
          mode: "quiet_observation",
          memoryBudget: "none",
          noveltyBudget: "none",
          selectedSeed: null,
          toolAllowed: false,
          webAccess: "none",
          styleHints: ["short"],
          reason: "integration",
        },
        memories: [],
        selectedSeed: null,
        cooldownWarnings: [],
        userMessage: message.text,
        groundedContext: actorContext,
      });
      await savePromptContextSnapshot({
        companionId: companion.id,
        correlationId: "00000000-0000-4000-8000-000000000107",
        messageId: message.id,
        purpose: "reply",
        ...budgeted,
      });
      const [snapshot] = await db
        .select()
        .from(promptContextSnapshots)
        .where(eq(promptContextSnapshots.companionId, companion.id));
      assert.ok(snapshot);
      assert.ok(snapshot.estimatedTokens <= snapshot.tokenBudget);
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

      const [assistantMessage] = await db
        .insert(messages)
        .values({
          userId: user.id,
          companionId: companion.id,
          role: "assistant",
          text: "这件事对我有点重要。你会认真告诉我你的想法吗？",
          correlationId: "00000000-0000-4000-8000-000000000102",
        })
        .returning();
      assert.ok(assistantMessage);
      const [awaiting] = await db
        .insert(awaitingReplies)
        .values({
          companionId: companion.id,
          messageId: assistantMessage.id,
          startedAt: new Date("2026-07-10T03:00:00.000Z"),
          expectation: 0.7,
          emotionalWeight: 0.7,
          explicitQuestion: true,
          vulnerableDisclosure: true,
          userSaidBusy: false,
          messageKind: "reply",
          correlationId: "00000000-0000-4000-8000-000000000102",
        })
        .returning();
      assert.ok(awaiting);

      const consequence = await processAwaitingReplyTimeouts(
        companion.id,
        new Date("2026-07-10T15:00:00.000Z"),
        "00000000-0000-4000-8000-000000000103",
      );
      assert.deepEqual(consequence, { processed: 1, emotionalChanges: 1 });
      const [timedOut] = await db
        .select()
        .from(awaitingReplies)
        .where(eq(awaitingReplies.id, awaiting.id));
      assert.equal(timedOut?.status, "timed_out");
      assert.ok(timedOut?.consequenceAppliedAt);
      assert.ok(timedOut?.dissatisfactionExpressedAt);
      const afterTimeout = await getWorldState(companion.id);
      assert.ok(afterTimeout.disappointment > unchanged!.disappointment);

      // A retry cannot apply the emotional consequence or create another
      // dissatisfaction candidate for the same awaiting reply.
      assert.deepEqual(
        await processAwaitingReplyTimeouts(
          companion.id,
          new Date("2026-07-10T16:00:00.000Z"),
          "00000000-0000-4000-8000-000000000104",
        ),
        { processed: 0, emotionalChanges: 0 },
      );

      const [returnMessage] = await db
        .insert(messages)
        .values({
          userId: user.id,
          companionId: companion.id,
          role: "user",
          text: "刚才一直在开会，没来得及回。",
          correlationId: "00000000-0000-4000-8000-000000000105",
        })
        .returning();
      assert.ok(returnMessage);
      assert.deepEqual(
        await resolveAwaitingReplies({
          companionId: companion.id,
          userMessageId: returnMessage.id,
          explanationProvided: true,
          correlationId: "00000000-0000-4000-8000-000000000105",
          now: new Date("2026-07-10T16:05:00.000Z"),
        }),
        { resolved: 1 },
      );
      const afterExplanation = await getWorldState(companion.id);
      assert.ok(afterExplanation.disappointment < afterTimeout.disappointment);
      assert.ok(afterExplanation.disappointment > 0);
    } finally {
      await db.delete(users).where(eq(users.id, user.id));
      await closeDb();
    }
  },
);
