import { createHash, randomUUID } from "node:crypto";
import type {
  ActionPlan,
  CompanionState,
  MessageAnalysis,
  RuntimeConfig,
  SeedCard,
} from "@/core/types";
import {
  bootstrapCompanion,
  applyDailyReflectionTransaction,
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
  listEnabledSeeds,
  listRecentAnnotations,
  listRecentMessages,
  listTodayActivity,
  renewMessageProcessing,
  updateProactiveLog,
  useMemories,
} from "@/db/repo";
import {
  enqueueAssistantMessage,
  listMessageOutbox,
  type EnqueueAssistantInput,
} from "@/db/messageOutboxRepo";
import { logRuntimeEvent } from "@/core/eventLog";
import {
  computeMirrorIndex,
  computeProactiveScore,
  computeRepetitionScore,
  computeTopicEntropy,
  isEchoReply,
} from "@/core/metrics";
import { hoursSince, isQuietHours, zonedDateKey } from "@/lib/time";
import { act } from "@/psyche/actor";
import { analyzeMessage } from "@/psyche/analyzer";
import { directAction } from "@/psyche/egoDirector";
import {
  applyDailyReflection,
  applyInteractionGrowth,
  applyProactiveGrowth,
  reflectOnDay,
  type StateChangeDraft,
} from "@/psyche/growthEngine";
import { assessDrives } from "@/psyche/idDrive";
import {
  memoryCooldownWarnings,
  selectRelevantMemories,
  shouldStoreMemory,
} from "@/psyche/memory";
import { selectNoveltySeed } from "@/psyche/noveltyEngine";
import { drainTelegramOutbox } from "@/messaging/outbox";
import type { TelegramTextMessage } from "@/telegram/webhook";
import { executeTool, TOOL_REGISTRY, type ToolExecution } from "@/tools/registry";

type RuntimeContext = NonNullable<Awaited<ReturnType<typeof getRuntimeContext>>>;
type RecentMessage = Awaited<ReturnType<typeof listRecentMessages>>[number];

interface ActorResult {
  finalText: string;
  actorOutput: Awaited<ReturnType<typeof act>>["output"];
  actorRaw: unknown;
  toolExecution: ToolExecution | null;
}

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

function toSeed(row: {
  id?: string;
  type: string;
  text: string;
  tagsJson?: unknown;
  tags?: unknown;
  weight?: number;
  enabled?: boolean;
  usedCount?: number;
  lastUsedAt?: Date | string | null;
}): SeedCard {
  const rawTags = row.tagsJson ?? row.tags;
  return {
    id: row.id,
    type: row.type,
    text: row.text,
    tags: Array.isArray(rawTags) ? rawTags.filter((tag): tag is string => typeof tag === "string") : [],
    weight: row.weight ?? 1,
    enabled: row.enabled ?? true,
    usedCount: row.usedCount ?? 0,
    lastUsedAt: row.lastUsedAt ?? null,
  };
}

function annotationAnalysis(annotation: Record<string, unknown> | undefined): MessageAnalysis {
  const topics = Array.isArray(annotation?.topicsJson)
    ? annotation.topicsJson.filter(
        (topic): topic is { name: string; confidence: number } =>
          Boolean(topic) &&
          typeof topic === "object" &&
          typeof (topic as { name?: unknown }).name === "string" &&
          typeof (topic as { confidence?: unknown }).confidence === "number",
      )
    : [{ name: "daily_life", confidence: 0.5 }];
  return {
    topics,
    emotion: typeof annotation?.emotion === "string" ? annotation.emotion : "neutral",
    intent: typeof annotation?.intent === "string" ? annotation.intent : "conversation",
    importance: typeof annotation?.importance === "number" ? annotation.importance : 0.5,
    novelty: typeof annotation?.novelty === "number" ? annotation.novelty : 0.5,
    summary: typeof annotation?.summary === "string" ? annotation.summary : "",
  };
}

function proactiveTags(messages: RecentMessage[]): string[] {
  return messages.flatMap((message) => {
    const raw = asObject(message.rawJson);
    if (raw?.proactive !== true) return [];
    const seed = asObject(raw.selectedSeed);
    return Array.isArray(seed?.tags) ? seed.tags.filter((tag): tag is string => typeof tag === "string") : [];
  });
}

function userTopicNames(annotations: Array<{ topicsJson: unknown; messageRole?: string }>): string[] {
  return annotations.flatMap((annotation) =>
    annotation.messageRole === "user" && Array.isArray(annotation.topicsJson)
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
    selectedSeed: SeedCard | null;
    proactive?: boolean;
    safety?: boolean;
  },
) {
  const topics = input.proactive && input.selectedSeed
    ? input.selectedSeed.tags.map((name) => ({ name, confidence: 0.78 }))
    : input.selectedSeed
      ? [
          ...input.analysis.topics,
          ...input.selectedSeed.tags.map((name) => ({ name, confidence: 0.62 })),
        ]
      : input.analysis.topics;
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
    novelty: input.selectedSeed ? 0.72 : Math.min(0.65, input.analysis.novelty),
    summary: input.text.length > 120 ? `${input.text.slice(0, 117)}...` : input.text,
  } satisfies MessageAnalysis;
}

function deterministicRoll(...parts: Array<string | number | Date>) {
  const input = parts.map((part) => (part instanceof Date ? part.toISOString() : String(part))).join(":" );
  return createHash("sha256").update(input).digest().readUInt32BE(0) / 0x1_0000_0000;
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

function composeToolResult(message: string, execution: ToolExecution | null): string {
  if (!execution?.ok) return message;
  const description = execution.result.description;
  return typeof description === "string"
    ? `${message}\n\n「生成图像 / 内在世界场景：${description}」`
    : message;
}

// The Actor output goes straight out. Crisis handling still short-circuits earlier,
// and tool names remain constrained by the registry.
async function runActor(input: Parameters<typeof act>[0]): Promise<ActorResult> {
  const recentAssistant = (input.recentMessages ?? [])
    .filter((item) => item.role === "assistant")
    .map((item) => item.text);

  let actor = await act(input);
  if (isEchoReply(actor.output.message, recentAssistant)) {
    actor = await act({
      ...input,
      cooldownWarnings: [
        ...input.cooldownWarnings,
        "FORBIDDEN: do not reuse any prior coding/bot/接口 reply. Answer only the latest user message.",
      ],
    });
  }
  // ponytail: if the model still echoes, refuse to send the loop — acknowledge the user text instead
  if (isEchoReply(actor.output.message, recentAssistant)) {
    const tip = (input.userMessage ?? "").trim().slice(0, 80) || "你刚说的那句";
    actor = {
      ...actor,
      output: {
        ...actor.output,
        message: `嗯，我听到了：${tip}\n你希望我现在问你哪一块？`,
        toolCall: null,
      },
      raw: actor.raw,
    };
  }

  const toolExecution = actor.output.toolCall ? await executeTool(actor.output.toolCall) : null;
  return {
    finalText: composeToolResult(actor.output.message, toolExecution),
    actorOutput: actor.output,
    actorRaw: actor.raw,
    toolExecution,
  };
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
    noveltyBudget: "none",
    selectedSeed: null,
    toolAllowed: false,
    styleHints: ["direct", "safety-first", "no roleplay"],
    reason: "Deterministic safety override for a crisis expression",
  };
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "psyche.ego.plan",
    source: "safety",
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
      selectedSeed: null,
      safety: true,
    }),
    },
    (state) => applyInteractionGrowth(state, analysis),
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
  const context = await bootstrapCompanion({
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
    payloadJson: {
      messageId: userMessage.row.id,
      telegramMessageId: message.messageId,
      correlationId,
      resumed: !userMessage.created,
    },
  });
  const config = runtimeConfig(context);
  const analyzed = await analyzeMessage(message.text, config.model);
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

  const timeZone = config.policy.quietHours.timeZone;
  const [
    recentMessages,
    recentAnnotations,
    availableMemories,
    seedRows,
    toolCallsToday,
    photoToolStats,
  ] =
    await Promise.all([
      listRecentMessages(context.companion.id, 30),
      listRecentAnnotations(context.companion.id, 50),
      listAvailableMemories(context.companion.id, 100),
      listEnabledSeeds(context.companion.id),
      countTodayToolCalls(context.companion.id, timeZone),
      getToolStats(context.companion.id, "generate_fake_photo", timeZone),
    ]);
  const recentAssistant = recentMessages.filter((item) => item.role === "assistant").slice(0, 10);
  const topicEntropy = computeTopicEntropy(recentAnnotations);
  const repetitionScore = computeRepetitionScore(recentAssistant);
  const mirrorIndex = computeMirrorIndex(
    userTopicNames(recentAnnotations),
    proactiveTags(recentMessages),
  );
  const selectedMemories = selectRelevantMemories(
    availableMemories,
    message.text,
    analyzed.analysis,
  );
  if (selectedMemories.length) {
    await useMemories(selectedMemories.map((memory) => memory.id), timeZone);
  }
  const seeds = seedRows.map(toSeed);
  const selectedSeed = selectNoveltySeed(seeds, {
    state: context.state,
    analysis: analyzed.analysis,
    mirrorIndex,
  });
  const driveAssessment = assessDrives(context.state, analyzed.analysis);
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "psyche.id.drive",
    source: "id",
    payloadJson: driveAssessment,
  });
  const directed = await directAction({
    kind: "user",
    state: context.state,
    analysis: analyzed.analysis,
    memories: selectedMemories,
    selectedSeed,
    driveAssessment,
    topicEntropy,
    repetitionScore,
    mirrorIndex,
    config,
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
    payloadJson: { ...plan, usedFallback: directed.usedFallback, error: directed.error },
  });

  const acted = await runActor({
    config,
    state: context.state,
    plan,
    memories: selectedMemories,
    selectedSeed,
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
  });
  if (!await renewMessageProcessing(userMessage.row.id, leaseToken)) {
    throw new Error("Telegram processing lease expired during actor generation");
  }
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
        selectedMemories: selectedMemories.map((memory) => memory.id),
        selectedSeed,
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
        selectedSeed,
      }),
      memoryCandidate,
      toolCall: toolCallWrite(acted.toolExecution, plan.reason),
      selectedSeedId: selectedSeed?.id,
    },
    (state) => applyInteractionGrowth(state, analyzed.analysis),
  );
  if (!assistant.message) throw new Error("Failed to enqueue assistant reply");
  if (!assistant.created) await completeMessageProcessing(userMessage.row.id);
  const delivery = await drainTelegramOutbox(assistant.message.id);
  return {
    status: "processed" as const,
    safetyMode: false,
    messageId: assistant.message.id,
    delivery,
  };
}

async function primaryContext(): Promise<RuntimeContext> {
  const telegramUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
  if (!telegramUserId) throw new Error("TELEGRAM_ALLOWED_USER_ID is not configured");
  return (
    (await getRuntimeContext(telegramUserId)) ??
    (await bootstrapCompanion({ telegramUserId, displayName: "Telegram User" }))
  );
}

async function writeProactiveLog(
  context: RuntimeContext,
  input: {
    shouldSend: boolean;
    reason: string;
    selectedMode?: string | null;
    selectedSeedJson?: SeedCard | null;
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
    selectedSeedJson: null,
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

export async function runHourlyProactive(now = new Date()): Promise<ProactiveRunResult> {
  if (hourlyRun) return { sent: false, reason: "already_running" };
  hourlyRun = runHourlyProactiveOnce(now);
  try {
    return await hourlyRun;
  } finally {
    hourlyRun = null;
  }
}

async function runHourlyProactiveOnce(now: Date): Promise<ProactiveRunResult> {
  const context = await primaryContext();
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
  const [
    stats,
    recentMessages,
    recentAnnotations,
    seedRows,
    availableMemories,
    toolCallsToday,
    photoToolStats,
  ] =
    await Promise.all([
      getProactiveStats(context.companion.id, timeZone),
      listRecentMessages(context.companion.id, 40),
      listRecentAnnotations(context.companion.id, 50),
      listEnabledSeeds(context.companion.id),
      listAvailableMemories(context.companion.id, 60),
      countTodayToolCalls(context.companion.id, timeZone),
      getToolStats(context.companion.id, "generate_fake_photo", timeZone),
    ]);
  const topicEntropy = computeTopicEntropy(recentAnnotations);
  const mirrorIndex = computeMirrorIndex(
    userTopicNames(recentAnnotations),
    proactiveTags(recentMessages),
  );
  const scoreRoll = deterministicRoll(idempotencyKey, "score");
  const intervalRoll = deterministicRoll(idempotencyKey, "interval");
  const thresholdRoll = deterministicRoll(idempotencyKey, "threshold");
  const seedRoll = deterministicRoll(idempotencyKey, "seed-use");
  const seedSelectionRoll = deterministicRoll(idempotencyKey, "seed-selection");
  const score = computeProactiveScore(context.state, scoreRoll, topicEntropy, mirrorIndex);
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "system.tick",
    source: "cron.hourly",
    payloadJson: {
      at: now.toISOString(),
      score,
      randomSeed: idempotencyKey,
      rolls: { scoreRoll, intervalRoll, thresholdRoll, seedRoll, seedSelectionRoll },
      topicEntropy,
      mirrorIndex,
      noveltyBoost: (topicEntropy.collapseRisk ? 0.045 : 0) + (mirrorIndex > 0.8 ? 0.045 : 0),
    },
  });

  if (isQuietHours(now, config.policy.quietHours)) {
    await writeProactiveLog(context, {
      shouldSend: false,
      reason: "Quiet hours: knowing when not to act is part of the policy",
      quietHoursBlocked: true,
      idempotencyKey,
      score,
    });
    return { sent: false, reason: "quiet_hours", score };
  }
  const reservedByThisWindow = existingCheck?.shouldSend ? 1 : 0;
  if (stats.sentToday - reservedByThisWindow >= config.policy.proactiveMaxPerDay) {
    await writeProactiveLog(context, {
      shouldSend: false,
      reason: "Daily proactive limit reached",
      dailyLimitBlocked: true,
      idempotencyKey,
      score,
    });
    return { sent: false, reason: "daily_limit", score };
  }
  if (
    !existingCheck &&
    hoursSince(stats.lastSentAt, now) < config.policy.minimumProactiveIntervalHours + intervalRoll * 2
  ) {
    await writeProactiveLog(context, {
      shouldSend: false,
      reason: "Minimum proactive interval has not elapsed",
      intervalBlocked: true,
      idempotencyKey,
      score,
    });
    return { sent: false, reason: "minimum_interval", score };
  }
  const scoreThreshold = 0.5 + thresholdRoll * 0.14;
  if (score < scoreThreshold) {
    await writeProactiveLog(context, {
      shouldSend: false,
      reason: "Drive, relationship and random jitter did not justify an interruption",
      idempotencyKey,
      score,
    });
    return { sent: false, reason: "score_below_threshold", score, scoreThreshold };
  }
  const latestAnnotation = recentAnnotations.find((item) => item.messageRole === "user") as
    | (Record<string, unknown> & { messageRole?: string })
    | undefined;
  const analysis = annotationAnalysis(latestAnnotation);
  const repetitionScore = computeRepetitionScore(
    recentMessages.filter((message) => message.role === "assistant").slice(0, 10),
  );
  const seeds = seedRows.map(toSeed);
  const selectedSeed = selectNoveltySeed(seeds, {
    state: context.state,
    analysis,
    mirrorIndex,
    required: true,
    random: seedRoll,
    selectionRandom: seedSelectionRoll,
    now,
  });
  if (!selectedSeed) {
    await writeProactiveLog(context, {
      shouldSend: false,
      reason: "No enabled novelty seed is available",
      idempotencyKey,
      score,
    });
    return { sent: false, reason: "no_seed", score };
  }
  const latestUserText = recentMessages.find((message) => message.role === "user")?.text ?? "";
  const selectedMemories = selectRelevantMemories(
    availableMemories,
    latestUserText,
    analysis,
    2,
  );
  if (selectedMemories.length) {
    await useMemories(selectedMemories.map((memory) => memory.id), timeZone);
  }
  const driveAssessment = assessDrives(context.state, analysis);
  const directed = await directAction({
    kind: "proactive",
    state: context.state,
    analysis,
    memories: selectedMemories,
    selectedSeed,
    driveAssessment,
    topicEntropy,
    repetitionScore,
    mirrorIndex,
    config,
  });
  const photoCooldownBlocked =
    hoursSince(photoToolStats.lastUsedAt, now) < TOOL_REGISTRY.generate_fake_photo.cooldownHours;
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
    source: "ego.proactive",
    payloadJson: { ...plan, score, usedFallback: directed.usedFallback, error: directed.error },
  });
  if (plan.action === "do_nothing") {
    await writeProactiveLog(context, {
      shouldSend: false,
      reason: plan.reason,
      selectedMode: plan.mode,
      selectedSeedJson: selectedSeed,
      idempotencyKey,
      score,
    });
    return { sent: false, reason: "ego_do_nothing", score };
  }

  const acted = await runActor({
    config,
    state: context.state,
    plan,
    memories: selectedMemories,
    selectedSeed,
    cooldownWarnings: [
      ...memoryCooldownWarnings(selectedMemories),
      ...(toolCallsToday >= config.policy.toolDailyLimit ? ["Daily tool limit reached; no tool call is allowed."] : []),
      ...(photoCooldownBlocked
        ? [`generate_fake_photo is in its ${TOOL_REGISTRY.generate_fake_photo.cooldownHours}h cooldown.`]
        : []),
    ],
    analysis,
    userMessage: null,
    recentMessages: recentMessages.map((message) => ({ role: message.role, text: message.text })),
  });

  const chatId = recentMessages.find((message) => message.role === "user" && message.chatId)?.chatId ?? context.user.telegramUserId;
  // The database reservation is the cross-process lock for this hourly window.
  const reservation = existingCheck ?? await writeProactiveLog(context, {
    shouldSend: true,
    reason: `Reserved before enqueue: ${plan.reason}`,
    selectedMode: plan.mode,
    selectedSeedJson: selectedSeed,
    idempotencyKey,
    score,
  });
  try {
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
        chatId,
        text: acted.finalText,
        rawJson: {
          proactive: true,
          actionPlan: plan,
          actorRaw: acted.actorRaw,
          selectedSeed,
          selectedMemories: selectedMemories.map((memory) => memory.id),
          score,
          topicEntropy,
          mirrorIndex,
          randomSeed: idempotencyKey,
        },
        correlationId: reservation.id,
        sourceType: "proactive",
        sourceId: reservation.id,
        idempotencyBase: `proactive:${reservation.id}`,
        annotation: buildAssistantAnnotation({
          text: acted.finalText,
          plan,
          analysis,
          selectedSeed,
          proactive: true,
        }),
        memoryCandidate,
        toolCall: toolCallWrite(acted.toolExecution, plan.reason),
        selectedSeedId: selectedSeed.id,
        proactiveLogId: reservation.id,
      },
      applyProactiveGrowth,
    );
    if (!assistant.message) throw new Error("Failed to enqueue proactive message");
    await updateProactiveLog(reservation.id, { reason: plan.reason });
    const delivery = await drainTelegramOutbox(assistant.message.id);
    const outbox = await listMessageOutbox(assistant.message.id);
    const delivered = outbox.length > 0 && outbox.every((item) => item.status === "delivered");
    await logRuntimeEvent({
      userId: context.user.id,
      companionId: context.companion.id,
      type: delivered ? "proactive.sent" : "proactive.queued",
      source: "cron.hourly",
      payloadJson: {
        correlationId: reservation.id,
        messageId: assistant.message.id,
        score,
        actionPlan: plan,
        selectedSeed,
        delivery,
      },
    });
    return {
      sent: delivered,
      reason: plan.reason,
      score,
      messageId: assistant.message.id,
    };
  } catch (error) {
    await updateProactiveLog(reservation.id, {
      shouldSend: false,
      reason: `Enqueue failed: ${plan.reason}`,
    }).catch((updateError) => {
      console.error("Failed to update proactive reservation", updateError);
    });
    throw error;
  }
}

export async function runDailyReflection(now = new Date()) {
  const context = await primaryContext();
  const config = runtimeConfig(context);
  const date = zonedDateKey(now, config.policy.quietHours.timeZone);
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "system.tick",
    source: "cron.daily",
    payloadJson: { at: now.toISOString(), date },
  });
  const activity = await listTodayActivity(
    context.companion.id,
    date,
    config.policy.quietHours.timeZone,
  );
  const generated = await reflectOnDay(activity, context.state, config);
  let growth: ReturnType<typeof applyDailyReflection> | null = null;
  let journalResult: Awaited<ReturnType<typeof applyDailyReflectionTransaction>> | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const latestState = await getCompanionState(context.companion.id);
    growth = applyDailyReflection(latestState, generated.reflection);
    // Neon HTTP cannot keep a callback transaction open. The repository commits
    // journal, state, audit rows and tomorrow seeds in one PostgreSQL statement.
    journalResult = await applyDailyReflectionTransaction({
      journalInput: {
        companionId: context.companion.id,
        date,
        summary: generated.reflection.summary,
        reflection: generated.reflection.reflection,
        traitUpdatesJson: generated.reflection.traitUpdates,
        beliefUpdatesJson: {},
        arcUpdatesJson: generated.reflection.arcUpdates,
      },
      expectedState: latestState,
      state: growth.state,
      changes: growth.changes,
      seeds: generated.reflection.tomorrowSeeds,
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
  if (!journalResult.created) {
    return { reflected: false, reason: "already_reflected", date, journalId: journalResult.row.id };
  }
  if (generated.reflection.tomorrowSeeds.length) {
    await logRuntimeEvent({
      userId: context.user.id,
      companionId: context.companion.id,
      type: "world.seed.created",
      source: "growth",
      payloadJson: { journalId: journalResult.row.id, seeds: generated.reflection.tomorrowSeeds },
    });
  }
  return {
    reflected: true,
    date,
    journalId: journalResult.row.id,
    stateChanges: growth.changes.length,
    tomorrowSeeds: generated.reflection.tomorrowSeeds.length,
  };
}
