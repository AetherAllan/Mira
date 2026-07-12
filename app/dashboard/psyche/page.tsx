import { Brain, CirclePause, Footprints, Sparkles } from "lucide-react";
import { loadDashboardData } from "@/components/dashboard/data";
import { KeyValue, MetricGroup, PageIntro, Panel } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { JsonInspector } from "@/components/dashboard/JsonInspector";
import { formatDate } from "@/components/dashboard/format";

export const dynamic = "force-dynamic";

export default async function PsychePage() {
  const data = await loadDashboardData();
  const held = data.proactiveLogs.find((log) => !log.shouldSend);
  const sent = data.proactiveLogs.find((log) => log.shouldSend);
  const activeCooldowns = data.memories.filter((memory) => memory.cooldownUntil && new Date(memory.cooldownUntil).getTime() > Date.now());
  const actionPlans = data.recentMessages.flatMap((message) => {
    const raw = message.rawJson as { actionPlan?: unknown } | null | undefined;
    return raw?.actionPlan ? [{ id: message.id, createdAt: message.createdAt, plan: raw.actionPlan }] : [];
  });
  return (
    <>
      <PageIntro title="Id / Ego / Actor" description="驱动提出愿望，Ego 选择行动，Actor 直接写出并发送。危机仍走独立安全短路。" />
      <div className="grid gap-3 md:grid-cols-3">
        <Panel title="今天想做什么" description="Id / strongest current impulse" action={<Sparkles className="size-4 text-amber-300" />}><p className="text-sm leading-6 text-zinc-300">探索一个不来自用户最近项目的内在世界场景。</p><p className="mt-2 text-[10px] text-zinc-600">noveltySeeking {data.state.drives.noveltySeeking.toFixed(2)} · aestheticUrge {data.state.drives.aestheticUrge.toFixed(2)}</p></Panel>
        <Panel title="为什么没做" description="Ego / restraint is a valid action" action={<CirclePause className="size-4 text-zinc-500" />}><p className="text-sm leading-6 text-zinc-300">{held?.reason ?? "没有被拦下的主动计划。"}</p>{held ? <p className="mt-2 font-mono text-[9px] text-zinc-700">{formatDate(held.createdAt)}</p> : null}</Panel>
        <Panel title="今天做了什么" description="Actor / externally observable" action={<Footprints className="size-4 text-cyan-300" />}><p className="text-sm leading-6 text-zinc-300">{sent?.sentText ?? "今天还没有主动消息。"}</p>{sent?.selectedMode ? <Badge className="mt-2 text-violet-300">{sent.selectedMode}</Badge> : null}</Panel>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Id / Drive system" description="当前冲动强度；只有 Ego 可以把它变成 action plan。" action={<Brain className="size-4 text-amber-300" />}><MetricGroup values={data.state.drives} tone="amber" /></Panel>
        <Panel title="Ego / Recent action plans" description="最近的 reply / proactive / do_nothing 决策。" className="xl:col-span-2">
          {actionPlans.length ? <div className="space-y-2">{actionPlans.slice(0, 20).map((entry) => <div key={entry.id} className="rounded border border-white/[0.06] bg-black/15 p-3"><div className="mb-2 flex justify-between"><span className="font-mono text-[10px] text-zinc-500">message {entry.id}</span><span className="font-mono text-[9px] text-zinc-700">{formatDate(entry.createdAt)}</span></div><JsonInspector data={entry.plan} label="action plan" /></div>)}</div> : <p className="text-xs text-zinc-600">当前快照没有独立 action plan 记录；运行后会从 message rawJson 显示。</p>}
        </Panel>
      </div>
      <div className="mt-4">
        <Panel title="Personality & policy" description="Actor prompt 会读取这些配置；危机短路与工具 allowlist 仍是硬边界。"><KeyValue label="Character" value={data.companion.configJson.character.name} /><KeyValue label="Model" value={data.companion.configJson.model} /><KeyValue label="Quiet hours" value={`${data.companion.configJson.policy.quietHours.start}–${data.companion.configJson.policy.quietHours.end}`} note={data.companion.configJson.policy.quietHours.timeZone} /><KeyValue label="Proactive budget" value={`${data.stats.proactiveRemaining} remaining`} /><KeyValue label="Minimum interval" value={`${data.companion.configJson.policy.minimumProactiveIntervalHours}h`} /><KeyValue label="Memory threshold" value={data.companion.configJson.policy.memoryWriteThreshold.toFixed(2)} /><div className="mt-4 rounded-md border border-white/[0.06] bg-black/15 p-3"><p className="metric-label">Current cooldowns</p><div className="mt-2 space-y-2"><div className="flex justify-between gap-3 text-[10px]"><span className="text-zinc-400">generate_fake_photo</span><span className="font-mono text-zinc-600">4h registry cooldown</span></div>{activeCooldowns.length ? activeCooldowns.map((memory) => <div key={memory.id} className="flex justify-between gap-3 text-[10px]"><span className="truncate text-zinc-400">memory · {memory.content}</span><span className="shrink-0 font-mono text-amber-400/60">until {new Date(memory.cooldownUntil!).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</span></div>) : <p className="text-[10px] text-zinc-700">No memory cooldown is active.</p>}</div></div><div className="mt-3 grid gap-2"><JsonInspector data={data.companion.configJson.character} label="personality config" /><JsonInspector data={data.companion.configJson.policy} label="policy config" /></div></Panel>
      </div>
    </>
  );
}
