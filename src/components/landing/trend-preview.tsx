"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TrendPoint {
  t: number;
  confidence: number;
  engagement: number;
  leadership: number;
}

const tooltipStyle = {
  background: "rgba(12,12,20,0.94)",
  border: "1px solid #24243a",
  borderRadius: 12,
  padding: "8px 10px",
  fontSize: 11,
  color: "#f4f4f9",
  boxShadow: "0 20px 40px -20px rgba(0,0,0,0.9)",
} as const;

export function TrendPreview({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-[200px] w-full sm:h-[220px] 2xl:h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="conf-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#7c5cff" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="eng-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(v: number) => `${Math.floor(v / 60)}m`}
            tick={{ fill: "#7a7a92", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            domain={[40, 100]}
            ticks={[50, 70, 90]}
            tick={{ fill: "#7a7a92", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={26}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(v) => `${Math.floor(Number(v) / 60)}m ${String(Number(v) % 60).padStart(2, "0")}s`}
            cursor={{ stroke: "rgba(255,255,255,0.15)" }}
          />
          <Area
            type="monotone"
            dataKey="engagement"
            name="Engagement"
            stroke="#22d3ee"
            strokeWidth={1.6}
            fill="url(#eng-fill)"
            dot={false}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="confidence"
            name="Confidence"
            stroke="#a78bfa"
            strokeWidth={2}
            fill="url(#conf-fill)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
