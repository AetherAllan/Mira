import { Clock3, Gauge, Moon, Send } from "lucide-react";
import { loadDashboardData } from "@/components/dashboard/data";
import { DataStatus, KeyValue, PageIntro, Panel, ValueBar } from "@/components/dashboard/ui";
import { StatCard } from "@/components/layout/StatCard";
import { ProactiveLogTable } from "@/components/dashboard/ProactiveLogTable";

export const dynamic = "force-dynamic";

export default async function ProactivePage() {
  const data = await loadDashboardData();
  const lastSent = data.proactiveLogs.find((log) => log.shouldSend);
  const budget = data.companion.configJson.policy.proactiveMaxPerDay;
  const userTopics = new Set(data.recentMessages.filter((message) => message.role === "user").flatMap((message) => message.annotation?.topics.map((topic) => topic.name) ?? []));
  const proactiveTags = new Set(data.proactiveLogs.filter((log) => log.shouldSend).flatMap((log) => {
    const seed = log.selectedSeedJson as { tags?: string[] } | null;
    return seed?.tags ?? [];
  }));
  const mirrorIndex = proactiveTags.size ? [...proactiveTags].filter((tag) => userTopics.has(tag)).length / proactiveTags.size : 0;
  const hoursSinceLastSend = lastSent ? Math.max(0, (Date.now() - new Date(lastSent.createdAt).getTime()) / 3_600_000) : null;
  return (
    <>
      <PageIntro title="Agency with restraint" description="Cron 只做短检查。Quiet hours、每日预算和最小间隔是硬门，不是提示词建议。" />
      <DataStatus source={data.source} error={data.connectionError} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Sent today" value={`${data.stats.todayProactive} / ${budget}`} description="今日主动消息使用量" icon={Send} /><StatCard label="Budget remaining" value={data.stats.proactiveRemaining} description="达到 0 后所有 check 只记录不发送" icon={Gauge} tone="emerald" /><StatCard label="Minimum interval" value={`${data.companion.configJson.policy.minimumProactiveIntervalHours}h`} description="避免连续打扰" icon={Clock3} tone="violet" /><StatCard label="Quiet hours" value={`${data.companion.configJson.policy.quietHours.start}–${data.companion.configJson.policy.quietHours.end}`} description={data.companion.configJson.policy.quietHours.timeZone} icon={Moon} tone="amber" /></div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[.7fr_1.3fr]"><Panel title="Current decision inputs" description="MVP heuristic：drives + relationship + topic entropy + jitter，随后经过硬限制。"><ValueBar label="initiative" value={data.state.traits.initiative} tone="cyan" /><div className="mt-4"><ValueBar label="novelty seeking" value={data.state.drives.noveltySeeking} tone="violet" /></div><div className="mt-4"><ValueBar label="boundary sensitivity" value={data.state.relationship.boundarySensitivity} tone="amber" /></div><div className="mt-4"><ValueBar label="mirror index" value={mirrorIndex} description={mirrorIndex > 0.8 ? "高重合：提高 novelty seed 权重" : "主动话题未明显镜像用户"} tone={mirrorIndex > 0.8 ? "rose" : "emerald"} /></div><div className="mt-5"><KeyValue label="Topic collapse" value={data.topicEntropy.collapseRisk ? "RISK" : "clear"} /><KeyValue label="Last sent mode" value={lastSent?.selectedMode ?? "—"} /><KeyValue label="Since last send" value={hoursSinceLastSend === null ? "—" : `${hoursSinceLastSend.toFixed(1)}h`} /><KeyValue label="Last message id" value={lastSent?.sentMessageId ?? "—"} /></div></Panel><Panel title="Hourly proactive checks" description="shouldSend、拦截原因、selected mode/seed、发送文本和评分都可审查。"><ProactiveLogTable logs={data.proactiveLogs} /></Panel></div>
    </>
  );
}
