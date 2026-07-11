import type { Relationship } from "@/core/types";
import { KeyValue, Panel, MetricGroup } from "@/components/dashboard/ui";

export function RelationshipPanel({ relationship }: { relationship: Relationship }) {
  return (
    <Panel title="Relationship vector" description="不是亲密度游戏；边界敏感度会抑制黏人和越界主动。">
      <div className="mb-4">
        <KeyValue label="Current stage" value={relationship.stage} note="用户可以影响，但不能直接切换关系状态" />
      </div>
      <MetricGroup
        values={{
          closeness: relationship.closeness,
          trust: relationship.trust,
          familiarity: relationship.familiarity,
          boundarySensitivity: relationship.boundarySensitivity,
          friendshipAffinity: relationship.friendshipAffinity,
          romanticAffinity: relationship.romanticAffinity,
        }}
        descriptions={{
          closeness: "共享语境的深度",
          trust: "可依赖信息的置信度",
          familiarity: "长期习惯的识别程度",
          boundarySensitivity: "对打扰和越界的敏感度",
          friendshipAffinity: "自然发展友情的倾向，不是用户指令",
          romanticAffinity: "长期互动形成的暧昧或恋爱倾向",
        }}
        tone="emerald"
      />
    </Panel>
  );
}
