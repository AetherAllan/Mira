import type { DashboardToolCall } from "@/components/dashboard/data";
import { formatDate } from "@/components/dashboard/format";
import { JsonInspector } from "@/components/dashboard/JsonInspector";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/ui";

export function ToolCallTable({ calls }: { calls: DashboardToolCall[] }) {
  if (!calls.length) return <EmptyState />;
  return (
    <div className="overflow-x-auto rounded-md border border-white/[0.07]">
      <table className="data-table min-w-[850px]"><thead><tr><th>Tool</th><th>Reason</th><th>Arguments</th><th>Result</th><th>Time</th></tr></thead><tbody>{calls.map((call) => <tr key={call.id}><td><Badge className="border-fuchsia-400/20 text-fuchsia-300">{call.toolName}</Badge><p className="mt-1 font-mono text-[9px] text-zinc-700">msg {call.messageId ?? "—"}</p></td><td className="max-w-xs text-xs leading-5 text-zinc-400">{call.reason ?? "Actor requested an allowlisted tool."}</td><td className="min-w-56"><JsonInspector data={call.argsJson} label="args" /></td><td className="min-w-56"><JsonInspector data={call.resultJson} label="result" /></td><td className="whitespace-nowrap font-mono text-[9px] text-zinc-600">{formatDate(call.createdAt)}</td></tr>)}</tbody></table>
    </div>
  );
}

