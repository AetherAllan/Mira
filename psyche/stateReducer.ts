import type {
  CompanionState,
  Drives,
  Mood,
  StateDimension,
  StateReason,
} from "@/core/types";
import type { StateChangeDraft } from "@/psyche/growthEngine";
import type { ScheduleBlock, WorldEvent } from "@/world/types";
import { clamp01 } from "@/lib/number";

const REASON_TTL_MS = 72 * 60 * 60_000;
const MOOD_KEYS = new Set<keyof Mood>([
  "valence", "energy", "curiosity", "concern", "playfulness", "boredom",
  "loneliness", "irritation", "disappointment",
]);
const DRIVE_KEYS = new Set<keyof Drives>([
  "affection", "aestheticUrge", "noveltySeeking", "shareDesire",
]);

function decayToward(value: number, target: number, ratePerHour: number, hours: number) {
  const retained = Math.exp(-ratePerHour * hours);
  return clamp01(target + (value - target) * retained);
}

function draft(
  targetPath: string,
  before: number,
  after: number,
  reason: string,
  causedBy: string,
): StateChangeDraft | null {
  if (Math.abs(before - after) < 0.00001) return null;
  return { targetPath, beforeJson: before, afterJson: after, deltaJson: after - before, reason, causedBy };
}

function addReason(
  state: CompanionState,
  dimension: StateDimension,
  input: Omit<StateReason, "expiresAt" | "occurredAt"> & { occurredAt: Date },
) {
  const active = (state.stateReasons[dimension] ?? [])
    .filter((reason) => new Date(reason.expiresAt).getTime() > input.occurredAt.getTime());
  const next: StateReason = {
    ...input,
    occurredAt: input.occurredAt.toISOString(),
    expiresAt: new Date(input.occurredAt.getTime() + REASON_TTL_MS).toISOString(),
  };
  const previous = active[active.length - 1];
  const merged = previous?.sourceId === next.sourceId && previous.reason === next.reason
    ? [...active.slice(0, -1), { ...next, impact: Math.max(-0.3, Math.min(0.3, previous.impact + next.impact)) }]
    : [...active, next];
  state.stateReasons[dimension] = merged.slice(-5);
}

function activityDeltas(type: ScheduleBlock["type"] | undefined, hours: number) {
  const energyPerHour: Record<ScheduleBlock["type"], number> = {
    sleep: 0.08, commute: -0.04, work: -0.025, meal: 0.03,
    leisure: 0.015, social: -0.01, errand: -0.03, exploration: -0.025,
  };
  const boredomPerHour: Record<ScheduleBlock["type"], number> = {
    sleep: -0.04, commute: 0.01, work: 0.02, meal: -0.01,
    leisure: -0.03, social: -0.06, errand: -0.02, exploration: -0.08,
  };
  return {
    energy: type ? energyPerHour[type] * hours : 0,
    boredom: type ? boredomPerHour[type] * hours : 0,
  };
}

export function reduceCompanionStateForTime(input: {
  state: CompanionState;
  active?: ScheduleBlock;
  hours: number;
  occurredAt: Date;
  correlationId: string;
}) {
  const before = input.state;
  const next: CompanionState = {
    ...before,
    mood: { ...before.mood },
    drives: { ...before.drives },
    stateReasons: { ...before.stateReasons },
  };
  const activity = activityDeltas(input.active?.type, input.hours);
  next.mood.energy = clamp01(before.mood.energy + activity.energy);
  next.mood.boredom = clamp01(before.mood.boredom + activity.boredom);
  next.mood.curiosity = decayToward(before.mood.curiosity, 0.55, 0.02, input.hours);
  next.mood.concern = decayToward(before.mood.concern, 0.22, 0.03, input.hours);
  next.mood.playfulness = decayToward(before.mood.playfulness, 0.4, 0.02, input.hours);
  next.mood.loneliness = decayToward(
    before.mood.loneliness,
    input.active?.type === "social" ? 0.04 : input.active?.type === "work" ? 0.1 : 0.18,
    input.active?.type === "social" ? 0.14 : 0.015,
    input.hours,
  );
  next.mood.irritation = decayToward(before.mood.irritation, 0, 0.08, input.hours);
  next.mood.disappointment = decayToward(before.mood.disappointment, 0, 0.04, input.hours);
  next.drives.shareDesire = decayToward(before.drives.shareDesire, 0.35, 0.05, input.hours);
  next.drives.noveltySeeking = clamp01(
    before.drives.noveltySeeking + before.mood.boredom * 0.004 * input.hours -
      (input.active?.type === "exploration" ? 0.02 * input.hours : 0),
  );
  for (const [dimension, impact] of Object.entries(activity) as Array<["energy" | "boredom", number]>) {
    if (Math.abs(impact) < 0.00001 || !input.active) continue;
    addReason(next, dimension, {
      reason: input.active.title,
      sourceType: "schedule",
      sourceId: input.active.id,
      correlationId: input.correlationId,
      impact,
      occurredAt: input.occurredAt,
    });
  }
  const changes = [
    ...Object.keys(next.mood).map((key) => {
      const dimension = key as keyof Mood;
      return draft(`mood.${dimension}`, before.mood[dimension], next.mood[dimension], input.active?.title ?? "natural decay", "world.tick");
    }),
    ...Object.keys(next.drives).map((key) => {
      const dimension = key as keyof Drives;
      return draft(`drives.${dimension}`, before.drives[dimension], next.drives[dimension], input.active?.title ?? "natural decay", "world.tick");
    }),
  ].filter((item): item is StateChangeDraft => item !== null);
  if (changes.length) next.version = before.version + 1;
  return { state: next, changes };
}

export function applyWorldEventToCompanionState(state: CompanionState, event: WorldEvent) {
  const next: CompanionState = {
    ...state,
    mood: { ...state.mood },
    drives: { ...state.drives },
    stateReasons: { ...state.stateReasons },
  };
  const changes: StateChangeDraft[] = [];
  for (const [rawDimension, rawImpact] of Object.entries(event.emotionalImpact)) {
    if (!Number.isFinite(rawImpact) || rawImpact === 0) continue;
    const dimension = rawDimension as StateDimension;
    let before: number | undefined;
    let after: number | undefined;
    let targetPath = "";
    if (MOOD_KEYS.has(dimension as keyof Mood)) {
      before = next.mood[dimension as keyof Mood];
      after = clamp01(before + rawImpact);
      next.mood[dimension as keyof Mood] = after;
      targetPath = `mood.${dimension}`;
    } else if (DRIVE_KEYS.has(dimension as keyof Drives)) {
      before = next.drives[dimension as keyof Drives];
      after = clamp01(before + rawImpact);
      next.drives[dimension as keyof Drives] = after;
      targetPath = `drives.${dimension}`;
    }
    if (before === undefined || after === undefined || before === after) continue;
    addReason(next, dimension, {
      reason: event.title,
      sourceType: "world_event",
      sourceId: event.id,
      correlationId: event.correlationId,
      impact: after - before,
      occurredAt: event.occurredAt,
    });
    const change = draft(targetPath, before, after, event.title, "world.event");
    if (change) changes.push(change);
  }
  if (changes.length) next.version = state.version + 1;
  return { state: next, changes };
}
