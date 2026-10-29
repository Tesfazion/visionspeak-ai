"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildReport } from "@/lib/analysis/report";
import type { SessionMode } from "@/lib/types";
import type { SpeechLanguage } from "@/lib/analysis/speech";
import { useVisionSession } from "@/hooks/useVisionSession";
import { CoachFeed, LiveScorePanel, SessionMeta, SignalGrid, TranscriptPanel } from "@/components/studio/panels";
import { ControlBar, Stage, TimelineStrip, VoiceMeter } from "@/components/studio/stage";
import { Button, Pill, cn } from "@/components/ui";
import { ArrowRight, Eye, RotateCcw, ScanFace, Shield, Sparkles, TriangleAlert, Zap } from "@/components/icons";

const MODE_LABEL: Record<SessionMode, string> = {
  practice: "Practice",
  presentation: "Presentation",
  interview: "Interview",
};

/* ------------------------------------------------------------------ *
 * Unsaved-session recovery
 *
 * The aggregate exists only in memory until the POST succeeds, so a dropped
 * connection, an expired session or a closed tab used to destroy the whole
 * analysis. The draft is written to this device only — the transcript never
 * leaves it by any other path.
 * ------------------------------------------------------------------ */
const DRAFT_KEY = "visionspeak:draft:v1";
const DRAFT_TTL_MS = 7 * 86_400_000;

interface Draft {
  aggregate: unknown;
  meta: { speaker: string; title: string; mode: SessionMode; notes: string };
  clientSessionId: string;
  at: number;
}

const newClientSessionId = () =>
  globalThis.crypto?.randomUUID?.() ?? `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

function readDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (!parsed?.aggregate || !parsed.meta || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > DRAFT_TTL_MS) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeDraft(draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* private mode or quota exceeded — retry still works while the tab is open */
  }
}

export default function StudioPage() {
  const router = useRouter();
  const [mode, setMode] = useState<SessionMode>("practice");
  const [language, setLanguage] = useState<SpeechLanguage>("en-US");
  const [speaker, setSpeaker] = useState("");
  const [title, setTitle] = useState("Live practice session");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hydrated = useRef(false);

  const live = useVisionSession(mode);
  const { phase, metrics, samples, nudges } = live;
  const clientSessionId = useRef<string>(newClientSessionId());
  const [draft, setDraft] = useState<{ at: number; title: string } | null>(null);

  // Restoring the saved speaker *must* happen after hydration: reading
  // localStorage during render would make the server HTML and the first client
  // render disagree, so a one-shot effect is the hydration-safe way to do it.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const stored = window.localStorage.getItem("visionspeak:speaker");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration restore
      if (stored) setSpeaker(stored);
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    if (!speaker) return;
    try {
      window.localStorage.setItem("visionspeak:speaker", speaker);
    } catch {
      /* ignore */
    }
  }, [speaker]);

  // Offer to recover a session that never reached the server.
  useEffect(() => {
    const saved = readDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration restore
    if (saved) setDraft({ at: saved.at, title: saved.meta.title || "Untitled session" });
  }, []);

  useEffect(() => {
    if (phase !== "live" && phase !== "paused") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const busy = saving || phase === "loading" || phase === "requesting";

  const postSession = useCallback(
    async (aggregate: unknown, meta: Record<string, unknown>, clientId: string) => {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aggregate, meta: { ...meta, clientSessionId: clientId } }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || `Save failed (${res.status}).`);
      return data.id;
    },
    [],
  );

  const handleEnd = useCallback(async () => {
    const aggregate = live.stop();
    if (!aggregate) return;
    if (aggregate.durationSec < 8 || aggregate.timeline.length < 5) {
      setNotice(
        `That was only ${aggregate.durationSec}s of analysed speech. Speak for at least 10 seconds so the scores have something to read.`,
      );
      return;
    }

    const meta = {
      speaker: speaker.trim() || "Speaker",
      title: title.trim() || `${MODE_LABEL[mode]} session`,
      mode,
      notes: "",
    };

    setSaving(true);
    setSaveError(null);
    try {
      const id = await postSession(aggregate, meta, clientSessionId.current);
      writeDraft(null);
      setDraft(null);
      router.push(`/report/${id}`);
    } catch (err) {
      // Keep the analysis on this device so "Retry save" is a real retry, not
      // a second, empty attempt against a stopped engine.
      writeDraft({ aggregate, meta, clientSessionId: clientSessionId.current, at: Date.now() });
      setDraft({ at: Date.now(), title: meta.title });
      setSaveError(
        err instanceof Error && err.message.length < 200
          ? err.message
          : "The report could not be saved. Your session is kept on this device — retry, or come back to it later.",
      );
      setSaving(false);
    }
  }, [live, mode, postSession, router, speaker, title]);

  const retrySave = useCallback(async () => {
    const saved = readDraft();
    if (!saved) {
      setSaveError("The draft is no longer on this device. Start a new session to analyse again.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const id = await postSession(saved.aggregate, saved.meta, saved.clientSessionId);
      writeDraft(null);
      setDraft(null);
      router.push(`/report/${id}`);
    } catch (err) {
      setSaveError(
        err instanceof Error && err.message.length < 200 ? err.message : "Still could not save. Your session is safe on this device.",
      );
      setSaving(false);
    }
  }, [postSession, router]);

  const resetSession = useCallback(() => {
    setNotice(null);
    setSaveError(null);
    setDraft(null);
    writeDraft(null);
    clientSessionId.current = newClientSessionId();
    live.reset();
  }, [live]);

  const previewReport = useMemo(() => {
    if (samples.length < 10) return null;
    return buildReport({
      durationSec: samples[samples.length - 1].t,
      analyzedFrames: samples.length * 25,
      faceVisiblePct: 95,
      eyeContactPct: metrics?.eyeContact ?? 0,
      gazeAwayCount: 0,
      avgGazeAwaySec: 0,
      blinkRatePerMin: metrics?.blinkRate ?? 0,
      smilePct: 0,
      expressionVariety: 0,
      tension: 0,
      headStabilityPct: 0,
      avgShoulderSlopeDeg: 0,
      avgLeanDeg: 0,
      uprightPct: 0,
      headOverShouldersPct: 0,
      swayIndex: 0,
      alignmentScore: 0,
      gestureRatePerMin: 0,
      handsVisiblePct: 0,
      bothHandsPct: 0,
      openness: 0,
      nervousness: 0,
      voice: {
        speakingTimePct: 0,
        avgDb: -60,
        volumeConsistency: 0,
        pitchVariation: 0,
        pauseCount: 0,
        longPauseCount: 0,
        avgPauseSec: 0,
        energy: 0,
      },
      speech: { transcript: "", words: 0, fillers: [], totalFillers: 0, fillerEvents: [], supported: false, language },
      language,
      wpm: 0,
      paceSource: "acoustic",
      emotions: { neutral: 60, happy: 20, surprise: 5, sad: 5, angry: 5, fear: 5 },
      timeline: samples,
    }, mode);
  }, [samples, metrics, mode, language]);

  return (
    <div className="container-wide relative pb-14 pt-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 grid-lines opacity-40" />

      <header className="relative mb-5 flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="eyebrow">Studio</div>
          <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-ink sm:text-[32px]">
            Live speaking analysis
          </h1>
          <p className="pretty mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-fog sm:text-[13px]">
            Set the frame, hit start, and speak. Nine scores update five times a second while the coach
            watches for habits you can feel but can&apos;t see.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="good">
            <Shield className="size-3" /> on-device
          </Pill>
          <Pill>
            <ScanFace className="size-3" /> 478-point mesh
          </Pill>
          <Pill>
            <Zap className="size-3" /> 5 Hz scoring
          </Pill>
        </div>
      </header>

      <SessionMeta
        speaker={speaker}
        onSpeaker={setSpeaker}
        title={title}
        onTitle={setTitle}
        mode={mode}
        onMode={setMode}
        language={language}
        onLanguage={(l) => {
          setLanguage(l);
          live.setSpeechLanguage(l);
        }}
        disabled={phase === "live" || phase === "paused" || saving}
      />

      {draft && !saving && (
        <div className="panel mt-4 flex flex-col gap-3 border-amber/25 bg-amber/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber" />
            <div>
              <div className="text-[12px] font-medium text-ink">
                Unsaved session from{" "}
                {new Date(draft.at).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              <p className="pretty mt-0.5 text-[11px] leading-relaxed text-fog">
                &ldquo;{draft.title}&rdquo; never reached the server. The analysis is still on this
                device — save it before it expires.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={retrySave}>
              <Sparkles className="size-3.5" /> Save it
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                writeDraft(null);
                setDraft(null);
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] 3xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Stage
            videoRef={live.videoRef}
            canvasRef={live.canvasRef}
            phase={phase}
            progress={live.progress}
            error={live.error}
            metrics={metrics}
            samples={samples}
            onStart={live.start}
            onReset={resetSession}
          />

          {/*
           * On a phone the score belongs directly under the camera — scrolling
           * past the whole control stack mid-session to find it is not usable.
           * The panel is rendered twice (here and in the right column) so each
           * breakpoint keeps a sensible reading order without JS layout logic.
           */}
          <div className="xl:hidden">
            <LiveScorePanel metrics={metrics} phase={phase} />
          </div>

          {/* Docked on phones so Pause / End are always one thumb away. */}
          <div className="safe-b sticky bottom-0 z-30 -mx-1 px-1 xl:static xl:pb-0">
            <div className="rounded-2xl bg-base/80 backdrop-blur-xl xl:bg-transparent xl:backdrop-blur-none">
              <ControlBar
                phase={phase}
                metrics={metrics}
                samples={samples}
                onStart={live.start}
                onToggle={live.toggle}
                onEnd={handleEnd}
                onReset={resetSession}
                saving={busy}
                speechSupported={live.speechSupported}
              />
            </div>
          </div>

          <TimelineStrip samples={samples} />

          {/* On phones the transcript belongs under the camera so you can glance
              down while speaking; on desktop it lives in the right rail. */}
          <div className="xl:hidden">
            <TranscriptPanel
              speech={live.speech}
              phase={phase}
              speaking={metrics?.speaking ?? false}
            />
          </div>

          <SignalGrid metrics={metrics} />

          {!live.speechSupported && (
            <div className="panel flex items-start gap-2.5 px-4 py-3">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber" />
              <p className="text-[11.5px] leading-relaxed text-fog">
                <span className="text-mist">Transcript unavailable in this browser.</span> Pace and filler
                detection switch to the acoustic estimator; for word-level filler counts use Chrome or
                Edge.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="hidden xl:block">
            <LiveScorePanel metrics={metrics} phase={phase} />
          </div>
          <VoiceMeter metrics={metrics} />
          <TranscriptPanel
            speech={live.speech}
            phase={phase}
            speaking={metrics?.speaking ?? false}
          />
          <CoachFeed nudges={nudges} />
          <div className="panel flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-[11px] text-fog">Projected grade</div>
              <div className="text-[13px] font-medium text-ink">
                {previewReport ? `${previewReport.grade} · ${previewReport.gradeLabel}` : "Not enough data yet"}
              </div>
            </div>
            <Eye className={cn("size-4", previewReport ? "text-mint" : "text-fog/40")} />
          </div>
        </div>
      </div>

      {/* ---------------- overlays ---------------- */}
      {(saving || saveError || notice) && (
        <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto overscroll-contain-y bg-base/85 px-5 py-6 backdrop-blur-md">
          <div className="panel my-auto w-full max-w-md p-6">
            {saveError ? (
              <>
                <span className="grid size-11 place-items-center rounded-xl border border-rose/30 bg-rose/10 text-rose">
                  <TriangleAlert className="size-5" />
                </span>
                <h2 className="mt-4 text-[16px] font-medium text-ink">Report not saved</h2>
                <p className="pretty mt-2 text-[12.5px] leading-relaxed text-fog">{saveError}</p>
                <div className="mt-5 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSaveError(null)}>
                    Dismiss
                  </Button>
                  <Button size="sm" onClick={retrySave}>
                    Retry save <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </>
            ) : notice ? (
              <>
                <span className="grid size-11 place-items-center rounded-xl border border-amber/30 bg-amber/10 text-amber">
                  <TriangleAlert className="size-5" />
                </span>
                <h2 className="mt-4 text-[16px] font-medium text-ink">Session too short</h2>
                <p className="pretty mt-2 text-[12.5px] leading-relaxed text-fog">{notice}</p>
                <div className="mt-5 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      resetSession();
                    }}
                  >
                    <RotateCcw className="size-3.5" /> Start a new session
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="relative grid size-11 place-items-center rounded-xl border border-brand/30 bg-brand/10 text-brand-soft">
                    <span className="absolute inset-0 animate-ping rounded-xl border border-brand/25" />
                    <Sparkles className="size-5" />
                  </span>
                  <div>
                    <h2 className="text-[16px] font-medium text-ink">Scoring your session</h2>
                    <p className="text-[11.5px] text-fog">This runs on the server in a few milliseconds.</p>
                  </div>
                </div>
                <ul className="mt-5 space-y-2">
                  {[
                    "Aggregating gaze, posture and gesture signals",
                    "Fitting vocal delivery and pause structure",
                    "Weighting the confidence model",
                    "Writing strengths, blind spots and drills",
                  ].map((s, i) => (
                    <li key={s} className="flex items-center gap-2.5 text-[12px] text-mist">
                      <span
                        className="size-1.5 rounded-full bg-brand-soft"
                        style={{ animation: `blink 1.6s ${i * 0.18}s infinite` }}
                      />
                      {s}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
