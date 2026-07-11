import type { CompanionState, MessageAnalysis, SeedCard } from "@/core/types";
import { hoursSince } from "@/lib/time";

function tagOverlap(seed: SeedCard, analysis?: MessageAnalysis | null): number {
  const topics = new Set(analysis?.topics.map((topic) => topic.name) ?? []);
  if (!topics.size || !seed.tags.length) return 0;
  return seed.tags.filter((tag) => topics.has(tag)).length / seed.tags.length;
}

function seedWeight(seed: SeedCard, options: { analysis?: MessageAnalysis | null; mirrorIndex?: number; now: Date }): number {
  const differenceBoost =
    (options.mirrorIndex ?? 0) > 0.8 ? 1 + (1 - tagOverlap(seed, options.analysis)) * 2 : 1;
  // ponytail: usedCount/recency decay only; upgrade path = longer cooldown + reflection-generated seeds
  const usagePenalty = 1 / (1 + (seed.usedCount ?? 0));
  const recent =
    seed.lastUsedAt && hoursSince(new Date(seed.lastUsedAt), options.now) < 12 ? 0.2 : 1;
  return Math.max(0.05, seed.weight ?? 1) * differenceBoost * usagePenalty * recent;
}

export function selectNoveltySeed(
  seeds: SeedCard[],
  options: {
    state: CompanionState;
    analysis?: MessageAnalysis | null;
    mirrorIndex?: number;
    required?: boolean;
    random?: number;
    selectionRandom?: number;
    now?: Date;
  },
): SeedCard | null {
  const enabled = seeds.filter((seed) => seed.enabled !== false);
  if (!enabled.length) return null;

  const now = options.now ?? new Date();
  const cooled = enabled.filter(
    (seed) => !seed.lastUsedAt || hoursSince(new Date(seed.lastUsedAt), now) >= 12,
  );
  const available = cooled.length ? cooled : enabled;

  const random = options.random ?? Math.random();
  const shouldUse =
    options.required ||
    (options.mirrorIndex ?? 0) > 0.8 ||
    random < options.state.drives.noveltySeeking * 0.45;
  if (!shouldUse) return null;

  const weighted = available.map((seed) => ({
    seed,
    weight: seedWeight(seed, { analysis: options.analysis, mirrorIndex: options.mirrorIndex, now }),
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = (options.selectionRandom ?? random) * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return item.seed;
  }
  return weighted.at(-1)?.seed ?? null;
}
