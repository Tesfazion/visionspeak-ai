"use client";

import {
  Activity,
  CircleCheck,
  Crown,
  Eye,
  Gauge,
  Hand,
  Info,
  MessageSquare,
  Mic,
  Quote,
  Smile,
  Sparkles,
  Waves,
} from "@/components/icons";
import { EMOTION_META } from "@/lib/analysis/emotion";
import { RUBRICS } from "@/lib/analysis/scoring";
import type { LiveMetrics, Nudge, SessionMode } from "@/lib/types";
import { Bar, Pill, ScoreRing, cn, toneFor } from "@/components/ui";

const PILLARS = [
  { key: "eyeContact", label: "Eye contact", color: "#34d399" },
  { key: "posture", label: "Posture", color: "#a78bfa" },
  { key: "gestures", label: "Gestures", color: "#22d3ee" },
  { key: "voice", label: "Voice", color: "#fbbf24" },
  { key: "expression", label: "Expression", color: "#fb7185" },
] as const;

export function LiveScorePanel({ metrics, phase }: { metrics: LiveMetrics | null; phase: string }) {
  const confidence = metrics?.confidence ?? 0;
  const composites = [
    { label: "Engagement", value: metrics?.engagement ?? 0, icon: Waves },
    { label: "Leadership", value: metrics?.leadership ?? 0, icon: Crown },
    { label: "Communication", value: metrics?.communication ?? 0, icon: MessageSquare },
  ];

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-medium text-ink">Live score</h2>
        <Pill tone={phase === "live" ? "good" : phase === "paused" ? "warn" : "neutral"} className="!py-0.5">
          {phase === "live" ? "analysing" : phase === "paused" ? "paused" : "standby"}
        </Pill>
      </div>

      <div className="mt-4 flex items-center gap-5">
        <ScoreRing value={confidence} size={124} stroke={9} label="confidence" />
        <div className="flex-1 space-y-3">
          {composites.map((c) => (
            <div key={c.label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] text-fog">
                  <c.icon className="size-3" /> {c.label}
                </span>
                <span className="metric-num text-[11.5px] text-mist">{c.value}</span>
              </div>
              <Bar value={c.value} height={4} />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 hairline" />

      <div className="mt-4 space-y-3">
        {PILLARS.map((p) => {
          const value = metrics ? metrics[p.key] : 0;
          return (
            <div key={p.key}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11.5px] text-mist">{p.label}</span>
                <span className="metric-num text-[11.5px]" style={{ color: toneFor(value).hex }}>
                  {value}
                </span>
              </div>
              <Bar value={value} tone={p.color} height={4} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TILES = [
  {
    key: "gaze",
    label: "Gaze",
    icon: Eye,
    value: (m: LiveMetrics | null) => (m ? m.gazeLabel : "—"),
    sub: (m: LiveMetrics | null) => (m ? `${m.yaw}° / ${m.pitch}°` : "yaw / pitch"),
  },
  {
    key: "expression",
    label: "Expression",
    icon: Smile,
    value: (m: LiveMetrics | null) => (m ? EMOTION_META[m.emotion].label : "—"),
    sub: (m: LiveMetrics | null) => (m ? `${m.expression}/100` : "—"),
  },
  {
    key: "blink",
    label: "Blink rate",
    icon: Activity,
    value: (m: LiveMetrics | null) => (m ? `${m.blinkRate}` : "—"),
    sub: () => "per minute · 12–25 ideal",
  },
  {
    key: "pace",
    label: "Pace",
    icon: Gauge,
    value: (m: LiveMetrics | null) => (m && m.wpm ? `${m.wpm}` : "—"),
    sub: () => "words per minute",
  },
  {
    key: "hands",
    label: "Hands in frame",
    icon: Hand,
    value: (m: LiveMetrics | null) => (m ? `${m.hands}` : "—"),
    sub: (m: LiveMetrics | null) => (m ? `gesture ${m.gestures}` : "—"),
  },
  {
    key: "fillers",
    label: "Fillers",
    icon: Quote,
    value: (m: LiveMetrics | null) => (m ? `${m.fillerCount}` : "—"),
    sub: (m: LiveMetrics | null) => (m ? `${m.wordCount} words tracked` : "transcript"),
  },
] as const;

export function SignalGrid({ metrics }: { metrics: LiveMetrics | null }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-medium text-ink">Signals</h2>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-fog">live</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {TILES.map((t) => (
          <div key={t.key} className="rounded-xl border border-line/80 bg-white/[0.015] px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.14em] text-fog">
              <t.icon className="size-3" />
              {t.label}
            </div>
            <div className="metric-num mt-1 text-[15px] leading-none text-ink">{t.value(metrics)}</div>
            <div className="mt-1 truncate text-[10px] text-fog/70">{t.sub(metrics)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const NUDGE_META: Record<
  Nudge["kind"],
  { icon: typeof Eye; color: string; bg: string }
> = {
  eyes: { icon: Eye, color: "text-mint", bg: "bg-mint/10 border-mint/25" },
  posture: { icon: Activity, color: "text-brand-soft", bg: "bg-brand/10 border-brand/25" },
  hands: { icon: Hand, color: "text-aqua", bg: "bg-aqua/10 border-aqua/25" },
  voice: { icon: Mic, color: "text-amber", bg: "bg-amber/10 border-amber/25" },
  pace: { icon: Gauge, color: "text-amber", bg: "bg-amber/10 border-amber/25" },
  fillers: { icon: Quote, color: "text-amber", bg: "bg-amber/10 border-amber/25" },
  expression: { icon: Smile, color: "text-rose", bg: "bg-rose/10 border-rose/25" },
  praise: { icon: Sparkles, color: "text-mint", bg: "bg-mint/10 border-mint/25" },
};

export function CoachFeed({ nudges }: { nudges: Nudge[] }) {
  return (
    <div className="panel flex flex-col p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <Sparkles className="size-3.5 text-brand-soft" /> Live coaching
        </h2>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-fog">
          {nudges.length ? `${nudges.length} notes` : "waiting"}
        </span>
      </div>

      <div
        className="mt-3 max-h-[248px] space-y-2 overflow-y-auto overscroll-contain-y pr-1 2xl:max-h-[320px]"
        // Coaching notes are discrete events, so announcing them is useful
        // rather than noisy (unlike the 5 Hz score readout).
        role="status"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Live coaching notes"
      >
        {nudges.length === 0 && (
          <div className="rounded-xl border border-dashed border-line px-3 py-6 text-center">
            <Info className="mx-auto size-4 text-fog/60" />
            <p className="mt-2 text-[11.5px] leading-relaxed text-fog/80">
              Coaching notes appear the moment a habit needs attention — and when something is working.
            </p>
          </div>
        )}
        {nudges.map((n, i) => {
          const meta = NUDGE_META[n.kind];
          return (
            <div
              key={n.id}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border px-3 py-2.5",
                meta.bg,
                i === 0 && "animate-rise",
              )}
            >
              <meta.icon className={cn("mt-0.5 size-3.5 shrink-0", meta.color)} />
              <p className="text-[11.5px] leading-snug text-mist">{n.message}</p>
              <span className="ml-auto shrink-0 font-mono text-[9px] text-fog/60">
                {n.severity === "good" ? "✓" : n.severity === "warn" ? "!" : "·"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-1.5 border-t border-line/70 pt-3 text-[10px] text-fog/70">
        <CircleCheck className="size-3 text-mint/70" />
        Nudges are rate-limited so you can actually focus on speaking.
      </div>
    </div>
  );
}

export function SessionMeta({
  speaker,
  onSpeaker,
  title,
  onTitle,
  mode,
  onMode,
  disabled,
}: {
  speaker: string;
  onSpeaker: (v: string) => void;
  title: string;
  onTitle: (v: string) => void;
  mode: SessionMode;
  onMode: (v: SessionMode) => void;
  disabled: boolean;
}) {
  const modes: { id: SessionMode; label: string }[] = [
    { id: "practice", label: "Practice" },
    { id: "presentation", label: "Presentation" },
    { id: "interview", label: "Interview" },
  ];
  const rubric = RUBRICS[mode] ?? RUBRICS.practice;
  return (
    <div className="panel flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <input
            value={speaker}
            onChange={(e) => onSpeaker(e.target.value.slice(0, 40))}
            placeholder="Your name"
            aria-label="Speaker name"
            disabled={disabled}
            className="h-8 w-32 rounded-lg border border-line bg-white/[0.02] px-2.5 text-[12.5px] text-ink placeholder:text-fog/60 focus:border-brand/50 focus:outline-none disabled:opacity-50"
          />
          <input
            value={title}
            onChange={(e) => onTitle(e.target.value.slice(0, 80))}
            placeholder="Session title"
            aria-label="Session title"
            disabled={disabled}
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-white/[0.02] px-2.5 text-[12.5px] text-ink placeholder:text-fog/60 focus:border-brand/50 focus:outline-none disabled:opacity-50"
          />
        </div>
        <div className="flex items-center rounded-lg border border-line bg-white/[0.02] p-0.5">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onMode(m.id)}
              disabled={disabled}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11.5px] transition-colors disabled:opacity-50",
                mode === m.id ? "bg-brand/20 text-brand-soft" : "text-fog hover:text-ink",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10.5px] leading-relaxed text-fog">
        <span className="text-mist">{`${rubric.label} rubric`}</span> — {rubric.summary}
      </p>
    </div>
  );
}

export const NUDGE_KINDS = Object.keys(NUDGE_META) as Nudge["kind"][];
