"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipStyle = {
  background: "rgba(12,12,20,0.95)",
  border: "1px solid #24243a",
  borderRadius: 12,
  padding: "8px 10px",
  fontSize: 11,
  color: "#f4f4f9",
  boxShadow: "0 20px 40px -20px rgba(0,0,0,0.9)",
} as const;

export interface SessionTrendPoint {
  label: string;
  overall: number;
  confidence: number;
  leadership: number;
}

export function SessionTrend({ data }: { data: SessionTrendPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="grid h-[214px] place-items-center rounded-xl border border-dashed border-line px-4 text-center text-[11.5px] text-fog sm:h-[230px]">
        Run one more session to unlock trend lines.
      </div>
    );
  }

  return (
    <div className="h-[214px] w-full sm:h-[230px] 2xl:h-[270px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#7a7a92", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={20}
          />
          <YAxis
            domain={[30, 100]}
            ticks={[40, 60, 80, 100]}
            tick={{ fill: "#7a7a92", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={42}
          />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(255,255,255,0.16)" }} />
          <Line
            type="monotone"
            dataKey="overall"
            name="Overall"
            stroke="#a78bfa"
            strokeWidth={2.2}
            dot={{ r: 2.5, strokeWidth: 0, fill: "#a78bfa" }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="confidence"
            name="Confidence"
            stroke="#22d3ee"
            strokeWidth={1.6}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="leadership"
            name="Leadership"
            stroke="#34d399"
            strokeWidth={1.6}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
