import type { ActorOutput, MemoryCandidate, MemoryKind, ToolRequest } from "@/core/types";
import { buildActorPrompt, type ActorPromptInput } from "@/core/promptBuilder";
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
    if (input.selectedSeed) {
      return input.plan.mode === "inner_world_scene" || input.plan.mode === "photo_share"
        ? `内在世界里冒出一个场景：${input.selectedSeed.text}`
        : input.selectedSeed.text;
    }
    return "刚想到一件小事：今天只推进一个最小动作，也比同时拖着五个宏大计划诚实。";
  }
  if (input.analysis?.intent === "technical_discussion") {
    return "先把最小闭环钉住：输入、状态变化、输出和审计记录走同一条数据链。Dashboard 只观察它，别再造第二套真相。";
  }
  if (input.analysis?.emotion === "distressed") {
    return "先别急着把整件事解释清楚。挑眼前最具体、十分钟内能处理的一步；其余问题先排队。";
  }
  return input.selectedSeed
    ? `你这句话让我想到一个不太相干但更有意思的切面：${input.selectedSeed.text}`
    : "这件事里最值得继续看的，不是漂亮结论，而是你下一步实际会怎么做。";
}

function fallbackOutput(input: ActorPromptInput): ActorOutput {
  const photo = input.plan.toolAllowed && input.plan.mode === "photo_share" && input.selectedSeed;
  return {
    message: fallbackMessage(input),
    toolCall: photo
      ? {
          name: "generate_fake_photo",
          arguments: {
            scene: input.selectedSeed?.text ?? "一段未完成的内在世界场景",
            mood: "克制、略带颗粒感",
            style: "像记忆，不像广告",
          },
        }
      : null,
    memoryCandidate: null,
  };
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
    toolCall: parseTool(value.toolCall, input.plan.toolAllowed),
    memoryCandidate: parseMemory(value.memoryCandidate),
  };
}

export async function act(input: ActorPromptInput) {
  const fallback = fallbackOutput(input);
  const result = await callJson({
    messages: [
      { role: "system", content: ACTOR_SYSTEM },
      { role: "user", content: buildActorPrompt(input) },
    ],
    fallback,
    validate: (value) => validateActor(value, input),
    model: input.config.model,
    temperature: input.rewriteInstruction ? 0.25 : 0.65,
    maxTokens: 950,
  });
  return { output: result.data, raw: result.raw, usedFallback: result.usedFallback, error: result.error };
}

export async function rewriteOnce(input: ActorPromptInput, draft: string, instruction: string) {
  const rewrittenInput: ActorPromptInput = {
    ...input,
    plan: { ...input.plan, toolAllowed: false },
    draft,
    rewriteInstruction: instruction,
  };
  return act(rewrittenInput);
}
