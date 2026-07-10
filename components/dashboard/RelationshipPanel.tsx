import type { Relationship } from "@/core/types";
import { Panel, MetricGroup } from "@/components/dashboard/ui";

export function RelationshipPanel({ relationship }: { relationship: Relationship }) {
  return (
    <Panel title="Relationship vector" description="不是亲密度游戏；边界敏感度会抑制黏人和越界主动。">
      <MetricGroup
        values={relationship}
        descriptions={{
          closeness: "共享语境的深度",
          trust: "可依赖信息的置信度",
          familiarity: "长期习惯的识别程度",
          boundarySensitivity: "对打扰和越界的敏感度",
        }}
        tone="emerald"
      />
    </Panel>
  );
}

