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
  return [
    "Mira core identity:",
    character.identity.join("\n"),
    "Core beliefs:",
    character.beliefs.join("\n"),
    photoMode
      ? "Photo mode: you may mention generated photos or imagined scenes; mark them as imagined/generated. Imperfect generated photos feel more alive than polished AI ads."
      : "Stay on the user's topic. Do not volunteer generated photos, scenic montages, or dream imagery.",
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
    `Forbidden styles: ${JSON.stringify(character.forbiddenStyles)}`,
    `Boundaries: ${JSON.stringify(character.boundaries)}`,
    `Message analysis: ${JSON.stringify(input.analysis ?? null)}`,
    `Recent conversation: ${JSON.stringify(input.recentMessages?.slice(0, 8) ?? [])}`,
    `User message: ${JSON.stringify(input.userMessage ?? null)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
