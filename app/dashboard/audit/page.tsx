import { Brain, Database, HelpCircle, MessageCircleOff, Send, Wrench } from "lucide-react";
import { loadDashboardData } from "@/components/dashboard/data";
import { DataStatus, PageIntro, Panel } from "@/components/dashboard/ui";
import { StateChangeTimeline } from "@/components/dashboard/StateChangeTimeline";
import { JsonInspector } from "@/components/dashboard/JsonInspector";
import { formatDate } from "@/components/dashboard/format";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const data = await loadDashboardData();
  const lastSent = data.proactiveLogs.find((log) => log.shouldSend);
  const lastHeld = data.proactiveLogs.find((log) => !log.shouldSend);
  const lastMemory = data.memories[0];
  const lastTool = data.toolCalls[0];
  const questions = [
    { icon: Send, question: "她为什么发这条消息？", answer: lastSent?.reason ?? "当前快照没有主动发送记录。", evidence: lastSent },
    { icon: Brain, question: "她为什么变得更主动？", answer: data.stateChanges.find((change) => change.targetPath.includes("initiative"))?.reason ?? "当前没有 initiative 变化；不要从语气猜人格变化。", evidence: data.stateChanges.find((change) => change.targetPath.includes("initiative")) },
    { icon: Database, question: "她为什么记住这件事？", answer: lastMemory ? `importance ${lastMemory.importance.toFixed(2)} / confidence ${lastMemory.confidence.toFixed(2)}，超过写入阈值 ${data.companion.configJson.policy.memoryWriteThreshold.toFixed(2)}。` : "当前没有 memory。", evidence: lastMemory },
    { icon: MessageCircleOff, question: "她为什么没有发主动消息？", answer: lastHeld?.reason ?? "当前没有被抑制的 proactive check。", evidence: lastHeld },
  ];
  return (
    <>
      <PageIntro title="Causal audit" description="把“她为什么这么做”落到状态、计划、审查和事件证据，而不是用人格故事事后解释。" />
      <DataStatus source={data.source} error={data.connectionError} />
      <div className="grid gap-3 xl:grid-cols-2">{questions.map(({ icon: Icon, question, answer, evidence }) => <Panel key={question} title={question} description="Evidence-backed answer" action={<Icon className="size-4 text-cyan-300/70" />}><p className="text-sm leading-6 text-zinc-300">{answer}</p><div className="mt-3"><JsonInspector data={evidence} label="supporting evidence" /></div></Panel>)}</div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2"><Panel title="Personality changes" description="只有 state_changes 才算人格或状态变化证据。"><StateChangeTimeline changes={data.stateChanges} /></Panel><Panel title="Memory / tool / reflection audit" description="写入、工具调用与 daily reflection 的最近证据。"><div className="space-y-4">{lastMemory ? <div className="rounded border border-white/[0.06] bg-black/15 p-3"><div className="flex items-center gap-2"><Database className="size-3.5 text-emerald-300" /><p className="text-xs text-zinc-300">Memory write</p><span className="ml-auto font-mono text-[9px] text-zinc-700">{formatDate(lastMemory.createdAt)}</span></div><p className="mt-2 text-[11px] leading-5 text-zinc-500">{lastMemory.content}</p></div> : null}{lastTool ? <div className="rounded border border-white/[0.06] bg-black/15 p-3"><div className="flex items-center gap-2"><Wrench className="size-3.5 text-fuchsia-300" /><p className="text-xs text-zinc-300">Tool call</p><span className="ml-auto font-mono text-[9px] text-zinc-700">{formatDate(lastTool.createdAt)}</span></div><p className="mt-2 text-[11px] leading-5 text-zinc-500">{lastTool.reason ?? "Actor requested an allowlisted tool."}</p></div> : null}{data.latestJournal ? <div className="rounded border border-white/[0.06] bg-black/15 p-3"><div className="flex items-center gap-2"><HelpCircle className="size-3.5 text-violet-300" /><p className="text-xs text-zinc-300">Daily reflection</p><span className="ml-auto font-mono text-[9px] text-zinc-700">{data.latestJournal.date}</span></div><p className="mt-2 text-[11px] leading-5 text-zinc-500">{data.latestJournal.reflection}</p></div> : null}</div></Panel></div>
    </>
  );
}

