import { Database, Image, MessageSquareText, Sparkles } from "lucide-react";
import { loadDashboardData } from "@/components/dashboard/data";
import { ArcList } from "@/components/dashboard/ArcList";
import { PageIntro, Panel, ValueBar } from "@/components/dashboard/ui";
import { StatCard } from "@/components/layout/StatCard";
import { StateOverview } from "@/components/dashboard/StateOverview";
import { MoodChart } from "@/components/dashboard/MoodChart";
import { TopicEntropyPanel } from "@/components/dashboard/TopicEntropyPanel";
import { RecentMessages } from "@/components/dashboard/RecentMessages";
import { EventTimeline } from "@/components/dashboard/EventTimeline";
import { JsonInspector } from "@/components/dashboard/JsonInspector";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await loadDashboardData();
  return (
    <>
      <PageIntro title={`${data.companion.name} / runtime pulse`} description="一眼确认她今天说了什么、为什么主动、状态是否漂移，以及任何需要审查的异常。" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Messages today" value={data.stats.todayMessages} description="user + assistant，可观测交互总量" icon={MessageSquareText} trend={3} />
        <StatCard label="Proactive today" value={`${data.stats.todayProactive} / ${data.companion.configJson.policy.proactiveMaxPerDay}`} description={`剩余预算 ${data.stats.proactiveRemaining} 条`} icon={Sparkles} tone="violet" />
        <StatCard label="Tool calls today" value={data.stats.todayToolCalls} description="只统计 allowlist 内实际执行" icon={Image} tone="amber" />
        <StatCard label="Memory writes" value={data.stats.todayMemoryWrites} description="选择性写入，不等于消息归档" icon={Database} tone="emerald" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[.75fr_1.25fr]">
        <StateOverview state={data.state} />
        <Panel title="Mood / 7 day trace" description="情绪是短期状态，不会直接覆盖稳定人格。"><MoodChart history={data.moodHistory} /></Panel>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <TopicEntropyPanel entropy={data.topicEntropy} />
        <Panel title="Repetition guard" description="最近 10 条 assistant 消息的开头与关键词相似度启发式。">
          <div className="space-y-5"><ValueBar label="repetition score" value={data.repetitionScore} tone={data.repetitionScore > 0.6 ? "rose" : "emerald"} /><p className="rounded-md border border-white/[0.06] bg-black/20 p-3 text-[11px] leading-5 text-zinc-500">{data.repetitionScore > 0.6 ? "重复度偏高；最近回复开头或关键词可能在模板化。" : "当前没有明显模板化。继续监控固定开头和高频项目词。"}</p></div>
        </Panel>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Active arcs" description="长期内在问题只缓慢推进，progress 不是任务完成率。"><ArcList arcs={data.state.activeArcs} /></Panel>
        <Panel title="Latest internal journal" description="Daily reflection 的内部摘要；不会自动发送给用户。">
          {data.latestJournal ? <div><div className="flex items-center justify-between"><p className="font-mono text-[10px] text-zinc-600">{data.latestJournal.date}</p><span className="font-mono text-[9px] text-violet-400/55">PRIVATE / REFLECTION</span></div><p className="mt-3 text-sm leading-6 text-zinc-300">{data.latestJournal.summary}</p><p className="mt-3 border-l border-violet-400/20 pl-3 text-xs leading-5 text-zinc-500">{data.latestJournal.reflection}</p><div className="mt-4"><JsonInspector data={{ traits: data.latestJournal.traitUpdatesJson, beliefs: data.latestJournal.beliefUpdatesJson, arcs: data.latestJournal.arcUpdatesJson }} label="journal updates" /></div></div> : <p className="text-xs text-zinc-600">今天还没有 internal journal。</p>}
        </Panel>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2"><RecentMessages messages={data.recentMessages} /><EventTimeline events={data.recentEvents} /></div>
    </>
  );
}
