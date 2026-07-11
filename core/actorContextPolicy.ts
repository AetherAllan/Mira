export function resolveActivityFreshness<T extends { id: string }>(input: {
  schedule: readonly T[];
  currentScheduleBlockId: string | null;
  worldStateFresh: boolean;
}) {
  const confirmed = input.schedule.find(
    (block) => block.id === input.currentScheduleBlockId,
  );
  return {
    currentActivity: input.worldStateFresh ? confirmed : undefined,
    lastConfirmedActivity: input.worldStateFresh ? undefined : confirmed,
  };
}
