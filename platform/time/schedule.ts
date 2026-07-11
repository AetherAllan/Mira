export interface TimeInterval {
  startAt: Date;
  endAt: Date;
  status?: string;
}

// Schedule blocks use half-open intervals. At an exact boundary the old block
// has ended and the next block owns the instant; subtracting a millisecond
// makes both tick transitions and user-visible "current activity" lie.
export function intervalContains(block: TimeInterval, at: Date) {
  return (
    block.status !== "cancelled" &&
    block.startAt.getTime() <= at.getTime() &&
    at.getTime() < block.endAt.getTime()
  );
}

export function activeIntervalAt<T extends TimeInterval>(blocks: readonly T[], at: Date) {
  return blocks.find((block) => intervalContains(block, at));
}

