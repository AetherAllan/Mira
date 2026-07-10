import type { CompanionState, TopicEntropy } from "@/core/types";

type AnnotationLike = { topicsJson?: unknown; topics?: unknown };
type MessageLike = { text: string };

function topicNames(annotation: AnnotationLike): string[] {
  const topics = annotation.topicsJson ?? annotation.topics;
  if (!Array.isArray(topics)) return [];
  return topics
    .filter(
      (topic): topic is { name: string; confidence?: number } =>
        Boolean(topic) && typeof topic === "object" && typeof (topic as { name?: unknown }).name === "string",
    )
    .filter((topic) => typeof topic.confidence !== "number" || topic.confidence >= 0.25)
    .map((topic) => topic.name);
}

export function computeTopicEntropy(annotations: AnnotationLike[]): TopicEntropy {
  const counts = new Map<string, number>();
  for (const topic of annotations.slice(0, 50).flatMap(topicNames)) {
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (!total) {
    return { entropyScore: 0, top1Share: 0, top3Share: 0, collapseRisk: false, distribution: [] };
  }

  const distribution = [...counts]
    .map(([topic, count]) => ({ topic, count, share: count / total }))
    .sort((a, b) => b.count - a.count);
  const rawEntropy = distribution.reduce(
    (sum, item) => sum - item.share * Math.log2(item.share),
    0,
  );
  const maximum = counts.size > 1 ? Math.log2(counts.size) : 1;
  const top1Share = distribution[0]?.share ?? 0;
  const top3Share = distribution.slice(0, 3).reduce((sum, item) => sum + item.share, 0);
  return {
    entropyScore: Math.min(1, rawEntropy / maximum),
    top1Share,
    top3Share,
    collapseRisk: top3Share > 0.75,
    distribution,
  };
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]{2,}/gu)
      ?.filter((token) => !["这个", "那个", "可以", "就是", "because", "with", "that"].includes(token)) ?? [],
  );
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

export function computeRepetitionScore(messages: MessageLike[]): number {
  const recent = messages.slice(0, 10);
  if (recent.length < 2) return 0;
  const newest = tokens(recent[0].text);
  const keywordSimilarity = Math.max(...recent.slice(1).map((message) => jaccard(newest, tokens(message.text))));
  const openings = recent.map((message) => message.text.trim().slice(0, 12).toLocaleLowerCase());
  const repeatedOpeningShare = openings.filter((opening) => opening && opening === openings[0]).length / recent.length;
  return Math.min(1, keywordSimilarity * 0.7 + repeatedOpeningShare * 0.3);
}

export function computeMirrorIndex(userTopics: string[], proactiveTopics: string[]): number {
  return jaccard(new Set(userTopics), new Set(proactiveTopics));
}

export function computeProactiveScore(
  state: CompanionState,
  random = Math.random(),
  topicEntropy?: TopicEntropy,
  mirrorIndex = 0,
): number {
  const noveltyPressure =
    (topicEntropy?.collapseRisk ? 0.045 : 0) + (mirrorIndex > 0.8 ? 0.045 : 0);
  const score =
    state.traits.initiative * 0.2 +
    state.drives.curiosity * 0.18 +
    state.drives.boredom * 0.12 +
    state.drives.noveltySeeking * 0.14 +
    state.relationship.closeness * 0.1 +
    random * 0.26 +
    noveltyPressure;
  return Math.min(1, Math.max(0, score));
}
