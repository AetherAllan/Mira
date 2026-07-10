"use client";

import { useMemo, useState } from "react";
import { Bot, Filter, Search, UserRound, Wrench } from "lucide-react";
import type { DashboardMessage } from "@/components/dashboard/data";
import { formatDate, percent } from "@/components/dashboard/format";
import { JsonInspector } from "@/components/dashboard/JsonInspector";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/dashboard/ui";

export function ConversationTimeline({ messages }: { messages: DashboardMessage[] }) {
  const [role, setRole] = useState("all");
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState("");
  const filtered = useMemo(() => messages.filter((message) => {
    const roleMatch = role === "all" || message.role === role;
    const topicMatch = !topic || message.annotation?.topics.some((item) => item.name.toLowerCase().includes(topic.toLowerCase()));
    const dateMatch = !date || new Date(message.createdAt).toISOString().slice(0, 10) === date;
    return roleMatch && topicMatch && dateMatch;
  }), [messages, role, topic, date]);

  return (
    <div>
      <div className="mb-4 grid gap-2 rounded-md border border-white/[0.07] bg-black/15 p-3 sm:grid-cols-[10rem_1fr_11rem]">
        <label className="relative">
          <Filter className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-zinc-600" />
          <select value={role} onChange={(event) => setRole(event.target.value)} className="h-9 w-full appearance-none rounded-md border border-white/10 bg-[#0d1013] pl-9 pr-3 text-xs text-zinc-300 outline-none">
            <option value="all">All roles</option><option value="user">User</option><option value="assistant">Assistant</option><option value="system">System</option><option value="tool">Tool</option>
          </select>
        </label>
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-zinc-600" />
          <Input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="按 topic 搜索…" className="pl-9" />
        </label>
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>

      <p className="mb-3 font-mono text-[9px] uppercase tracking-wider text-zinc-700">{filtered.length} / {messages.length} messages</p>
      {filtered.length ? <div className="space-y-3">{filtered.map((message) => {
        const Icon = message.role === "user" ? UserRound : message.role === "tool" ? Wrench : Bot;
        return (
          <article key={message.id} className="lab-panel p-4">
            <div className="flex items-start gap-3">
              <div className="grid size-8 shrink-0 place-items-center rounded-md border border-white/[0.08] bg-white/[0.03] text-zinc-500"><Icon className="size-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={message.role === "assistant" ? "text-violet-300" : message.role === "user" ? "text-sky-300" : ""}>{message.role}</Badge>
                  <span className="font-mono text-[9px] text-zinc-700">{formatDate(message.createdAt)}</span>
                  {message.memoryCandidateJson ? <Badge className="border-emerald-400/20 text-emerald-300">memory candidate</Badge> : null}
                  {message.toolCalls?.length ? <Badge className="border-fuchsia-400/20 text-fuchsia-300">tool × {message.toolCalls.length}</Badge> : null}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-200">{message.text}</p>
                {message.annotation ? (
                  <div className="mt-4 grid gap-3 border-t border-white/[0.05] pt-3 md:grid-cols-[1.3fr_repeat(4,minmax(0,.65fr))]">
                    <div><p className="metric-label">topics</p><div className="mt-1.5 flex flex-wrap gap-1">{message.annotation.topics.map((item) => <Badge key={item.name}>{item.name} · {percent(item.confidence)}</Badge>)}</div></div>
                    <div><p className="metric-label">emotion</p><p className="mt-1 text-xs text-zinc-300">{message.annotation.emotion}</p></div>
                    <div><p className="metric-label">intent</p><p className="mt-1 text-xs text-zinc-300">{message.annotation.intent}</p></div>
                    <div><p className="metric-label">importance</p><p className="mt-1 font-mono text-xs text-zinc-300">{message.annotation.importance.toFixed(2)}</p></div>
                    <div><p className="metric-label">novelty</p><p className="mt-1 font-mono text-xs text-zinc-300">{message.annotation.novelty.toFixed(2)}</p></div>
                  </div>
                ) : <p className="mt-3 text-[10px] text-zinc-700">No annotation attached.</p>}
                <div className="mt-3 grid gap-2 lg:grid-cols-2"><JsonInspector data={message.rawJson} /><JsonInspector data={{ memoryCandidate: message.memoryCandidateJson, toolCalls: message.toolCalls }} label="runtime trace" /></div>
              </div>
            </div>
          </article>
        );
      })}</div> : <EmptyState>没有符合筛选条件的消息。</EmptyState>}
    </div>
  );
}

