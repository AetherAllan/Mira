export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function fixedClock(instant: Date): Clock {
  const fixed = new Date(instant);
  return { now: () => new Date(fixed) };
}
