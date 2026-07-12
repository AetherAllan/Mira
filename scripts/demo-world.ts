import assert from "node:assert/strict";
import { buildDailySchedule } from "@/world/planner";
import { generateOrdinaryWorldEvent } from "@/world/events";
import { buildThoughtAndShareCandidate } from "@/world/thoughts";
import { scoreShareCandidate } from "@/world/share";
import { planWeatherScheduleAdjustment } from "@/world/weather";
import { inferWorldSignals } from "@/world/userSignals";
import { evaluateAwaitingReply, resolveAwaitingReply } from "@/world/awaitingReply";
import type { AwaitingReply, ShareCandidate } from "@/world/types";

const companionId = "00000000-0000-4000-8000-000000000001";
const correlationId = "00000000-0000-4000-8000-000000000002";
const friday = new Date("2026-07-10T00:00:00.000Z");
const rainObservedAt = new Date("2026-07-10T09:45:00.000Z");
const park = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "朝阳公园",
  category: "park",
  latitude: 39.937,
  longitude: 116.474,
};
const bookstore = {
  id: "00000000-0000-4000-8000-000000000011",
  name: "附近书店",
  category: "book_store",
  latitude: 39.939,
  longitude: 116.476,
};

const schedule = buildDailySchedule({
  companionId,
  date: friday,
  homeLocationId: "home",
  workLocationId: "work",
  optionalLocationId: park.id,
  seed: "acceptance-friday-plan",
  correlationId,
});
const evening = schedule.find((block) => block.locationId === park.id);
assert.ok(evening, "fixture seed must create an optional evening block");

const adjustment = planWeatherScheduleAdjustment({
  schedule,
  places: [park, bookstore],
  now: rainObservedAt,
  weatherRisk: 0.8,
  weatherSummary: "北京傍晚持续降雨",
});
assert.ok(adjustment);
assert.equal(adjustment.indoorPlaceId, bookstore.id);

const event = generateOrdinaryWorldEvent({
  companionId,
  occurredAt: new Date("2026-07-10T11:30:00.000Z"),
  locationId: bookstore.id,
  scheduleType: "exploration",
  correlationId,
  seed: "acceptance-bookstore-event",
  existingEvents: [],
  eventChance: 1,
  nonTemplateDraft: {
    type: "routine",
    title: "躲雨时翻到一本旧游戏杂志",
    description: "书页有点旧，里面的广告比正文更有年代感。",
    emotionalImpact: { curiosity: 0.1, boredom: -0.05, shareDesire: 0.12 },
    consequences: ["记下这家书店的旧杂志架，之后可以再来"],
    importance: 0.65,
    sharePotential: 0.7,
  },
});
assert.ok(event);
const generated = buildThoughtAndShareCandidate(event);
assert.ok(generated);
assert.ok(generated.candidate);

// A persisted event may become more user-relevant when it touches a known
// shared interest. This enrichment changes sharing motivation, not the fact.
const candidate: ShareCandidate = {
  ...generated.candidate,
  relevanceToUser: 1,
  emotionalIntensity: 0.9,
  novelty: 0.9,
  intimacy: 0.7,
  urgency: 0.8,
  interruptionCost: 0.1,
  reasonToShare: "这件已发生的小事碰到了双方聊过的游戏兴趣",
};
const share = scoreShareCandidate(candidate, {
  currentShareDesire: 0.9,
  eventImportance: event.importance,
  relationshipTrust: 0.75,
  miraIrritation: 0.1,
  quietHours: false,
  userLikelyBusy: false,
  hasUnansweredProactive: false,
  dailySentCount: 0,
  hoursSinceLastProactive: 8,
});
assert.equal(share.shouldShare, true);

const fakeTelegram: string[] = [];
fakeTelegram.push("本来想去公园，雨把我赶进了附近书店。翻到一本旧游戏杂志，广告比正文好看，有点荒唐。你会留这种东西吗？");
const recommendationSignals = inferWorldSignals(
  "你下次可以去三联韬奋书店看看，我觉得你会喜欢。",
  new Date("2026-07-10T12:00:00.000Z"),
);
assert.ok(recommendationSignals.some((signal) => signal.type === "place_recommendation"));
assert.ok(recommendationSignals.some((signal) => signal.type === "mira_suggestion"));

const awaiting: AwaitingReply = {
  id: "00000000-0000-4000-8000-000000000020",
  companionId,
  messageId: "00000000-0000-4000-8000-000000000021",
  startedAt: new Date("2026-07-10T10:00:00.000Z"),
  expectation: 0.75,
  emotionalWeight: 0.8,
  explicitQuestion: true,
  vulnerableDisclosure: true,
  userSaidBusy: false,
  status: "waiting",
};
const timeout = evaluateAwaitingReply(awaiting, new Date("2026-07-10T23:00:00.000Z"));
assert.ok(timeout.disappointmentDelta > 0);
assert.equal(timeout.irritationDelta, 0);
const recovery = resolveAwaitingReply(
  timeout.awaitingReply,
  new Date("2026-07-11T01:00:00.000Z"),
  true,
);
assert.ok(recovery.disappointmentDelta < 0);
assert.ok(Math.abs(recovery.disappointmentDelta) < timeout.disappointmentDelta);

console.log(JSON.stringify({
  fixedBeijingDate: "2026-07-10 (Friday)",
  schedule: { workBlock: "10:00-18:00", originalEveningPlace: park.name },
  weather: { risk: 0.8, decision: adjustment.reason, replacement: bookstore.name },
  causalChain: {
    worldEventId: event.id,
    innerThoughtId: generated.thought.id,
    shareCandidateId: candidate.id,
    shareScore: share.score,
    fakeTelegram,
  },
  userInfluence: recommendationSignals.map((signal) => signal.type),
  awaitingReply: {
    timeoutReason: timeout.reason,
    disappointmentDelta: timeout.disappointmentDelta,
    irritationDelta: timeout.irritationDelta,
    explanationRecovery: recovery.disappointmentDelta,
  },
}, null, 2));
