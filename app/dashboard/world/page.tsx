import { Aperture, CloudRain, MoonStar, Palette } from "lucide-react";
import { loadDashboardData } from "@/components/dashboard/data";
import { DataStatus, PageIntro, Panel } from "@/components/dashboard/ui";
import { SeedCardBrowser } from "@/components/dashboard/SeedCardBrowser";
import { WorldEventTable } from "@/components/dashboard/WorldEventTable";
import { ArcList } from "@/components/dashboard/ArcList";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function WorldPage() {
  const data = await loadDashboardData();
  const tagCounts = new Map<string, number>();
  for (const seed of data.seeds) for (const tag of seed.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const motifs = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const imaginedScenes = data.seeds.filter((seed) => seed.type === "imagined_scene");
  return (
    <>
      <PageIntro title="Mira's inner world" description="想象场景、虚构日记与生成图片都被明确标注为内部内容；不会声称真实旅行、真实拍照或现实身体经历。" />
      <DataStatus source={data.source} error={data.connectionError} />
      <div className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
        <Panel title="Recurring motifs" description="来自 seed tags 的重复视觉与情绪母题。"><div className="flex flex-wrap gap-2">{motifs.map(([tag, count]) => <Badge key={tag} className="px-2 py-1 text-cyan-300">{tag} <span className="ml-1 text-zinc-600">×{count}</span></Badge>)}</div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded border border-white/[0.06] bg-black/15 p-3"><CloudRain className="size-4 text-sky-300/60" /><p className="mt-2 text-xs text-zinc-300">Rain / reflective surfaces</p></div><div className="rounded border border-white/[0.06] bg-black/15 p-3"><MoonStar className="size-4 text-violet-300/60" /><p className="mt-2 text-xs text-zinc-300">Night / empty transit</p></div><div className="rounded border border-white/[0.06] bg-black/15 p-3"><Aperture className="size-4 text-amber-300/60" /><p className="mt-2 text-xs text-zinc-300">Imperfect snapshots</p></div><div className="rounded border border-white/[0.06] bg-black/15 p-3"><Palette className="size-4 text-rose-300/60" /><p className="mt-2 text-xs text-zinc-300">Muted neon</p></div></div></Panel>
        <Panel title="Active arcs" description="World events 可以推进 arc，但一次影响必须很小。"><ArcList arcs={data.state.activeArcs} /></Panel>
      </div>
      <div className="mt-4"><Panel title="Seed card browser" description="启发式 novelty 来源。禁用卡片后不会再被随机选择。"><SeedCardBrowser seeds={data.seeds} /></Panel></div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[.7fr_1.3fr]"><Panel title="Imagined scenes" description="明确属于内在世界，不是现实地点声明。"><div className="space-y-3">{imaginedScenes.map((scene) => <div key={scene.id} className="rounded border border-white/[0.06] bg-black/15 p-3"><Badge className="text-violet-300">imagined</Badge><p className="mt-2 text-xs leading-5 text-zinc-400">{scene.text}</p></div>)}</div></Panel><Panel title="World event generation log" description="生成结果、mood impact 和 arc impact 均保留。"><WorldEventTable events={data.worldEvents} /></Panel></div>
    </>
  );
}

