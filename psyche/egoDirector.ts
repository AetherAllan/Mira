import type {
  ActionMode,
  ActionPlan,
  CompanionState,
  MessageAnalysis,
  SelectedMemory,
  TopicEntropy,
  RuntimeConfig,
} from "@/core/types";
import type { DriveAssessment } from "@/psyche/idDrive";
import { callJson } from "@/llm/client";
import { EGO_SYSTEM } from "@/llm/prompts";
import { asString, asStringArray, type JsonObject } from "@/llm/json";
import type { LlmUsageContext } from "@/db/usageRepo";

const MODES: ActionMode[] = [
  "technical_companion",
  "weird_question",
  "quiet_observation",
  "project_nudge",
  "inner_world_scene",
  "photo_share",
  "playful_challenge",
  "emotional_support",
];
const MEMORY_BUDGETS = ["none", "light", "medium", "heavy"] as const;

interface DirectOptions {
  kind: "user" | "proactive";
  state: CompanionState;
  analysis?: MessageAnalysis | null;
  memories: SelectedMemory[];
  driveAssessment: DriveAssessment;
  topicEntropy: TopicEntropy;
  repetitionScore: number;
  mirrorIndex: number;
  config: RuntimeConfig;
  usageContext?: LlmUsageContext;
}

function fallbackPlan(options: DirectOptions): ActionPlan {
  const intent = options.analysis?.intent ?? "";
  const mode: ActionMode =
    options.kind === "proactive"
      ? "quiet_observation"
      : intent === "technical_discussion"
        ? "technical_companion"
        : options.analysis?.emotion === "distressed"
          ? "emotional_support"
          : "quiet_observation";
  return {
    action: options.kind === "user" ? "reply" : "proactive_message",
    mode,
    memoryBudget: options.memories.length > 2 ? "medium" : options.memories.length ? "light" : "none",
    toolAllowed: false,
    webAccess: "none",
    styleHints: ["short", "specific", "not customer-service-like"],
    reason: `${options.driveAssessment.dominant} is dominant; selected the smallest bounded action`,
  };
}

function validatePlan(value: JsonObject, options: DirectOptions): ActionPlan | null {
  const rawMode = asString(value.mode) as ActionMode;
  const rawMemoryBudget = asString(value.memoryBudget) as ActionPlan["memoryBudget"];
  if (!MODES.includes(rawMode)) return null;
  if (!MEMORY_BUDGETS.includes(rawMemoryBudget)) return null;
  const rawAction = asString(value.action);
  const action = options.kind === "user" ? "reply" : rawAction === "do_nothing" ? "do_nothing" : "proactive_message";
  return {
    action,
    mode: rawMode,
    memoryBudget: rawMemoryBudget,
    toolAllowed: Boolean(value.toolAllowed) && rawMode === "photo_share",
    webAccess: asString(value.webAccess) === "search" ? "search" : "none",
    styleHints: asStringArray(value.styleHints).slice(0, 6),
    reason: asString(value.reason, "Ego selected a bounded action"),
  };
}

export async function directAction(options: DirectOptions) {
  const fallback = fallbackPlan(options);
  const result = await callJson({
    messages: [
      { role: "system", content: EGO_SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          kind: options.kind,
          state: options.state,
          analysis: options.analysis ?? null,
          selectedMemories: options.memories,
          drives: options.driveAssessment,
          topicEntropy: options.topicEntropy,
          repetitionScore: options.repetitionScore,
          mirrorIndex: options.mirrorIndex,
        }),
      },
    ],
    fallback,
    validate: (value) => validatePlan(value, options),
    model: options.config.model,
    temperature: 0.25,
    maxTokens: 650,
    usageContext: options.usageContext,
  });
  return { plan: result.data, raw: result.raw, usedFallback: result.usedFallback, error: result.error };
}
