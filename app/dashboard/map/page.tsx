import Image from "next/image";
import { MapPinned } from "lucide-react";
import { loadWorldDashboardData } from "@/components/dashboard/worldData";
import { PageIntro, Panel } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const label = (status: string, source: string) => source === "user_recommendation"
  ? "用户推荐"
  : status === "visited" ? "去过" : status === "want_to_visit" ? "想去" : "已知";

export default async function MapPage() {
  const data = await loadWorldDashboardData();
  const mapped = data.places.filter((place) => place.latitude != null && place.longitude != null);
  return (
    <>
      <PageIntro title="Beijing map" description="地点按需进入 Mira 的 KnownPlace；私人住所和虚构工作单位只使用近似区域，不展示精确地址。" />
      <Panel title="Persistent place map" description="Google 静态图由服务端代理；API key 不会出现在浏览器 URL。">
        <div className="relative aspect-[16/7] min-h-72 overflow-hidden rounded-md border border-white/[0.07] bg-[#080a0d]">
          {process.env.GOOGLE_MAPS_API_KEY ? <Image src="/api/admin/world/map-image" alt="Mira 在北京的已知地点静态地图" fill unoptimized className="object-cover opacity-80" /> : <div className="grid h-full place-items-center p-6 text-center"><div><MapPinned className="mx-auto size-8 text-cyan-300/50" /><p className="mt-3 text-sm text-zinc-400">尚未配置 GOOGLE_MAPS_API_KEY</p><p className="mt-1 text-xs text-zinc-600">地点列表仍可用；配置后这里显示服务端 Google 静态图。</p></div></div>}
        </div>
      </Panel>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{mapped.map((place) => <div key={place.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-zinc-200">{place.name}</p><p className="mt-1 text-[11px] text-zinc-600">{place.district ?? "北京"} · {place.category}</p></div><Badge className={place.status === "visited" ? "text-emerald-300" : place.source === "user_recommendation" ? "text-violet-300" : "text-cyan-300"}>{label(place.status, place.source)}</Badge></div><div className="mt-4 flex items-center justify-between font-mono text-[10px] text-zinc-600"><span>visits {place.visitCount}</span><span>familiarity {place.familiarity.toFixed(2)}</span></div>{place.miraImpression ? <p className="mt-3 border-l border-cyan-400/15 pl-3 text-xs leading-5 text-zinc-500">{place.miraImpression}</p> : null}</div>)}</div>
    </>
  );
}
