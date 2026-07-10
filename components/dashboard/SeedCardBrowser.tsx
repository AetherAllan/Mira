"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleOff, Dices, Plus, Sparkles } from "lucide-react";
import type { DashboardSeed } from "@/components/dashboard/data";
import { formatDate } from "@/components/dashboard/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function SeedCardBrowser({ seeds }: { seeds: DashboardSeed[] }) {
  const router = useRouter();
  const [type, setType] = useState("all");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const types = useMemo(() => Array.from(new Set(seeds.map((seed) => seed.type))), [seeds]);
  const visible = type === "all" ? seeds : seeds.filter((seed) => seed.type === type);

  async function post(url: string, payload: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
    router.refresh();
  }

  async function add(form: FormData) {
    setBusy("add"); setStatus(null);
    try { await post("/api/admin/seed", { type: form.get("type"), text: form.get("text"), tags: String(form.get("tags") ?? "").split(",").map((item) => item.trim()).filter(Boolean), weight: Number(form.get("weight")) }); setAdding(false); setStatus("Seed card 已添加。"); }
    catch (error) { setStatus(error instanceof Error ? error.message : "添加失败"); }
    finally { setBusy(null); }
  }

  async function toggle(seed: DashboardSeed) {
    setBusy(seed.id); setStatus(null);
    try { await post("/api/admin/seed", { action: "toggle", id: seed.id, enabled: !seed.enabled }); setStatus(seed.enabled ? "Seed 已禁用。" : "Seed 已启用。"); }
    catch (error) { setStatus(error instanceof Error ? error.message : "更新失败"); }
    finally { setBusy(null); }
  }

  async function generate(seedId?: string) {
    setBusy(seedId ?? "generate"); setStatus(null);
    try { await post("/api/admin/world/generate", { seedId }); setStatus("World event 已生成；状态影响仍受 Growth Engine 限幅。"); }
    catch (error) { setStatus(error instanceof Error ? error.message : "生成失败"); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <select value={type} onChange={(event) => setType(event.target.value)} className="h-9 rounded-md border border-white/10 bg-[#0d1013] px-3 text-xs text-zinc-300 outline-none"><option value="all">All seed types</option>{types.map((item) => <option key={item}>{item}</option>)}</select>
        <Button size="sm" variant="secondary" onClick={() => setAdding((value) => !value)}><Plus className="size-3.5" /> Add seed</Button>
        <Button size="sm" onClick={() => generate()} disabled={busy === "generate"}><Dices className="size-3.5" /> Generate World Event</Button>
      </div>
      {adding ? <form action={add} className="mb-4 grid gap-3 rounded-md border border-cyan-400/15 bg-cyan-400/[0.035] p-4 sm:grid-cols-[12rem_1fr_7rem]"><Input name="type" required placeholder="type" /><Input name="tags" placeholder="tags, comma separated" /><Input name="weight" type="number" step="0.1" min="0" defaultValue="1" /><Textarea name="text" required placeholder="Seed text…" className="sm:col-span-3" /><div className="sm:col-span-3"><Button type="submit" disabled={busy === "add"}>Save seed</Button></div></form> : null}
      {status ? <p className="mb-3 rounded border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] text-zinc-400">{status}</p> : null}
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {visible.map((seed) => (
          <article key={seed.id} className={`rounded-md border p-4 ${seed.enabled ? "border-white/[0.07] bg-black/15" : "border-white/[0.04] bg-black/10 opacity-45"}`}>
            <div className="flex items-center gap-2"><Badge className="text-violet-300">{seed.type}</Badge><span className="ml-auto font-mono text-[9px] text-zinc-700">weight {(seed.weight ?? 1).toFixed(1)}</span></div>
            <p className="mt-3 min-h-14 text-xs leading-5 text-zinc-300">{seed.text}</p>
            <div className="mt-3 flex flex-wrap gap-1">{seed.tags.map((tag) => <span key={tag} className="text-[9px] text-cyan-400/50">#{tag}</span>)}</div>
            <div className="mt-4 flex items-center border-t border-white/[0.05] pt-3"><div><p className="font-mono text-[9px] text-zinc-600">used {seed.usedCount}×</p><p className="font-mono text-[8px] text-zinc-700">{formatDate(seed.lastUsedAt, true)}</p></div><div className="ml-auto flex gap-1"><Button size="icon" variant="ghost" title={seed.enabled ? "Disable" : "Enable"} disabled={busy === seed.id} onClick={() => toggle(seed)}><CircleOff className="size-3.5" /></Button><Button size="icon" variant="ghost" title="Generate from this seed" disabled={busy === seed.id} onClick={() => generate(seed.id)}><Sparkles className="size-3.5 text-cyan-300" /></Button></div></div>
          </article>
        ))}
      </div>
    </div>
  );
}
