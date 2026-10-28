"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { VisionEngine, type SessionAggregate } from "@/lib/analysis/engine";
import { recognizerAvailable } from "@/lib/analysis/speech";
import type { FrameSample, LiveMetrics, Nudge, SessionMode } from "@/lib/types";

export type Phase = "idle" | "requesting" | "loading" | "live" | "paused" | "finished" | "error";

const MAX_NUDGES = 24;

function explainMediaError(err: unknown): string {
  const name = (err as DOMException)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera or microphone access was blocked. Allow it from the icon in your browser's address bar, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera or microphone was found. Connect a device and reload the studio.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The camera is already in use by another application. Close it (Zoom, Teams, OBS) and try again.";
  }
  return "The camera could not start. Check permissions and reload the page.";
}

export function useVisionSession(mode: SessionMode) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<VisionEngine | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("Warming up");
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [samples, setSamples] = useState<FrameSample[]>([]);
  // Server snapshot is `false` (no Web Speech on the server) and the client
  // snapshot is the real capability, so hydration matches and no effect is
  // needed to sync it — useSyncExternalStore handles the switch.
  const speechSupported = useSyncExternalStore(
    () => () => undefined,
    () => recognizerAvailable(),
    () => false,
  );

  useEffect(() => {
    return () => {
      engineRef.current?.abort();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = useCallback(async () => {
    if (engineRef.current) return;
    setError(null);
    setNudges([]);
    setSamples([]);
    setMetrics(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      setError(
        "This browser does not expose camera access. Use Chrome or Edge over https:// or http://localhost.",
      );
      return;
    }

    setPhase("requesting");
    setProgress("Requesting camera & microphone");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user", frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) throw new Error("stage-not-ready");

      video.srcObject = stream;
      await video.play().catch(() => undefined);
      // Wait for the first real frame so landmark coordinates are valid.
      await new Promise<void>((resolve) => {
        if (video.videoWidth > 0) return resolve();
        const onLoaded = () => resolve();
        video.addEventListener("loadeddata", onLoaded, { once: true });
        setTimeout(resolve, 2500);
      });

      setPhase("loading");
      const engine = new VisionEngine(video, canvas, stream, mode, {
        onProgress: (label) => setProgress(label),
        onStatus: (status) => {
          if (status === "running") setPhase("live");
          if (status === "paused") setPhase("paused");
        },
        onMetrics: (m) => setMetrics(m),
        onSample: (s) => setSamples((prev) => (prev.length > 7200 ? prev : [...prev, s])),
        onNudge: (n) =>
          setNudges((prev) => {
            if (prev.some((p) => p.id === n.id)) return prev;
            return [n, ...prev].slice(0, MAX_NUDGES);
          }),
        onError: (message) => {
          setError(message);
          setPhase("error");
        },
      });
      engineRef.current = engine;
      await engine.start();
    } catch (err) {
      if ((err as Error)?.message === "stage-not-ready") {
        setError("The video stage is not ready yet. Try again in a moment.");
      } else {
        setError(explainMediaError(err));
      }
      setPhase("error");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [mode]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    setPhase("paused");
  }, []);

  const resume = useCallback(() => {
    engineRef.current?.resume();
    setPhase("live");
  }, []);

  const toggle = useCallback(() => {
    if (phase === "paused") resume();
    else if (phase === "live") pause();
  }, [phase, pause, resume]);

  const stop = useCallback((): SessionAggregate | null => {
    const engine = engineRef.current;
    engineRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (!engine) return null;
    const aggregate = engine.finish();
    setPhase("finished");
    return aggregate;
  }, []);

  const reset = useCallback(() => {
    engineRef.current?.abort();
    engineRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setPhase("idle");
    setMetrics(null);
    setNudges([]);
    setSamples([]);
    setError(null);
  }, []);

  // Keyboard: space = pause/resume, escape = end + reset.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space" && (phase === "live" || phase === "paused")) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, toggle]);

  return {
    videoRef,
    canvasRef,
    phase,
    progress,
    error,
    metrics,
    nudges,
    samples,
    speechSupported,
    start,
    pause,
    resume,
    toggle,
    stop,
    reset,
  };
}
