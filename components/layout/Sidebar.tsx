"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BrainCircuit,
  Database,
  Gauge,
  History,
  MessagesSquare,
  Orbit,
  Radio,
  Scale,
  Settings,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: Gauge },
  { href: "/dashboard/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/dashboard/state", label: "State", icon: Activity },
  { href: "/dashboard/psyche", label: "Psyche", icon: BrainCircuit },
  { href: "/dashboard/memory", label: "Memory", icon: Database },
  { href: "/dashboard/world", label: "World", icon: Orbit },
  { href: "/dashboard/events", label: "Events", icon: Radio },
  { href: "/dashboard/proactive", label: "Proactive", icon: Sparkles },
  { href: "/dashboard/tools", label: "Tools", icon: Wrench },
  { href: "/dashboard/critic", label: "Critic", icon: Scale },
  { href: "/dashboard/audit", label: "Audit", icon: History },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  mobile?: boolean;
  onClose?: () => void;
}

export function Sidebar({ mobile = false, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-dvh w-64 shrink-0 flex-col border-r border-white/[0.07] bg-[#090b0e]/95",
        mobile ? "fixed inset-y-0 left-0 z-50 shadow-2xl shadow-black" : "sticky top-0 hidden lg:flex",
      )}
    >
      <div className="flex h-16 items-center gap-3 border-b border-white/[0.07] px-5">
        <div className="relative grid size-9 place-items-center rounded-lg border border-cyan-400/25 bg-cyan-400/10">
          <span className="absolute inset-1 rounded border border-cyan-300/10" />
          <span className="font-mono text-sm font-semibold text-cyan-200">M</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium tracking-[0.18em] text-zinc-100">MIRA</p>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">psyche runtime</p>
        </div>
        {mobile ? (
          <button className="text-zinc-500 hover:text-zinc-100" onClick={onClose} aria-label="关闭导航">
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Dashboard navigation">
        <p className="px-3 pb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-700">observability</p>
        <div className="space-y-0.5">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  "group flex h-9 items-center gap-3 rounded-md border px-3 text-sm transition-colors",
                  active
                    ? "border-cyan-400/15 bg-cyan-400/[0.09] text-cyan-100"
                    : "border-transparent text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-200",
                )}
              >
                <Icon className={cn("size-4", active ? "text-cyan-300" : "text-zinc-600 group-hover:text-zinc-400")} />
                <span>{label}</span>
                {active ? <span className="ml-auto size-1 rounded-full bg-cyan-300 shadow-[0_0_8px_#67e8f9]" /> : null}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-white/[0.07] p-4">
        <div className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2.5">
          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            Mira runtime
            <span className="ml-auto font-mono text-[9px] text-zinc-600">v0.1</span>
          </div>
          <p className="mt-1 font-mono text-[9px] text-zinc-700">WEBHOOK · SERVERLESS · NEON</p>
        </div>
      </div>
    </aside>
  );
}

