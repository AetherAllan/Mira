"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Mood } from "@/core/types";
import { formatDate, labelForKey } from "@/components/dashboard/format";

const colors: Record<string, string> = {
  valence: "#67e8f9",
  energy: "#a78bfa",
  curiosity: "#34d399",
  concern: "#fbbf24",
  playfulness: "#f472b6",
  boredom: "#71717a",
};

function normalize(history: Array<Record<string, string | number>>) {
  if (!history[0]?.targetPath) return history;
  return history.map((point) => {
    const metric = String(point.targetPath).split(".").at(-1) ?? "value";
    return { date: formatDate(String(point.createdAt), true), [metric]: Number(point.after) };
  });
}

export function MoodChart({ history, metrics = ["valence", "energy", "curiosity"] }: { history: Array<Record<string, string | number>>; metrics?: Array<keyof Mood> }) {
  const data = normalize(history);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3">
        {metrics.map((metric) => (
          <span key={metric} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <span className="size-1.5 rounded-full" style={{ background: colors[metric] }} /> {labelForKey(metric)}
          </span>
        ))}
      </div>
      <div className="h-64 w-full" aria-label="最近七天情绪变化">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -24, right: 8, top: 6, bottom: 0 }}>
            <defs>
              {metrics.map((metric) => (
                <linearGradient id={`mood-${metric}`} key={metric} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors[metric]} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={colors[metric]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 1]} tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#111418", border: "1px solid rgba(255,255,255,.1)", borderRadius: 6, fontSize: 11 }}
              formatter={(value, name) => [Number(value).toFixed(2), labelForKey(String(name))]}
            />
            {metrics.map((metric) => (
              <Area
                key={metric}
                type="monotone"
                dataKey={metric}
                connectNulls
                stroke={colors[metric]}
                fill={`url(#mood-${metric})`}
                strokeWidth={1.5}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

