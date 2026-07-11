import type { JsonValue, MessageAnalysis, Topic, WorldSignal, WorldSignalType } from "@/core/types";
import { callJson } from "@/llm/client";
import type { LlmUsageContext } from "@/db/usageRepo";
import { ANALYZER_SYSTEM } from "@/llm/prompts";
import { asObject, asString, clamp01, type JsonObject } from "@/llm/json";
import { inferWorldSignals } from "@/world/userSignals";

const CRISIS_PATTERNS = [
  /(?:我)?(?:想|准备|打算)(?:去)?(?:死|自杀|伤害自己)/i,
  /不想活(?:了|下去)?/i,
  /结束(?:我)?自己的生命/i,
  /我想结束一切/i,
  /kill myself|end my life|suicid(?:e|al)|i (?:want|plan|am going) to die|i don['’]?t want to live/i,
  /(?:正在|马上|现在).*(?:伤害我|杀我|生命危险)/i,
];

export function detectCrisis(text: string): boolean {
  // Developers often anthropomorphize broken software ("这个 build 不想活了").
  // Remove only that narrow non-human subject form; "项目让我不想活" must remain a crisis hit.
  const humanText = text.replace(
    /(?:这个|那个|该)?\s*(?:build|进程|服务|程序|代码|项目)(?:自己|本身)?\s*不想活(?:了|下去)?/gi,
    "",
  );
  return CRISIS_PATTERNS.some((pattern) => pattern.test(humanText));
}

function inferTopics(text: string): Topic[] {
  const rules: Array<[RegExp, string]> = [
    [/(代码|编程|架构|api|typescript|next\.js|数据库|deploy|vercel|commit)/i, "software_project"],
    [/(ai|模型|llm|agent|companion|prompt)/i, "ai_companion"],
    [/(照片|图像|视觉|审美|photo|image)/i, "visual_aesthetic"],
    [/(记忆|忘记|memory)/i, "memory"],
    [/(累|焦虑|难过|害怕|压力|崩溃)/i, "emotional_state"],
    [/(工作|项目|截止|需求)/i, "work"],
  ];
  const topics = rules
    .filter(([pattern]) => pattern.test(text))
    .map(([, name]) => ({ name, confidence: 0.72 }));
  return topics.length ? topics.slice(0, 4) : [{ name: "daily_life", confidence: 0.55 }];
}

function heuristicAnalysis(text: string): MessageAnalysis {
  const crisis = detectCrisis(text);
  const technical = /(代码|架构|bug|api|数据库|typescript|next\.js|deploy|vercel)/i.test(text);
  const distressed = /(累|焦虑|难过|害怕|压力|崩溃|烦)/i.test(text);
  const question = /[?？]|怎么|为什么|如何/.test(text);
  return {
    topics: inferTopics(text),
    emotion: crisis ? "crisis" : distressed ? "distressed" : question ? "curious" : "neutral",
    intent: crisis ? "safety_crisis" : technical ? "technical_discussion" : question ? "question" : "conversation",
    importance: crisis ? 1 : Math.min(0.8, 0.38 + text.length / 500 + (distressed ? 0.15 : 0)),
    novelty: technical ? 0.55 : 0.42,
    summary: text.length > 100 ? `${text.slice(0, 97)}...` : text,
    worldSignals: inferWorldSignals(text),
  };
}

const WORLD_SIGNAL_TYPES = new Set<WorldSignalType>([
  "place_recommendation",
  "user_schedule",
  "user_commitment",
  "mira_suggestion",
  "correction",
  "external_information_candidate",
  "user_busy",
  "relationship_intent",
]);

function validateWorldSignals(value: unknown): WorldSignal[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(asObject)
    .filter((item): item is JsonObject => item !== null)
    .flatMap((item) => {
      const type = asString(item.type) as WorldSignalType;
      const subject = asString(item.subject);
      const content = asString(item.content);
      if (!WORLD_SIGNAL_TYPES.has(type) || !subject || !content) return [];
      const expectedAt = asString(item.expectedAt);
      const metadata = asObject(item.metadata) as Record<string, JsonValue> | null;
      return [{
        type,
        subject,
        content,
        confidence: clamp01(item.confidence, 0.5),
        expectedAt:
          expectedAt && Number.isFinite(new Date(expectedAt).getTime()) ? expectedAt : undefined,
        metadata: metadata ?? undefined,
      } satisfies WorldSignal];
    })
    .slice(0, 8);
}

function validateAnalysis(value: JsonObject): MessageAnalysis | null {
  const rawTopics = Array.isArray(value.topics) ? value.topics : [];
  const topics = rawTopics
    .map(asObject)
    .filter((topic): topic is JsonObject => topic !== null)
    .map((topic) => ({ name: asString(topic.name), confidence: clamp01(topic.confidence, 0.5) }))
    .filter((topic) => topic.name)
    .slice(0, 6);
  const emotion = asString(value.emotion);
  const intent = asString(value.intent);
  if (!topics.length || !emotion || !intent) return null;
  return {
    topics,
    emotion,
    intent,
    importance: clamp01(value.importance, 0.5),
    novelty: clamp01(value.novelty, 0.5),
    summary: asString(value.summary),
    worldSignals: validateWorldSignals(value.worldSignals),
  };
}

function mergeWorldSignals(primary: WorldSignal[], fallback: WorldSignal[]) {
  const unique = new Map<string, WorldSignal>();
  for (const item of [...primary, ...fallback]) {
    const key = `${item.type}:${item.subject.toLocaleLowerCase("zh-CN")}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].slice(0, 8);
}

export async function analyzeMessage(text: string, model?: string, usageContext?: LlmUsageContext): Promise<{
  analysis: MessageAnalysis;
  raw: JsonObject | null;
  usedFallback: boolean;
  error: string | null;
}> {
  const fallback = heuristicAnalysis(text);
  // Safety classification must not depend on an available model or valid JSON.
  if (detectCrisis(text)) return { analysis: fallback, raw: null, usedFallback: true, error: null };

  const result = await callJson({
    messages: [
      { role: "system", content: ANALYZER_SYSTEM },
      { role: "user", content: text },
    ],
    fallback,
    validate: validateAnalysis,
    model,
    temperature: 0.1,
    maxTokens: 500,
    usageContext,
  });
  return {
    analysis: {
      ...result.data,
      worldSignals: mergeWorldSignals(result.data.worldSignals, fallback.worldSignals),
    },
    raw: result.raw,
    usedFallback: result.usedFallback,
    error: result.error,
  };
}
