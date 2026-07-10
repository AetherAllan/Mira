import type { MessageAnalysis, MemoryCandidate, SelectedMemory } from "@/core/types";

interface MemoryLike {
  id: string;
  kind: SelectedMemory["kind"];
  content: string;
  tagsJson?: unknown;
  tags?: unknown;
  importance: number;
  confidence: number;
  useCount: number;
  cooldownUntil: Date | string | null;
}

function words(text: string): Set<string> {
  return new Set(text.toLocaleLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? []);
}

function overlap(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let hits = 0;
  for (const item of left) if (right.has(item)) hits += 1;
  return hits / Math.max(1, Math.min(left.size, right.size));
}

export function selectRelevantMemories(
  rows: MemoryLike[],
  userMessage: string,
  analysis: MessageAnalysis,
  limit = 4,
  now = new Date(),
): SelectedMemory[] {
  const query = words(`${userMessage} ${analysis.topics.map((topic) => topic.name).join(" ")}`);
  return rows
    .filter((row) => !row.cooldownUntil || new Date(row.cooldownUntil) <= now)
    .map((row) => {
      const tagsSource = row.tagsJson ?? row.tags;
      const tags = Array.isArray(tagsSource)
        ? tagsSource.filter((tag): tag is string => typeof tag === "string")
        : [];
      const relevance = overlap(query, words(`${row.content} ${tags.join(" ")}`));
      const score = relevance * 0.55 + row.importance * 0.25 + row.confidence * 0.2 - Math.min(0.15, row.useCount * 0.01);
      return { row, tags, score };
    })
    .filter((item) => item.score >= 0.2)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ row, tags }) => ({
      id: row.id,
      kind: row.kind,
      content: row.content,
      tags,
      importance: row.importance,
      confidence: row.confidence,
      useCount: row.useCount,
      cooldownUntil: row.cooldownUntil ? new Date(row.cooldownUntil) : null,
    }));
}

export function shouldStoreMemory(candidate: MemoryCandidate | null, threshold: number): candidate is MemoryCandidate {
  return Boolean(candidate?.content.trim()) && (candidate?.importance ?? 0) >= threshold;
}

export function memoryCooldownWarnings(memories: SelectedMemory[]): string[] {
  return memories
    .filter((memory) => memory.useCount >= 2)
    .map((memory) => `Memory ${memory.id} has already been reused ${memory.useCount} times; avoid quoting it verbatim.`);
}
