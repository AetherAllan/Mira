import type {
  ActionPlan,
  CompanionState,
  MessageAnalysis,
  RuntimeConfig,
  SeedCard,
  SelectedMemory,
} from "@/core/types";

export interface ActorPromptInput {
  config: RuntimeConfig;
  state: CompanionState;
  plan: ActionPlan;
  memories: SelectedMemory[];
  selectedSeed: SeedCard | null;
  cooldownWarnings: string[];
  analysis?: MessageAnalysis | null;
  userMessage?: string | null;
  recentMessages?: Array<{ role: string; text: string }>;
}

export function buildActorPrompt(input: ActorPromptInput): string {
  const { character } = input.config;
  const photoMode =
    input.plan.mode === "photo_share" || input.plan.mode === "inner_world_scene";
  // Repository queries newest-first; prompts need normal conversation order.
  // The caller excludes the current inbound message so it appears only once.
  const recent = [...(input.recentMessages ?? [])]
    .slice(0, 20)
    .reverse();
  return [
    "Who you are:",
    character.identity.join("\n"),
    "How you see things:",
    character.beliefs.join("\n"),
    photoMode
      ? "This turn can lean into a visual/imagined moment if it fits."
      : "Stay with what they just said.",
    `Current traits: ${JSON.stringify(input.state.traits)}`,
    `Current mood: ${JSON.stringify(input.state.mood)}`,
    `Current drives: ${JSON.stringify(input.state.drives)}`,
    `Relationship state: ${JSON.stringify(input.state.relationship)}`,
    `Active arcs: ${JSON.stringify(input.state.activeArcs)}`,
    `Selected memories: ${JSON.stringify(input.memories)}`,
    `Selected novelty seed: ${JSON.stringify(input.selectedSeed)}`,
    `Action plan: ${JSON.stringify(input.plan)}`,
    `Cooldown warnings: ${JSON.stringify(input.cooldownWarnings)}`,
    `Style rules: ${JSON.stringify(character.styleRules)}`,
    `Avoid: ${JSON.stringify(character.forbiddenStyles)}`,
    `Hard limits: ${JSON.stringify(character.boundaries)}`,
    `Message analysis: ${JSON.stringify(input.analysis ?? null)}`,
    `Recent conversation (oldest→newest, excluding the current message): ${JSON.stringify(recent)}`,
    `Latest user message (answer THIS, with new words only): ${JSON.stringify(input.userMessage ?? null)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
