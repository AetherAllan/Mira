import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  trend?: number;
  tone?: "cyan" | "violet" | "amber" | "emerald";
}

const tones = {
  cyan: "bg-cyan-400/10 text-cyan-300",
  violet: "bg-violet-400/10 text-violet-300",
  amber: "bg-amber-400/10 text-amber-300",
  emerald: "bg-emerald-400/10 text-emerald-300",
};

export function StatCard({ label, value, description, icon: Icon, trend, tone = "cyan" }: StatCardProps) {
  const TrendIcon = trend === undefined || trend === 0 ? Minus : trend > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
          <p className="mt-2 font-mono text-2xl font-medium tracking-tight text-zinc-100">{value}</p>
        </div>
        <div className={`grid size-8 place-items-center rounded-md ${tones[tone]}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 border-t border-white/[0.05] pt-3">
        {trend !== undefined ? (
          <span className={trend > 0 ? "text-emerald-400" : trend < 0 ? "text-rose-400" : "text-zinc-600"}>
            <TrendIcon className="size-3" />
          </span>
        ) : null}
        <p className="text-[11px] leading-4 text-zinc-600">{description}</p>
      </div>
    </Card>
  );
}
