import { loadWorldDashboardData } from "@/components/dashboard/worldData";
import { PageIntro, Panel } from "@/components/dashboard/ui";
import { JsonInspector } from "@/components/dashboard/JsonInspector";

export const dynamic = "force-dynamic";

export default async function WorldDebugPage() {
  const { debug } = await loadWorldDashboardData();
  const sections = [
    ["WorldState", debug.worldState, "当前权威世界状态与版本。"],
    ["Schedule", debug.schedule, "日程来源、状态、地点与变更原因。"],
    ["Characters", debug.characters, "稳定虚构配角与关系状态。"],
    ["OpenLoops", debug.openLoops, "未完成承诺、建议和后续。"],
    ["InnerThoughts", debug.innerThoughts, "内部想法不等于已发送。"],
    ["ShareCandidates", debug.shareCandidates, "来源、评分、claim 与发送状态。"],
    ["AwaitingReply", debug.awaitingReplies, "期待强度、超时后果与一次性不满。"],
    ["ExternalInformation", debug.externalInformation, "来源、短摘要、可靠度和去重组。"],
    ["Tick Log", debug.tickRuns, "窗口、lease、seed、重试和结果。"],
    ["Prompt Context", debug.promptContexts, "脱敏 context、token 预算、选中 ID 与 hash。"],
    ["State Changes", debug.stateChanges, "每次变化的 before / after / reason / correlation。"],
    ["LLM Usage", debug.llmUsage, "Actor、planner、news、embedding 与 reflection 的 tokens、成本、延迟和 fallback。"],
  ] as const;
  return <><PageIntro title="World Debug" description="后台权威视图。这里允许看内部状态，但所有字段仍按 companion 隔离并可沿 correlationId 追踪。" /><div className="grid gap-4 xl:grid-cols-2">{sections.map(([title, value, description]) => <Panel key={title} title={title} description={description}><div className="mb-3 font-mono text-[10px] text-zinc-600">{Array.isArray(value) ? `${value.length} rows` : "current snapshot"}</div><JsonInspector data={value} label={`${title} raw JSON`} /></Panel>)}</div></>;
}
