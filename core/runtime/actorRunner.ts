import { isEchoReply } from "@/core/metrics";
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
    const tip = (input.userMessage ?? "").trim().slice(0, 80) || "你刚说的那句";
    const candidate = input.groundedContext?.shareCandidate;
    const candidateRef = typeof candidate?.sourceId === "string" ? candidate.sourceId : null;
    const candidateType = candidate?.sourceType === "world_event"
      ? "world"
      : candidate?.sourceType === "external_information"
        ? "external"
        : "opinion";
    actor = {
      ...actor,
      output: {
        ...actor.output,
        message: input.plan.action === "proactive_message"
          ? (input.groundedContext?.shareCandidate?.contentSummary as string | undefined) ?? "有件事我想等信息更确定一点再说。"
          : `嗯，我听到了：${tip}\n这次我只说能确定的部分。`,
        factClaims: candidateRef
          ? [{ type: candidateType, sourceRefs: candidateType === "opinion" ? [] : [candidateRef] }]
          : [],
        groundingRefs: candidateRef && candidateType !== "opinion" ? [candidateRef] : [],
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
