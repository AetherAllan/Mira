"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RuntimeConfig } from "@/core/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function lines(value: string[]) { return value.join("\n"); }
function list(value: FormDataEntryValue | null) { return String(value ?? "").split("\n").map((item) => item.trim()).filter(Boolean); }

export function SettingsForm({ config }: { config: RuntimeConfig }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  async function save(formData: FormData) {
    setBusy(true); setStatus(null);
    const payload: RuntimeConfig = {
      schemaVersion: 3,
      model: String(formData.get("model")),
      character: {
        name: String(formData.get("name")),
        identity: list(formData.get("identity")),
        beliefs: list(formData.get("beliefs")),
        styleRules: list(formData.get("styleRules")),
        forbiddenStyles: list(formData.get("forbiddenStyles")),
        boundaries: list(formData.get("boundaries")),
        // Profile editing is added with the world settings UI. Preserve the
        // current value so this form cannot erase server-managed world identity.
        profile: config.character.profile,
      },
      policy: {
        proactiveMaxPerDay: Number(formData.get("proactiveMaxPerDay")),
        quietHours: { start: String(formData.get("quietStart")), end: String(formData.get("quietEnd")), timeZone: String(formData.get("timeZone")) },
        minimumProactiveIntervalHours: Number(formData.get("minimumProactiveIntervalHours")),
        memoryWriteThreshold: Number(formData.get("memoryWriteThreshold")),
        toolDailyLimit: Number(formData.get("toolDailyLimit")),
      },
    };
    try {
      const response = await fetch("/api/admin/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
      setStatus("Settings 已保存。新的 runtime 请求会读取此配置。 "); router.refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : "保存失败"); }
    finally { setBusy(false); }
  }
  return (
    <form action={save} className="space-y-4">
      <section className="lab-panel p-4"><div className="mb-4"><h3 className="text-sm text-zinc-100">Runtime model</h3><p className="mt-1 text-[11px] text-zinc-600">只保存公开 model id。OpenRouter BASE_URL 和 API_KEY 永远不发送到客户端。</p></div><div className="grid gap-3 sm:grid-cols-2"><label><span className="field-label">Character name</span><Input name="name" defaultValue={config.character.name} required /></label><label><span className="field-label">OpenRouter model</span><Input name="model" defaultValue={config.model} required /></label></div></section>
      <section className="lab-panel p-4"><h3 className="text-sm text-zinc-100">Character config</h3><p className="mt-1 text-[11px] text-zinc-600">每行一条规则。Identity 定义是谁，beliefs 定义长期判断偏好。</p><div className="mt-4 grid gap-4 lg:grid-cols-2"><label><span className="field-label">Core identity</span><Textarea name="identity" defaultValue={lines(config.character.identity)} className="min-h-36" /></label><label><span className="field-label">Core beliefs</span><Textarea name="beliefs" defaultValue={lines(config.character.beliefs)} className="min-h-36" /></label><label><span className="field-label">Style rules</span><Textarea name="styleRules" defaultValue={lines(config.character.styleRules)} className="min-h-40" /></label><label><span className="field-label">Forbidden styles</span><Textarea name="forbiddenStyles" defaultValue={lines(config.character.forbiddenStyles)} className="min-h-40" /></label><label className="lg:col-span-2"><span className="field-label">Boundaries</span><Textarea name="boundaries" defaultValue={lines(config.character.boundaries)} className="min-h-36" /></label></div></section>
      <section className="lab-panel p-4"><h3 className="text-sm text-zinc-100">Policy config</h3><p className="mt-1 text-[11px] text-zinc-600">主动预算和 cooldown 是硬限制；LLM 不能绕过。</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><label><span className="field-label">Proactive max / day</span><Input name="proactiveMaxPerDay" type="number" min="0" max="12" defaultValue={config.policy.proactiveMaxPerDay} /></label><label><span className="field-label">Minimum interval (hours)</span><Input name="minimumProactiveIntervalHours" type="number" min="1" max="24" step="0.5" defaultValue={config.policy.minimumProactiveIntervalHours} /></label><label><span className="field-label">Memory write threshold</span><Input name="memoryWriteThreshold" type="number" min="0" max="1" step="0.01" defaultValue={config.policy.memoryWriteThreshold} /></label><label><span className="field-label">Tool daily limit</span><Input name="toolDailyLimit" type="number" min="0" max="20" defaultValue={config.policy.toolDailyLimit} /></label><label><span className="field-label">Quiet start</span><Input name="quietStart" type="time" defaultValue={config.policy.quietHours.start} /></label><label><span className="field-label">Quiet end</span><Input name="quietEnd" type="time" defaultValue={config.policy.quietHours.end} /></label><label className="sm:col-span-2"><span className="field-label">Timezone</span><Input name="timeZone" defaultValue={config.policy.quietHours.timeZone} /></label></div></section>
      {status ? <p className="rounded border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs text-zinc-400">{status}</p> : null}
      <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save runtime settings"}</Button></div>
    </form>
  );
}
