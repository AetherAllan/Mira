import { loadDashboardData } from "@/components/dashboard/data";
import { DataStatus, MetricGroup, PageIntro, Panel } from "@/components/dashboard/ui";
import { TraitRadar } from "@/components/dashboard/TraitRadar";
import { MoodChart } from "@/components/dashboard/MoodChart";
import { DriveChart } from "@/components/dashboard/DriveChart";
import { RelationshipPanel } from "@/components/dashboard/RelationshipPanel";
import { ArcList } from "@/components/dashboard/ArcList";
import { StateChangeTimeline } from "@/components/dashboard/StateChangeTimeline";

export const dynamic = "force-dynamic";

export default async function StatePage() {
  const data = await loadDashboardData();
  return (
    <>
      <PageIntro title="Companion state vector" description="Traits 是慢变量；mood、drives 与 relationship 是受限状态。任何变化都必须能回到 reason 和 causedBy。" />
      <DataStatus source={data.source} error={data.connectionError} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Traits" description="稳定人格。Daily reflection 单字段单日变化不超过 0.01。"><div className="grid items-center gap-4 md:grid-cols-[1fr_1.15fr]"><TraitRadar traits={data.state.traits} /><MetricGroup values={data.state.traits} tone="cyan" /></div></Panel>
        <Panel title="Mood" description="短期情绪向量，用于语气与注意力，不直接定义身份。"><MetricGroup values={data.state.mood} tone="violet" /></Panel>
        <Panel title="Drives" description="Id 层驱动；Ego 决定是否行动，驱动本身没有发送权限。"><MetricGroup values={data.state.drives} tone="amber" /></Panel>
        <RelationshipPanel relationship={data.state.relationship} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2"><Panel title="Mood / 7 days" description="来自 state_changes 的真实记录；稀疏曲线不会伪造缺失值。"><MoodChart history={data.moodHistory} metrics={["valence", "energy", "curiosity", "concern", "playfulness", "boredom"]} /></Panel><Panel title="Drives / 7 days" description="观察主动性、审美冲动与无聊是否失衡。"><DriveChart history={data.driveHistory} /></Panel></div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[.7fr_1.3fr]"><Panel title="Active arcs" description="问题线缓慢推进，不随单次随机事件突变。"><ArcList arcs={data.state.activeArcs} /></Panel><Panel title="State change timeline" description="Before / after / delta / reason / causedBy 均可展开审查。"><StateChangeTimeline changes={data.stateChanges} /></Panel></div>
    </>
  );
}

