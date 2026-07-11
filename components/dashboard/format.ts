import type { DateValue } from "@/components/dashboard/data";
import { formatZonedTimestamp } from "@/platform/time";

const keyLabels: Record<string, string> = {
  directness: "Directness",
  warmth: "Warmth",
  sarcasm: "Sarcasm",
  curiosity: "Curiosity",
  initiative: "Initiative",
  aestheticSensitivity: "Aesthetic sensitivity",
  independence: "Independence",
  emotionalVolatility: "Emotional volatility",
  valence: "Valence",
  energy: "Energy",
  concern: "Concern",
  playfulness: "Playfulness",
  boredom: "Boredom",
  affection: "Affection",
  aestheticUrge: "Aesthetic urge",
  noveltySeeking: "Novelty seeking",
  closeness: "Closeness",
  trust: "Trust",
  familiarity: "Familiarity",
  boundarySensitivity: "Boundary sensitivity",
};

export function labelForKey(key: string) {
  return keyLabels[key] ?? key.replaceAll("_", " ");
}

export function formatDate(value: DateValue | null | undefined, compact = false) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return formatZonedTimestamp(date, "Asia/Shanghai", { includeYear: !compact });
}

export function percent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function eventTone(type: string) {
  if (type.startsWith("user")) return "bg-sky-400";
  if (type.startsWith("assistant")) return "bg-violet-400";
  if (type.startsWith("memory")) return "bg-emerald-400";
  if (type.startsWith("tool")) return "bg-fuchsia-400";
  if (type.startsWith("state")) return "bg-cyan-400";
  if (type.startsWith("proactive")) return "bg-rose-400";
  return "bg-zinc-500";
}
