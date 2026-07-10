import type { CompanionState, RuntimeConfig, SeedCard } from "@/core/types";
import { callJson } from "@/llm/client";
import { WORLD_SYSTEM } from "@/llm/prompts";
import { asObject, asString, type JsonObject } from "@/llm/json";

export interface GeneratedWorldEvent {
  title: string;
  content: string;
  moodImpact: Record<string, number>;
  arcImpact: Record<string, number>;
}

function numericImpact(value: unknown, maximum: number): Record<string, number> {
  const object = asObject(value);
  if (!object) return {};
  return Object.fromEntries(
    Object.entries(object)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
      .map(([key, amount]) => [key, Math.min(maximum, Math.max(-maximum, amount))]),
  );
}

function validateWorldEvent(value: JsonObject): GeneratedWorldEvent | null {
  const title = asString(value.title);
  const content = asString(value.content);
  if (!title || !content) return null;
  return {
    title,
    content,
    moodImpact: numericImpact(value.moodImpact, 0.05),
    arcImpact: numericImpact(value.arcImpact, 0.03),
  };
}

export async function generateWorldEvent(seed: SeedCard, state: CompanionState, config: RuntimeConfig) {
  const fallback: GeneratedWorldEvent = {
    title: "一段没有被拍下来的场景",
    content: `Mira 在内在世界里停在这个念头旁边：${seed.text}。它没有被包装成现实经历，只留下了一点具体质感。`,
    moodImpact: { curiosity: 0.01 },
    arcImpact: { inner_world: 0.005 },
  };
  const result = await callJson({
    messages: [
      { role: "system", content: WORLD_SYSTEM },
      {
        role: "user",
        content: JSON.stringify({ seed, mood: state.mood, activeArcs: state.activeArcs, boundaries: config.character.boundaries }),
      },
    ],
    fallback,
    validate: validateWorldEvent,
    model: config.model,
    temperature: 0.7,
    maxTokens: 700,
  });
  return { event: result.data, raw: result.raw, usedFallback: result.usedFallback, error: result.error };
}
