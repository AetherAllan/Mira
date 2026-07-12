import { loadWorldDashboardData } from "@/components/dashboard/worldData";
import { JsonInspector } from "@/components/dashboard/JsonInspector";
import { PageIntro, Panel } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function WorldPage() {
  const data = await loadWorldDashboardData();
  const plan = data.dailyPlans[0] ?? null;
  const events = plan
    ? data.plannedEvents.filter((event) => event.planId === plan.id).reverse()
    : [];
  return (
    <>
      <PageIntro
        title="Mira's daily life"
        description="每日计划先落库，只有时间推进后发生的事件才会进入世界事实、心理状态和记忆。"
      />
      <div className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
        <Panel title="Current daily plan" description="AI 规划、校验结果和采样 seed 均可审计。">
          {plan ? (
            <div className="space-y-3 text-sm text-zinc-300">
              <div className="flex flex-wrap gap-2">
                <Badge>{plan.localDate}</Badge><Badge>{plan.dayType}</Badge>
                {plan.weekendMode ? <Badge>{plan.weekendMode}</Badge> : null}<Badge>{plan.status}</Badge>
              </div>
              <p className="font-medium text-zinc-100">{plan.theme}</p>
              <p className="text-xs leading-5 text-zinc-400">{plan.summary}</p>
              <JsonInspector data={plan.validationJson} label="validation" />
            </div>
          ) : <p className="text-xs text-zinc-500">尚未生成每日计划。</p>}
        </Panel>
        <Panel title="Fixed social world" description="人物是连续关系，不是一次性话题卡。">
          <div className="grid gap-2 sm:grid-cols-2">
            {data.characters.map((character) => (
              <div key={character.id} className="rounded border border-white/[0.06] bg-black/15 p-3">
                <p className="text-sm text-zinc-200">{character.name}</p>
                <p className="mt-1 text-xs text-zinc-500">{character.role}</p>
                <p className="mt-2 text-xs leading-5 text-zinc-400">{character.currentSituation}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="mt-4">
        <Panel title="Planned event slots" description="required 必定发生；candidate 在合法时间窗按状态和剩余配额抽取。">
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="rounded border border-white/[0.06] bg-black/15 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{event.slot}</Badge><Badge>{event.status}</Badge><Badge>{event.eventType}</Badge>
                  <span className="text-xs text-zinc-500">{event.windowStart.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</span>
                </div>
                <p className="mt-2 text-sm text-zinc-200">{event.title}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">{event.description}</p>
                {event.selectionReason ? <p className="mt-2 font-mono text-[10px] text-zinc-600">{event.selectionReason}</p> : null}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
