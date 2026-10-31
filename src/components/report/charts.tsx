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
import { useChartTheme } from "@/components/site/theme";

export function ProfileRadar({ pillars }: { pillars: PillarScores }) {
  const chart = useChartTheme();
  const [showTable, setShowTable] = useState(false);
  const data = [
    { dim: "Eye contact", value: pillars.eyeContact },
    { dim: "Posture", value: pillars.posture },
    { dim: "Gestures", value: pillars.gestures },
    { dim: "Voice", value: pillars.voice },
    { dim: "Expression", value: pillars.expression },
    { dim: "Engagement", value: pillars.engagement },
  ];

  return (
    <div>
      <div className="h-[248px] w-full sm:h-[268px] 2xl:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%" aria-describedby="radar-data-table">
            <defs>
              <linearGradient id="radar-fill" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={chart.hue.violet} stopOpacity={0.55} />
                <stop offset="100%" stopColor={chart.hue.cyan} stopOpacity={0.2} />
              </linearGradient>
            </defs>
            <PolarGrid stroke={chart.polarGrid} />
            <PolarAngleAxis dataKey="dim" tick={{ fill: chart.axis, fontSize: 10 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar
              dataKey="value"
              stroke={chart.hue.violet}
              strokeWidth={2}
              fill="url(#radar-fill)"
              fillOpacity={1}
              isAnimationActive={false}
              aria-label="Six-dimension profile radar chart showing eye contact, posture, gestures, voice, expression and engagement"
              aria-describedby="radar-data-table"
            />
            <Tooltip contentStyle={chart.tooltip} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-[11px] text-brand-soft hover:text-brand"
          aria-expanded={showTable}
        >
          {showTable ? "Hide data table" : "Show data table"}
        </button>
      </div>
      <table id="radar-data-table" className={cn("mt-2 w-full text-left text-[11px]", showTable ? "" : "sr-only")}>
        <caption className="sr-only">Profile radar values by dimension</caption>
        <thead>
          <tr className="border-b border-line/60">
            <th className="py-1 pr-2 font-medium text-fog">Dimension</th>
            <th className="py-1 text-right font-medium text-fog">Score</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.dim} className="border-b border-line/40">
              <td className="py-1 pr-2 text-mist">{row.dim}</td>
              <td className="py-1 text-right text-ink">{Math.round(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const METRICS = [
  { key: "confidence", label: "Confidence", hue: "violet" },
  { key: "engagement", label: "Engagement", hue: "cyan" },
  { key: "leadership", label: "Leadership", hue: "emerald" },
  { key: "eyeContact", label: "Eye contact", hue: "amber" },
  { key: "voice", label: "Voice", hue: "rose" },
  { key: "posture", label: "Posture", hue: "blue" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

export function TimelineChart({ timeline }: { timeline: TimelinePoint[] }) {
  const chart = useChartTheme();
  const [active, setActive] = useState<MetricKey[]>(["confidence", "engagement", "leadership"]);
  const [showTable, setShowTable] = useState(false);

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
                on ? "border-line-bright bg-raised text-ink" : "border-line/70 text-fog hover:text-mist",
              )}
            >
              <span className="size-1.5 rounded-full" style={{ background: on ? chart.hue[m.hue] : chart.idle }} />
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="h-[228px] w-full sm:h-[248px] 2xl:h-[290px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -18 }} aria-describedby="timeline-data-table">
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(v: number) => `${Math.floor(v / 60)}m`}
              tick={{ fill: chart.axis, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={48}
            />
            <YAxis
              domain={[30, 100]}
              ticks={[40, 60, 80, 100]}
              tick={{ fill: chart.axis, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={chart.tooltip}
              labelFormatter={(v) =>
                `${Math.floor(Number(v) / 60)}m ${Number(v) % 60}s`
              }
              cursor={{ stroke: chart.cursor }}
            />
            {METRICS.filter((m) => active.includes(m.key)).map((m) => (
              <Line
                key={m.key}
                type="monotone"
                dataKey={m.key}
                name={m.label}
                stroke={chart.hue[m.hue]}
                strokeWidth={1.8}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                isAnimationActive={false}
                aria-label={`Timeline line for ${m.label}`}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-[11px] text-brand-soft hover:text-brand"
          aria-expanded={showTable}
        >
          {showTable ? "Hide data table" : "Show data table"}
        </button>
      </div>
      <div className={cn("mt-2 overflow-x-auto", showTable ? "" : "sr-only")}>
        <table className="w-full min-w-[420px] text-left text-[11px]">
          <caption className="sr-only">Session timeline values by time for selected metrics</caption>
          <thead>
            <tr className="border-b border-line/60">
              <th className="py-1 pr-2 font-medium text-fog">Time (s)</th>
              {METRICS.filter((m) => active.includes(m.key)).map((m) => (
                <th key={m.key} className="py-1 pr-2 text-right font-medium text-fog">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 50).map((row, idx) => (
              <tr key={idx} className="border-b border-line/40">
                <td className="py-1 pr-2 text-mist">{Math.round(row.t)}</td>
                {METRICS.filter((m) => active.includes(m.key)).map((m) => (
                  <td key={m.key} className="py-1 pr-2 text-right text-ink">
                    {typeof row[m.key] === "number" ? Math.round(row[m.key] as number) : "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
