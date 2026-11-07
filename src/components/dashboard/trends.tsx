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
import { useChartTheme } from "@/components/site/theme";

export interface SessionTrendPoint {
  label: string;
  overall: number;
  confidence: number;
  leadership: number;
}

export function SessionTrend({ data, voiceOnly = false }: { data: SessionTrendPoint[]; voiceOnly?: boolean }) {
  const chart = useChartTheme();

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
          <CartesianGrid stroke={chart.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: chart.axis, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={20}
          />
          <YAxis
            domain={[30, 100]}
            ticks={[40, 60, 80, 100]}
            tick={{ fill: chart.axis, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={42}
          />
          <Tooltip contentStyle={chart.tooltip} cursor={{ stroke: chart.cursor }} />
          <Line
            type="monotone"
            dataKey="overall"
            name={voiceOnly ? "Voice" : "Overall"}
            stroke={chart.hue.violet}
            strokeWidth={2.2}
            dot={{ r: 2.5, strokeWidth: 0, fill: chart.hue.violet }}
            isAnimationActive={false}
          />
          {!voiceOnly && (
            <Line
              type="monotone"
              dataKey="confidence"
              name="Confidence"
              stroke={chart.hue.cyan}
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
            />
          )}
          {!voiceOnly && (
            <Line
              type="monotone"
              dataKey="leadership"
              name="Leadership"
              stroke={chart.hue.emerald}
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
