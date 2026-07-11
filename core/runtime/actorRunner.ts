import { isEchoReply } from "@/core/metrics";
import type { ActorOutput } from "@/core/types";
import { act } from "@/psyche/actor";
import { executeTool, type ToolExecution } from "@/tools/registry";
import { validateActorGrounding } from "@/world/grounding";

export interface ActorResult {
  finalText: string;
  actorOutput: Awaited<ReturnType<typeof act>>["output"];
  actorRaw: unknown;
  toolExecution: ToolExecution | null;
  citations: Awaited<ReturnType<typeof act>>["citations"];
  promptDebug: Awaited<ReturnType<typeof act>>["promptDebug"];
  grounding: ReturnType<typeof validateActorGrounding>;
}

function composeToolResult(message: string, execution: ToolExecution | null): string {
  if (!execution?.ok) return message;
  const description = execution.result.description;
  return typeof description === "string"
    ? `${message}\n\n「生成图像 / 内在世界场景：${description}」`
    : message;
}

const WEEKDAY_ZH: Record<string, string> = {
  Monday: "一",
  Tuesday: "二",
  Wednesday: "三",
  Thursday: "四",
  Friday: "五",
  Saturday: "六",
  Sunday: "日",
};

export function buildDeterministicActorFallback(
  input: Pick<Parameters<typeof act>[0], "userMessage" | "groundedContext">,
): Pick<ActorOutput, "message" | "factClaims" | "groundingRefs"> {
  const context = input.groundedContext;
  const userMessage = input.userMessage?.trim() ?? "";
  if (context && /(?:几点|时间|周几|星期几|日期|几号)/u.test(userMessage)) {
    const weekday = WEEKDAY_ZH[context.temporal.weekday] ?? context.temporal.weekday;
    return {
      message: `现在是北京时间 ${context.temporal.localDate} ${context.temporal.localTime.slice(0, 5)}，周${weekday}。`,
      factClaims: [{ type: "world" as const, sourceRefs: ["temporal:observed"] }],
      groundingRefs: ["temporal:observed"],
    };
  }
  if (context && /(?:在哪|哪里|什么地方|干嘛|做什么)/u.test(userMessage)) {
    const place = context.currentLocation;
    const activity = context.currentActivity;
    if (place || activity) {
      const refs = [place?.id, activity?.id].filter((value): value is string => Boolean(value));
      return {
        message: `${place ? `我现在在${place.name}` : "我现在的位置没确认"}${activity ? `，正${activity.title}` : ""}。`,
        factClaims: [{ type: "world" as const, sourceRefs: refs }],
        groundingRefs: refs,
      };
    }
  }
  const place = context?.currentLocation;
  const activity = context?.currentActivity;
  if (place || activity) {
    const refs = [place?.id, activity?.id].filter((value): value is string => Boolean(value));
    return {
      message: `${place ? `我现在在${place.name}` : ""}${activity ? `，正${activity.title}` : ""}。别的细节我先不乱补。`,
      factClaims: [{ type: "world" as const, sourceRefs: refs }],
      groundingRefs: refs,
    };
  }
  const tip = userMessage.slice(0, 80) || "你刚说的那句";
  return {
    message: `你问的是“${tip}”。我刚才那句不准，先收回。`,
    factClaims: [],
    groundingRefs: [],
  };
}

// Actor prose is not a world-authority boundary. It gets one grounded rewrite,
// then a deterministic fallback; tool names remain constrained by the registry.
export async function runActor(input: Parameters<typeof act>[0]): Promise<ActorResult> {
  const recentAssistant = (input.recentMessages ?? [])
    .filter((item) => item.role === "assistant")
    .map((item) => item.text);

  let actor = await act(input);
  const validationContext = () => {
    if (!input.groundedContext || actor.citations.length === 0) return input.groundedContext;
    const citationFacts = actor.citations.map((citation) => ({
      id: citation.url,
      sourceName: "OpenRouter web search",
      sourceUrl: citation.url,
      title: citation.title,
      factualSummary: citation.content,
    }));
    return {
      ...input.groundedContext,
      externalInformation: [...input.groundedContext.externalInformation, ...citationFacts],
      allowedReferenceIds: [
        ...input.groundedContext.allowedReferenceIds,
        ...actor.citations.map((citation) => citation.url),
      ],
    };
  };
  let grounding = validateActorGrounding(actor.output, validationContext());
  if (isEchoReply(actor.output.message, recentAssistant) || !grounding.valid) {
    actor = await act({
      ...input,
      cooldownWarnings: [
        ...input.cooldownWarnings,
        ...(isEchoReply(actor.output.message, recentAssistant)
          ? ["FORBIDDEN: do not reuse a prior reply. Answer only the latest user message."]
          : []),
        ...(!grounding.valid
          ? [`Grounding failed (${grounding.reasons.join(", ")}). Use only allowed IDs; proposedWorldMutation must be null.`]
          : []),
      ],
    });
    grounding = validateActorGrounding(actor.output, validationContext());
  }
  if (isEchoReply(actor.output.message, recentAssistant) || !grounding.valid) {
    const candidate = input.groundedContext?.shareCandidate;
    const candidateRef = typeof candidate?.sourceId === "string" ? candidate.sourceId : null;
    const candidateType = candidate?.sourceType === "world_event"
      ? "world"
      : candidate?.sourceType === "external_information"
        ? "external"
        : "opinion";
    const fallback: Pick<ActorOutput, "message" | "factClaims" | "groundingRefs"> =
      input.plan.action === "proactive_message"
      ? {
          message: (input.groundedContext?.shareCandidate?.contentSummary as string | undefined) ?? "有件事我想等信息更确定一点再说。",
          factClaims: candidateRef
            ? [{ type: candidateType, sourceRefs: candidateType === "opinion" ? [] : [candidateRef] }]
            : [],
          groundingRefs: candidateRef && candidateType !== "opinion" ? [candidateRef] : [],
        }
      : buildDeterministicActorFallback(input);
    actor = {
      ...actor,
      output: {
        ...actor.output,
        ...fallback,
        proposedWorldMutation: null,
        toolCall: null,
      },
      raw: actor.raw,
      citations: [],
    };
    grounding = { valid: true, reasons: ["deterministic_grounded_fallback"] };
  }

  const toolExecution = actor.output.toolCall ? await executeTool(actor.output.toolCall) : null;
  return {
    finalText: composeToolResult(actor.output.message, toolExecution),
    actorOutput: actor.output,
    actorRaw: actor.raw,
    toolExecution,
    citations: actor.citations,
    promptDebug: actor.promptDebug,
    grounding,
  };
}
