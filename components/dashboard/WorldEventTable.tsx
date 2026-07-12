import type { DashboardWorldEvent } from "@/components/dashboard/data";
import { formatDate } from "@/components/dashboard/format";
import { JsonInspector } from "@/components/dashboard/JsonInspector";
import { EmptyState } from "@/components/dashboard/ui";

export function WorldEventTable({ events }: { events: DashboardWorldEvent[] }) {
  if (!events.length) return <EmptyState />;
  return (
    <div className="space-y-3">
      {events.map((event) => (
        <article key={event.id} className="rounded-md border border-white/[0.07] bg-black/15 p-4">
          <div className="flex items-start justify-between gap-4"><p className="text-sm text-zinc-200">{event.title}</p><time className="font-mono text-[9px] text-zinc-600">{formatDate(event.createdAt)}</time></div>
          <p className="mt-3 text-xs leading-5 text-zinc-400">{event.content}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2"><JsonInspector data={event.moodImpactJson} label="mood impact" /><JsonInspector data={event.arcImpactJson} label="arc impact" /></div>
        </article>
      ))}
    </div>
  );
}
