import { randomUUID } from "node:crypto";
import { systemClock } from "@/platform/time";
import type {
  ActionPlan,
  CompanionState,
  MessageAnalysis,
  RuntimeConfig,
} from "@/core/types";
import {
  ensureCompanionContext,
  claimMessageProcessing,
  completeMessageProcessing,
  countTodayToolCalls,
  createAnnotation,
  createMessage,
  createProactiveLog,
  findAssistantReply,
  findProactiveLogByIdempotencyKey,
  finishMessageProcessing,
  getCompanionState,
  getProactiveStats,
  getRuntimeContext,
  getToolStats,
  listAvailableMemories,
  listRecentAnnotations,
  listRecentMessages,
  renewMessageProcessing,
  updateProactiveLog,
  useMemories,
} from "@/db/repo";
import {
  enqueueAssistantMessage,
  listMessageOutbox,
  type EnqueueAssistantInput,
} from "@/db/messageOutboxRepo";
import { applyUserWorldSignals } from "@/db/interactionRepo";
import { persistWebCitations } from "@/db/providerRepo";
import { listActiveSharedKnowledge } from "@/db/interactionRepo";
import {
  hasWaitingProactiveReply,
  resolveAwaitingReplies,
} from "@/db/awaitingReplyRepo";
import {
  claimShareCandidate,
  countTodayLifeShares,
  listPendingShareCandidates,
  markShareCandidateShared,
  markPendingCandidateSharedInReply,
  releaseShareCandidate,
  updateShareCandidateScore,
} from "@/db/shareRepo";
import { logRuntimeEvent } from "@/core/eventLog";
import {
  buildActorGroundedContext,
  savePromptContextSnapshot,
} from "@/core/actorContext";
import {
  computeMirrorIndex,
  computeRepetitionScore,
  computeTopicEntropy,
} from "@/core/metrics";
import { runActor } from "@/core/runtime/actorRunner";
import { getPrimaryRuntimeContext } from "@/core/runtime/context";
import { hoursSince, isQuietHours } from "@/lib/time";
import { analyzeMessage } from "@/psyche/analyzer";
import { directAction } from "@/psyche/egoDirector";
import {
  applyInteractionGrowth,
  applyProactiveGrowth,
  type StateChangeDraft,
} from "@/psyche/growthEngine";
import { assessDrives } from "@/psyche/idDrive";
import {
  memoryCooldownWarnings,
  selectRelevantMemories,
  shouldStoreMemory,
} from "@/psyche/memory";
import { drainTelegramOutbox } from "@/messaging/outbox";
import { scoreShareCandidate } from "@/world/share";
import type { TelegramTextMessage } from "@/telegram/webhook";
import { TOOL_REGISTRY, type ToolExecution } from "@/tools/registry";

export { runDailyReflection } from "@/core/runtime/dailyReflection";

type RuntimeContext = NonNullable<Awaited<ReturnType<typeof getRuntimeContext>>>;
const SAFETY_REPLY =
  "我先认真一点：如果你现在可能伤害自己，或正处于立即危险，请立刻联系当地紧急服务，并马上联系一个你信任、能到场的人。先离开危险物品和独处环境，去有人的地方。你现在是否处于立即危险？";

function runtimeConfig(context: RuntimeContext): RuntimeConfig {
  return context.companion.configJson;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function topicNames(
  annotations: Array<{ topicsJson: unknown; messageRole?: string }>,
  role: "user" | "assistant",
): string[] {
  return annotations.flatMap((annotation) =>
    annotation.messageRole === role && Array.isArray(annotation.topicsJson)
      ? annotation.topicsJson
          .map((topic) => asObject(topic)?.name)
          .filter((name): name is string => typeof name === "string")
      : [],
  );
}

function buildAssistantAnnotation(
  input: {
    text: string;
    plan: ActionPlan;
    analysis: MessageAnalysis;
    proactive?: boolean;
    safety?: boolean;
  },
) {
  const topics = input.analysis.topics;
  const uniqueTopics = [...new Map(topics.map((topic) => [topic.name, topic])).values()].slice(0, 8);
  return {
    topics: uniqueTopics.length ? uniqueTopics : [{ name: "daily_life", confidence: 0.5 }],
    emotion: input.safety
      ? "concerned"
      : input.plan.mode === "emotional_support"
        ? "supportive"
        : "composed",
    intent: input.safety ? "safety_response" : input.plan.mode,
    importance: input.safety ? 1 : input.proactive ? 0.48 : Math.max(0.35, input.analysis.importance * 0.8),
    novelty: Math.min(0.75, input.analysis.novelty),
    summary: input.text.length > 120 ? `${input.text.slice(0, 117)}...` : input.text,
    worldSignals: [],
  } satisfies MessageAnalysis;
}

function toolCallWrite(execution: ToolExecution | null, reason: string) {
  if (!execution) return null;
  return {
    toolName: execution.toolName,
    argsJson: execution.args,
    resultJson: execution.ok ? execution.result : { error: execution.error },
    reason,
  };
}

function awaitingReplyDraft(input: {
  text: string;
  messageKind: "reply" | "proactive";
  userSaidBusy: boolean;
  vulnerableDisclosure?: boolean;
  userCommitment?: boolean;
}) {
  const explicitQuestion = /[?？]/.test(input.text);
  const vulnerableDisclosure = input.vulnerableDisclosure ?? false;
  return {
    expectation: input.userCommitment
      ? 0.75
      : vulnerableDisclosure
        ? 0.7
        : explicitQuestion
          ? 0.55
          : 0.1,
    emotionalWeight: input.userCommitment
      ? 0.7
      : vulnerableDisclosure
        ? 0.7
        : explicitQuestion
          ? 0.4
          : 0.1,
    explicitQuestion,
    vulnerableDisclosure,
    userCommitment: input.userCommitment ?? false,
    userSaidBusy: input.userSaidBusy,
    messageKind: input.messageKind,
  };
}

async function enqueueWithStateRetry(
  companionId: string,
  input: Omit<EnqueueAssistantInput, "stateMutation">,
  applyGrowth: (state: CompanionState) => { state: CompanionState; changes: StateChangeDraft[] },
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const latest = await getCompanionState(companionId);
    const growth = applyGrowth(latest);
    const result = await enqueueAssistantMessage({
      ...input,
      stateMutation: { expected: latest, next: growth.state, changes: growth.changes },
    });
    if (!result.conflict) return result;
  }
  throw new Error("Companion state changed too often before reply enqueue");
}

async function persistSafetyReply(
  context: RuntimeContext,
  message: TelegramTextMessage,
  analysis: MessageAnalysis,
  userMessageId: string,
  leaseToken: string,
  correlationId: string,
) {
  const plan: ActionPlan = {
    action: "reply",
    mode: "emotional_support",
    memoryBudget: "none",
    toolAllowed: false,
    styleHints: ["direct", "safety-first", "no roleplay"],
    reason: "Deterministic safety override for a crisis expression",
  };
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "psyche.ego.plan",
    source: "safety",
    correlationId,
    payloadJson: plan,
  });
  const assistant = await enqueueWithStateRetry(
    context.companion.id,
    {
    userId: context.user.id,
    companionId: context.companion.id,
    chatId: message.chatId,
    text: SAFETY_REPLY,
    rawJson: {
      safetyMode: true,
      actionPlan: plan,
      replyToTelegramMessageId: message.messageId,
    },
    correlationId,
    sourceType: "safety",
    sourceId: userMessageId,
    idempotencyBase: `reply:${userMessageId}`,
    replyToMessageId: userMessageId,
    processing: { messageId: userMessageId, leaseToken },
    annotation: buildAssistantAnnotation({
      text: SAFETY_REPLY,
      plan,
      analysis,
      safety: true,
    }),
    },
    (state) => applyInteractionGrowth(state, analysis, correlationId),
  );
  if (!assistant.message) throw new Error("Failed to enqueue safety reply");
  const delivery = await drainTelegramOutbox(assistant.message.id);
  return {
    status: "processed" as const,
    safetyMode: true,
    messageId: assistant.message.id,
    delivery,
  };
}

export async function handleTelegramMessage(message: TelegramTextMessage) {
  const correlationId = randomUUID();
  const context = await ensureCompanionContext({
    telegramUserId: message.userId,
    displayName: message.displayName,
  });
  const userMessage = await createMessage({
    userId: context.user.id,
    companionId: context.companion.id,
    role: "user",
    text: message.text,
    rawJson: message.raw,
    telegramMessageId: message.messageId,
    chatId: message.chatId,
    correlationId,
    sourceType: "telegram_inbound",
    sourceId: `${message.chatId}:${message.messageId}`,
    processingStatus: "received",
  });
  if (await findAssistantReply(userMessage.row.id)) {
    await completeMessageProcessing(userMessage.row.id);
    return { status: "duplicate" as const };
  }

  const claim = await claimMessageProcessing(userMessage.row.id);
  if (!claim) {
    return userMessage.row.processingStatus === "completed"
      ? { status: "duplicate" as const }
      : { status: "in_progress" as const };
  }
  if (!claim.processingLeaseToken) throw new Error("Telegram processing claim has no lease token");

  try {
    return await processTelegramMessage(
      context,
      userMessage,
      message,
      claim.processingLeaseToken,
      userMessage.row.correlationId ?? correlationId,
    );
  } catch (error) {
    await finishMessageProcessing(
      userMessage.row.id,
      claim.processingLeaseToken,
      "failed",
    ).catch((finishError) => {
      console.error("Failed to release Telegram processing claim", finishError);
    });
    throw error;
  }
}

async function processTelegramMessage(
  context: RuntimeContext,
  userMessage: Awaited<ReturnType<typeof createMessage>>,
  message: TelegramTextMessage,
  leaseToken: string,
  correlationId: string,
) {

  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "user.message",
    source: "telegram",
    correlationId,
    payloadJson: {
      messageId: userMessage.row.id,
      telegramMessageId: message.messageId,
      correlationId,
      resumed: !userMessage.created,
    },
  });
  await resolveAwaitingReplies({
    companionId: context.companion.id,
    userMessageId: userMessage.row.id,
    explanationProvided: /(?:忙|加班|开会|没看到|没来得及|睡着|抱歉|刚回来)/.test(
      message.text,
    ),
    correlationId,
  });
  const config = runtimeConfig(context);
  const analyzed = await analyzeMessage(message.text, config.model, {
    companionId: context.companion.id,
    correlationId,
    category: "analyzer",
  });
  if (!await renewMessageProcessing(userMessage.row.id, leaseToken)) {
    throw new Error("Telegram processing lease expired during analysis");
  }
  await createAnnotation({
    messageId: userMessage.row.id,
    topicsJson: analyzed.analysis.topics,
    emotion: analyzed.analysis.emotion,
    intent: analyzed.analysis.intent,
    importance: analyzed.analysis.importance,
    novelty: analyzed.analysis.novelty,
    summary: analyzed.analysis.summary,
  });
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "psyche.analyzer",
    source: "analyzer",
    correlationId,
    payloadJson: {
      analysis: analyzed.analysis,
      usedFallback: analyzed.usedFallback,
      error: analyzed.error,
    },
  });
  if (analyzed.analysis.intent === "safety_crisis") {
    return persistSafetyReply(
      context,
      message,
      analyzed.analysis,
      userMessage.row.id,
      leaseToken,
      correlationId,
    );
  }

  await applyUserWorldSignals({
    userId: context.user.id,
    companionId: context.companion.id,
    messageId: userMessage.row.id,
    messageText: message.text,
    analysis: analyzed.analysis,
    correlationId,
  });

  const timeZone = config.policy.quietHours.timeZone;
  const [
    recentMessages,
    recentAnnotations,
    availableMemories,
    toolCallsToday,
    photoToolStats,
  ] =
    await Promise.all([
      listRecentMessages(context.companion.id, 30),
      listRecentAnnotations(context.companion.id, 50),
      listAvailableMemories(context.companion.id, 100),
      countTodayToolCalls(context.companion.id, timeZone),
      getToolStats(context.companion.id, "generate_fake_photo", timeZone),
    ]);
  const recentAssistant = recentMessages.filter((item) => item.role === "assistant").slice(0, 10);
  const topicEntropy = computeTopicEntropy(recentAnnotations);
  const repetitionScore = computeRepetitionScore(recentAssistant);
  const mirrorIndex = computeMirrorIndex(
    topicNames(recentAnnotations, "user"),
    topicNames(recentAnnotations, "assistant"),
  );
  const selectedMemories = selectRelevantMemories(
    availableMemories,
    message.text,
    analyzed.analysis,
  );
  if (selectedMemories.length) {
    await useMemories(selectedMemories.map((memory) => memory.id), timeZone);
  }
  const driveAssessment = assessDrives(context.state, analyzed.analysis);
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "psyche.id.drive",
    source: "id",
    correlationId,
    payloadJson: driveAssessment,
  });
  const directed = await directAction({
    kind: "user",
    state: context.state,
    analysis: analyzed.analysis,
    memories: selectedMemories,
    driveAssessment,
    topicEntropy,
    repetitionScore,
    mirrorIndex,
    config,
    usageContext: { companionId: context.companion.id, correlationId, category: "ego" },
  });
  const photoCooldownBlocked =
    hoursSince(photoToolStats.lastUsedAt) < TOOL_REGISTRY.generate_fake_photo.cooldownHours;
  const plan: ActionPlan = {
    ...directed.plan,
    toolAllowed:
      directed.plan.toolAllowed &&
      toolCallsToday < config.policy.toolDailyLimit &&
      !photoCooldownBlocked,
  };
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "psyche.ego.plan",
    source: "ego",
    correlationId,
    payloadJson: { ...plan, usedFallback: directed.usedFallback, error: directed.error },
  });

  const groundedContext = await buildActorGroundedContext({
    companionId: context.companion.id,
    config,
    state: context.state,
    currentMessageId: userMessage.row.id,
    memories: selectedMemories,
    relevanceText: message.text,
    relevantTopics: analyzed.analysis.topics.map((topic) => topic.name),
  });
  const acted = await runActor({
    config,
    state: context.state,
    plan,
    memories: selectedMemories,
    cooldownWarnings: [
      ...memoryCooldownWarnings(selectedMemories),
      ...(toolCallsToday >= config.policy.toolDailyLimit ? ["Daily tool limit reached; no tool call is allowed."] : []),
      ...(photoCooldownBlocked
        ? [`generate_fake_photo is in its ${TOOL_REGISTRY.generate_fake_photo.cooldownHours}h cooldown.`]
        : []),
    ],
    analysis: analyzed.analysis,
    userMessage: message.text,
    recentMessages: recentMessages
      .filter((item) => item.id !== userMessage.row.id)
      .map((item) => ({ role: item.role, text: item.text })),
    groundedContext,
    usageContext: { companionId: context.companion.id, correlationId, category: "actor" },
  });
  if (!await renewMessageProcessing(userMessage.row.id, leaseToken)) {
    throw new Error("Telegram processing lease expired during actor generation");
  }
  await Promise.all([
    savePromptContextSnapshot({
      companionId: context.companion.id,
      correlationId,
      messageId: userMessage.row.id,
      purpose: "reply",
      ...acted.promptDebug,
    }),
    persistWebCitations({
      companionId: context.companion.id,
      citations: acted.citations,
      fetchedAt: new Date(),
      correlationId,
    }),
  ]);
  const memoryCandidate = shouldStoreMemory(
    acted.actorOutput.memoryCandidate,
    config.policy.memoryWriteThreshold,
  )
    ? acted.actorOutput.memoryCandidate
    : null;
  const assistant = await enqueueWithStateRetry(
    context.companion.id,
    {
      userId: context.user.id,
      companionId: context.companion.id,
      chatId: message.chatId,
      text: acted.finalText,
      rawJson: {
        actionPlan: plan,
        actorRaw: acted.actorRaw,
        actorFactClaims: acted.actorOutput.factClaims,
        actorGroundingRefs: acted.actorOutput.groundingRefs,
        groundingValidation: acted.grounding,
        webCitations: acted.citations,
        selectedMemories: selectedMemories.map((memory) => memory.id),
        topicEntropy,
        mirrorIndex,
        repetitionScore,
        replyToTelegramMessageId: message.messageId,
      },
      correlationId,
      sourceType: "telegram_reply",
      sourceId: userMessage.row.id,
      idempotencyBase: `reply:${userMessage.row.id}`,
      replyToMessageId: userMessage.row.id,
      processing: { messageId: userMessage.row.id, leaseToken },
      annotation: buildAssistantAnnotation({
        text: acted.finalText,
        plan,
        analysis: analyzed.analysis,
      }),
      memoryCandidate,
      toolCall: toolCallWrite(acted.toolExecution, plan.reason),
      awaitingReply: awaitingReplyDraft({
        text: acted.finalText,
        messageKind: "reply",
        userSaidBusy: analyzed.analysis.worldSignals.some(
          (signal) => signal.type === "user_busy",
        ),
      }),
    },
    (state) => applyInteractionGrowth(state, analyzed.analysis, correlationId),
  );
  if (!assistant.message) throw new Error("Failed to enqueue assistant reply");
  const reactiveCandidate = groundedContext.shareCandidate;
  const reactiveCandidateId = typeof reactiveCandidate?.id === "string" ? reactiveCandidate.id : null;
  const reactiveSourceId = typeof reactiveCandidate?.sourceId === "string" ? reactiveCandidate.sourceId : null;
  const reactiveSummary = typeof reactiveCandidate?.contentSummary === "string"
    ? reactiveCandidate.contentSummary.slice(0, 24)
    : "";
  const usedReactiveCandidate = Boolean(
    reactiveCandidateId && (
      acted.actorOutput.groundingRefs.includes(reactiveCandidateId) ||
      (reactiveSourceId && acted.actorOutput.groundingRefs.includes(reactiveSourceId)) ||
      (reactiveSummary.length >= 8 && acted.finalText.includes(reactiveSummary))
    ),
  );
  if (usedReactiveCandidate && reactiveCandidateId) {
    await markPendingCandidateSharedInReply(reactiveCandidateId, assistant.message.id);
  }
  if (!assistant.created) await completeMessageProcessing(userMessage.row.id);
  const delivery = await drainTelegramOutbox(assistant.message.id);
  return {
    status: "processed" as const,
    safetyMode: false,
    messageId: assistant.message.id,
    delivery,
  };
}

async function writeProactiveLog(
  context: RuntimeContext,
  input: {
    shouldSend: boolean;
    reason: string;
    selectedMode?: string | null;
    sentMessageId?: string | null;
    sentText?: string | null;
    quietHoursBlocked?: boolean;
    dailyLimitBlocked?: boolean;
    intervalBlocked?: boolean;
    idempotencyKey?: string | null;
    score: number;
  },
) {
  return createProactiveLog({
    userId: context.user.id,
    companionId: context.companion.id,
    selectedMode: null,
    sentMessageId: null,
    sentText: null,
    quietHoursBlocked: false,
    dailyLimitBlocked: false,
    intervalBlocked: false,
    ...input,
  });
}

type ProactiveRunResult = {
  sent: boolean;
  reason: string;
  score?: number;
  scoreThreshold?: number;
  messageId?: string;
};

let hourlyRun: Promise<ProactiveRunResult> | null = null;

export async function runHourlyProactive(now = systemClock.now()): Promise<ProactiveRunResult> {
  if (hourlyRun) return { sent: false, reason: "already_running" };
  hourlyRun = runCandidateHourlyProactiveOnce(now);
  try {
    return await hourlyRun;
  } finally {
    hourlyRun = null;
  }
}

async function runCandidateHourlyProactiveOnce(now: Date): Promise<ProactiveRunResult> {
  const context = await getPrimaryRuntimeContext();
  const config = runtimeConfig(context);
  const timeZone = config.policy.quietHours.timeZone;
  const windowStart = new Date(now);
  windowStart.setUTCMinutes(0, 0, 0);
  const idempotencyKey = `hourly:${context.companion.id}:${windowStart.toISOString()}`;
  const existingCheck = await findProactiveLogByIdempotencyKey(idempotencyKey);
  if (existingCheck && (!existingCheck.shouldSend || existingCheck.sentMessageId)) {
    return {
      sent: Boolean(existingCheck.sentMessageId),
      reason: "already_checked",
      score: existingCheck.score ?? undefined,
      messageId: existingCheck.sentMessageId ?? undefined,
    };
  }

  const [stats, candidates, sharedKnowledge, recentMessages, unansweredProactive, lifeSharesToday] =
    await Promise.all([
      getProactiveStats(context.companion.id, timeZone),
      listPendingShareCandidates(context.companion.id, now),
      listActiveSharedKnowledge(context.companion.id, now, 30),
      listRecentMessages(context.companion.id, 30),
      hasWaitingProactiveReply(context.companion.id),
      countTodayLifeShares(context.companion.id, timeZone),
    ]);
  const userLikelyBusy = sharedKnowledge.some(
    (item) => item.subject === "用户当前可能忙碌",
  );
  const evaluations = candidates
    .map((candidate) => ({
      candidate,
      evaluation: scoreShareCandidate(candidate, {
        currentShareDesire: context.state.drives.shareDesire,
        eventImportance: candidate.eventImportance,
        relationshipTrust: context.state.relationship.trust,
        miraIrritation: context.state.mood.irritation,
        quietHours: isQuietHours(now, config.policy.quietHours),
        userLikelyBusy,
        hasUnansweredProactive: unansweredProactive,
        dailySentCount: ["inner_thought", "world_event", "open_loop"].includes(candidate.sourceType)
          ? lifeSharesToday
          : stats.sentToday,
        dailyLimit: ["inner_thought", "world_event", "open_loop"].includes(candidate.sourceType)
          ? 2
          : config.policy.proactiveMaxPerDay,
        hoursSinceLastProactive: hoursSince(stats.lastSentAt, now),
        minimumIntervalHours: config.policy.minimumProactiveIntervalHours,
      }),
    }))
    .sort(
      (left, right) =>
        left.candidate.priority - right.candidate.priority ||
        right.evaluation.score - left.evaluation.score ||
        left.candidate.createdAt.getTime() - right.candidate.createdAt.getTime(),
    );
  await Promise.all(
    evaluations.map(({ candidate, evaluation }) =>
      updateShareCandidateScore(candidate.id, evaluation.score),
    ),
  );
  const selected = evaluations.find(({ evaluation }) => evaluation.shouldShare);
  const best = selected ?? evaluations[0];
  if (!best) {
    await writeProactiveLog(context, {
      shouldSend: false,
      reason: "No persisted share candidate is available",
      idempotencyKey,
      score: 0,
    });
    return { sent: false, reason: "no_candidate", score: 0 };
  }
  if (!selected) {
    const reason = `Candidate blocked: ${best.evaluation.blockedBy.join(", ")}`;
    await writeProactiveLog(context, {
      shouldSend: false,
      reason,
      idempotencyKey,
      score: best.evaluation.score,
      quietHoursBlocked: best.evaluation.blockedBy.includes("quiet_hours"),
      dailyLimitBlocked: best.evaluation.blockedBy.includes("daily_limit"),
      intervalBlocked: best.evaluation.blockedBy.includes("minimum_interval"),
    });
    return { sent: false, reason, score: best.evaluation.score, scoreThreshold: 0.62 };
  }

  const claimed = await claimShareCandidate(selected.candidate.id, selected.evaluation.score, now);
  if (!claimed) return { sent: false, reason: "candidate_claimed_elsewhere" };
  const candidate = selected.candidate;
  const analysis: MessageAnalysis = {
    topics: [{ name: candidate.sourceType, confidence: 0.9 }],
    emotion: candidate.emotionalIntensity >= 0.6 ? "emotionally_engaged" : "reflective",
    intent: "share_persisted_world_event",
    importance: candidate.eventImportance,
    novelty: candidate.novelty,
    summary: candidate.contentSummary,
    worldSignals: [],
  };
  const plan: ActionPlan = {
    action: "proactive_message",
    mode: "quiet_observation",
    memoryBudget: "light",
    toolAllowed: false,
    webAccess: "none",
    styleHints: ["short", "specific", "grounded in the selected persisted event"],
    reason: `${candidate.reasonToShare}; score=${selected.evaluation.score.toFixed(3)}`,
  };
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "psyche.ego.plan",
    source: "ego.proactive",
    correlationId: claimed.row.correlationId,
    payloadJson: { plan, shareCandidateId: candidate.id, evaluation: selected.evaluation },
  });

  const selectedMemories = selectRelevantMemories(
    await listAvailableMemories(context.companion.id, 60),
    candidate.contentSummary,
    analysis,
    2,
  );
  const reservation = existingCheck ?? await writeProactiveLog(context, {
    shouldSend: true,
    reason: `Reserved persisted candidate ${candidate.id}`,
    selectedMode: plan.mode,
    idempotencyKey,
    score: selected.evaluation.score,
  });
  const groundedContext = await buildActorGroundedContext({
    companionId: context.companion.id,
    config,
    state: context.state,
    shareCandidateId: candidate.id,
    memories: selectedMemories,
    relevanceText: candidate.contentSummary,
    relevantTopics: [candidate.sourceType],
    now,
  });
  const acted = await runActor({
    config,
    state: context.state,
    plan,
    memories: selectedMemories,
    cooldownWarnings: ["Only describe facts contained in the selected persisted candidate."],
    analysis,
    userMessage: null,
    recentMessages: recentMessages.map((message) => ({ role: message.role, text: message.text })),
    groundedContext,
    usageContext: {
      companionId: context.companion.id,
      correlationId: reservation.id,
      category: "actor",
      metadata: { proactive: true, shareCandidateId: candidate.id },
    },
  });
  await Promise.all([
    savePromptContextSnapshot({
      companionId: context.companion.id,
      correlationId: reservation.id,
      purpose: "proactive",
      ...acted.promptDebug,
    }),
    persistWebCitations({
      companionId: context.companion.id,
      citations: acted.citations,
      fetchedAt: now,
      correlationId: reservation.id,
    }),
  ]);
  const chatId =
    recentMessages.find((message) => message.role === "user" && message.chatId)?.chatId ??
    context.user.telegramUserId;
  try {
    const assistant = await enqueueWithStateRetry(
      context.companion.id,
      {
        userId: context.user.id,
        companionId: context.companion.id,
        chatId,
        text: acted.finalText,
        rawJson: {
          proactive: true,
          actionPlan: plan,
          actorRaw: acted.actorRaw,
          actorFactClaims: acted.actorOutput.factClaims,
          actorGroundingRefs: acted.actorOutput.groundingRefs,
          groundingValidation: acted.grounding,
          webCitations: acted.citations,
          shareCandidateId: candidate.id,
          groundingSourceId: candidate.sourceId,
          score: selected.evaluation.score,
        },
        correlationId: reservation.id,
        sourceType: "proactive",
        sourceId: candidate.id,
        idempotencyBase: `proactive:${candidate.id}`,
        annotation: buildAssistantAnnotation({
          text: acted.finalText,
          plan,
          analysis,
          proactive: true,
        }),
        memoryCandidate: null,
        toolCall: null,
        proactiveLogId: reservation.id,
        awaitingReply: awaitingReplyDraft({
          text: acted.finalText,
          messageKind: "proactive",
          userSaidBusy: false,
          vulnerableDisclosure:
            candidate.emotionalIntensity >= 0.65 && candidate.intimacy >= 0.5,
          // `user_follow_up` also covers ordinary follow-ups and the single bounded
          // dissatisfaction candidate. Only an explicit persisted commitment may
          // receive the stronger "missed promise" consequence.
          userCommitment:
            candidate.sourceType === "user_follow_up" &&
            /(?:用户承诺|user commitment)/i.test(
              `${candidate.reasonToShare} ${candidate.contentSummary}`,
            ),
        }),
      },
      applyProactiveGrowth,
    );
    if (!assistant.message) throw new Error("Failed to enqueue proactive candidate");
    if (!await markShareCandidateShared({
      id: candidate.id,
      leaseToken: claimed.leaseToken,
      messageId: assistant.message.id,
      now,
    })) {
      throw new Error("Share candidate lease was lost after enqueue");
    }
    await updateProactiveLog(reservation.id, { reason: plan.reason });
    const delivery = await drainTelegramOutbox(assistant.message.id);
    const outbox = await listMessageOutbox(assistant.message.id);
    const delivered = outbox.length > 0 && outbox.every((item) => item.status === "delivered");
    await logRuntimeEvent({
      userId: context.user.id,
      companionId: context.companion.id,
      type: delivered ? "proactive.sent" : "proactive.queued",
      source: "cron.hourly",
      correlationId: reservation.id,
      payloadJson: {
        messageId: assistant.message.id,
        shareCandidateId: candidate.id,
        score: selected.evaluation.score,
        delivery,
      },
    });
    return {
      sent: delivered,
      reason: plan.reason,
      score: selected.evaluation.score,
      messageId: assistant.message.id,
    };
  } catch (error) {
    await releaseShareCandidate(
      candidate.id,
      claimed.leaseToken,
      error instanceof Error ? error.message : "proactive enqueue failed",
      now,
    ).catch(() => false);
    throw error;
  }
}
