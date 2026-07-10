import { Ban, Check, Clock3, ShieldX } from "lucide-react";
import type { DashboardProactiveLog } from "@/components/dashboard/data";
import { formatDate } from "@/components/dashboard/format";
import { JsonInspector } from "@/components/dashboard/JsonInspector";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/ui";

export function ProactiveLogTable({ logs }: { logs: DashboardProactiveLog[] }) {
  if (!logs.length) return <EmptyState />;
  return (
    <div className="space-y-3">
      {logs.map((log) => {
        const blocks = [log.quietHoursBlocked && "quiet hours", log.dailyLimitBlocked && "daily limit", log.intervalBlocked && "interval", log.criticBlocked && "critic"].filter(Boolean);
        return (
          <article key={log.id} className="rounded-md border border-white/[0.07] bg-black/15 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`grid size-6 place-items-center rounded ${log.shouldSend ? "bg-emerald-400/10 text-emerald-300" : "bg-zinc-400/5 text-zinc-500"}`}>{log.shouldSend ? <Check className="size-3.5" /> : <Ban className="size-3.5" />}</span>
              <Badge className={log.shouldSend ? "text-emerald-300" : "text-zinc-500"}>{log.shouldSend ? "sent" : "held"}</Badge>
              {log.selectedMode ? <Badge className="text-violet-300">{log.selectedMode}</Badge> : null}
              {log.score !== null ? <span className="font-mono text-[10px] text-zinc-600">score {log.score.toFixed(2)}</span> : null}
              <time className="ml-auto font-mono text-[9px] text-zinc-700">{formatDate(log.createdAt)}</time>
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-300">{log.reason}</p>
            {blocks.length ? <div className="mt-2 flex items-center gap-2 text-[10px] text-amber-300/70"><ShieldX className="size-3" /> blocked by {blocks.join(" + ")}</div> : <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-600"><Clock3 className="size-3" /> all gates passed</div>}
            {log.sentText ? <p className="mt-3 rounded border border-violet-400/10 bg-violet-400/[0.035] p-3 text-xs leading-5 text-violet-100/75">{log.sentText}</p> : null}
            <div className="mt-3"><JsonInspector data={log.selectedSeedJson} label="selected seed" /></div>
          </article>
        );
      })}
    </div>
  );
}

