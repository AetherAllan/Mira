import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { labelForKey, percent } from "@/components/dashboard/format";

export function PageIntro({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <h2 className="text-xl font-medium tracking-tight text-zinc-100">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
  className,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ValueBar({
  label,
  value,
  description,
  tone = "cyan",
}: {
  label: string;
  value: number;
  description?: string;
  tone?: "cyan" | "violet" | "amber" | "emerald" | "rose";
}) {
  const colors = {
    cyan: "bg-cyan-400",
    violet: "bg-violet-400",
    amber: "bg-amber-400",
    emerald: "bg-emerald-400",
    rose: "bg-rose-400",
  };
  const width = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs text-zinc-300">{labelForKey(label)}</span>
          {description ? <span className="ml-2 text-[10px] text-zinc-600">{description}</span> : null}
        </div>
        <span className="font-mono text-[11px] text-zinc-500">{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]" title={percent(value)}>
        <div className={cn("h-full rounded-full opacity-80", colors[tone])} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function MetricGroup({
  values,
  descriptions = {},
  tone = "cyan",
}: {
  values: object;
  descriptions?: Record<string, string>;
  tone?: "cyan" | "violet" | "amber" | "emerald" | "rose";
}) {
  return (
    <div className="space-y-3.5">
      {Object.entries(values).map(([key, value]) => (
        <ValueBar key={key} label={key} value={Number(value)} description={descriptions[key]} tone={tone} />
      ))}
    </div>
  );
}

export function EmptyState({ children = "还没有可展示的运行记录。" }: { children?: ReactNode }) {
  return (
    <div className="grid min-h-28 place-items-center rounded-md border border-dashed border-white/[0.08] bg-black/10 p-6 text-center text-xs text-zinc-600">
      {children}
    </div>
  );
}

export function KeyValue({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.05] py-2.5 last:border-0">
      <div>
        <p className="text-xs text-zinc-400">{label}</p>
        {note ? <p className="mt-0.5 text-[10px] text-zinc-600">{note}</p> : null}
      </div>
      <div className="text-right font-mono text-xs text-zinc-200">{value}</div>
    </div>
  );
}
