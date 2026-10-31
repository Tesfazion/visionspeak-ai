"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { VisionEngine, type SessionAggregate } from "@/lib/analysis/engine";
import { recognizerAvailable, type SpeechLanguage, type SpeechSnapshot } from "@/lib/analysis/speech";
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

export function useVisionSession(
  mode: SessionMode,
  options: {
    onFlush?: (aggregate: SessionAggregate) => Promise<void>;
  } = {},
) {
  const onFlush = options.onFlush;
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
  const [speech, setSpeech] = useState<SpeechSnapshot | null>(null);
  // Exposed so a caller (the meeting room) can render the same camera stream in
  // its own tile instead of asking for a second getUserMedia permission.
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioOnly, setAudioOnly] = useState(false);
  // Server snapshot is `false` (no Web Speech on the server) and the client
  // snapshot is the real capability, so hydration matches and no effect is
  // needed to sync it — useSyncExternalStore handles the switch.
  const speechSupported = useSyncExternalStore(
    () => () => undefined,
    () => recognizerAvailable(),
    () => false,
  );

  const speechLanguageRef = useRef<SpeechLanguage>("en-US");

  const setSpeechLanguage = useCallback((lang: SpeechLanguage) => {
    // Remember the choice even before the engine exists, so a language picked
    // on the pre-session screen is the one the recogniser actually boots with.
    speechLanguageRef.current = lang;
    engineRef.current?.setSpeechLanguage(lang);
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.abort();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = useCallback(async () => {
    if (engineRef.current) return;
    if (typeof window === "undefined") return;
    setError(null);
    setNudges([]);
    setSamples([]);
    setMetrics(null);
    setSpeech(null);
    setAudioOnly(false);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      setError(
        "This browser does not expose camera access. Use Chrome or Edge over https:// or http://localhost.",
      );
      return;
    }

    setPhase("requesting");
    setProgress("Requesting microphone");
    try {
      // First request audio only. If that succeeds, then request video.
      // If video fails, fall back to audio-only mode.
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (audioErr) {
        throw audioErr;
      }

      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user", frameRate: { ideal: 30 } },
        });
        // Combine audio + video
        videoStream.getVideoTracks().forEach((t) => stream!.addTrack(t));
      } catch {
        // Fall back to audio-only mode if video fails
        setAudioOnly(true);
      }

      if (!stream) throw new Error("stream-failed");
      streamRef.current = stream;
      setStream(stream);

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
        // The recogniser is driven by its own callback chain, so polling it on
        // the engine's metric cadence is the simplest reliable sync: ~5 Hz is
        // fast enough for a transcript to read as live while batching renders.
        onTick: () => setSpeech(engine.getSpeech()),
      });
      // Boot the recogniser in whatever language the user already picked.
      engine.setSpeechLanguage(speechLanguageRef.current);
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
      setStream(null);
    }
  }, [mode]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    setPhase("paused");
  }, []);

  // Offline awareness: aggregates produced while the connection is down are
  // queued so they can replay the moment the client comes back. The queue is
  // part of the hook's state so it survives a component unmount only as long
  // as the tab is open — a refresh loses it, which is the right trade-off.
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [offlineQueue, setOfflineQueue] = useState<SessionAggregate[]>([]);

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const queueOffline = useCallback((aggregate: SessionAggregate) => {
    setOfflineQueue((prev) => [...prev, aggregate]);
  }, []);

  const flushOfflineQueue = useCallback(async () => {
    if (!offlineQueue.length) return 0;
    const queue = offlineQueue;
    setOfflineQueue([]);
    let flushed = 0;
    for (const aggregate of queue) {
      try {
        await onFlush?.(aggregate);
        flushed++;
      } catch {
        // Put it back at the head so the next flush retries first.
        setOfflineQueue((prev) => [aggregate, ...prev]);
        break;
      }
    }
    return flushed;
  }, [offlineQueue, onFlush]);

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
    setStream(null);
    if (!engine) return null;
    const aggregate = engine.finish();
    setSpeech(engine.getSpeech?.() ?? aggregate.speech);
    setPhase("finished");
    return aggregate;
  }, []);

  const reset = useCallback(() => {
    engineRef.current?.abort();
    engineRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setPhase("idle");
    setMetrics(null);
    setNudges([]);
    setSamples([]);
    setSpeech(null);
    setError(null);
    setAudioOnly(false);
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
    speech,
    speechSupported,
    stream,
    audioOnly,
    offline,
    offlineQueue,
    queueOffline,
    flushOfflineQueue,
    setSpeechLanguage,
    start,
    pause,
    resume,
    toggle,
    stop,
    reset,
  };
}
