"use client";

import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Traits } from "@/core/types";
import { labelForKey } from "@/components/dashboard/format";

export function TraitRadar({ traits }: { traits: Traits }) {
  const data = Object.entries(traits).map(([key, value]) => ({
    key: labelForKey(key).split(" ")[0],
    value,
  }));
  return (
    <div className="h-72 w-full" aria-label="人格特质雷达图">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="67%">
          <PolarGrid stroke="rgba(255,255,255,.08)" />
          <PolarAngleAxis dataKey="key" tick={{ fill: "#71717a", fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: "#111418", border: "1px solid rgba(255,255,255,.1)", borderRadius: 6, fontSize: 11 }}
            formatter={(value) => [Number(value).toFixed(2), "value"]}
          />
          <Radar dataKey="value" stroke="#67e8f9" fill="#22d3ee" fillOpacity={0.12} strokeWidth={1.5} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

