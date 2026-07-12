import { createHash } from "node:crypto";
import type {
  ActionPlan,
  CompanionState,
  MessageAnalysis,
  RuntimeConfig,
  SelectedMemory,
} from "@/core/types";
import type { LlmUsageContext } from "@/db/usageRepo";
import type { TemporalContext } from "@/platform/time";

export interface ActorGroundedContext {
  temporal: TemporalContext;
  currentLocation: { id: string; name: string; category: string } | null;
  currentActivity: {
    id: string;
    title: string;
    type: string;
    startAtUtc: string;
    startLocal: string;
    endAtUtc: string;
    endLocal: string;
    localDate: string;
    timeZone: string;
  } | null;
  lastConfirmedActivity: { id: string; title: string; type: string } | null;
  schedule: Array<{
    id: string;
    title: string;
    type: string;
    startAtUtc: string;
    startLocal: string;
    endAtUtc: string;
    endLocal: string;
    localDate: string;
    timeZone: string;
    locationId: string | null;
    status: string;
    changeReason: string | null;
  }>;
  emotionReasons: Record<string, unknown>;
  dailyPlan?: Record<string, unknown> | null;
  workingMemory: Record<string, unknown> | null;
  openLoops: Array<Record<string, unknown>>;
  worldEvents: Array<Record<string, unknown>>;
  externalInformation: Array<Record<string, unknown>>;
  shareCandidate: Record<string, unknown> | null;
  recentMessages: Array<{ id: string; role: string; text: string; createdAt: string }>;
  allowedReferenceIds: string[];
}

export interface ActorPromptInput {
  config: RuntimeConfig;
  state: CompanionState;
  plan: ActionPlan;
  memories: SelectedMemory[];
  cooldownWarnings: string[];
  analysis?: MessageAnalysis | null;
  userMessage?: string | null;
  recentMessages?: Array<{ role: string; text: string }>;
  groundedContext?: ActorGroundedContext;
  usageContext?: LlmUsageContext;
}

export interface BudgetedActorPrompt {
  prompt: string;
  context: ActorGroundedContext | null;
  estimatedTokens: number;
  tokenBudget: number;
  contextHash: string;
}

function estimateTokens(value: string) {
  return Math.ceil(value.length / 4);
}

function localClock(value: string) {
  return value.slice(11, 16);
}

function renderLocalSchedule(context: ActorGroundedContext | null) {
  if (!context?.schedule.length) return "No schedule is loaded.";
  return context.schedule
    .map(
      (block) =>
        `- ${block.title}: ${localClock(block.startLocal)}–${localClock(block.endLocal)}, ${block.timeZone} [${block.status}; id=${block.id}]`,
    )
    .join("\n");
}

function render(input: ActorPromptInput, context: ActorGroundedContext | null) {
  const { character } = input.config;
  const photoMode = input.plan.mode === "photo_share" || input.plan.mode === "inner_world_scene";
  const legacyRecent = [...(input.recentMessages ?? [])].slice(0, 20).reverse();
  return [
    "1. Mira core identity and personality:",
    character.identity.join("\n"),
    `Beliefs: ${JSON.stringify(character.beliefs)}`,
    `Profile: ${JSON.stringify(character.profile)}`,
    "2. Current real time and persisted world time:",
    context
      ? [
          `Observed Beijing time: ${context.temporal.localDateTime} (${context.temporal.weekday}, ${context.temporal.dayPeriod})`,
          `Observed UTC evidence: ${context.temporal.observedAtUtc}`,
          `World advanced through: ${context.temporal.worldAdvancedThroughLocal} (${context.temporal.worldAdvancedThroughUtc} UTC evidence)`,
          `World lag: ${context.temporal.worldLagSeconds}s; fresh=${context.temporal.worldStateFresh}`,
        ].join("\n")
      : "Temporal context not loaded.",
    "3. Current grounded location and activity:",
    JSON.stringify({
      location: context?.currentLocation ?? null,
      currentActivity: context?.currentActivity ?? null,
      lastConfirmedActivity: context?.lastConfirmedActivity ?? null,
    }),
    "4. Current schedule (local wall time first; database facts only):",
    renderLocalSchedule(context),
    "Schedule UTC debug evidence (never reinterpret as Beijing wall time):",
    JSON.stringify(
      context?.schedule.map(({ id, startAtUtc, endAtUtc }) => ({ id, startAtUtc, endAtUtc })) ?? [],
    ),
    "5. Today's own-life plan and event progress:",
    JSON.stringify(context?.dailyPlan ?? null),
    "6. Current emotion, drives and concrete reasons:",
    JSON.stringify({ mood: input.state.mood, drives: input.state.drives, reasons: context?.emotionReasons ?? {} }),
    "7. Pending share candidate:",
    JSON.stringify(context?.shareCandidate ?? null),
    "8. Mira/shared open loops:",
    JSON.stringify(context?.openLoops ?? []),
    "9. Relevant long-term memories (self/world first):",
    JSON.stringify(input.memories),
    "10. Recent world events (physical and inner remain separate):",
    JSON.stringify(context?.worldEvents ?? []),
    "11. Relationship summary:",
    JSON.stringify(input.state.relationship),
    "12. Conversation working memory:",
    JSON.stringify(context?.workingMemory ?? null),
    "13. Relevant places, news and activity facts:",
    JSON.stringify(context?.externalInformation ?? []),
    "14. Recent conversation (oldest to newest; current user message excluded):",
    JSON.stringify(context?.recentMessages ?? legacyRecent),
    "15. Current user message (appears exactly once):",
    JSON.stringify(input.userMessage ?? null),
    `Traits: ${JSON.stringify(input.state.traits)}`,
    `Drives: ${JSON.stringify(input.state.drives)}`,
    `Active arcs: ${JSON.stringify(input.state.activeArcs)}`,
    `Action plan: ${JSON.stringify(input.plan)}`,
    `Allowed grounding reference IDs: ${JSON.stringify(context?.allowedReferenceIds ?? [])}`,
    `Cooldown warnings: ${JSON.stringify(input.cooldownWarnings)}`,
    `Style rules: ${JSON.stringify(character.styleRules)}`,
    `Avoid: ${JSON.stringify(character.forbiddenStyles)}`,
    `Hard limits: ${JSON.stringify(character.boundaries)}`,
    `Message analysis: ${JSON.stringify(input.analysis ?? null)}`,
    photoMode
      ? "This turn may describe an explicit inner-world image, but must not claim it physically happened."
      : "Stay with the current message and persisted world facts.",
  ].join("\n\n");
}

export function buildBudgetedActorPrompt(
  input: ActorPromptInput,
  tokenBudget = 8_000,
): BudgetedActorPrompt {
  const context = input.groundedContext
    ? {
        ...input.groundedContext,
        externalInformation: [...input.groundedContext.externalInformation],
        worldEvents: [...input.groundedContext.worldEvents],
        recentMessages: [...input.groundedContext.recentMessages],
        openLoops: [...input.groundedContext.openLoops],
      }
    : null;
  let prompt = render(input, context);

  // Mira's own day is the stable context. Conversation history still loads 24
  // rows, but the oldest chat leaves first when the fixed budget is exceeded.
  while (context && estimateTokens(prompt) > tokenBudget) {
    if (context.recentMessages.length > 8) context.recentMessages.shift();
    else if (context.externalInformation.length > 2) context.externalInformation.pop();
    else if (context.worldEvents.length > 8) context.worldEvents.shift();
    else if (context.openLoops.length > 3) context.openLoops.pop();
    else break;
    prompt = render(input, context);
  }
  if (estimateTokens(prompt) > tokenBudget) {
    throw new Error("Actor prompt exceeds its fixed token budget after safe trimming");
  }
  return {
    prompt,
    context,
    estimatedTokens: estimateTokens(prompt),
    tokenBudget,
    contextHash: createHash("sha256").update(prompt).digest("hex"),
  };
}
