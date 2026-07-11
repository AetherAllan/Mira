import { GitBranch, MapPin } from "lucide-react";
import { loadWorldDashboardData } from "@/components/dashboard/worldData";
import { EmptyState, PageIntro, Panel } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { JsonInspector } from "@/components/dashboard/JsonInspector";
import { formatZonedTimestamp } from "@/platform/time";

export const dynamic = "force-dynamic";

const date = (value: Date) =>
  formatZonedTimestamp(value, "Asia/Shanghai", { includeYear: false });

export default async function TimelinePage() {
  const data = await loadWorldDashboardData();
  return (
    <>
      <PageIntro title="World timeline" description="重要生活事件按发生时间排列；地点、角色、用户影响和后果都来自持久化因果链。" />
      <Panel title="Causal event stream" description="physical 与 inner 明确分层，旧 Inner World 记录不会被算作现实到访。">
        {data.timeline.length ? <div className="relative space-y-5 before:absolute before:bottom-2 before:left-[5.25rem] before:top-2 before:w-px before:bg-white/[0.07]">{data.timeline.map((event) => <div key={event.id} className="relative grid grid-cols-[72px_1fr] gap-6"><span className="pt-1 text-right font-mono text-[10px] text-zinc-600">{date(event.occurredAt)}</span><div className="relative rounded-md border border-white/[0.07] bg-black/15 p-4 before:absolute before:-left-[1.72rem] before:top-4 before:size-2 before:rounded-full before:bg-cyan-400"><div className="flex flex-wrap items-center gap-2"><Badge className={event.realityLayer === "physical" ? "text-emerald-300" : "text-violet-300"}>{event.realityLayer}</Badge><Badge>{event.type}</Badge>{event.userInfluenced ? <Badge className="text-amber-300">user influenced</Badge> : null}{event.hasConsequences ? <Badge className="text-cyan-300">has follow-up</Badge> : null}</div><p className="mt-3 text-sm text-zinc-200">{event.title}</p><p className="mt-2 text-xs leading-5 text-zinc-500">{event.content}</p><div className="mt-3 flex flex-wrap gap-4 text-[10px] text-zinc-600">{event.place ? <span className="flex items-center gap-1"><MapPin className="size-3" />{event.place.name}</span> : null}<span className="flex items-center gap-1"><GitBranch className="size-3" />{event.causeType ?? "legacy"}{event.causeId ? ` / ${event.causeId}` : ""}</span>{event.characters.map((character) => <span key={character.id}>{character.name} · {character.role}</span>)}</div><div className="mt-3"><JsonInspector label="event cause / consequences" data={{ eventId: event.id, correlationId: event.correlationId, causeType: event.causeType, causeId: event.causeId, consequences: event.consequencesJson, emotionalImpact: event.emotionalImpactJson }} /></div></div></div>)}</div> : <EmptyState>还没有世界事件。</EmptyState>}
      </Panel>
    </>
  );
}
