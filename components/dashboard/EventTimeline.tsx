import type { DashboardEvent } from "@/components/dashboard/data";
import { eventTone, formatDate } from "@/components/dashboard/format";
import { JsonInspector } from "@/components/dashboard/JsonInspector";
import { EmptyState, Panel } from "@/components/dashboard/ui";

export function EventTimeline({ events, limit = 10, title = "Event timeline" }: { events: DashboardEvent[]; limit?: number; title?: string }) {
  const rows = events.slice(0, limit);
  return (
    <Panel title={title} description="每个节点都保留 source 和原始 payload，便于追踪因果。">
      {rows.length ? (
        <div className="relative ml-1 space-y-4 before:absolute before:bottom-2 before:left-[4px] before:top-2 before:w-px before:bg-white/[0.07]">
          {rows.map((event) => (
            <div key={event.id} className="relative pl-6">
              <span className={`absolute left-0 top-1.5 size-2 rounded-full ring-4 ring-[#111418] ${eventTone(event.type)}`} />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-[11px] text-zinc-300">{event.type}</span>
                <span className="text-[10px] text-zinc-600">via {event.source}</span>
                <span className="ml-auto font-mono text-[9px] text-zinc-700">{formatDate(event.createdAt, true)}</span>
              </div>
              <div className="mt-2"><JsonInspector data={event.payloadJson} label="payload" /></div>
            </div>
          ))}
        </div>
      ) : <EmptyState />}
    </Panel>
  );
}
