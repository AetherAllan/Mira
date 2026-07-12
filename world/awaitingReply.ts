import type { AwaitingReply } from "@/world/types";
import { clamp01 } from "@/lib/number";

export interface ReplyEmotionImpact {
  disappointmentDelta: number;
  irritationDelta: number;
}

export interface AwaitingReplyEvaluation extends ReplyEmotionImpact {
  awaitingReply: AwaitingReply;
  reason: string;
}

const HOUR_MS = 60 * 60 * 1000;

function consequenceKind(reply: AwaitingReply) {
  if (reply.userCommitment) return "missed_commitment" as const;
  if (reply.vulnerableDisclosure) return "vulnerable_disclosure" as const;
  if (reply.explicitQuestion) return "explicit_question" as const;
  return "ordinary_chat" as const;
}

function deadlineFor(reply: AwaitingReply) {
  if (reply.userCommitment && reply.expectedAt) {
    return new Date(reply.expectedAt.getTime() + (reply.userSaidBusy ? 8 * HOUR_MS : 0));
  }
  const hours = reply.vulnerableDisclosure ? 12 : reply.explicitQuestion ? 8 : 24;
  const busyMultiplier = reply.userSaidBusy ? 2 : 1;
  return new Date(reply.startedAt.getTime() + hours * busyMultiplier * HOUR_MS);
}

export function evaluateAwaitingReply(reply: AwaitingReply, now: Date): AwaitingReplyEvaluation {
  const empty = { disappointmentDelta: 0, irritationDelta: 0 };
  if (reply.status !== "waiting" || reply.consequenceAppliedAt) {
    return { awaitingReply: { ...reply }, ...empty, reason: "already_settled" };
  }
  if (now.getTime() < deadlineFor(reply).getTime()) {
    return { awaitingReply: { ...reply }, ...empty, reason: "within_grace_period" };
  }

  const kind = consequenceKind(reply);
  if (kind === "ordinary_chat") {
    return {
      awaitingReply: { ...reply, status: "timed_out" },
      ...empty,
      reason: kind,
    };
  }

  const weight = (clamp01(reply.expectation) + clamp01(reply.emotionalWeight)) / 2;
  const busyMultiplier = reply.userSaidBusy ? 0.15 : 1;
  const base =
    kind === "missed_commitment"
      ? { disappointment: 0.07, irritation: 0.025 }
      : kind === "vulnerable_disclosure"
        ? { disappointment: 0.06, irritation: 0 }
        : { disappointment: 0.025, irritation: 0 };

  return {
    awaitingReply: {
      ...reply,
      status: "timed_out",
      consequenceAppliedAt: now,
    },
    disappointmentDelta: base.disappointment * weight * busyMultiplier,
    irritationDelta: base.irritation * weight * busyMultiplier,
    reason: kind,
  };
}

export function canExpressDissatisfaction(reply: AwaitingReply) {
  return Boolean(
    reply.consequenceAppliedAt &&
      !reply.dissatisfactionExpressedAt &&
      !reply.userSaidBusy &&
      reply.emotionalWeight >= 0.65,
  );
}

export function markDissatisfactionExpressed(reply: AwaitingReply, at: Date): AwaitingReply {
  if (!canExpressDissatisfaction(reply)) return { ...reply };
  return { ...reply, dissatisfactionExpressedAt: at };
}

export function resolveAwaitingReply(
  reply: AwaitingReply,
  at: Date,
  explanationProvided: boolean,
): AwaitingReplyEvaluation {
  if (reply.status === "resolved" || reply.status === "dismissed") {
    return {
      awaitingReply: { ...reply },
      disappointmentDelta: 0,
      irritationDelta: 0,
      reason: "already_settled",
    };
  }

  if (!reply.consequenceAppliedAt) {
    return {
      awaitingReply: { ...reply, status: "resolved", resolvedAt: at },
      disappointmentDelta: 0,
      irritationDelta: 0,
      reason: explanationProvided ? "resolved_with_explanation" : "resolved",
    };
  }

  const weight = clamp01(reply.emotionalWeight);
  return {
    awaitingReply: { ...reply, status: "resolved", resolvedAt: at },
    // Recovery is intentionally partial; the world reducer handles the remaining 24–72h decay.
    disappointmentDelta: -(explanationProvided ? 0.025 : 0.008) * weight,
    irritationDelta: -(explanationProvided ? 0.012 : 0.003) * weight,
    reason: explanationProvided ? "resolved_with_explanation" : "resolved",
  };
}
