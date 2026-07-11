export interface ExternalInformationForRanking {
  title: string;
  factualSummary: string;
  category: string;
  personalRelevance: number;
  reliability: number;
  novelty: number;
  fetchedAt: Date;
}

function terms(value: string) {
  const normalized = value.toLocaleLowerCase("zh-CN").replaceAll("_", " ");
  const result = new Set(normalized.match(/[a-z0-9]{2,}|[\p{Script=Han}]{2,}/gu) ?? []);
  for (const run of normalized.match(/[\p{Script=Han}]{3,}/gu) ?? []) {
    for (let index = 0; index < run.length - 1; index += 1) {
      result.add(run.slice(index, index + 2));
    }
  }
  return result;
}

function overlap(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let matches = 0;
  for (const term of left) if (right.has(term)) matches += 1;
  return matches / Math.sqrt(left.size * right.size);
}

export function rankExternalInformation<T extends ExternalInformationForRanking>(
  rows: readonly T[],
  input: { queryText?: string; topics?: string[]; now?: Date },
) {
  const now = input.now ?? new Date();
  const queryTerms = terms(`${input.queryText ?? ""} ${(input.topics ?? []).join(" ")}`);
  return [...rows]
    .map((row) => {
      const factTerms = terms(`${row.category} ${row.title} ${row.factualSummary}`);
      const ageHours = Math.max(0, (now.getTime() - row.fetchedAt.getTime()) / 3_600_000);
      const recency = Math.exp(-ageHours / 48);
      const topicRelevance = overlap(queryTerms, factTerms);
      const score =
        0.42 * row.personalRelevance +
        0.18 * row.reliability +
        0.15 * row.novelty +
        0.1 * recency +
        0.15 * topicRelevance;
      return { row, score, topicRelevance };
    })
    .sort(
      (left, right) =>
        right.score - left.score || right.row.fetchedAt.getTime() - left.row.fetchedAt.getTime(),
    )
    .map(({ row }) => row);
}

