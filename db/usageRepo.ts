import { getDb } from "@/db/client";
import { llmUsageLogs } from "@/db/schema";

export type LlmUsageCategory = typeof llmUsageLogs.$inferInsert.category;

export interface LlmUsageContext {
  companionId: string;
  correlationId?: string;
  category: LlmUsageCategory;
  metadata?: Record<string, unknown>;
}

export async function recordLlmUsage(input: {
  context: LlmUsageContext;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  latencyMs: number;
  usedFallback: boolean;
  error?: string | null;
}) {
  await getDb().insert(llmUsageLogs).values({
    companionId: input.context.companionId,
    correlationId: input.context.correlationId,
    category: input.context.category,
    model: input.model,
    promptTokens: input.promptTokens ?? 0,
    completionTokens: input.completionTokens ?? 0,
    totalTokens: input.totalTokens ?? 0,
    costUsd: input.costUsd,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    usedFallback: input.usedFallback,
    error: input.error,
    metadataJson: input.context.metadata ?? {},
  });
}
