import { createHash } from "node:crypto";

/** Stable seed material for replaying a world decision after a retry. */
export function createWorldSeed(...parts: readonly string[]) {
  const material = parts.map((part) => `${part.length}:${part}`).join("|");
  return createHash("sha256").update(material).digest("hex");
}

/**
 * Small deterministic generator for decisions inside one persisted seed.
 * It is not cryptographic; SHA-256 is only used to derive the replayable state.
 */
export function createSeededRandom(seed: string) {
  let state = Number.parseInt(createWorldSeed(seed).slice(0, 8), 16) >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function seededChoice<T>(items: readonly T[], seed: string) {
  if (items.length === 0) return undefined;
  return items[Math.floor(createSeededRandom(seed)() * items.length)];
}
