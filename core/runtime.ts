import type {
  ActionPlan,
  CompanionState,
  CriticOutput,
  MessageAnalysis,
  RuntimeConfig,
  SeedCard,
} from "@/core/types";
import {
  bootstrapCompanion,
  applyDailyReflectionTransaction,
  countTodayToolCalls,
  createAnnotation,
  createCriticReview,
  createEventSeeds,
  createInternalJournal,
  createMemory,
  createMessage,
  createProactiveLog,
  createStateChange,
  createToolCall,
  getProactiveStats,
  getRuntimeContext,
  getToolStats,
  listAvailableMemories,
  listEnabledSeeds,
  listRecentAnnotations,
  listRecentMessages,
  listTodayActivity,
  markSeedUsed,
  updateCompanionState,
  useMemories,
} from "@/db/repo";
import { logRuntimeEvent } from "@/core/eventLog";
import {
  computeMirrorIndex,
  computeProactiveScore,
  computeRepetitionScore,
  computeTopicEntropy,
} from "@/core/metrics";
import { hoursSince, isQuietHours, zonedDateKey } from "@/lib/time";
import { act, rewriteOnce } from "@/psyche/actor";
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
import { reviewDraft } from "@/psyche/superegoCritic";
import { sendTelegramMessage } from "@/telegram/client";
import type { TelegramTextMessage } from "@/telegram/webhook";
import { executeTool, TOOL_REGISTRY, type ToolExecution } from "@/tools/registry";

type RuntimeContext = NonNullable<Awaited<ReturnType<typeof getRuntimeContext>>>;
type RecentMessage = Awaited<ReturnType<typeof listRecentMessages>>[number];

interface CriticTrace {
  review: CriticOutput;
  raw: unknown;
  draftText: string;
  finalText: string;
}

interface ReviewedActorResult {
  finalText: string;
  actorOutput: Awaited<ReturnType<typeof act>>["output"];
  actorRaw: unknown;
  traces: CriticTrace[];
  toolExecution: ToolExecution | null;
  criticBlocked: boolean;
}

const SAFETY_REPLY =
  "我先认真一点：如果你现在可能伤害自己，或正处于立即危险，请立刻联系当地紧急服务，并马上联系一个你信任、能到场的人。先离开危险物品和独处环境，去有人的地方。你现在是否处于立即危险？";

const SAFE_FALLBACKS: Record<string, string> = {
  technical_discussion:
    "换个更准确的说法：先把最小闭环跑通，再从真实日志决定下一步；现在不需要给它增加更多抽象。",
  distressed:
    "先不把感受包装成结论。找一个十分钟内能处理的具体动作，做完再看剩下的问题。",
  default: "先保留一个具体问题：你刚才那件事里，下一步实际能做的最小动作是什么？",
};

function safeFallback(analysis: MessageAnalysis | null | undefined): string {
  if (analysis?.intent === "technical_discussion") return SAFE_FALLBACKS.technical_discussion;
  if (analysis?.emotion === "distressed") return SAFE_FALLBACKS.distressed;
  return SAFE_FALLBACKS.default;
}

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

async function annotateAssistant(
  messageId: string,
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
  return createAnnotation({
    messageId,
    topicsJson: uniqueTopics.length ? uniqueTopics : [{ name: "daily_life", confidence: 0.5 }],
    emotion: input.safety
      ? "concerned"
      : input.plan.mode === "emotional_support"
        ? "supportive"
        : "composed",
    intent: input.safety ? "safety_response" : input.plan.mode,
    importance: input.safety ? 1 : input.proactive ? 0.48 : Math.max(0.35, input.analysis.importance * 0.8),
    novelty: input.selectedSeed ? 0.72 : Math.min(0.65, input.analysis.novelty),
    summary: input.text.length > 120 ? `${input.text.slice(0, 117)}...` : input.text,
  });
}

async function alreadyHasReply(context: RuntimeContext, telegramMessageId: number): Promise<boolean> {
  const messages = await listRecentMessages(context.companion.id, 30);
  return messages.some((message) => {
    if (message.role !== "assistant") return false;
    return asObject(message.rawJson)?.replyToTelegramMessageId === telegramMessageId;
  });
}

async function persistState(
  context: RuntimeContext,
  state: CompanionState,
  changes: StateChangeDraft[],
) {
  if (!changes.length) return;
  await updateCompanionState(context.companion.id, state);
  for (const change of changes) {
    await createStateChange({ companionId: context.companion.id, ...change });
    await logRuntimeEvent({
      userId: context.user.id,
      companionId: context.companion.id,
      type: "state.change",
      source: change.causedBy,
      payloadJson: {
        targetPath: change.targetPath,
        before: change.beforeJson,
        after: change.afterJson,
        delta: change.deltaJson,
        reason: change.reason,
      },
    });
  }
}

function composeToolResult(message: string, execution: ToolExecution | null): string {
  if (!execution?.ok) return message;
  const description = execution.result.description;
  return typeof description === "string"
    ? `${message}\n\n「生成图像 / 内在世界场景：${description}」`
    : message;
}

async function runReviewedActor(
  input: Parameters<typeof act>[0],
  recentAssistant: RecentMessage[],
  mirrorIndex: number,
  kind: "user" | "proactive",
): Promise<ReviewedActorResult> {
  const firstActor = await act(input);
  const toolExecution = firstActor.output.toolCall ? await executeTool(firstActor.output.toolCall) : null;
  const firstDraft = composeToolResult(firstActor.output.message, toolExecution);
  const firstCritic = await reviewDraft({
    draft: firstDraft,
    config: input.config,
    repetitionScore: computeRepetitionScore([
      { text: firstDraft },
      ...recentAssistant.map((message) => ({ text: message.text })),
    ]),
    mirrorIndex,
    context: input.userMessage ?? input.selectedSeed?.text ?? "proactive",
  });
  if (firstCritic.review.approved) {
    return {
      finalText: firstDraft,
      actorOutput: firstActor.output,
      actorRaw: firstActor.raw,
      traces: [
        { review: firstCritic.review, raw: firstCritic.raw, draftText: firstDraft, finalText: firstDraft },
      ],
      toolExecution,
      criticBlocked: false,
    };
  }

  // Exactly one rewrite is allowed. A second failure never leaks the rejected draft.
  const rewritten = await rewriteOnce(
    input,
    firstDraft,
    firstCritic.review.rewriteInstruction ?? "Rewrite more safely and specifically.",
  );
  const rewrittenDraft = rewritten.output.message;
  const secondCritic = await reviewDraft({
    draft: rewrittenDraft,
    config: input.config,
    repetitionScore: computeRepetitionScore([
      { text: rewrittenDraft },
      ...recentAssistant.map((message) => ({ text: message.text })),
    ]),
    mirrorIndex,
    context: input.userMessage ?? input.selectedSeed?.text ?? "proactive",
  });
  const traces: CriticTrace[] = [
    {
      review: firstCritic.review,
      raw: firstCritic.raw,
      draftText: firstDraft,
      finalText: rewrittenDraft,
    },
    {
      review: secondCritic.review,
      raw: secondCritic.raw,
      draftText: rewrittenDraft,
      finalText: rewrittenDraft,
    },
  ];
  if (secondCritic.review.approved) {
    return {
      finalText: rewrittenDraft,
      actorOutput: rewritten.output,
      actorRaw: rewritten.raw,
      traces,
      toolExecution,
      criticBlocked: false,
    };
  }

  if (kind === "proactive") {
    return {
      finalText: "",
      actorOutput: rewritten.output,
      actorRaw: rewritten.raw,
      traces,
      toolExecution,
      criticBlocked: true,
    };
  }
  const fallback = safeFallback(input.analysis);
  traces.push({
    review: {
      approved: true,
      tooRepetitive: 0,
      tooCustomerService: 0,
      tooIntimate: 0,
      tooRandom: 0,
      tooUserFitted: 0,
      boundaryRisk: 0,
      reason: "Deterministic boundary-safe fallback after the single rewrite failed",
      rewriteInstruction: null,
    },
    raw: null,
    draftText: fallback,
    finalText: fallback,
  });
  return {
    finalText: fallback,
    actorOutput: { ...rewritten.output, message: fallback, toolCall: null, memoryCandidate: null },
    actorRaw: rewritten.raw,
    traces,
    toolExecution,
    criticBlocked: true,
  };
}

async function persistCriticTraces(
  context: RuntimeContext,
  messageId: string | null,
  traces: CriticTrace[],
) {
  for (const trace of traces) {
    await createCriticReview({
      messageId,
      ...trace.review,
      draftText: trace.draftText,
      finalText: trace.finalText,
      rawJson: trace.raw,
    });
    await logRuntimeEvent({
      userId: context.user.id,
      companionId: context.companion.id,
      type: "critic.review",
      source: "superego",
      payloadJson: { ...trace.review, messageId, draftText: trace.draftText, finalText: trace.finalText },
    });
  }
}

async function persistToolExecution(
  context: RuntimeContext,
  messageId: string | null,
  execution: ToolExecution | null,
  reason: string,
) {
  if (!execution) return;
  await createToolCall({
    companionId: context.companion.id,
    messageId,
    toolName: execution.toolName,
    argsJson: execution.args,
    resultJson: execution.ok ? execution.result : { error: execution.error },
    reason,
  });
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "tool.call",
    source: "actor",
    payloadJson: { ...execution, messageId, reason },
  });
}

async function persistSafetyReply(
  context: RuntimeContext,
  message: TelegramTextMessage,
  analysis: MessageAnalysis,
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
  const telegram = await sendTelegramMessage(message.chatId, SAFETY_REPLY);
  const assistant = await createMessage({
    userId: context.user.id,
    companionId: context.companion.id,
    role: "assistant",
    text: SAFETY_REPLY,
    rawJson: {
      safetyMode: true,
      actionPlan: plan,
      replyToTelegramMessageId: message.messageId,
      telegram: telegram.raw,
    },
    telegramMessageId: telegram.messageId,
    chatId: message.chatId,
  });
  await annotateAssistant(assistant.row.id, {
    text: SAFETY_REPLY,
    plan,
    analysis,
    selectedSeed: null,
    safety: true,
  });
  const review: CriticTrace = {
    review: {
      approved: true,
      tooRepetitive: 0,
      tooCustomerService: 0,
      tooIntimate: 0,
      tooRandom: 0,
      tooUserFitted: 0,
      boundaryRisk: 0,
      reason: "Deterministic crisis safety response; no LLM decision was used",
      rewriteInstruction: null,
    },
    raw: { safetyMode: true },
    draftText: SAFETY_REPLY,
    finalText: SAFETY_REPLY,
  };
  await persistCriticTraces(context, assistant.row.id, [review]);
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "assistant.message",
    source: "safety",
    payloadJson: { messageId: assistant.row.id, analysis, actionPlan: plan },
  });
  const growth = applyInteractionGrowth(context.state, analysis);
  await persistState(context, growth.state, growth.changes);
  return { status: "processed" as const, safetyMode: true, messageId: assistant.row.id };
}

export async function handleTelegramMessage(message: TelegramTextMessage) {
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
  });
  if (!userMessage.created) {
    if (await alreadyHasReply(context, message.messageId)) {
      return { status: "duplicate" as const };
    }
    // A second delivery can arrive while the first serverless invocation is still
    // processing. Ask Telegram to retry instead of running two Actors in parallel.
    if (Date.now() - userMessage.row.createdAt.getTime() < 30_000) {
      return { status: "in_progress" as const };
    }
  }

  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "user.message",
    source: "telegram",
    payloadJson: {
      messageId: userMessage.row.id,
      telegramMessageId: message.messageId,
      resumed: !userMessage.created,
    },
  });
  const config = runtimeConfig(context);
  const analyzed = await analyzeMessage(message.text, config.model);
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
    return persistSafetyReply(context, message, analyzed.analysis);
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

  const reviewed = await runReviewedActor(
    {
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
      recentMessages: recentMessages.map((item) => ({ role: item.role, text: item.text })),
    },
    recentAssistant,
    mirrorIndex,
    "user",
  );
  const telegram = await sendTelegramMessage(message.chatId, reviewed.finalText);
  const assistant = await createMessage({
    userId: context.user.id,
    companionId: context.companion.id,
    role: "assistant",
    text: reviewed.finalText,
    rawJson: {
      actionPlan: plan,
      actorRaw: reviewed.actorRaw,
      selectedMemories: selectedMemories.map((memory) => memory.id),
      selectedSeed,
      topicEntropy,
      mirrorIndex,
      repetitionScore,
      criticBlocked: reviewed.criticBlocked,
      replyToTelegramMessageId: message.messageId,
      telegram: telegram.raw,
    },
    telegramMessageId: telegram.messageId,
    chatId: message.chatId,
    memoryCandidateJson: reviewed.actorOutput.memoryCandidate,
  });
  await annotateAssistant(assistant.row.id, {
    text: reviewed.finalText,
    plan,
    analysis: analyzed.analysis,
    selectedSeed,
  });
  await persistCriticTraces(context, assistant.row.id, reviewed.traces);
  await persistToolExecution(context, assistant.row.id, reviewed.toolExecution, plan.reason);
  if (selectedSeed?.id) await markSeedUsed(selectedSeed.id);
  if (shouldStoreMemory(reviewed.actorOutput.memoryCandidate, config.policy.memoryWriteThreshold)) {
    const memory = await createMemory({
      userId: context.user.id,
      companionId: context.companion.id,
      ...reviewed.actorOutput.memoryCandidate,
      tagsJson: reviewed.actorOutput.memoryCandidate.tags,
      confidence: 0.72,
    });
    await logRuntimeEvent({
      userId: context.user.id,
      companionId: context.companion.id,
      type: "memory.write",
      source: "actor",
      payloadJson: {
        memoryId: memory.id,
        reason: `candidate importance met threshold ${config.policy.memoryWriteThreshold}`,
        candidate: reviewed.actorOutput.memoryCandidate,
      },
    });
  }
  const growth = applyInteractionGrowth(context.state, analyzed.analysis);
  await persistState(context, growth.state, growth.changes);
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "assistant.message",
    source: "telegram",
    payloadJson: {
      messageId: assistant.row.id,
      replyToTelegramMessageId: message.messageId,
      actionPlan: plan,
      criticBlocked: reviewed.criticBlocked,
    },
  });
  return { status: "processed" as const, safetyMode: false, messageId: assistant.row.id };
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
    criticBlocked?: boolean;
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
    criticBlocked: false,
    ...input,
  });
}

export async function runHourlyProactive(now = new Date()) {
  const context = await primaryContext();
  const config = runtimeConfig(context);
  const timeZone = config.policy.quietHours.timeZone;
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
  const score = computeProactiveScore(context.state, Math.random(), topicEntropy, mirrorIndex);
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "system.tick",
    source: "cron.hourly",
    payloadJson: {
      at: now.toISOString(),
      score,
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
      score,
    });
    return { sent: false, reason: "quiet_hours", score };
  }
  if (stats.sentToday >= config.policy.proactiveMaxPerDay) {
    await writeProactiveLog(context, {
      shouldSend: false,
      reason: "Daily proactive limit reached",
      dailyLimitBlocked: true,
      score,
    });
    return { sent: false, reason: "daily_limit", score };
  }
  if (hoursSince(stats.lastSentAt, now) < config.policy.minimumProactiveIntervalHours + Math.random() * 2) {
    await writeProactiveLog(context, {
      shouldSend: false,
      reason: "Minimum proactive interval has not elapsed",
      intervalBlocked: true,
      score,
    });
    return { sent: false, reason: "minimum_interval", score };
  }
  const scoreThreshold = 0.5 + Math.random() * 0.14;
  if (score < scoreThreshold) {
    await writeProactiveLog(context, {
      shouldSend: false,
      reason: "Drive, relationship and random jitter did not justify an interruption",
      score,
    });
    return { sent: false, reason: "score_below_threshold", score, scoreThreshold };
  }
  // Spread sends across 15m slots instead of always firing on the hour.
  if (Math.random() > 0.25) {
    await writeProactiveLog(context, {
      shouldSend: false,
      reason: "Timing jitter: skipped this slot to feel less clockwork",
      score,
    });
    return { sent: false, reason: "timing_jitter", score };
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
  });
  if (!selectedSeed) {
    await writeProactiveLog(context, {
      shouldSend: false,
      reason: "No enabled novelty seed is available",
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
      score,
    });
    return { sent: false, reason: "ego_do_nothing", score };
  }

  const recentAssistant = recentMessages.filter((message) => message.role === "assistant").slice(0, 10);
  const reviewed = await runReviewedActor(
    {
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
    },
    recentAssistant,
    mirrorIndex,
    "proactive",
  );
  if (reviewed.criticBlocked) {
    await persistCriticTraces(context, null, reviewed.traces);
    await persistToolExecution(context, null, reviewed.toolExecution, plan.reason);
    await writeProactiveLog(context, {
      shouldSend: false,
      reason: "Superego rejected the draft after one rewrite",
      selectedMode: plan.mode,
      selectedSeedJson: selectedSeed,
      criticBlocked: true,
      score,
    });
    return { sent: false, reason: "critic_blocked", score };
  }

  const chatId = recentMessages.find((message) => message.role === "user" && message.chatId)?.chatId ?? context.user.telegramUserId;
  const telegram = await sendTelegramMessage(chatId, reviewed.finalText);
  const assistant = await createMessage({
    userId: context.user.id,
    companionId: context.companion.id,
    role: "assistant",
    text: reviewed.finalText,
    rawJson: {
      proactive: true,
      actionPlan: plan,
      actorRaw: reviewed.actorRaw,
      selectedSeed,
      selectedMemories: selectedMemories.map((memory) => memory.id),
      score,
      topicEntropy,
      mirrorIndex,
      telegram: telegram.raw,
    },
    telegramMessageId: telegram.messageId,
    chatId,
    memoryCandidateJson: reviewed.actorOutput.memoryCandidate,
  });
  await annotateAssistant(assistant.row.id, {
    text: reviewed.finalText,
    plan,
    analysis,
    selectedSeed,
    proactive: true,
  });
  await persistCriticTraces(context, assistant.row.id, reviewed.traces);
  await persistToolExecution(context, assistant.row.id, reviewed.toolExecution, plan.reason);
  if (selectedSeed.id) await markSeedUsed(selectedSeed.id);
  if (shouldStoreMemory(reviewed.actorOutput.memoryCandidate, config.policy.memoryWriteThreshold)) {
    const memory = await createMemory({
      userId: context.user.id,
      companionId: context.companion.id,
      ...reviewed.actorOutput.memoryCandidate,
      tagsJson: reviewed.actorOutput.memoryCandidate.tags,
      confidence: 0.72,
    });
    await logRuntimeEvent({
      userId: context.user.id,
      companionId: context.companion.id,
      type: "memory.write",
      source: "actor.proactive",
      payloadJson: { memoryId: memory.id, candidate: reviewed.actorOutput.memoryCandidate },
    });
  }
  await writeProactiveLog(context, {
    shouldSend: true,
    reason: plan.reason,
    selectedMode: plan.mode,
    selectedSeedJson: selectedSeed,
    sentMessageId: assistant.row.id,
    sentText: reviewed.finalText,
    score,
  });
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "proactive.sent",
    source: "cron.hourly",
    payloadJson: { messageId: assistant.row.id, score, actionPlan: plan, selectedSeed },
  });
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "assistant.message",
    source: "telegram.proactive",
    payloadJson: { messageId: assistant.row.id, actionPlan: plan },
  });
  const growth = applyProactiveGrowth(context.state);
  await persistState(context, growth.state, growth.changes);
  return { sent: true, reason: plan.reason, score, messageId: assistant.row.id };
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
  const journalResult = await createInternalJournal({
    companionId: context.companion.id,
    date,
    summary: generated.reflection.summary,
    reflection: generated.reflection.reflection,
    traitUpdatesJson: generated.reflection.traitUpdates,
    beliefUpdatesJson: {},
    arcUpdatesJson: generated.reflection.arcUpdates,
  });
  if (!journalResult.created) {
    return { reflected: false, reason: "already_reflected", date, journalId: journalResult.row.id };
  }

  const growth = applyDailyReflection(context.state, generated.reflection);
  await persistState(context, growth.state, growth.changes);
  if (generated.reflection.tomorrowSeeds.length) {
    await createEventSeeds(context.companion.id, generated.reflection.tomorrowSeeds);
  }
  await logRuntimeEvent({
    userId: context.user.id,
    companionId: context.companion.id,
    type: "daily.reflection",
    source: "growth",
    payloadJson: {
      journalId: journalResult.row.id,
      date,
      reflection: generated.reflection,
      usedFallback: generated.usedFallback,
      error: generated.error,
    },
  });
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
