import type { DashboardStateChange } from "@/components/dashboard/data";
import { formatDate } from "@/components/dashboard/format";
import { JsonInspector } from "@/components/dashboard/JsonInspector";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/ui";

export function StateChangeTimeline({ changes }: { changes: DashboardStateChange[] }) {
  if (!changes.length) return <EmptyState />;
  return (
    <div className="space-y-3">
      {changes.map((change) => (
        <article key={change.id} className="rounded-md border border-white/[0.07] bg-black/15 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-cyan-400/20 text-cyan-300">{change.targetPath}</Badge>
            <span className="text-[10px] text-zinc-600">caused by</span><span className="font-mono text-[10px] text-zinc-400">{change.causedBy}</span>
            <time className="ml-auto font-mono text-[9px] text-zinc-700">{formatDate(change.createdAt)}</time>
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-400">{change.reason}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <JsonInspector data={change.beforeJson} label="before" />
            <JsonInspector data={change.afterJson} label="after" />
            <JsonInspector data={change.deltaJson} label="delta" />
          </div>
        </article>
      ))}
    </div>
  );
}
