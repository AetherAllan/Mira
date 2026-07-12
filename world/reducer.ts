import { assertScheduleHasNoConflicts } from "@/world/planner";
import {
  WORLD_TICK_MINUTES,
  type ScheduleBlock,
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
  const correlationId =
    input.correlationId?.trim() || active?.correlationId || input.state.lastCorrelationId;

  const next: WorldState = {
    ...input.state,
    currentTime: input.windowEnd,
    currentLocationId: active?.locationId,
    currentActivityId: active?.id,
    currentScheduleBlockId: active?.id,
    lastChangeReason: active ? `schedule activity: ${active.type}` : "natural world tick",
    lastCorrelationId: correlationId,
    lastWorldTickAt: input.windowEnd,
    version: input.state.version + 1,
  };

  const changes: WorldStateChange[] = [];
  addChange(changes, "currentScheduleBlockId", input.state.currentScheduleBlockId, next.currentScheduleBlockId, "schedule progression");
  addChange(changes, "currentLocationId", input.state.currentLocationId, next.currentLocationId, "schedule progression");

  return { state: next, schedule, stateChanges: changes, scheduleTransitions: transitions };
}

function reduceAggregateDecay(state: WorldState, until: Date, correlationId: string | undefined) {
  const next: WorldState = {
    ...state,
    currentTime: until,
    currentActivityId: undefined,
    currentScheduleBlockId: undefined,
    lastChangeReason: "offline aggregate natural decay",
    lastCorrelationId: correlationId,
    lastWorldTickAt: until,
    version: state.version + 1,
  };
  return { state: next, stateChanges: [] as WorldStateChange[] };
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
