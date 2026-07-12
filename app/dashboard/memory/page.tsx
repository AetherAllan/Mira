import { loadDashboardData } from "@/components/dashboard/data";
import { PageIntro, Panel } from "@/components/dashboard/ui";
import { MemoryTable } from "@/components/dashboard/MemoryTable";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const data = await loadDashboardData();
  const counts = Object.fromEntries(["user_memory", "relationship_memory", "self_memory", "world_experience"].map((kind) => [kind, data.memories.filter((memory) => memory.kind === kind).length]));
  return (
    <>
      <PageIntro title="Selective memory" description="保留对未来行为有用的信息，而不是把消息日志复制成永久人格。Reuse 超限会触发 24 小时 cooldown。" />
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">{Object.entries(counts).map(([kind, count]) => <div key={kind} className="lab-panel p-3"><p className="font-mono text-[9px] text-zinc-600">{kind}</p><p className="mt-2 font-mono text-xl text-zinc-200">{count}</p></div>)}</div>
      <Panel title="Memory index" description="搜索、按 kind/tag 过滤；管理员可写入、删除或手动设置 24h cooldown。"><MemoryTable memories={data.memories} /></Panel>
    </>
  );
}
