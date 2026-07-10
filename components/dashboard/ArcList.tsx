import type { ActiveArc } from "@/core/types";
import { Badge } from "@/components/ui/badge";

export function ArcList({ arcs }: { arcs: ActiveArc[] }) {
  return (
    <div className="space-y-4">
      {arcs.map((arc) => <article key={arc.id}><div className="mb-1.5 flex items-center gap-2"><p className="text-xs text-zinc-300">{arc.title}</p><Badge className="ml-auto">{Math.round(arc.progress * 100)}%</Badge></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400/70 to-violet-400/70" style={{ width: `${arc.progress * 100}%` }} /></div><p className="mt-2 text-[10px] leading-4 text-zinc-600">{arc.currentQuestion}</p></article>)}
    </div>
  );
}
