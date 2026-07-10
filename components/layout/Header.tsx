"use client";

import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";

const labels: Record<string, { title: string; eyebrow: string }> = {
  "/dashboard": { title: "Runtime Overview", eyebrow: "Mira / OBSERVATORY" },
  "/dashboard/conversations": { title: "Conversation Trace", eyebrow: "TELEGRAM / MESSAGE BUS" },
  "/dashboard/state": { title: "State Vector", eyebrow: "GROWTH / CHANGE LOG" },
  "/dashboard/psyche": { title: "Psyche Engine", eyebrow: "ID / EGO / ACTOR" },
  "/dashboard/memory": { title: "Selective Memory", eyebrow: "RECALL / COOLDOWN" },
  "/dashboard/world": { title: "Inner World", eyebrow: "SEEDS / MOTIFS / SCENES" },
  "/dashboard/events": { title: "Event Stream", eyebrow: "RUNTIME / AUDIT TRAIL" },
  "/dashboard/proactive": { title: "Proactive Control", eyebrow: "AGENCY / RESTRAINT" },
  "/dashboard/tools": { title: "Tool Registry", eyebrow: "ALLOWLIST / EXECUTION" },
  "/dashboard/audit": { title: "Causal Audit", eyebrow: "WHY / WHAT CHANGED" },
  "/dashboard/settings": { title: "Runtime Policy", eyebrow: "CHARACTER / GUARDRAILS" },
};

export function Header({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const label = labels[pathname] ?? labels["/dashboard"];

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-white/[0.07] bg-[#0b0d10]/85 px-4 backdrop-blur-xl sm:px-6">
      <button className="mr-3 text-zinc-500 hover:text-zinc-100 lg:hidden" onClick={onMenu} aria-label="打开导航">
        <Menu className="size-5" />
      </button>
      <div>
        <p className="font-mono text-[9px] tracking-[0.2em] text-cyan-400/60">{label.eyebrow}</p>
        <h1 className="mt-0.5 text-sm font-medium text-zinc-100 sm:text-base">{label.title}</h1>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden h-8 items-center gap-2 rounded-md border border-white/[0.07] bg-black/20 px-3 text-[11px] text-zinc-600 md:flex">
          <Search className="size-3.5" />
          <span>⌘ K</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-400/10 bg-emerald-400/[0.06] px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-emerald-300/80">
          <span className="size-1.5 rounded-full bg-emerald-400" /> live
        </div>
      </div>
    </header>
  );
}

