import assert from "node:assert/strict";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import {
  awaitingReplies,
  companions,
  externalInformation,
  internalJournals,
  knownPlaces,
  llmUsageLogs,
  messages,
  messageOutbox,
  promptContextSnapshots,
  scheduleBlocks,
  shareCandidates,
  users,
  worldStates,
  worldCharacters,
  worldTickRuns,
} from "@/db/schema";
import {
  getCachedProviderValue,
  persistDiscoveredPlaces,
  persistExternalFacts,
  setCachedProviderValue,
} from "@/db/providerRepo";
import { applyWeatherScheduleAdjustment } from "@/db/weatherRepo";
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
import { applyLongTermReflectionEvolution } from "@/db/reflectionRepo";
import { recordLlmUsage } from "@/db/usageRepo";
import {
  enqueueAssistantMessage,
  listMessageOutbox,
} from "@/db/messageOutboxRepo";
import { drainTelegramOutbox } from "@/messaging/outbox";
import { TelegramSendError } from "@/telegram/client";

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
  { skip: !enabled, timeout: 180_000 },
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
      const persistentWorld = await ensurePersistentWorld(
        companion.id,
        DEFAULT_RUNTIME_CONFIG.character.profile,
        new Date("2026-07-10T02:07:00.000Z"),
      );
      const discovered = {
        companionId: companion.id,
        places: [{
          provider: "osm" as const,
          providerId: `osm-fixture-${suffix}`,
          name: "集成测试书店",
          category: "book_store",
          district: "朝阳区",
          address: "北京市朝阳区测试路 1 号",
          coordinates: { latitude: 39.921, longitude: 116.461 },
          distanceMeters: null,
        }],
        discoveredAt: new Date("2026-07-10T02:07:30.000Z"),
        correlationId: "00000000-0000-4000-8000-000000000107",
      };
      assert.equal((await persistDiscoveredPlaces(discovered)).inserted, 1);
      assert.equal((await persistDiscoveredPlaces(discovered)).inserted, 0);
      const [osmPlace] = await db
        .select()
        .from(knownPlaces)
        .where(
          and(
            eq(knownPlaces.companionId, companion.id),
            eq(knownPlaces.providerPoiId, discovered.places[0].providerId),
          ),
        );
      assert.equal(osmPlace?.provider, "osm");
      assert.equal(osmPlace?.coordinateSystem, "wgs84");
      const [journal] = await db.insert(internalJournals).values({
        companionId: companion.id,
        date: "2026-07-09",
        summary: "integration reflection",
        reflection: "bounded evolution",
      }).returning();
      assert.ok(journal);
      const reflection = {
        summary: "integration reflection",
        reflection: "bounded evolution",
        moodUpdates: {},
        driveUpdates: {},
        relationshipUpdates: {},
        traitUpdates: {},
        arcUpdates: [],
        tomorrowSeeds: [],
        relationshipSummary: "relationship stable",
        placePreferenceUpdates: [{
          placeId: persistentWorld.homePlace.id,
          familiarityDelta: 1,
          impression: "更熟悉了一点",
        }],
        interestUpdates: { added: ["独立游戏开发"], cooled: [] },
        characterUpdates: [{
          stableKey: persistentWorld.characters[0]!.stableKey,
          relationshipDelta: 1,
          currentSituation: "最近一起完成了一个普通需求",
        }],
        weeklySummary: null,
      };
      const evolution = await applyLongTermReflectionEvolution({
        companionId: companion.id,
        journalId: journal.id,
        reflection,
        correlationId: "00000000-0000-4000-8000-000000000108",
        now: new Date("2026-07-10T02:08:00.000Z"),
      });
      assert.equal(evolution.applied, true);
      assert.equal((await applyLongTermReflectionEvolution({
        companionId: companion.id,
        journalId: journal.id,
        reflection,
        correlationId: "00000000-0000-4000-8000-000000000108",
      })).applied, false);
      const [evolvedPlace] = await db.select().from(knownPlaces).where(eq(knownPlaces.id, persistentWorld.homePlace.id));
      const [evolvedCharacter] = await db.select().from(worldCharacters).where(eq(worldCharacters.id, persistentWorld.characters[0]!.id));
      assert.ok(Math.abs((evolvedPlace?.familiarity ?? 0) - persistentWorld.homePlace.familiarity) <= 0.030001);
      assert.ok(Math.abs((evolvedCharacter?.relationshipScore ?? 0) - persistentWorld.characters[0]!.relationshipScore) <= 0.020001);
      await recordLlmUsage({
        context: {
          companionId: companion.id,
          correlationId: "00000000-0000-4000-8000-000000000108",
          category: "reflection",
        },
        model: "fixture/model:free",
        promptTokens: 120,
        completionTokens: 30,
        totalTokens: 150,
        costUsd: 0,
        latencyMs: 42,
        usedFallback: false,
      });
      const [usage] = await db.select().from(llmUsageLogs).where(eq(llmUsageLogs.companionId, companion.id));
      assert.equal(usage?.totalTokens, 150);

      const enqueueInput = {
        userId: user.id,
        companionId: companion.id,
        chatId: "integration-chat",
        text: "first bubble\nsecond bubble",
        rawJson: { integration: true },
        correlationId: "00000000-0000-4000-8000-000000000109",
        sourceType: "proactive" as const,
        sourceId: `integration-outbox:${suffix}`,
        idempotencyBase: `integration-outbox:${suffix}`,
        annotation: {
          topics: [{ name: "integration", confidence: 1 }],
          emotion: "neutral",
          intent: "outbox_test",
          importance: 0.5,
          novelty: 0.5,
          summary: "outbox integration",
          worldSignals: [],
        },
      };
      const enqueued = await Promise.all([
        enqueueAssistantMessage(enqueueInput),
        enqueueAssistantMessage(enqueueInput),
      ]);
      assert.equal(enqueued.filter((item) => item.created).length, 1);
      const logicalMessage = enqueued.find((item) => item.message)?.message;
      assert.ok(logicalMessage);
      assert.equal((await listMessageOutbox(logicalMessage.id)).length, 2);
      let transportCalls = 0;
      const delivery = await drainTelegramOutbox(logicalMessage.id, 6, async () => {
        transportCalls += 1;
        if (transportCalls === 2) {
          throw new TelegramSendError("fixture timeout", "delivery_unknown", false);
        }
        return { messageId: 9001, raw: { ok: true, result: { message_id: 9001 } } };
      });
      assert.deepEqual(delivery, { delivered: 1, failed: 0, unknown: 1 });
      const outboxRows = await db
        .select()
        .from(messageOutbox)
        .where(eq(messageOutbox.messageId, logicalMessage.id));
      assert.deepEqual(outboxRows.map((row) => row.status).sort(), ["delivered", "delivery_unknown"]);

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
      assert.equal(externalWrite.inserted, 2);
      assert.equal(externalWrite.duplicates, 1);
      assert.equal(externalWrite.insertedFacts.length, 1);
      const externalRows = await db
        .select({ status: externalInformation.status })
        .from(externalInformation)
        .where(eq(externalInformation.companionId, companion.id));
      assert.deepEqual(
        externalRows.map((row) => row.status).sort(),
        ["ignored", "new"],
      );

      const park = persistentWorld.places.find(
        (place) => place.canonicalKey === "seed:beijing:place:chaoyang-park",
      );
      assert.ok(park);
      const [rainFact] = await db
        .insert(externalInformation)
        .values({
          companionId: companion.id,
          idempotencyKey: `integration-weather:${suffix}`,
          sourceName: "Open-Meteo fixture",
          title: "北京降雨",
          factualSummary: "北京傍晚持续降雨。",
          category: "weather",
          factsJson: { condition: "rain" },
          fetchedAt: new Date("2026-07-10T08:30:00.000Z"),
          beijingRelevance: 1,
          personalRelevance: 1,
          reliability: 0.9,
          novelty: 0.8,
        })
        .returning();
      assert.ok(rainFact);
      const [outdoorPlan] = await db
        .insert(scheduleBlocks)
        .values({
          companionId: companion.id,
          idempotencyKey: `integration-outdoor-plan:${suffix}`,
          title: "下班后去朝阳公园散步",
          type: "exploration",
          startAt: new Date("2026-07-10T11:00:00.000Z"),
          endAt: new Date("2026-07-10T13:00:00.000Z"),
          localDate: "2026-07-10",
          locationId: park.id,
          status: "planned",
          source: "mira_decision",
        })
        .returning();
      assert.ok(outdoorPlan);
      const weatherAdjustment = await applyWeatherScheduleAdjustment({
        companionId: companion.id,
        now: new Date("2026-07-10T08:30:00.000Z"),
        weatherRisk: 0.8,
        weatherSummary: rainFact.factualSummary,
      });
      assert.equal(weatherAdjustment.adjusted, true);
      const [changedOutdoorPlan] = await db
        .select()
        .from(scheduleBlocks)
        .where(eq(scheduleBlocks.id, outdoorPlan.id));
      assert.equal(changedOutdoorPlan?.status, "changed");
      assert.notEqual(changedOutdoorPlan?.locationId, park.id);
      assert.equal((await applyWeatherScheduleAdjustment({
        companionId: companion.id,
        now: new Date("2026-07-10T08:31:00.000Z"),
        weatherRisk: 0.8,
        weatherSummary: rainFact.factualSummary,
      })).adjusted, false);
      // This isolated weather fixture is not a complete daily schedule. Remove
      // it before the world-tick scenario so the planner can create the real
      // continuous day and the catch-up assertion tests production behavior.
      await db.delete(scheduleBlocks).where(eq(scheduleBlocks.id, outdoorPlan.id));

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
      assert.ok(state.version >= 2 && state.version <= 4);
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
      assert.equal(actorContext.temporal.worldStateFresh, true);
      assert.equal(actorContext.currentActivity?.id, state.currentScheduleBlockId);
      assert.equal(
        actorContext.schedule.filter((block) => block.status === "active").length,
        1,
      );
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
      assert.equal(completedRuns.length, 2);
      assert.ok(completedRuns.every((run) => run.status === "completed"));

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
