import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/dashboard/LoginForm";

export const metadata = { title: "Admin Login" };

export default function LoginPage() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#080a0c] p-5">
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="relative w-full max-w-sm">
        <Link href="/" className="mb-5 inline-flex items-center gap-2 text-xs text-zinc-600 hover:text-zinc-300"><ArrowLeft className="size-3.5" /> Back to Mira</Link>
        <section className="lab-panel p-6 sm:p-7">
          <div className="grid size-10 place-items-center rounded-md border border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-300"><ShieldCheck className="size-5" /></div>
          <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-400/60">Restricted observatory</p>
          <h1 className="mt-2 text-xl font-medium text-zinc-100">Inspect Mira&apos;s runtime</h1>
          <p className="mt-2 text-xs leading-5 text-zinc-600">登录 cookie 仅由服务端设置为 httpOnly。服务端配置的 ADMIN_PASSWORD、API key 与数据库 URL 不会序列化到客户端；输入只用于本次校验。</p>
          <LoginForm />
        </section>
        <p className="mt-4 text-center font-mono text-[8px] uppercase tracking-[0.15em] text-zinc-800">Mira / private admin surface</p>
      </div>
    </main>
  );
}
