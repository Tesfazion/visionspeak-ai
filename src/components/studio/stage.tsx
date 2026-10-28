"use client";

import type { RefObject } from "react";
import {
  Camera,
  CameraOff,
  Hand,
  Pause,
  Play,
  RotateCcw,
  ScanFace,
  Shield,
  Square,
  Timer,
  TriangleAlert,
  Video,
} from "lucide-react";
import { formatClock, formatDuration } from "@/lib/math";
import type { FrameSample, LiveMetrics } from "@/lib/types";
import { Bar, Button, Pill, cn, toneFor } from "@/components/ui";
import type { Phase } from "@/hooks/useVisionSession";

/* ------------------------------------------------------------------ *
 * Stage
 * ------------------------------------------------------------------ */

export function Stage({
  videoRef,
  canvasRef,
  phase,
  progress,
  error,
  metrics,
  samples,
  onStart,
  onReset,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  phase: Phase;
  progress: string;
  error: string | null;
  metrics: LiveMetrics | null;
  samples: FrameSample[];
  onStart: () => void;
  onReset: () => void;
}) {
  const live = phase === "live" || phase === "paused";
  const elapsed = samples.length ? samples[samples.length - 1].t : metrics?.elapsed ?? 0;

  return (
    <div className="panel overflow-hidden p-2.5">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line/80 bg-[radial-gradient(120%_100%_at_50%_0%,#141024_0%,#0a0912_60%,#07060c_100%)] sm:aspect-video">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
          playsInline
          muted
          autoPlay
          aria-label="Live camera preview"
        />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

        {/* vignette + grain */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_50%,transparent_45%,rgba(0,0,0,0.55)_100%)]" />
        <div className="pointer-events-none absolute inset-0 noise-overlay opacity-[0.04]" />

        {/* corner brackets */}
        {[
          "left-3 top-3 border-l border-t rounded-tl-md",
          "right-3 top-3 border-r border-t rounded-tr-md",
          "left-3 bottom-3 border-b border-l rounded-bl-md",
          "right-3 bottom-3 border-b border-r rounded-br-md",
        ].map((cls) => (
          <span key={cls} className={cn("pointer-events-none absolute size-7 border-white/20", cls)} />
        ))}

        {live && (
          <>
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 backdrop-blur">
              <span className="relative flex size-1.5">
                <span
                  className={cn(
                    "absolute inset-0 rounded-full",
                    phase === "paused" ? "bg-amber" : "animate-pulse-ring bg-rose",
                  )}
                />
                <span className={cn("relative size-1.5 rounded-full", phase === "paused" ? "bg-amber" : "bg-rose")} />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/80">
                {phase === "paused" ? "paused" : "live"}
              </span>
              <span className="metric-num text-[10px] text-white/60">{formatClock(elapsed)}</span>
            </div>

            <div className="absolute right-4 top-4 flex items-center gap-1.5">
              <span
                className={cn(
                  "rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] backdrop-blur",
                  metrics?.face
                    ? "border-mint/30 bg-mint/10 text-mint"
                    : "border-rose/30 bg-rose/10 text-rose",
                )}
              >
                {metrics?.face ? "face locked" : "no face"}
              </span>
              <span className="rounded-full border border-aqua/25 bg-aqua/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-aqua backdrop-blur">
                {metrics?.hands ?? 0} hand{(metrics?.hands ?? 0) === 1 ? "" : "s"}
              </span>
            </div>

            <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-3">
              <div className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 backdrop-blur">
                <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/50">gaze</div>
                <div className="text-[11px] font-medium text-white/85">{metrics?.gazeLabel ?? "—"}</div>
              </div>
              <div className="flex-1" />
              <div className="hidden rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-right backdrop-blur sm:block">
                <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/50">posture</div>
                <div className="text-[11px] font-medium text-white/85">{metrics?.postureLabel ?? "—"}</div>
              </div>
            </div>

            {phase === "paused" && (
              <div className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[2px]">
                <div className="rounded-xl border border-line bg-base/80 px-5 py-4 text-center">
                  <Pause className="mx-auto size-4 text-amber" />
                  <p className="mt-2 text-[13px] font-medium text-ink">Session paused</p>
                  <p className="text-[11px] text-fog">Press space or hit resume to continue.</p>
                </div>
              </div>
            )}
          </>
        )}

        {!live && (
          <div className="absolute inset-0 grid place-items-center bg-base/55 px-6 backdrop-blur-[2px]">
            <div className="max-w-sm text-center">
              {phase === "error" ? (
                <>
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-rose/30 bg-rose/10 text-rose">
                    <TriangleAlert className="size-5" />
                  </span>
                  <h2 className="mt-4 text-[16px] font-medium text-ink">Camera unavailable</h2>
                  <p className="pretty mt-2 text-[12.5px] leading-relaxed text-fog">{error}</p>
                  <div className="mt-5 flex justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={onReset}>
                      <RotateCcw className="size-3.5" /> Reset
                    </Button>
                    <Button size="sm" onClick={onStart}>
                      <Camera className="size-3.5" /> Try again
                    </Button>
                  </div>
                </>
              ) : phase === "requesting" || phase === "loading" ? (
                <>
                  <span className="relative mx-auto grid size-12 place-items-center rounded-2xl border border-brand/30 bg-brand/10 text-brand-soft">
                    <span className="absolute inset-0 animate-ping rounded-2xl border border-brand/20" />
                    <ScanFace className="size-5" />
                  </span>
                  <h2 className="mt-4 text-[16px] font-medium text-ink">Preparing the studio</h2>
                  <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-fog">{progress}…</p>
                  <div className="mx-auto mt-4 h-1 w-40 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-brand to-aqua" />
                  </div>
                </>
              ) : (
                <>
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-line bg-white/[0.04] text-mist">
                    <CameraOff className="size-6" />
                  </span>
                  <h2 className="mt-4 text-[17px] font-medium text-ink">Ready when you are</h2>
                  <p className="pretty mt-2 text-[12.5px] leading-relaxed text-fog">
                    VisionSpeak needs your camera and microphone to read gaze, posture, gestures and
                    voice. Analysis runs entirely in this tab.
                  </p>
                  <div className="mt-5 flex flex-col items-center gap-3">
                    <Button size="md" onClick={onStart} className="w-full sm:w-auto">
                      <Video className="size-4" /> Enable camera &amp; mic
                    </Button>
                    <span className="flex items-center gap-1.5 text-[10.5px] text-fog/80">
                      <Shield className="size-3 text-mint/80" /> No video is uploaded, stored or shared
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

export function ControlBar({
  phase,
  metrics,
  samples,
  onStart,
  onToggle,
  onEnd,
  onReset,
  saving,
  speechSupported,
}: {
  phase: Phase;
  metrics: LiveMetrics | null;
  samples: FrameSample[];
  onStart: () => void;
  onToggle: () => void;
  onEnd: () => void;
  onReset: () => void;
  saving: boolean;
  speechSupported: boolean;
}) {
  const live = phase === "live" || phase === "paused";
  const ready = live || phase === "finished";
  const elapsed = samples.length ? samples[samples.length - 1].t : metrics?.elapsed ?? 0;

  return (
    <div className="panel flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              phase === "live"
                ? "bg-rose shadow-[0_0_10px_2px_rgba(251,113,133,0.5)]"
                : phase === "paused"
                  ? "bg-amber"
                  : "bg-fog/40",
            )}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-fog">
            {phase === "live" ? "recording" : phase === "paused" ? "paused" : phase === "finished" ? "saved" : "standby"}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <Timer className="mr-1 size-3.5 text-fog" />
          <span className="metric-num text-[20px] font-medium leading-none text-ink">{formatClock(elapsed)}</span>
        </div>
        <div className="hidden items-center gap-3 text-[10.5px] text-fog md:flex">
          <span className="flex items-center gap-1">
            <ScanFace className="size-3" /> {metrics?.face ? "tracked" : "searching"}
          </span>
          <span className="flex items-center gap-1">
            <Hand className="size-3" /> {metrics?.hands ?? 0}
          </span>
          <span className={cn(speechSupported ? "text-fog" : "text-fog/50")}>
            {speechSupported ? "transcript on" : "transcript unavailable"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
        {!live && phase !== "finished" && (
          <Button onClick={onStart} disabled={saving || phase === "loading" || phase === "requesting"}>
            <Play className="size-3.5" /> Start session
          </Button>
        )}
        {live && (
          <>
            <Button variant="outline" onClick={onToggle}>
              {phase === "paused" ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              {phase === "paused" ? "Resume" : "Pause"}
            </Button>
            <Button variant="primary" onClick={onEnd} disabled={saving}>
              <Square className="size-3.5" /> End &amp; analyse
            </Button>
          </>
        )}
        {(phase === "finished" || ready) && !live && (
          <Button variant="subtle" onClick={onReset} disabled={saving}>
            <RotateCcw className="size-3.5" /> New session
          </Button>
        )}
        <span className="hidden font-mono text-[9.5px] text-fog/60 lg:block">space · pause</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */

export function TimelineStrip({ samples }: { samples: FrameSample[] }) {
  const window = samples.slice(-180);
  const duration = samples.length ? samples[samples.length - 1].t : 0;

  return (
    <div className="panel px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-fog">session timeline</span>
        <span className="font-mono text-[9.5px] text-fog/70">
          {samples.length ? formatDuration(duration) : "—"}
        </span>
      </div>
      <div className="mt-2 flex h-9 items-end gap-[2px]">
        {window.length === 0 && (
          <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-line text-[10.5px] text-fog/60">
            Confidence for each second will appear here
          </div>
        )}
        {window.map((s, i) => {
          const tone = toneFor(s.confidence);
          return (
            <div
              key={`${s.t}-${i}`}
              title={`${formatClock(s.t)} · confidence ${s.confidence}`}
              className="min-w-[2px] flex-1 rounded-sm transition-all duration-300"
              style={{
                height: `${Math.max(12, s.confidence)}%`,
                background: tone.hex,
                opacity: 0.35 + (s.confidence / 100) * 0.65,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Voice meter
 * ------------------------------------------------------------------ */

export function VoiceMeter({ metrics }: { metrics: LiveMetrics | null }) {
  const energy = metrics?.energy ?? 0;
  const speaking = metrics?.speaking ?? false;
  return (
    <div className="panel px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-fog">voice</span>
        <span className="flex items-center gap-1.5 text-[10px] text-fog">
          <span
            className={cn("size-1.5 rounded-full", speaking ? "bg-mint animate-blink" : "bg-fog/40")}
          />
          {speaking ? "speaking" : "silent"}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Bar
          value={energy}
          tone={energy > 70 ? "#34d399" : energy > 35 ? "#22d3ee" : "#fbbf24"}
          height={8}
          className="flex-1"
        />
        <span className="metric-num w-12 text-right text-[11px] text-mist">
          {metrics ? `${metrics.db} dB` : "—"}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-fog">
        <span>{metrics?.wpm ? `${metrics.wpm} wpm` : "pace analysing"}</span>
        <Pill tone={(metrics?.fillerCount ?? 0) > 4 ? "warn" : "neutral"} className="!px-2 !py-0.5 !text-[9px]">
          {metrics?.fillerCount ?? 0} fillers
        </Pill>
      </div>
    </div>
  );
}
