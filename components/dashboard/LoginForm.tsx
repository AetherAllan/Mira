"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function login(formData: FormData) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: formData.get("password") }) });
      if (!response.ok) throw new Error(response.status === 401 ? "密码不正确。" : "登录服务暂时不可用。");
      router.replace("/dashboard"); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "登录失败。"); }
    finally { setBusy(false); }
  }
  return (
    <form action={login} className="mt-7 space-y-3">
      <label><span className="field-label">Admin password</span><div className="relative"><KeyRound className="pointer-events-none absolute left-3 top-2.5 size-4 text-zinc-600" /><Input name="password" type="password" autoComplete="current-password" required autoFocus placeholder="••••••••••••" className="pl-10" /></div></label>
      {error ? <p role="alert" className="rounded border border-rose-400/15 bg-rose-400/[0.05] px-3 py-2 text-xs text-rose-200/80">{error}</p> : null}
      <Button className="w-full" type="submit" disabled={busy}>{busy ? "Verifying…" : "Enter observatory"}</Button>
    </form>
  );
}
