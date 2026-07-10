import type { CompanionState } from "@/core/types";
import { Panel, ValueBar } from "@/components/dashboard/ui";

export function StateOverview({ state }: { state: CompanionState }) {
  const dominantMood = Object.entries(state.mood).sort(([, a], [, b]) => b - a)[0];
  const dominantDrive = Object.entries(state.drives).sort(([, a], [, b]) => b - a)[0];
  return (
    <Panel title="State pulse" description="当前状态，不是固定人格；mood 和 drives 会随交互缓慢变化。">
      <div className="space-y-5">
        <ValueBar label={dominantMood[0]} value={dominantMood[1]} description="当前最强 mood" tone="violet" />
        <ValueBar label={dominantDrive[0]} value={dominantDrive[1]} description="当前最强 drive" tone="cyan" />
        <ValueBar label="trust" value={state.relationship.trust} description="关系建立仍处于早期" tone="emerald" />
        <ValueBar label="boundarySensitivity" value={state.relationship.boundarySensitivity} description="主动行为的刹车" tone="amber" />
      </div>
    </Panel>
  );
}

