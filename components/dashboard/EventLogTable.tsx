"use client";

import { useMemo, useState } from "react";
import type { DashboardEvent } from "@/components/dashboard/data";
import { eventTone, formatDate } from "@/components/dashboard/format";
import { JsonInspector } from "@/components/dashboard/JsonInspector";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/dashboard/ui";

export function EventLogTable({ events }: { events: DashboardEvent[] }) {
  const [type, setType] = useState("all");
  const [source, setSource] = useState("all");
  const [date, setDate] = useState("");
  const types = useMemo(() => Array.from(new Set(events.map((event) => event.type))), [events]);
  const sources = useMemo(() => Array.from(new Set(events.map((event) => event.source))), [events]);
  const filtered = useMemo(() => events.filter((event) => {
    const iso = event.createdAt instanceof Date ? event.createdAt.toISOString() : new Date(event.createdAt).toISOString();
    return (type === "all" || event.type === type) && (source === "all" || event.source === source) && (!date || iso.slice(0, 10) === date);
  }), [events, type, source, date]);
  return (
    <div>
      <div className="mb-4 grid gap-2 rounded-md border border-white/[0.07] bg-black/15 p-3 sm:grid-cols-3">
        <select value={type} onChange={(event) => setType(event.target.value)} className="h-9 rounded-md border border-white/10 bg-[#0d1013] px-3 text-xs text-zinc-300 outline-none"><option value="all">All event types</option>{types.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={source} onChange={(event) => setSource(event.target.value)} className="h-9 rounded-md border border-white/10 bg-[#0d1013] px-3 text-xs text-zinc-300 outline-none"><option value="all">All sources</option>{sources.map((item) => <option key={item}>{item}</option>)}</select>
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>
      {filtered.length ? <div className="space-y-2">{filtered.map((item) => <article key={item.id} className="rounded-md border border-white/[0.07] bg-black/15 p-3"><div className="flex flex-wrap items-center gap-2"><span className={`size-1.5 rounded-full ${eventTone(item.type)}`} /><span className="font-mono text-[11px] text-zinc-300">{item.type}</span><span className="text-[10px] text-zinc-600">{item.source}</span><time className="ml-auto font-mono text-[9px] text-zinc-700">{formatDate(item.createdAt)}</time></div><div className="mt-2"><JsonInspector data={item.payloadJson} label="event payload" /></div></article>)}</div> : <EmptyState>没有符合筛选条件的事件。</EmptyState>}
    </div>
  );
}

