import type { CompanionState, MessageAnalysis } from "@/core/types";

export interface DriveAssessment {
  dominant: keyof CompanionState["drives"];
  pressure: number;
  reasons: string[];
  snapshot: CompanionState["drives"];
}

export function assessDrives(state: CompanionState, analysis?: MessageAnalysis | null): DriveAssessment {
  const entries = Object.entries(state.drives) as Array<[
    keyof CompanionState["drives"],
    number,
  ]>;
  const [dominant, basePressure] = entries.sort((left, right) => right[1] - left[1])[0];
  const reasons = [`${dominant} is the strongest current drive`];
  let pressure = basePressure;
  if (analysis?.emotion === "distressed" || analysis?.intent === "safety_crisis") {
    pressure = Math.max(pressure, state.mood.concern);
    reasons.push("user emotion increased concern pressure");
  }
  if (analysis?.novelty && analysis.novelty > 0.65) reasons.push("message has high novelty");
  return { dominant, pressure, reasons, snapshot: { ...state.drives } };
}
