import type {
  ActiveArc,
  CompanionState,
  DailyReflection,
  Drives,
  Mood,
  Relationship,
  RuntimeConfig,
  Traits,
  MessageAnalysis,
} from "@/core/types";
import { callJson } from "@/llm/client";
import { REFLECTION_SYSTEM } from "@/llm/prompts";
import { asObject, asString, asStringArray, type JsonObject } from "@/llm/json";
import type { LlmUsageContext } from "@/db/usageRepo";

export interface StateChangeDraft {
  targetPath: string;
  beforeJson: unknown;
  afterJson: unknown;
  deltaJson: unknown;
  reason: string;
  causedBy: string;
}

const TRAIT_KEYS: Array<keyof Traits> = [
  "directness",
  "warmth",
  "sarcasm",
  "curiosity",
  "initiative",
  "aestheticSensitivity",
  "independence",
  "emotionalVolatility",
];
const MOOD_KEYS: Array<keyof Mood> = [
  "valence",
  "energy",
  "curiosity",
  "concern",
  "playfulness",
  "boredom",
  "loneliness",
  "irritation",
  "disappointment",
];
const DRIVE_KEYS: Array<keyof Drives> = [
  "affection",
  "aestheticUrge",
  "noveltySeeking",
  "shareDesire",
];
type NumericRelationshipKey = Exclude<keyof Relationship, "stage">;
const RELATIONSHIP_KEYS: NumericRelationshipKey[] = [
  "closeness",
  "trust",
  "familiarity",
  "boundarySensitivity",
  "friendshipAffinity",
  "romanticAffinity",
];

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function delta(value: unknown, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(-maximum, value))
    : 0;
}

function parseUpdates<K extends string>(value: unknown, keys: K[], maximum: number): Partial<Record<K, number>> {
  const object = asObject(value);
  if (!object) return {};
  return Object.fromEntries(keys.map((key) => [key, delta(object[key], maximum)]).filter(([, value]) => value !== 0)) as Partial<
    Record<K, number>
  >;
}

function changed<T extends object>(
  targetPath: string,
  before: T,
  after: T,
  reason: string,
  causedBy: string,
): StateChangeDraft | null {
  if (JSON.stringify(before) === JSON.stringify(after)) return null;
  const deltaJson = Object.fromEntries(
    Object.keys(after).map((key) => {
      const left = (before as Record<string, unknown>)[key];
      const right = (after as Record<string, unknown>)[key];
      return [key, typeof left === "number" && typeof right === "number" ? right - left : null];
    }),
  );
  return { targetPath, beforeJson: before, afterJson: after, deltaJson, reason, causedBy };
}

export function applyInteractionGrowth(
  state: CompanionState,
  analysis: MessageAnalysis,
  correlationId = "00000000-0000-4000-8000-000000000000",
  occurredAt = new Date(),
): {
  state: CompanionState;
  changes: StateChangeDraft[];
} {
  const mood = { ...state.mood };
  const relationship = { ...state.relationship };

  // A user message may matter, but it must not overwrite Mira's day. World
  // events and schedule activity are the primary source of short-term affect.
  mood.curiosity = clamp(mood.curiosity + (analysis.novelty - 0.5) * 0.012);
  mood.concern = clamp(mood.concern + (analysis.emotion === "distressed" ? 0.02 : -0.004));
  relationship.familiarity = clamp(relationship.familiarity + 0.004 + analysis.importance * 0.004);
  relationship.trust = clamp(relationship.trust + analysis.importance * 0.003);
  relationship.friendshipAffinity = clamp(relationship.friendshipAffinity + 0.004);
  const relationshipIntent = analysis.worldSignals.find(
    (item) => item.type === "relationship_intent",
  )?.metadata?.intent;
  if (relationshipIntent === "friendship") {
    relationship.friendshipAffinity = clamp(relationship.friendshipAffinity + 0.008);
  } else if (relationshipIntent === "romantic") {
    // A request can influence the relationship, but never flips its state by itself.
    relationship.romanticAffinity = clamp(relationship.romanticAffinity + 0.01);
  }
  relationship.stage =
    relationship.romanticAffinity >= 0.65 &&
    relationship.trust >= 0.55 &&
    relationship.closeness >= 0.55
      ? "romantic"
      : relationship.romanticAffinity >= 0.35 && relationship.trust >= 0.4
        ? "ambiguous"
        : relationship.friendshipAffinity >= 0.55
          ? "close_friendship"
          : relationship.friendshipAffinity >= 0.25
            ? "friendship"
            : "new";

  const stateReasons = { ...state.stateReasons };
  for (const dimension of ["curiosity", "concern"] as const) {
    const impact = mood[dimension] - state.mood[dimension];
    if (impact === 0) continue;
    stateReasons[dimension] = [
      ...(stateReasons[dimension] ?? []).filter((reason) => new Date(reason.expiresAt) > occurredAt),
      {
        reason: dimension === "concern" ? "用户表达的情绪需要留意" : "用户带来了新的信息",
        sourceType: "user_message" as const,
        correlationId,
        impact,
        occurredAt: occurredAt.toISOString(),
        expiresAt: new Date(occurredAt.getTime() + 72 * 60 * 60_000).toISOString(),
      },
    ].slice(-5);
  }
  const next = { ...state, mood, relationship, stateReasons, version: state.version + 1 };
  const changes = [
    changed("mood", state.mood, mood, "user message changed short-term affect", "user.message"),
    changed("relationship", state.relationship, relationship, "bounded familiarity update", "user.message"),
  ].filter((item): item is StateChangeDraft => item !== null);
  return { state: next, changes };
}

export function applyProactiveGrowth(state: CompanionState): {
  state: CompanionState;
  changes: StateChangeDraft[];
} {
  const drives = {
    ...state.drives,
    noveltySeeking: clamp(state.drives.noveltySeeking - 0.025),
    shareDesire: clamp(state.drives.shareDesire - 0.08),
  };
  const mood = { ...state.mood, boredom: clamp(state.mood.boredom - 0.03) };
  const next = { ...state, drives, mood, version: state.version + 1 };
  const changes = [
    changed("drives", state.drives, drives, "a proactive action discharged novelty pressure", "proactive.sent"),
    changed("mood", state.mood, mood, "proactive action reduced boredom", "proactive.sent"),
  ].filter((item): item is StateChangeDraft => item !== null);
  return { state: next, changes };
}

function applyNumericUpdates<T extends object>(
  before: T,
  updates: Partial<Record<keyof T, number>>,
): T {
  const after = { ...before };
  for (const key of Object.keys(updates) as Array<keyof T>) {
    const value = updates[key];
    const current = after[key];
    if (typeof value === "number" && typeof current === "number") {
      after[key] = clamp(current + value) as T[keyof T];
    }
  }
  return after;
}

export function applyDailyReflection(state: CompanionState, reflection: DailyReflection): {
  state: CompanionState;
  changes: StateChangeDraft[];
} {
  // Enforce drift limits here even when a future caller bypasses LLM validation.
  const traitUpdates = Object.fromEntries(
    TRAIT_KEYS.map((key) => [key, delta(reflection.traitUpdates[key], 0.01)]),
  ) as Partial<Traits>;
  const moodUpdates = Object.fromEntries(MOOD_KEYS.map((key) => [key, delta(reflection.moodUpdates[key], 0.08)])) as Partial<Mood>;
  const driveUpdates = Object.fromEntries(
    DRIVE_KEYS.map((key) => [key, delta(reflection.driveUpdates[key], 0.08)]),
  ) as Partial<Drives>;
  const relationshipUpdates = Object.fromEntries(
    RELATIONSHIP_KEYS.map((key) => [key, delta(reflection.relationshipUpdates[key], 0.03)]),
  ) as Partial<Record<NumericRelationshipKey, number>>;
  const traits = applyNumericUpdates(state.traits, traitUpdates);
  const mood = applyNumericUpdates(state.mood, moodUpdates);
  const drives = applyNumericUpdates(state.drives, driveUpdates);
  const relationship = applyNumericUpdates(state.relationship, relationshipUpdates);
  const updateById = new Map(reflection.arcUpdates.map((update) => [update.id, update]));
  const activeArcs: ActiveArc[] = state.activeArcs.map((arc) => {
    const update = updateById.get(arc.id);
    if (!update) return arc;
    return {
      ...arc,
      progress: clamp(arc.progress + delta(update.progressDelta, 0.03)),
      currentQuestion: update.currentQuestion?.trim() || arc.currentQuestion,
    };
  });
  const next = {
    ...state,
    traits,
    mood,
    drives,
    relationship,
    activeArcs,
    version: state.version + 1,
  };
  const changes = [
    changed("traits", state.traits, traits, "daily reflection personality drift (max 0.01 per trait)", "daily.reflection"),
    changed("mood", state.mood, mood, "daily reflection", "daily.reflection"),
    changed("drives", state.drives, drives, "daily reflection", "daily.reflection"),
    changed("relationship", state.relationship, relationship, "daily reflection", "daily.reflection"),
    changed("activeArcs", state.activeArcs, activeArcs, "daily arc progress", "daily.reflection"),
  ].filter((item): item is StateChangeDraft => item !== null);
  return { state: next, changes };
}

function validatePlacePreferenceUpdates(value: unknown): DailyReflection["placePreferenceUpdates"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const update = asObject(item);
    const placeId = asString(update?.placeId);
    if (!update || !placeId) return [];
    return [{
      placeId,
      familiarityDelta: delta(update.familiarityDelta, 0.03),
      impression: asString(update.impression).slice(0, 500) || undefined,
    }];
  }).slice(0, 5);
}

function validateCharacterUpdates(value: unknown): DailyReflection["characterUpdates"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const update = asObject(item);
    const stableKey = asString(update?.stableKey);
    if (!update || !stableKey) return [];
    return [{
      stableKey,
      relationshipDelta: delta(update.relationshipDelta, 0.02),
      currentSituation: asString(update.currentSituation).slice(0, 500) || undefined,
    }];
  }).slice(0, 6);
}

function validateReflection(value: JsonObject): DailyReflection | null {
  const summary = asString(value.summary);
  const reflection = asString(value.reflection);
  if (!summary || !reflection) return null;
  const arcUpdates = Array.isArray(value.arcUpdates)
    ? value.arcUpdates
        .map(asObject)
        .filter((update): update is JsonObject => update !== null)
        .map((update) => ({
          id: asString(update.id),
          progressDelta: delta(update.progressDelta, 0.03),
          currentQuestion: asString(update.currentQuestion) || undefined,
        }))
        .filter((update) => update.id)
        .slice(0, 8)
    : [];
  return {
    summary,
    reflection,
    moodUpdates: parseUpdates(value.moodUpdates, MOOD_KEYS, 0.08),
    driveUpdates: parseUpdates(value.driveUpdates, DRIVE_KEYS, 0.08),
    relationshipUpdates: parseUpdates(value.relationshipUpdates, RELATIONSHIP_KEYS, 0.03),
    traitUpdates: parseUpdates(value.traitUpdates, TRAIT_KEYS, 0.01),
    arcUpdates,
    relationshipSummary: asString(value.relationshipSummary).slice(0, 1_000),
    placePreferenceUpdates: validatePlacePreferenceUpdates(value.placePreferenceUpdates),
    interestUpdates: {
      added: asStringArray(asObject(value.interestUpdates)?.added).slice(0, 2),
      cooled: asStringArray(asObject(value.interestUpdates)?.cooled).slice(0, 2),
    },
    characterUpdates: validateCharacterUpdates(value.characterUpdates),
    weeklySummary: asString(value.weeklySummary).slice(0, 2_000) || null,
  };
}

export async function reflectOnDay(
  activity: unknown,
  state: CompanionState,
  config: RuntimeConfig,
  usageContext?: LlmUsageContext,
  includeWeeklySummary = false,
) {
  const fallback: DailyReflection = {
    summary: "今天的记录不足以支持明显的人格变化。",
    reflection: "保留当前边界，只让情绪和驱动力轻微回归稳定。",
    moodUpdates: { boredom: -0.01, concern: -0.01 },
    driveUpdates: { noveltySeeking: 0.005 },
    relationshipUpdates: {},
    traitUpdates: {},
    arcUpdates: [],
    relationshipSummary: "关系没有出现需要改写长期判断的新证据。",
    placePreferenceUpdates: [],
    interestUpdates: { added: [], cooled: [] },
    characterUpdates: [],
    weeklySummary: null,
  };
  const result = await callJson({
    messages: [
      { role: "system", content: REFLECTION_SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          reflectionPeriod: includeWeeklySummary ? "daily_and_weekly" : "daily",
          state,
          beliefs: config.character.beliefs,
          activity,
        }).slice(0, 18_000),
      },
    ],
    fallback,
    validate: validateReflection,
    model: config.model,
    temperature: 0.35,
    maxTokens: 1200,
    usageContext,
  });
  return {
    reflection: includeWeeklySummary ? result.data : { ...result.data, weeklySummary: null },
    raw: result.raw,
    usedFallback: result.usedFallback,
    error: result.error,
  };
}
