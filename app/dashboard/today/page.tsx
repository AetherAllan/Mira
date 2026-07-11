import { CalendarDays, Clock3, MapPin } from "lucide-react";
import { loadWorldDashboardData } from "@/components/dashboard/worldData";
import { EmptyState, PageIntro, Panel } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { localTimeAt } from "@/platform/time";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const data = await loadWorldDashboardData();
  const timeZone = data.temporal.timeZone;
  const time = (value: Date) => localTimeAt(value, timeZone, false);
  const completed = data.schedule.filter((block) => block.status === "completed");
  const changed = data.schedule.filter((block) => ["changed", "cancelled", "delayed"].includes(block.status));
  return (
    <>
      <PageIntro title="Today / Beijing" description="公开生活视图：现在在哪里、正在做什么、今天怎么安排。内部浮点状态留在 World Debug。" />
      <div className="grid gap-3 md:grid-cols-3">
        <Panel title="北京时间" description="真实时钟与世界推进时间分开显示。"><div className="flex items-center gap-3"><Clock3 className="size-5 text-cyan-300" /><span className="font-mono text-xl text-zinc-100">{data.temporal.localTime.slice(0, 5)}</span></div><p className="mt-2 text-xs text-zinc-600">{data.localDate} · 世界推进至 {data.temporal.worldAdvancedThroughLocal.slice(11, 16)} · 延迟 {data.temporal.worldLagSeconds}s</p></Panel>
        <Panel title="当前位置" description="世界状态过期时不把旧地点冒充当前位置。"><div className="flex items-start gap-3"><MapPin className="mt-0.5 size-5 text-violet-300" /><div><p className="text-sm text-zinc-100">{data.currentPlace?.name ?? "位置未确认"}</p><p className="mt-1 text-xs text-zinc-600">{data.currentPlace?.district ?? (data.lastConfirmedPlace ? `上次确认：${data.lastConfirmedPlace.name}` : "—")}</p></div></div></Panel>
        <Panel title="当前活动" description="只在世界状态 30 分钟内有推进时展示。"><div className="flex items-start gap-3"><CalendarDays className="mt-0.5 size-5 text-amber-300" /><div><p className="text-sm text-zinc-100">{data.currentBlock?.title ?? (data.debug.worldHealth.worldStateFresh ? "暂无活动块" : "世界状态待同步")}</p>{data.currentBlock ? <Badge className="mt-2 text-amber-300">{data.currentBlock.status}</Badge> : null}</div></div></Panel>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
        <Panel title="今日时间表" description="计划、变化和完成状态共享同一条时间轴。">
          {data.schedule.length ? <div className="space-y-1">{data.schedule.map((block) => <div key={block.id} className="grid grid-cols-[88px_1fr_auto] items-start gap-3 border-b border-white/[0.05] py-3 last:border-0"><span className="font-mono text-[11px] text-zinc-600">{time(block.startAt)}–{time(block.endAt)}</span><div><p className="text-xs text-zinc-300">{block.title}</p><p className="mt-1 text-[10px] text-zinc-600">{block.changeReason ?? block.source}</p></div><Badge className={block.status === "active" ? "text-cyan-300" : block.status === "completed" ? "text-emerald-300" : ""}>{block.status}</Badge></div>)}</div> : <EmptyState>今天的计划尚未生成；下一次 world tick 会补齐。</EmptyState>}
        </Panel>
        <div className="space-y-4">
          <Panel title="她会公开怎么形容状态" description="有限描述，不暴露所有内部数值。"><ul className="space-y-2">{data.publicEmotion.map((item) => <li key={item} className="rounded border border-white/[0.05] bg-black/15 px-3 py-2 text-xs text-zinc-400">{item}</li>)}</ul></Panel>
          <Panel title="今日小结" description="来自 schedule 状态，不是 LLM 补写。"><div className="grid grid-cols-2 gap-3 text-center"><div className="rounded border border-white/[0.06] bg-black/15 p-3"><p className="font-mono text-xl text-emerald-300">{completed.length}</p><p className="mt-1 text-[10px] text-zinc-600">completed</p></div><div className="rounded border border-white/[0.06] bg-black/15 p-3"><p className="font-mono text-xl text-amber-300">{changed.length}</p><p className="mt-1 text-[10px] text-zinc-600">changed</p></div></div></Panel>
        </div>
      </div>
    </>
  );
}
