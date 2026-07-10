import type { TopicEntropy } from "@/core/types";
import { AlertTriangle } from "lucide-react";
import { Panel, ValueBar } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";

export function TopicEntropyPanel({ entropy }: { entropy: TopicEntropy }) {
  return (
    <Panel
      title="Topic entropy"
      description="最近 50 条 annotation 的话题分布；top3 > 0.75 时提示坍缩风险。"
      action={entropy.collapseRisk ? <Badge className="border-amber-400/20 text-amber-300"><AlertTriangle className="mr-1 size-3" /> collapse risk</Badge> : <Badge className="border-emerald-400/20 text-emerald-300">healthy spread</Badge>}
    >
      <div className="grid gap-5 sm:grid-cols-[1fr_1.3fr]">
        <div className="space-y-4">
          <ValueBar label="entropy score" value={entropy.entropyScore} tone="cyan" />
          <ValueBar label="top 1 share" value={entropy.top1Share} tone="violet" />
          <ValueBar label="top 3 share" value={entropy.top3Share} tone={entropy.collapseRisk ? "amber" : "emerald"} />
        </div>
        <div className="space-y-2.5">
          {entropy.distribution.slice(0, 6).map((item) => (
            <div key={item.topic} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex justify-between text-[10px] text-zinc-500">
                  <span className="truncate">{item.topic}</span><span>{item.count}</span>
                </div>
                <div className="h-1 rounded-full bg-white/[0.05]"><div className="h-1 rounded-full bg-cyan-400/55" style={{ width: `${item.share * 100}%` }} /></div>
              </div>
              <span className="text-right font-mono text-[10px] text-zinc-600">{Math.round(item.share * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
