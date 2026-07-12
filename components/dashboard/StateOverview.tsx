import type { CompanionState } from "@/core/types";
import { Panel, ValueBar } from "@/components/dashboard/ui";

export function StateOverview({ state }: { state: CompanionState }) {
  return (
    <Panel title="State pulse" description="唯一心理状态；每个变化都能追到日程、世界事件或对话。">
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(state.mood).map(([key, value]) => (
          <ValueBar key={key} label={key} value={value} description={state.stateReasons[key as keyof typeof state.stateReasons]?.at(-1)?.reason ?? "当前没有显著外部原因"} tone="violet" />
        ))}
        {Object.entries(state.drives).map(([key, value]) => (
          <ValueBar key={key} label={key} value={value} description={state.stateReasons[key as keyof typeof state.stateReasons]?.at(-1)?.reason ?? "缓慢回归基线"} tone="cyan" />
        ))}
        <ValueBar label="trust" value={state.relationship.trust} description="关系建立仍处于早期" tone="emerald" />
        <ValueBar label="boundarySensitivity" value={state.relationship.boundarySensitivity} description="主动行为的刹车" tone="amber" />
      </div>
    </Panel>
  );
}
