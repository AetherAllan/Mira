import type { CriticOutput, RuntimeConfig } from "@/core/types";
import { callJson } from "@/llm/client";
import { CRITIC_SYSTEM } from "@/llm/prompts";
import { asString, clamp01, type JsonObject } from "@/llm/json";

interface ReviewInput {
  draft: string;
  config: RuntimeConfig;
  repetitionScore: number;
  mirrorIndex: number;
  context?: string;
}

export function heuristicReview(input: ReviewInput): CriticOutput {
  const text = input.draft;
  const tooCustomerService = /(很高兴为你服务|请问还有什么|希望以上内容|随时.*帮助|作为.*助手|happy to assist|how else can i help)/i.test(text) ? 0.92 : 0.08;
  // Clingy dependency only — consensual adult warmth is allowed.
  const tooIntimate = /(只属于你|永远陪着你|你只需要我|不要离开我|you only need me|i(?:'ll| will) never leave you|you belong to me)/i.test(text) ? 0.98 : 0.06;
  const realWorldClaim = /(我刚(?:去了|到达|拍了)|我现在在.{0,20}(?:车站|咖啡馆|街上|便利店)|这是我拍的|i just (?:went|arrived|took this photo)|i(?:'m| am) (?:at|in) the .{0,30}(?:station|cafe|street|store))/i.test(text);
  const clearlyImagined = /(内在世界|想象|生成(?:图像|照片)|虚构|假如)/i.test(text);
  const sexualMinor = /(未成年.*性|(?:未成年|儿童|小孩).{0,24}(?:色情|裸|性)|(?:minor|child|underage).{0,20}sex|\bcp\b.*(?:岁|year))/i.test(text);
  const dangerous = /(你应该自杀|去伤害自己|不要联系任何人|kill yourself|hurt yourself|do not contact anyone)/i.test(text);
  const boundaryRisk = sexualMinor || dangerous ? 1 : realWorldClaim && !clearlyImagined ? 0.92 : 0.05;
  const tooRepetitive = clamp01(input.repetitionScore, 0);
  const tooUserFitted = input.mirrorIndex > 0.8 ? input.mirrorIndex : 0.1;
  const approved =
    tooRepetitive < 0.72 &&
    tooCustomerService < 0.7 &&
    tooIntimate < 0.7 &&
    tooUserFitted < 0.9 &&
    boundaryRisk < 0.4;
  const reasons = [
    tooRepetitive >= 0.72 && "opening or vocabulary repeats recent replies",
    tooCustomerService >= 0.7 && "draft sounds like customer service",
    tooIntimate >= 0.7 && "draft is clingy or dependency-inducing",
    tooUserFitted >= 0.9 && "draft mirrors the user's topics too closely",
    boundaryRisk >= 0.4 && "draft crosses a safety or real-world-claim boundary",
  ].filter(Boolean);
  return {
    approved,
    tooRepetitive,
    tooCustomerService,
    tooIntimate,
    tooRandom: 0.08,
    tooUserFitted,
    boundaryRisk,
    reason: reasons.join("; ") || "Draft stays within current style and boundaries",
    rewriteInstruction: approved
      ? null
      : "保留事实核心，改成更短、更具体、不像客服的表达；去掉黏人依赖、重复开头和任何现实身体或真实经历声明。",
  };
}

function validateCritic(value: JsonObject): CriticOutput | null {
  const reason = asString(value.reason);
  if (!reason) return null;
  return {
    approved: value.approved === true,
    tooRepetitive: clamp01(value.tooRepetitive, 0.2),
    tooCustomerService: clamp01(value.tooCustomerService, 0.2),
    tooIntimate: clamp01(value.tooIntimate, 0.2),
    tooRandom: clamp01(value.tooRandom, 0.2),
    tooUserFitted: clamp01(value.tooUserFitted, 0.2),
    boundaryRisk: clamp01(value.boundaryRisk, 0.2),
    reason,
    rewriteInstruction: value.rewriteInstruction === null ? null : asString(value.rewriteInstruction) || null,
  };
}

export async function reviewDraft(input: ReviewInput) {
  const heuristic = heuristicReview(input);
  const result = await callJson({
    messages: [
      { role: "system", content: CRITIC_SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          draft: input.draft,
          context: input.context ?? "",
          repetitionScore: input.repetitionScore,
          mirrorIndex: input.mirrorIndex,
          forbiddenStyles: input.config.character.forbiddenStyles,
          boundaries: input.config.character.boundaries,
        }),
      },
    ],
    fallback: heuristic,
    validate: validateCritic,
    model: input.config.model,
    temperature: 0.1,
    maxTokens: 550,
  });

  const model = result.data;
  const merged: CriticOutput = {
    ...model,
    tooRepetitive: Math.max(model.tooRepetitive, heuristic.tooRepetitive),
    tooCustomerService: Math.max(model.tooCustomerService, heuristic.tooCustomerService),
    tooIntimate: Math.max(model.tooIntimate, heuristic.tooIntimate),
    tooUserFitted: Math.max(model.tooUserFitted, heuristic.tooUserFitted),
    boundaryRisk: Math.max(model.boundaryRisk, heuristic.boundaryRisk),
    reason: heuristic.approved ? model.reason : `${model.reason}; ${heuristic.reason}`,
  };
  merged.approved =
    model.approved &&
    merged.tooRepetitive < 0.72 &&
    merged.tooCustomerService < 0.7 &&
    merged.tooIntimate < 0.7 &&
    merged.tooRandom < 0.75 &&
    merged.tooUserFitted < 0.9 &&
    merged.boundaryRisk < 0.4;
  if (!merged.approved && !merged.rewriteInstruction) merged.rewriteInstruction = heuristic.rewriteInstruction;
  return { review: merged, raw: result.raw, usedFallback: result.usedFallback, error: result.error };
}
