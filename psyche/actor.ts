import type { ActorOutput, MemoryCandidate, MemoryKind, ToolRequest } from "@/core/types";
import { buildBudgetedActorPrompt, type ActorPromptInput } from "@/core/promptBuilder";
import { callJson } from "@/llm/client";
import { ACTOR_SYSTEM } from "@/llm/prompts";
import { asObject, asString, asStringArray, clamp01, type JsonObject } from "@/llm/json";

const MEMORY_KINDS: MemoryKind[] = [
  "user_memory",
  "relationship_memory",
  "self_memory",
  "world_experience",
];

function fallbackMessage(input: ActorPromptInput): string {
  if (input.plan.action === "proactive_message") {
    const candidate = input.groundedContext?.shareCandidate?.contentSummary;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    return "刚想到一件小事：今天只推进一个最小动作，也比同时拖着五个宏大计划诚实。";
  }
  if (input.analysis?.intent === "technical_discussion") {
    return "先把最小闭环钉住：输入、状态变化、输出和审计记录走同一条数据链。Dashboard 只观察它，别再造第二套真相。";
  }
  if (input.analysis?.emotion === "distressed") {
    return "先别急着把整件事解释清楚。挑眼前最具体、十分钟内能处理的一步；其余问题先排队。";
  }
  const candidate = input.groundedContext?.shareCandidate?.contentSummary;
  return typeof candidate === "string" && candidate.trim()
    ? `${candidate}。不过先说回你这句。`
    : "这件事里最值得继续看的，不是漂亮结论，而是你下一步实际会怎么做。";
}

function fallbackOutput(input: ActorPromptInput): ActorOutput {
  const photo = input.plan.toolAllowed && input.plan.mode === "photo_share";
  return {
    message: fallbackMessage(input),
    factClaims: [],
    groundingRefs: [],
    proposedWorldMutation: null,
    toolCall: photo
      ? {
          name: "generate_fake_photo",
          arguments: {
            scene: typeof input.groundedContext?.shareCandidate?.contentSummary === "string"
              ? input.groundedContext.shareCandidate.contentSummary
              : "一段未完成的内在世界场景",
            mood: "克制、略带颗粒感",
            style: "像记忆，不像广告",
          },
        }
      : null,
    memoryCandidate: null,
  };
}

function parseFactClaims(value: unknown): ActorOutput["factClaims"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const claim = asObject(item);
    const type = asString(claim?.type) as ActorOutput["factClaims"][number]["type"];
    if (!claim || !["world", "external", "opinion"].includes(type)) return [];
    return [{ type, sourceRefs: asStringArray(claim.sourceRefs).slice(0, 12) }];
  }).slice(0, 12);
}

function parseTool(value: unknown, allowed: boolean): ToolRequest | null {
  if (!allowed) return null;
  const tool = asObject(value);
  const args = asObject(tool?.arguments);
  // The model never gets to extend the tool allowlist.
  if (asString(tool?.name) !== "generate_fake_photo" || !args) return null;
  return {
    name: "generate_fake_photo",
    arguments: {
      scene: asString(args.scene),
      mood: asString(args.mood),
      style: asString(args.style),
    },
  };
}

function parseMemory(value: unknown): MemoryCandidate | null {
  const memory = asObject(value);
  if (!memory) return null;
  const kind = asString(memory.kind) as MemoryKind;
  const content = asString(memory.content);
  if (!MEMORY_KINDS.includes(kind) || !content) return null;
  return {
    kind,
    content,
    tags: asStringArray(memory.tags).slice(0, 8),
    importance: clamp01(memory.importance, 0.5),
  };
}

function validateActor(value: JsonObject, input: ActorPromptInput): ActorOutput | null {
  const message = asString(value.message);
  if (!message) return null;
  return {
    message: message.slice(0, 3800),
    factClaims: parseFactClaims(value.factClaims),
    groundingRefs: asStringArray(value.groundingRefs).slice(0, 24),
    proposedWorldMutation: (() => {
      const mutation = asObject(value.proposedWorldMutation);
      const payload = asObject(mutation?.payload);
      const type = asString(mutation?.type);
      const reason = asString(mutation?.reason);
      return mutation && payload && type && reason ? { type, payload, reason } : null;
    })(),
    toolCall: parseTool(value.toolCall, input.plan.toolAllowed),
    memoryCandidate: parseMemory(value.memoryCandidate),
  };
}

export async function act(input: ActorPromptInput) {
  const fallback = fallbackOutput(input);
  const budgeted = buildBudgetedActorPrompt(input);
  const result = await callJson({
    messages: [
      { role: "system", content: ACTOR_SYSTEM },
      { role: "user", content: budgeted.prompt },
    ],
    fallback,
    validate: (value) => validateActor(value, input),
    model: input.config.model,
    temperature: 0.65,
    maxTokens: 950,
    webSearch: input.plan.webAccess === "search",
    usageContext: input.usageContext,
  });
  return {
    output: result.data,
    raw: result.raw,
    usedFallback: result.usedFallback,
    error: result.error,
    citations: result.citations,
    promptDebug: {
      context: budgeted.context,
      estimatedTokens: budgeted.estimatedTokens,
      tokenBudget: budgeted.tokenBudget,
      contextHash: budgeted.contextHash,
    },
  };
}
