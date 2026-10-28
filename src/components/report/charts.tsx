"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PillarScores, TimelinePoint } from "@/lib/types";
import { cn } from "@/components/ui";

const tooltipStyle = {
  background: "rgba(12,12,20,0.95)",
  border: "1px solid #24243a",
  borderRadius: 12,
  padding: "8px 10px",
  fontSize: 11,
  color: "#f4f4f9",
  boxShadow: "0 20px 40px -20px rgba(0,0,0,0.9)",
} as const;

export function ProfileRadar({ pillars }: { pillars: PillarScores }) {
  const data = [
    { dim: "Eye contact", value: pillars.eyeContact },
    { dim: "Posture", value: pillars.posture },
    { dim: "Gestures", value: pillars.gestures },
    { dim: "Voice", value: pillars.voice },
    { dim: "Expression", value: pillars.expression },
    { dim: "Engagement", value: pillars.engagement },
  ];

  return (
    <div className="h-[248px] w-full sm:h-[268px] 2xl:h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <defs>
            <linearGradient id="radar-fill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <PolarGrid stroke="rgba(255,255,255,0.09)" />
          <PolarAngleAxis
            dataKey="dim"
            tick={{ fill: "#8b8ba4", fontSize: 10 }}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            dataKey="value"
            stroke="#a78bfa"
            strokeWidth={2}
            fill="url(#radar-fill)"
            fillOpacity={1}
            isAnimationActive={false}
          />
          <Tooltip contentStyle={tooltipStyle} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

const METRICS = [
  { key: "confidence", label: "Confidence", color: "#a78bfa" },
  { key: "engagement", label: "Engagement", color: "#22d3ee" },
  { key: "leadership", label: "Leadership", color: "#34d399" },
  { key: "eyeContact", label: "Eye contact", color: "#fbbf24" },
  { key: "voice", label: "Voice", color: "#fb7185" },
  { key: "posture", label: "Posture", color: "#60a5fa" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

export function TimelineChart({ timeline }: { timeline: TimelinePoint[] }) {
  const [active, setActive] = useState<MetricKey[]>(["confidence", "engagement", "leadership"]);

  const data = useMemo(() => {
    if (timeline.length <= 160) return timeline;
    const step = Math.ceil(timeline.length / 160);
    return timeline.filter((_, i) => i % step === 0);
  }, [timeline]);

  const toggle = (key: MetricKey) =>
    setActive((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {METRICS.map((m) => {
          const on = active.includes(m.key);
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => toggle(m.key)}
              aria-pressed={on}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] transition-colors",
                on ? "border-line-bright bg-white/[0.06] text-ink" : "border-line/70 text-fog hover:text-mist",
              )}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ background: on ? m.color : "#3f3f52" }}
              />
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="h-[228px] w-full sm:h-[248px] 2xl:h-[290px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(v: number) => `${Math.floor(v / 60)}m`}
              tick={{ fill: "#7a7a92", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={48}
            />
            <YAxis
              domain={[30, 100]}
              ticks={[40, 60, 80, 100]}
              tick={{ fill: "#7a7a92", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(v) =>
                `${Math.floor(Number(v) / 60)}m ${String(Math.round(Number(v)) % 60).padStart(2, "0")}s`
              }
              cursor={{ stroke: "rgba(255,255,255,0.16)" }}
            />
            {METRICS.filter((m) => active.includes(m.key)).map((m) => (
              <Line
                key={m.key}
                type="monotone"
                dataKey={m.key}
                name={m.label}
                stroke={m.color}
                strokeWidth={1.8}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
