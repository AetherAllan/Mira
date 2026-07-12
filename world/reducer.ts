import { assertScheduleHasNoConflicts } from "@/world/planner";
import { clamp01 } from "@/lib/number";
import {
  WORLD_TICK_MINUTES,
  type ScheduleBlock,
  type ScheduleBlockType,
  type WorldState,
  type WorldStateChange,
} from "@/world/types";

const TICK_MS = WORLD_TICK_MINUTES * 60 * 1000;

export interface TickWindow {
  windowStart: Date;
  windowEnd: Date;
}

export interface WorldTickInput extends TickWindow {
  state: WorldState;
  schedule: readonly ScheduleBlock[];
  correlationId?: string;
}

export interface ScheduleTransition {
  blockId: string;
  before: ScheduleBlock["status"];
  after: ScheduleBlock["status"];
  reason: string;
}

export interface WorldTickResult {
  state: WorldState;
  schedule: ScheduleBlock[];
  stateChanges: WorldStateChange[];
  scheduleTransitions: ScheduleTransition[];
}

export interface OfflineGapInput {
  state: WorldState;
  schedule: readonly ScheduleBlock[];
  until: Date;
  correlationId?: string;
}

export interface OfflineGapResult extends WorldTickResult {
  mode: "detailed" | "aggregate_decay";
  processedWindows: number;
  eventWindowStarts: Date[];
  eventGenerationAllowed: boolean;
}

export function getTickWindow(at: Date): TickWindow {
  const start = Math.floor(at.getTime() / TICK_MS) * TICK_MS;
  return { windowStart: new Date(start), windowEnd: new Date(start + TICK_MS) };
}

/** Returns the latest fully elapsed window; it never claims the currently open window. */
export function getCompletedTickWindow(at: Date): TickWindow {
  const end = Math.floor(at.getTime() / TICK_MS) * TICK_MS;
  return { windowStart: new Date(end - TICK_MS), windowEnd: new Date(end) };
}

function decayToward(value: number, target: number, ratePerHour: number, hours: number) {
  const retained = Math.exp(-ratePerHour * hours);
  return clamp01(target + (value - target) * retained);
}

function activityDelta(type: ScheduleBlockType | undefined, hours: number) {
  const energyPerHour: Record<ScheduleBlockType, number> = {
    sleep: 0.08,
    commute: -0.04,
    work: -0.025,
    meal: 0.03,
    leisure: 0.015,
    social: -0.01,
    errand: -0.03,
    exploration: -0.025,
  };
  const boredomPerHour: Record<ScheduleBlockType, number> = {
    sleep: -0.04,
    commute: 0.01,
    work: 0.02,
    meal: -0.01,
    leisure: -0.03,
    social: -0.06,
    errand: -0.02,
    exploration: -0.08,
  };
  return {
    energy: type ? energyPerHour[type] * hours : 0,
    boredom: type ? boredomPerHour[type] * hours : 0,
  };
}

function lonelinessBaseline(type: ScheduleBlockType | undefined) {
  if (type === "social") return 0.03;
  if (type === "work") return 0.1;
  if (type === "sleep") return 0.12;
  return 0.2;
}

function nextStatus(block: ScheduleBlock, at: Date): ScheduleBlock["status"] {
  if (block.status === "cancelled" || block.status === "completed") return block.status;
  if (block.endAt.getTime() <= at.getTime()) return "completed";
  if (block.startAt.getTime() <= at.getTime()) return "active";
  return block.status === "changed" || block.status === "delayed" ? block.status : "planned";
}

function addChange(
  changes: WorldStateChange[],
  targetPath: string,
  before: number | string | undefined,
  after: number | string | undefined,
  reason: string,
) {
  const previous = before ?? null;
  const next = after ?? null;
  if (typeof previous === "number" && typeof next === "number" && Math.abs(previous - next) < 1e-9) return;
  if (previous === next) return;
  changes.push({ targetPath, before: previous, after: next, reason });
}

export function reduceWorldTick(input: WorldTickInput): WorldTickResult {
  const elapsedMs = input.windowEnd.getTime() - input.windowStart.getTime();
  if (elapsedMs !== TICK_MS) throw new Error("World tick window must be exactly 15 minutes");
  if (input.state.lastWorldTickAt.getTime() !== input.windowStart.getTime()) {
    throw new Error("World state is not positioned at the tick window start");
  }
  assertScheduleHasNoConflicts(input.schedule);

  const transitions: ScheduleTransition[] = [];
  const schedule = input.schedule.map((block) => {
    const status = nextStatus(block, input.windowEnd);
    if (status !== block.status) {
      transitions.push({
        blockId: block.id,
        before: block.status,
        after: status,
        reason: status === "completed" ? "schedule block ended" : "schedule block started",
      });
    }
    return status === block.status ? { ...block } : { ...block, status };
  });
  const activeBlocks = schedule.filter((block) => block.status === "active");
  if (activeBlocks.length > 1) throw new Error("Schedule contains overlapping active blocks");
  const active = activeBlocks[0];
  const hours = elapsedMs / 3_600_000;
  const activity = activityDelta(active?.type, hours);
  const correlationId =
    input.correlationId?.trim() || active?.correlationId || input.state.lastCorrelationId;

  const next: WorldState = {
    ...input.state,
    currentTime: input.windowEnd,
    currentLocationId: active?.locationId,
    currentActivityId: active?.id,
    currentScheduleBlockId: active?.id,
    energy: clamp01(input.state.energy + activity.energy),
    boredom: clamp01(input.state.boredom + activity.boredom),
    curiosity: decayToward(input.state.curiosity, 0.55, 0.02, hours),
    loneliness: decayToward(
      input.state.loneliness,
      lonelinessBaseline(active?.type),
      active?.type === "social" ? 0.14 : 0.015,
      hours,
    ),
    irritation: decayToward(input.state.irritation, 0, 0.08, hours),
    disappointment: decayToward(input.state.disappointment, 0, 0.04, hours),
    shareDesire: decayToward(input.state.shareDesire, 0.35, 0.05, hours),
    lastChangeReason: active ? `schedule activity: ${active.type}` : "natural world tick",
    lastCorrelationId: correlationId,
    lastWorldTickAt: input.windowEnd,
    version: input.state.version + 1,
  };

  const changes: WorldStateChange[] = [];
  const activityReason = active ? `activity:${active.type}` : "no active schedule block";
  addChange(changes, "currentScheduleBlockId", input.state.currentScheduleBlockId, next.currentScheduleBlockId, "schedule progression");
  addChange(changes, "currentLocationId", input.state.currentLocationId, next.currentLocationId, "schedule progression");
  addChange(changes, "energy", input.state.energy, next.energy, activityReason);
  addChange(changes, "boredom", input.state.boredom, next.boredom, activityReason);
  addChange(changes, "curiosity", input.state.curiosity, next.curiosity, "natural decay toward baseline");
  addChange(changes, "loneliness", input.state.loneliness, next.loneliness, active?.type === "social" ? "social activity" : "natural decay");
  addChange(changes, "irritation", input.state.irritation, next.irritation, "natural decay");
  addChange(changes, "disappointment", input.state.disappointment, next.disappointment, "natural decay");
  addChange(changes, "shareDesire", input.state.shareDesire, next.shareDesire, "natural decay toward baseline");

  return { state: next, schedule, stateChanges: changes, scheduleTransitions: transitions };
}

function reduceAggregateDecay(state: WorldState, until: Date, correlationId: string | undefined) {
  const hours = (until.getTime() - state.lastWorldTickAt.getTime()) / 3_600_000;
  const next: WorldState = {
    ...state,
    currentTime: until,
    currentActivityId: undefined,
    currentScheduleBlockId: undefined,
    energy: decayToward(state.energy, 0.55, 0.035, hours),
    boredom: decayToward(state.boredom, 0.2, 0.035, hours),
    curiosity: decayToward(state.curiosity, 0.55, 0.02, hours),
    loneliness: decayToward(state.loneliness, 0.16, 0.015, hours),
    irritation: decayToward(state.irritation, 0, 0.08, hours),
    disappointment: decayToward(state.disappointment, 0, 0.04, hours),
    shareDesire: decayToward(state.shareDesire, 0.35, 0.05, hours),
    lastChangeReason: "offline aggregate natural decay",
    lastCorrelationId: correlationId,
    lastWorldTickAt: until,
    version: state.version + 1,
  };
  const stateChanges: WorldStateChange[] = [];
  addChange(stateChanges, "energy", state.energy, next.energy, "offline aggregate natural decay");
  addChange(stateChanges, "boredom", state.boredom, next.boredom, "offline aggregate natural decay");
  addChange(stateChanges, "curiosity", state.curiosity, next.curiosity, "offline aggregate natural decay");
  addChange(stateChanges, "loneliness", state.loneliness, next.loneliness, "offline aggregate natural decay");
  addChange(stateChanges, "irritation", state.irritation, next.irritation, "offline aggregate natural decay");
  addChange(stateChanges, "disappointment", state.disappointment, next.disappointment, "offline aggregate natural decay");
  addChange(stateChanges, "shareDesire", state.shareDesire, next.shareDesire, "offline aggregate natural decay");
  return { state: next, stateChanges };
}

export function reduceOfflineGap(input: OfflineGapInput): OfflineGapResult {
  const startMs = input.state.lastWorldTickAt.getTime();
  const targetMs = Math.floor(input.until.getTime() / TICK_MS) * TICK_MS;
  if (targetMs < startMs) throw new Error("Offline catch-up target cannot precede world state");
  if ((targetMs - startMs) % TICK_MS !== 0) {
    throw new Error("World state must start on a 15-minute boundary");
  }

  const target = new Date(targetMs);
  const elapsedMs = targetMs - startMs;
  const correlationId = input.correlationId?.trim() || input.state.lastCorrelationId;
  if (elapsedMs > 7 * 24 * 60 * 60 * 1000) {
    const aggregate = reduceAggregateDecay(input.state, target, correlationId);
    return {
      state: aggregate.state,
      schedule: input.schedule.map((block) => ({ ...block })),
      stateChanges: aggregate.stateChanges,
      scheduleTransitions: [],
      mode: "aggregate_decay",
      processedWindows: 0,
      eventWindowStarts: [],
      eventGenerationAllowed: false,
    };
  }

  let state = { ...input.state };
  let schedule = input.schedule.map((block) => ({ ...block }));
  const stateChanges: WorldStateChange[] = [];
  const scheduleTransitions: ScheduleTransition[] = [];
  const eventWindowStarts: Date[] = [];
  for (let windowStartMs = startMs; windowStartMs < targetMs; windowStartMs += TICK_MS) {
    const windowStart = new Date(windowStartMs);
    const result = reduceWorldTick({
      state,
      schedule,
      windowStart,
      windowEnd: new Date(windowStartMs + TICK_MS),
      correlationId,
    });
    state = result.state;
    schedule = result.schedule;
    stateChanges.push(...result.stateChanges);
    scheduleTransitions.push(...result.scheduleTransitions);
    eventWindowStarts.push(windowStart);
  }
  return {
    state,
    schedule,
    stateChanges,
    scheduleTransitions,
    mode: "detailed",
    processedWindows: eventWindowStarts.length,
    eventWindowStarts,
    eventGenerationAllowed: true,
  };
}
