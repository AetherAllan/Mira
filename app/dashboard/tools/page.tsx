import { Image as ImageIcon, LockKeyhole, PlugZap, Wrench } from "lucide-react";
import { loadDashboardData } from "@/components/dashboard/data";
import { KeyValue, PageIntro, Panel } from "@/components/dashboard/ui";
import { StatCard } from "@/components/layout/StatCard";
import { ToolCallTable } from "@/components/dashboard/ToolCallTable";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  const data = await loadDashboardData();
  const limit = data.companion.configJson.policy.toolDailyLimit;
  return (
    <>
      <PageIntro title="Allowlisted tool registry" description="LLM 只能请求 registry 中的工具名；服务端再次验证参数和 cooldown。当前图片工具只生成描述，不调用真实图片 API。" />
      <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Calls today" value={`${data.stats.todayToolCalls} / ${limit}`} description="每日工具预算" icon={Wrench} /><StatCard label="Registered" value="1" description="未注册名称会被拒绝" icon={LockKeyhole} tone="emerald" /><StatCard label="Image provider" value="MOCK" description="真实 image API 尚未接入" icon={PlugZap} tone="violet" /></div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[.7fr_1.3fr]"><Panel title="generate_fake_photo" description="将想象场景转换为明确标注的生成描述。" action={<Badge className="border-emerald-400/20 text-emerald-300">registered</Badge>}><div className="mb-4 grid size-10 place-items-center rounded-md border border-fuchsia-400/15 bg-fuchsia-400/[0.06]"><ImageIcon className="size-5 text-fuchsia-300" /></div><KeyValue label="Input" value="scene / mood / style" /><KeyValue label="Output" value="mock_image" /><KeyValue label="Cooldown" value="4h" /><KeyValue label="Daily use" value={`${data.stats.todayToolCalls} / ${limit}`} /><div className="mt-4 rounded border border-dashed border-white/[0.08] p-3 text-[11px] leading-5 text-zinc-600">Extension seam: 保持 tool output schema 不变，在 registry 内替换为真实 image provider。API key 仍只在服务端读取。</div></Panel><Panel title="Tool call records" description="args、result 和调用原因都可展开。"><ToolCallTable calls={data.toolCalls} /></Panel></div>
    </>
  );
}
