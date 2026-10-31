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
import { useChartTheme } from "@/components/site/theme";

export interface TrendPoint {
  t: number;
  confidence: number;
  engagement: number;
  leadership: number;
}

export function TrendPreview({ data }: { data: TrendPoint[] }) {
  const chart = useChartTheme();

  return (
    <div className="h-[200px] w-full sm:h-[220px] 2xl:h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="conf-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chart.hue.violet} stopOpacity={0.45} />
              <stop offset="100%" stopColor={chart.hue.violet} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="eng-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chart.hue.cyan} stopOpacity={0.3} />
              <stop offset="100%" stopColor={chart.hue.cyan} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={chart.grid} vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(v: number) => `${Math.floor(v / 60)}m`}
            tick={{ fill: chart.axis, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            domain={[40, 100]}
            ticks={[50, 70, 90]}
            tick={{ fill: chart.axis, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={26}
          />
          <Tooltip
            contentStyle={chart.tooltip}
            labelFormatter={(v) => `${Math.floor(Number(v) / 60)}m ${String(Number(v) % 60).padStart(2, "0")}s`}
            cursor={{ stroke: chart.cursor }}
          />
          <Area
            type="monotone"
            dataKey="engagement"
            name="Engagement"
            stroke={chart.hue.cyan}
            strokeWidth={1.6}
            fill="url(#eng-fill)"
            dot={false}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="confidence"
            name="Confidence"
            stroke={chart.hue.violet}
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
