"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Drives } from "@/core/types";
import { formatDate, labelForKey } from "@/components/dashboard/format";

const palette = ["#67e8f9", "#c084fc", "#f472b6", "#71717a", "#fbbf24", "#34d399", "#fb7185"];

function normalize(history: Array<Record<string, string | number>>) {
  if (!history[0]?.targetPath) return history;
  return history.map((point) => {
    const metric = String(point.targetPath).split(".").at(-1) ?? "value";
    return { date: formatDate(String(point.createdAt), true), [metric]: Number(point.after) };
  });
}

export function DriveChart({ history, metrics = ["curiosity", "aestheticUrge", "noveltySeeking", "boredom"] }: { history: Array<Record<string, string | number>>; metrics?: Array<keyof Drives> }) {
  const data = normalize(history);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3">
        {metrics.map((metric, index) => (
          <span key={metric} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <span className="size-1.5 rounded-full" style={{ background: palette[index] }} /> {labelForKey(metric)}
          </span>
        ))}
      </div>
      <div className="h-64 w-full" aria-label="最近七天驱动变化">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -24, right: 8, top: 6, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 1]} tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#111418", border: "1px solid rgba(255,255,255,.1)", borderRadius: 6, fontSize: 11 }}
              formatter={(value, name) => [Number(value).toFixed(2), labelForKey(String(name))]}
            />
            {metrics.map((metric, index) => (
              <Line key={metric} type="monotone" dataKey={metric} connectNulls stroke={palette[index]} dot={false} strokeWidth={1.5} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

