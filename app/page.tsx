import Link from "next/link";
import { ArrowRight, BrainCircuit, Database, Radio, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const modules = [
  { name: "ID", value: "drives", icon: Radio },
  { name: "EGO", value: "direction", icon: BrainCircuit },
  { name: "MEM", value: "selective", icon: Database },
  { name: "SAFE", value: "crisis", icon: ShieldCheck },
];

export default function HomePage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#080a0c] px-5 py-8 text-zinc-200">
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:56px_56px]" />
      <div className="pointer-events-none absolute left-1/2 top-[-22rem] size-[50rem] -translate-x-1/2 rounded-full bg-cyan-400/[0.06] blur-[120px]" />
      <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between border-b border-white/[0.07] pb-5">
          <div className="flex items-center gap-3"><div className="grid size-8 place-items-center rounded-md border border-cyan-400/20 bg-cyan-400/[0.07] font-mono text-xs text-cyan-200">M</div><div><p className="text-sm font-medium tracking-[0.2em]">MIRA</p><p className="font-mono text-[8px] tracking-[0.2em] text-zinc-700">COMPANION RUNTIME</p></div></div>
          <Button asChild variant="secondary" size="sm"><Link href="/login">Admin access <ArrowRight className="size-3.5" /></Link></Button>
        </header>
        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan-400/60">Telegram-native / stateful / observable</p>
            <h1 className="mt-5 max-w-3xl text-4xl font-medium leading-[1.05] tracking-[-0.045em] text-zinc-100 sm:text-6xl">A companion with<br /><span className="text-zinc-500">an inner runtime.</span></h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-zinc-500">Mira 不只生成下一句话。Mira 让她的驱动、记忆、边界、主动行为和缓慢的人格变化都可追踪、可审查。</p>
            <div className="mt-8 flex flex-wrap gap-3"><Button asChild><Link href="/login">Open observatory <ArrowRight className="size-3.5" /></Link></Button><span className="flex items-center gap-2 px-2 font-mono text-[9px] uppercase tracking-wider text-zinc-700"><span className="size-1.5 rounded-full bg-emerald-400" /> Railway webhook ready</span></div>
          </div>
          <div className="lab-panel p-5 sm:p-7">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4"><div><p className="font-mono text-[9px] tracking-[0.18em] text-zinc-600">PSYCHE ENGINE / LIVE VECTOR</p><p className="mt-1 text-sm text-zinc-200">Mira · awake, restrained</p></div><div className="relative size-10 rounded-full border border-cyan-400/20"><span className="absolute inset-2 animate-pulse rounded-full bg-cyan-400/15" /></div></div>
            <div className="mt-6 grid grid-cols-2 gap-3">{modules.map(({ name, value, icon: Icon }) => <div key={name} className="rounded-md border border-white/[0.06] bg-black/20 p-3"><div className="flex items-center gap-2"><Icon className="size-3.5 text-cyan-400/50" /><span className="font-mono text-[9px] text-zinc-600">{name}</span></div><p className="mt-3 text-xs text-zinc-300">{value}</p></div>)}</div>
            <div className="mt-5 space-y-4"><div><div className="mb-1 flex justify-between font-mono text-[9px] text-zinc-600"><span>curiosity</span><span>0.74</span></div><div className="h-1 rounded bg-white/[0.05]"><div className="h-1 w-[74%] rounded bg-cyan-400/70" /></div></div><div><div className="mb-1 flex justify-between font-mono text-[9px] text-zinc-600"><span>boundary sensitivity</span><span>0.82</span></div><div className="h-1 rounded bg-white/[0.05]"><div className="h-1 w-[82%] rounded bg-amber-400/65" /></div></div></div>
            <p className="mt-6 border-t border-white/[0.06] pt-4 font-mono text-[9px] leading-5 text-zinc-700">good agents should know when not to act</p>
          </div>
        </section>
        <footer className="flex flex-wrap justify-between gap-2 border-t border-white/[0.06] pt-5 font-mono text-[8px] uppercase tracking-[0.15em] text-zinc-700"><span>OpenRouter · Neon · Drizzle · pgvector</span><span>World events are imagined, never claimed as reality.</span></footer>
      </div>
    </main>
  );
}
