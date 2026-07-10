"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Plus, Search, Trash2 } from "lucide-react";
import type { DashboardMemory } from "@/components/dashboard/data";
import type { MemoryKind } from "@/core/types";
import { formatDate, percent } from "@/components/dashboard/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/dashboard/ui";

const kinds: MemoryKind[] = ["user_memory", "relationship_memory", "self_memory", "world_experience"];

async function request(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
}

export function MemoryTable({ memories }: { memories: DashboardMemory[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [tag, setTag] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const filtered = useMemo(() => memories.filter((memory) => {
    const query = search.toLowerCase();
    return (kind === "all" || memory.kind === kind)
      && (!query || memory.content.toLowerCase().includes(query))
      && (!tag || memory.tagsJson.some((item) => item.toLowerCase().includes(tag.toLowerCase())));
  }), [memories, search, kind, tag]);

  async function addMemory(formData: FormData) {
    setBusy("add"); setStatus(null);
    try {
      await request("/api/admin/memories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: formData.get("kind"),
          content: formData.get("content"),
          tags: String(formData.get("tags") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
          importance: Number(formData.get("importance")),
          confidence: Number(formData.get("confidence")),
        }),
      });
      setAdding(false); setStatus("Memory 已写入。请输入经过选择的信息，不要把日志当记忆。"); router.refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : "写入失败"); }
    finally { setBusy(null); }
  }

  async function remove(id: string) {
    if (!window.confirm("删除这条 memory？这个操作不可撤销。")) return;
    setBusy(id); setStatus(null);
    try { await request(`/api/admin/memories?id=${encodeURIComponent(id)}`, { method: "DELETE" }); setStatus("Memory 已删除。"); router.refresh(); }
    catch (error) { setStatus(error instanceof Error ? error.message : "删除失败"); }
    finally { setBusy(null); }
  }

  async function cooldown(id: string) {
    const cooldownUntil = new Date(Date.now() + 24 * 3_600_000).toISOString();
    setBusy(id); setStatus(null);
    try {
      await request("/api/admin/memories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cooldown", id, cooldownUntil }) });
      setStatus("已设置 24 小时 cooldown。"); router.refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : "设置失败"); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 xl:flex-row xl:items-center">
        <label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-zinc-600" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 memory 内容…" className="pl-9" /></label>
        <select value={kind} onChange={(event) => setKind(event.target.value)} className="h-9 rounded-md border border-white/10 bg-[#0d1013] px-3 text-xs text-zinc-300 outline-none"><option value="all">All kinds</option>{kinds.map((item) => <option key={item}>{item}</option>)}</select>
        <Input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="tag filter" className="xl:w-44" />
        <Button size="sm" onClick={() => setAdding((value) => !value)}><Plus className="size-3.5" /> Add memory</Button>
      </div>
      {adding ? (
        <form action={addMemory} className="mb-4 grid gap-3 rounded-md border border-cyan-400/15 bg-cyan-400/[0.035] p-4 lg:grid-cols-4">
          <select name="kind" className="h-9 rounded-md border border-white/10 bg-[#0d1013] px-3 text-xs text-zinc-300 outline-none">{kinds.map((item) => <option key={item}>{item}</option>)}</select>
          <Input name="tags" placeholder="tags, comma, separated" />
          <Input name="importance" type="number" step="0.01" min="0" max="1" defaultValue="0.5" aria-label="Importance" />
          <Input name="confidence" type="number" step="0.01" min="0" max="1" defaultValue="0.7" aria-label="Confidence" />
          <Textarea name="content" required placeholder="值得长期保留的具体事实或关系信息…" className="lg:col-span-4" />
          <div className="lg:col-span-4"><Button disabled={busy === "add"} type="submit">{busy === "add" ? "Writing…" : "Write selected memory"}</Button></div>
        </form>
      ) : null}
      {status ? <p className="mb-3 rounded border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] text-zinc-400">{status}</p> : null}
      {filtered.length ? (
        <div className="overflow-x-auto rounded-md border border-white/[0.07]">
          <table className="data-table min-w-[1000px]">
            <thead><tr><th>Memory</th><th>Kind / tags</th><th>Quality</th><th>Reuse</th><th>Cooldown</th><th aria-label="Actions" /></tr></thead>
            <tbody>{filtered.map((memory) => (
              <tr key={memory.id}>
                <td className="max-w-md"><p className="text-xs leading-5 text-zinc-300">{memory.content}</p><p className="mt-1 font-mono text-[9px] text-zinc-700">created {formatDate(memory.createdAt)}</p></td>
                <td><Badge className="text-emerald-300">{memory.kind}</Badge><div className="mt-2 flex max-w-xs flex-wrap gap-1">{memory.tagsJson.map((item) => <span key={item} className="text-[9px] text-cyan-400/55">#{item}</span>)}</div></td>
                <td><p className="font-mono text-[10px] text-zinc-400">importance {percent(memory.importance)}</p><p className="mt-1 font-mono text-[10px] text-zinc-600">confidence {percent(memory.confidence)}</p></td>
                <td><p className="font-mono text-xs text-zinc-300">{memory.useCount}×</p><p className="mt-1 text-[9px] text-zinc-700">{formatDate(memory.lastUsedAt, true)}</p></td>
                <td><p className="max-w-32 text-[10px] leading-4 text-zinc-500">{memory.cooldownUntil ? formatDate(memory.cooldownUntil) : "available"}</p></td>
                <td><div className="flex justify-end gap-1"><Button title="Cooldown 24h" variant="ghost" size="icon" disabled={busy === memory.id} onClick={() => cooldown(memory.id)}><Clock3 className="size-3.5" /></Button><Button title="Delete" variant="ghost" size="icon" disabled={busy === memory.id} onClick={() => remove(memory.id)}><Trash2 className="size-3.5 text-rose-400" /></Button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <EmptyState>没有符合筛选条件的 memory。</EmptyState>}
    </div>
  );
}

