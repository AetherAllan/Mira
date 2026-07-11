import type { ShareCandidate } from "@/world/types";

export interface ShareScoreContext {
  currentShareDesire: number;
  eventImportance: number;
  relationshipTrust: number;
  miraIrritation: number;
  quietHours: boolean;
  userLikelyBusy: boolean;
  hasUnansweredProactive: boolean;
  dailySentCount: number;
  dailyLimit?: number;
  hoursSinceLastProactive: number;
  minimumIntervalHours?: number;
  threshold?: number;
}

export interface ShareEvaluation {
  score: number;
  shouldShare: boolean;
  blockedBy: string[];
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function scoreShareCandidate(
  candidate: Pick<
    ShareCandidate,
    | "emotionalIntensity"
    | "relevanceToUser"
    | "novelty"
    | "intimacy"
    | "urgency"
    | "interruptionCost"
  >,
  context: ShareScoreContext,
): ShareEvaluation {
  const base =
    0.24 * clamp01(candidate.emotionalIntensity) +
    0.22 * clamp01(candidate.relevanceToUser) +
    0.15 * clamp01(candidate.novelty) +
    0.12 * clamp01(candidate.intimacy) +
    0.12 * clamp01(candidate.urgency) +
    0.09 * clamp01(context.eventImportance) +
    0.06 * clamp01(context.currentShareDesire);
  const penalty =
    0.15 * clamp01(candidate.interruptionCost) +
    0.05 * clamp01(context.miraIrritation) +
    0.04 * (1 - clamp01(context.relationshipTrust));
  const score = clamp01(base - penalty);
  const blockedBy: string[] = [];
  const dailyLimit = context.dailyLimit ?? 3;
  const minimumInterval = context.minimumIntervalHours ?? 4;

  if (context.quietHours) blockedBy.push("quiet_hours");
  if (context.userLikelyBusy) blockedBy.push("user_busy");
  if (context.hasUnansweredProactive) blockedBy.push("unanswered_proactive");
  if (context.dailySentCount >= dailyLimit) blockedBy.push("daily_limit");
  if (context.hoursSinceLastProactive < minimumInterval) blockedBy.push("minimum_interval");
  if (score < (context.threshold ?? 0.62)) blockedBy.push("below_threshold");

  return { score, shouldShare: blockedBy.length === 0, blockedBy };
}
