import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type FaceLandmarkerResult,
  type HandLandmarkerResult,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

import { clamp, ema, mean, std } from "@/lib/math";
import type { EmotionLabel, EngineStatus, FrameSample, LiveMetrics, Nudge, SessionMode } from "@/lib/types";
import { EMOTIONS } from "@/lib/types";
import { createCoach, type Coach } from "./coach";
import { dominantEmotion, emotionFromBlendshapes, expressiveness, smileScore, tensionScore, toBlendshapeMap } from "./emotion";
import type { Landmark } from "./landmarks";
import { handCentre, handOpenness, readGaze, readPosture, headPoseFromMatrix, headYawFromGeometry } from "./landmarks";
import { drawOverlay, type OverlayFrame } from "./overlay";
import {
  clampScore,
  composite,
  rubricFor,
  scoreExpression,
  scoreEyeContact,
  scoreGestureActivity,
  scoreGestures,
  scoreMovement,
  scorePitchVariation,
  scoreVocalEnergy,
  scoreVoice,
} from "./scoring";
import { SpeechEngine, type SpeechSnapshot } from "./speech";
import { VoiceEngine, type VoiceReading } from "./voice";

const WASM_PATH = "/mediapipe/wasm";
const CDN_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
const MODEL_BASE = "https://storage.googleapis.com/mediapipe-models";
const MODELS = {
  face: { local: "/mediapipe/models/face_landmarker.task", remote: `${MODEL_BASE}/face_landmarker/face_landmarker/float16/1/face_landmarker.task` },
  pose: {
    local: "/mediapipe/models/pose_landmarker_lite.task",
    remote: `${MODEL_BASE}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  },
  hand: { local: "/mediapipe/models/hand_landmarker.task", remote: `${MODEL_BASE}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` },
};

export interface SessionAggregate {
  durationSec: number;
  analyzedFrames: number;
  faceVisiblePct: number;
  eyeContactPct: number;
  gazeAwayCount: number;
  avgGazeAwaySec: number;
  blinkRatePerMin: number;
  smilePct: number;
  expressionVariety: number;
  tension: number;
  headStabilityPct: number;
  avgShoulderSlopeDeg: number;
  avgLeanDeg: number;
  uprightPct: number;
  headOverShouldersPct: number;
  swayIndex: number;
  alignmentScore: number;
  gestureRatePerMin: number;
  handsVisiblePct: number;
  bothHandsPct: number;
  openness: number;
  nervousness: number;
  voice: {
    speakingTimePct: number;
    avgDb: number;
    volumeConsistency: number;
    pitchVariation: number;
    pauseCount: number;
    longPauseCount: number;
    avgPauseSec: number;
    energy: number;
  };
  speech: SpeechSnapshot;
  wpm: number;
  paceSource: "transcript" | "acoustic";
  emotions: Record<EmotionLabel, number>;
  timeline: FrameSample[];
}

export interface EngineCallbacks {
  onStatus?: (status: EngineStatus) => void;
  onMetrics?: (m: LiveMetrics) => void;
  onNudge?: (n: Nudge) => void;
  onSample?: (s: FrameSample) => void;
  onError?: (message: string) => void;
  onProgress?: (label: string) => void;
}

class TimeWindow {
  private items: { t: number; v: number }[] = [];
  constructor(private span: number) {}
  push(t: number, v: number) {
    this.items.push({ t, v });
    this.prune(t);
  }
  prune(t: number) {
    while (this.items.length && t - this.items[0].t > this.span) this.items.shift();
  }
  mean(t?: number) {
    if (t !== undefined) this.prune(t);
    return this.items.length ? mean(this.items.map((i) => i.v)) : 0;
  }
  sum(t?: number) {
    if (t !== undefined) this.prune(t);
    return this.items.reduce((a, b) => a + b.v, 0);
  }
  std(t?: number) {
    if (t !== undefined) this.prune(t);
    return std(this.items.map((i) => i.v));
  }
  get count() {
    return this.items.length;
  }
}

export class VisionEngine {
  private face?: FaceLandmarker;
  private pose?: PoseLandmarker;
  private hand?: HandLandmarker;
  private voice: VoiceEngine | null = null;
  private speech = new SpeechEngine();
  private coach: Coach;

  private raf = 0;
  private active = false;
  private paused = false;
  private status: EngineStatus = "idle";

  private elapsed = 0;
  private lastStep = 0;
  private lastTs = 0;
  private mediaTs = 0;
  private lastEmit = 0;
  private lastSampleAt = -1;
  private frameIndex = 0;

  private overlayFrame: OverlayFrame | null = null;

  // Rolling windows (seconds of history).
  private eyeWin = new TimeWindow(9);
  private handWin = new TimeWindow(12);
  private swayWin = new TimeWindow(5);

  // Pose and hands are detected on alternating frames, so the most recent
  // result is cached and reused — otherwise every other frame would read as
  // "nothing detected" and poison visibility percentages.
  private lastHands: Landmark[][] = [];
  private lastPose: Landmark[] | null = null;
  private lastOpenness = 1.3;

  // Counters for the end-of-session aggregate.
  private c = {
    faceFrames: 0,
    engagedFrames: 0,
    headStableFrames: 0,
    smileSum: 0,
    smileFrames: 0,
    tensionSum: 0,
    opennessSum: 0,
    opennessFrames: 0,
    handsVisibleFrames: 0,
    bothHandsFrames: 0,
    postureFrames: 0,
    slopeSum: 0,
    leanSum: 0,
    uprightFrames: 0,
    headOverFrames: 0,
    blinks: 0,
    gestureEvents: 0,
    gazeAwayEvents: 0,
    awayDurations: [] as number[],
    expressionSamples: [] as number[],
    jitterSamples: [] as number[],
    emotionSum: Object.fromEntries(EMOTIONS.map((e) => [e, 0])) as Record<EmotionLabel, number>,
    samples: [] as FrameSample[],
    steps: 0,
  };

  private awayStart = 0;
  private lastBlinkAt = 0;
  private lastGestureAt = 0;
  private lastHand = { t: 0, x: 0.5, y: 0.5 };
  private handsHiddenSince = -1;
  private swayStd = 0;
  private lastSmile = 0;

  private smoothed = {
    eye: 62,
    posture: 68,
    gestures: 55,
    voice: 55,
    expression: 55,
    confidence: 60,
    engagement: 60,
    leadership: 60,
    communication: 60,
  };

  private latestVoice: VoiceReading | null = null;
  private latestMetrics: LiveMetrics | null = null;

  constructor(
    private video: HTMLVideoElement,
    private canvas: HTMLCanvasElement,
    private stream: MediaStream,
    private mode: SessionMode,
    private cb: EngineCallbacks = {},
  ) {
    // Built here (not as a field initializer) because field initializers run
    // before TypeScript's parameter-property assignments.
    this.coach = createCoach(mode);
  }

  /** What "good" looks like for this session's mode. */
  private get rubric() {
    return rubricFor(this.mode);
  }

  private setStatus(s: EngineStatus) {
    this.status = s;
    this.cb.onStatus?.(s);
  }

  async start() {
    this.setStatus("loading");
    try {
      this.cb.onProgress?.("Loading vision runtime");
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH).catch(() =>
        FilesetResolver.forVisionTasks(CDN_WASM),
      );

      this.cb.onProgress?.("Loading face + behaviour models");
      [this.face, this.pose, this.hand] = await Promise.all([
        this.createFace(fileset),
        this.createPose(fileset),
        this.createHand(fileset),
      ]);

      this.voice = new VoiceEngine(this.stream);
      await this.voice.start();
      this.speech.start();

      this.setStatus("running");
      this.active = true;
      this.paused = false;
      this.elapsed = 0;
      this.lastStep = 0;
      this.lastTs = 0;
      this.raf = requestAnimationFrame(this.loop);
    } catch (err) {
      console.error("[VisionSpeak] engine start failed", err);
      this.setStatus("error");
      this.cb.onError?.(
        "The vision runtime could not start. Check your connection (the models load once) and reload the page.",
      );
    }
  }

  private async createFace(fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>) {
    const options = {
      runningMode: "VIDEO" as const,
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    };
    try {
      return await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODELS.face.local, delegate: "GPU" },
        ...options,
      });
    } catch {
      try {
        return await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODELS.face.local, delegate: "CPU" },
          ...options,
        });
      } catch {
        return await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODELS.face.remote, delegate: "CPU" },
          ...options,
        });
      }
    }
  }

  private async createPose(fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>) {
    const options = { runningMode: "VIDEO" as const, numPoses: 1, minPoseDetectionConfidence: 0.5 };
    try {
      return await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODELS.pose.local, delegate: "GPU" },
        ...options,
      });
    } catch {
      try {
        return await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODELS.pose.local, delegate: "CPU" },
          ...options,
        });
      } catch {
        return await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODELS.pose.remote, delegate: "CPU" },
          ...options,
        });
      }
    }
  }

  private async createHand(fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>) {
    const options = { runningMode: "VIDEO" as const, numHands: 2, minHandDetectionConfidence: 0.45 };
    try {
      return await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODELS.hand.local, delegate: "GPU" },
        ...options,
      });
    } catch {
      try {
        return await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODELS.hand.local, delegate: "CPU" },
          ...options,
        });
      } catch {
        return await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODELS.hand.remote, delegate: "CPU" },
          ...options,
        });
      }
    }
  }

  pause() {
    if (!this.active || this.paused) return;
    this.paused = true;
    this.setStatus("paused");
  }

  resume() {
    if (!this.active || !this.paused) return;
    this.paused = false;
    this.lastStep = performance.now();
    this.setStatus("running");
  }

  toggle() {
    if (this.paused) this.resume();
    else this.pause();
  }

  private loop = () => {
    if (!this.active) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.video || !this.canvas) return;

    if (!this.paused) {
      const now = performance.now();
      if (now - this.lastStep >= 30 && this.video.readyState >= 2 && this.video.videoWidth > 0) {
        this.lastStep = now;
        this.step(now);
      }
    }

    if (this.overlayFrame) drawOverlay(this.canvas, this.video, { ...this.overlayFrame, analyzing: !this.paused });
  };

  private step(now: number) {
    const dt = this.lastTs ? Math.min(0.25, (now - this.lastTs) / 1000) : 0;
    this.lastTs = now;
    this.elapsed += dt;
    this.frameIndex++;

    // MediaPipe requires strictly increasing timestamps, independent of the
    // real frame clock (which we also use for delta timing).
    this.mediaTs = Math.max(this.mediaTs + 1, Math.round(now));
    const ts = this.mediaTs;

    let faceRes: FaceLandmarkerResult | null = null;
    let poseRes: PoseLandmarkerResult | null = null;
    let handRes: HandLandmarkerResult | null = null;

    try {
      faceRes = this.face?.detectForVideo(this.video, ts) ?? null;
    } catch {
      /* transient frame errors are expected while the stream warms up */
    }
    if (this.frameIndex % 2 === 0) {
      try {
        poseRes = this.pose?.detectForVideo(this.video, ts) ?? null;
      } catch {
        /* ignore */
      }
    } else {
      try {
        handRes = this.hand?.detectForVideo(this.video, ts) ?? null;
      } catch {
        /* ignore */
      }
    }

    if (this.frameIndex % 6 === 0 || !this.latestVoice) {
      this.latestVoice = this.voice?.sample(now) ?? null;
    }

    this.analyze(faceRes, poseRes, handRes, now, dt);

    if (now - this.lastEmit > 190) {
      this.lastEmit = now;
      this.emitMetrics();
    }

    if (this.elapsed - this.lastSampleAt >= 1) {
      this.lastSampleAt = Math.floor(this.elapsed);
      this.recordSample();
    }
  }

  private analyze(
    faceRes: FaceLandmarkerResult | null,
    poseRes: PoseLandmarkerResult | null,
    handRes: HandLandmarkerResult | null,
    now: number,
    dt: number,
  ) {
    const t = this.elapsed;
    this.c.steps++;
    const face = (faceRes?.faceLandmarks?.[0] ?? null) as Landmark[] | null;
    const faceVisible = Boolean(face && face.length > 400);
    const blends = toBlendshapeMap(faceRes?.faceBlendshapes?.[0]?.categories);
    const matrix = faceRes?.facialTransformationMatrixes?.[0]?.data as number[] | undefined;

    // ---- Head pose & gaze ------------------------------------------
    let yaw = 0;
    let pitch = 0;
    if (faceVisible && face) {
      const head = headPoseFromMatrix(matrix);
      if (head.valid) {
        yaw = head.yaw;
        pitch = head.pitch;
      } else {
        yaw = headYawFromGeometry(face);
      }
    }
    const gaze = faceVisible && face ? readGaze(face) : { horizontal: 0.5, vertical: 0.5, centered: 0, ear: 0, hasIris: false };

    const yawOk = Math.abs(yaw) < 17;
    const pitchOk = Math.abs(pitch) < 15;
    const gazeOk = gaze.hasIris ? gaze.centered > 0.42 : true;
    const engaged = faceVisible && yawOk && pitchOk && gazeOk;

    if (faceVisible) {
      this.c.faceFrames++;
      if (engaged) this.c.engagedFrames++;
      if (Math.abs(yaw) < 13 && Math.abs(pitch) < 11) this.c.headStableFrames++;
      this.eyeWin.push(t, engaged ? 1 : 0);
    }

    if (faceVisible && !engaged) {
      if (!this.awayStart) this.awayStart = t;
    } else if (engaged && this.awayStart) {
      const dur = t - this.awayStart;
      if (dur > 0.45) {
        this.c.gazeAwayEvents++;
        this.c.awayDurations.push(dur);
      }
      this.awayStart = 0;
    }

    // ---- Face affect -----------------------------------------------
    const blink = (blends.eyeBlinkLeft + blends.eyeBlinkRight) / 2;
    if (blink > 0.5 && now - this.lastBlinkAt > 140) {
      this.c.blinks++;
      this.lastBlinkAt = now;
    }

    const smile = smileScore(blends);
    const tension = tensionScore(blends);
    if (faceVisible) {
      this.c.smileSum += smile;
      this.c.smileFrames++;
      this.c.tensionSum += tension;
      this.c.expressionSamples.push(expressiveness(blends));
      if (this.c.expressionSamples.length > 3600) this.c.expressionSamples.shift();
      const dist = emotionFromBlendshapes(blends);
      for (const e of EMOTIONS) this.c.emotionSum[e] += dist[e];
    }
    this.lastSmile = smile;

    // ---- Posture ---------------------------------------------------
    if (poseRes) this.lastPose = ((poseRes.landmarks?.[0] ?? null) as Landmark[] | null);
    const pose = this.lastPose;
    let postureInstant = this.smoothed.posture;
    let lean = 0;
    let slope = 0;
    if (pose) {
      const p = readPosture(pose);
      if (p.visible) {
        lean = p.leanDeg;
        slope = p.shoulderSlopeDeg;
        this.c.postureFrames++;
        this.c.slopeSum += slope;
        this.c.leanSum += lean;
        if (lean < 8) this.c.uprightFrames++;
        if (Math.abs(p.headOffset) < 0.14) this.c.headOverFrames++;
        this.swayWin.push(t, p.shoulderMid.x);
        this.swayStd = this.swayWin.std(t);
        postureInstant = clamp(
          (100 - Math.min(100, Math.max(0, (slope - 4) / 8 * 100))) * 0.35 +
            (100 - Math.min(100, Math.max(0, (lean - 6) / 9 * 100))) * 0.35 +
            (100 - Math.min(100, Math.max(0, (Math.abs(p.headOffset) - 0.1) / 0.12 * 100))) * 0.2 +
            (lean < 8 ? 100 : 40) * 0.1,
        );
      }
    }

    // ---- Hands & gestures ------------------------------------------
    if (handRes) {
      this.lastHands = ((handRes.landmarks ?? []) as Landmark[][]).filter((h) => h.length >= 21);
    }
    const hands = this.lastHands;
    const handCount = hands.length;
    let openness = this.lastOpenness;

    if (handCount > 0) {
      const open = mean(hands.map((h) => handOpenness(h)));
      this.c.opennessSum += open;
      this.c.opennessFrames++;
      this.c.handsVisibleFrames++;
      if (handCount > 1) this.c.bothHandsFrames++;
      openness = open;
      this.lastOpenness = open;

      const centre = handCentre(hands[0]);
      if (this.lastHand.t && t - this.lastHand.t > 0.05) {
        const speed = Math.hypot(centre.x - this.lastHand.x, centre.y - this.lastHand.y) / (t - this.lastHand.t);
        const jitter = clamp((speed - 0.55) / 1.15 * 100);
        this.c.jitterSamples.push(jitter);
        if (this.c.jitterSamples.length > 3600) this.c.jitterSamples.shift();
      }
      this.lastHand = { t, x: centre.x, y: centre.y };

      if (open > 1.15 && t - this.lastGestureAt > 0.9) {
        this.c.gestureEvents++;
        this.lastGestureAt = t;
      }
      this.handWin.push(t, 1);
      this.handsHiddenSince = -1;
    } else {
      this.handWin.push(t, 0);
      this.lastHand = { t, x: 0.5, y: 0.5 };
      if (this.handsHiddenSince < 0) this.handsHiddenSince = Math.max(0.001, t);
    }

    // ---- Live scores ------------------------------------------------
    const eyePct = this.eyeWin.count ? this.eyeWin.mean(t) * 100 : 0;
    const blinkRate = this.blinkRate();
    const eyeInstant = faceVisible ? scoreEyeContact(eyePct, blinkRate, this.rubric) : this.smoothed.eye;

    const handsVisiblePct = this.handWin.count ? this.handWin.mean(t) * 100 : 0;
    const gestureRate = this.gestureRate();
    const jitterMean = this.c.jitterSamples.length ? mean(this.c.jitterSamples.slice(-120)) : 0;
    const gestureInstant = scoreGestures(
      {
        gestureRatePerMin: gestureRate,
        handsVisiblePct,
        bothHandsPct: handCount > 1 ? 100 : 30,
        avgOpenness: openness || 1.2,
        nervousnessIndex: jitterMean,
      },
      this.rubric,
    );

    const voice = this.latestVoice;
    const fillerDensity = this.speech.fillerDensity();
    const voiceInstant = voice
      ? scoreVoice({
          volumeConsistency: voice.volumeConsistency,
          energy: voice.energy,
          pitchVariation: voice.pitchVariation,
          speakingTimePct: voice.speakingTimePct || 60,
          fillerPer100: fillerDensity,
        })
      : this.smoothed.voice;

    const variety = this.expressionVariety();
    const expressionInstant = scoreExpression({ smilePct: smile, variety, tension }, this.rubric);

    // Smooth everything — the UI should read like a coach, not a seismograph.
    const a = 1 - Math.pow(0.001, dt); // frame-rate independent ~fast convergence
    const alpha = clamp(a * 0.35 + 0.02, 0.02, 0.25);
    this.smoothed.eye = ema(this.smoothed.eye, eyeInstant, alpha);
    this.smoothed.posture = ema(this.smoothed.posture, postureInstant, alpha * 0.8);
    this.smoothed.gestures = ema(this.smoothed.gestures, gestureInstant, alpha);
    this.smoothed.voice = ema(this.smoothed.voice, voiceInstant, alpha);
    this.smoothed.expression = ema(this.smoothed.expression, expressionInstant, alpha);

    const energy = scoreVocalEnergy(voice?.energy ?? 0);
    const movement = scoreMovement(clamp(this.swayStd * 900), this.rubric);
    const voiceVariation = scorePitchVariation(voice?.pitchVariation ?? 0);
    const gestureActivity = scoreGestureActivity(gestureRate, this.rubric);

    const pillars = composite(
      {
        eyeContact: this.smoothed.eye,
        posture: this.smoothed.posture,
        gestures: this.smoothed.gestures,
        voice: this.smoothed.voice,
        expression: this.smoothed.expression,
      },
      { energy, movement, voiceVariation, gestureActivity },
    );

    const compAlpha = clamp(alpha * 0.9, 0.02, 0.2);
    this.smoothed.confidence = ema(this.smoothed.confidence, pillars.confidence, compAlpha);
    this.smoothed.engagement = ema(this.smoothed.engagement, pillars.engagement, compAlpha);
    this.smoothed.leadership = ema(this.smoothed.leadership, pillars.leadership, compAlpha);
    this.smoothed.communication = ema(this.smoothed.communication, pillars.communication, compAlpha);

    // ---- Nudges ------------------------------------------------------
    const wpm = this.currentWpm();
    const nudges = this.coach.evaluate({
      now,
      elapsed: this.elapsed,
      faceVisible,
      eyeEngaged: engaged,
      eyesAwayMs: this.awayStart ? (t - this.awayStart) * 1000 : 0,
      eyeContactPct: this.c.faceFrames ? (this.c.engagedFrames / this.c.faceFrames) * 100 : 0,
      blinkRate,
      posture: this.smoothed.posture,
      lean,
      slope,
      hands: handCount,
      handsHiddenMs: this.handsHiddenSince > 0 ? (t - this.handsHiddenSince) * 1000 : 0,
      nervousness: jitterMean,
      db: voice?.db ?? -100,
      speaking: voice?.speaking ?? false,
      wpm,
      fillersRecent: this.speech.fillersInWindow(20000),
      smilePct: smile,
    });
    for (const n of nudges) this.cb.onNudge?.(n);

    // ---- Latest snapshot ---------------------------------------------
    const emotion = dominantEmotion(emotionFromBlendshapes(blends));
    const postureLabel = lean > 12 ? "Leaning" : slope > 9 ? "Uneven" : lean < 8 ? "Grounded" : "Fair";
    const gazeLabel = !faceVisible ? "No face" : engaged ? "On lens" : Math.abs(yaw) >= 17 ? (yaw > 0 ? "Looking aside" : "Looking aside") : "Drifting";

    this.overlayFrame = {
      face: face ?? undefined,
      pose: pose ?? undefined,
      hands,
      engaged,
      yaw,
      pitch,
      faceVisible,
      handsVisible: handCount,
      analyzing: true,
    };

    this.latestMetrics = {
      confidence: clampScore(this.smoothed.confidence),
      engagement: clampScore(this.smoothed.engagement),
      leadership: clampScore(this.smoothed.leadership),
      communication: clampScore(this.smoothed.communication),
      eyeContact: clampScore(this.smoothed.eye),
      posture: clampScore(this.smoothed.posture),
      gestures: clampScore(this.smoothed.gestures),
      voice: clampScore(this.smoothed.voice),
      expression: clampScore(this.smoothed.expression),
      gaze: Math.round(engaged ? gaze.centered * 100 : 0),
      yaw: Math.round(yaw),
      pitch: Math.round(pitch),
      db: Math.round(voice?.db ?? -100),
      energy: Math.round(voice?.energy ?? 0),
      wpm: Math.round(wpm),
      face: faceVisible,
      hands: handCount,
      emotion,
      speaking: voice?.speaking ?? false,
      postureLabel,
      gazeLabel,
      blinkRate: Math.round(blinkRate),
      fillerCount: this.speech.totalFillers(),
      wordCount: this.speech.snapshot().words,
      elapsed: Math.round(this.elapsed),
    };
  }

  private blinkRate() {
    if (this.elapsed < 4) return 14;
    const perMin = (this.c.blinks / Math.max(1, this.elapsed)) * 60;
    return perMin;
  }

  private gestureRate() {
    if (this.elapsed < 3) return 0;
    return (this.c.gestureEvents / Math.max(1, this.elapsed)) * 60;
  }

  private expressionVariety() {
    const s = this.c.expressionSamples.slice(-240);
    return clamp(std(s) * 700);
  }

  private currentWpm(): number {
    const speed = this.speech.snapshot();
    const speakingMin = Math.max(1 / 60, (this.latestVoice?.speakingTimePct ?? 0) / 100 * this.elapsed / 60);
    if (speed.words >= 6) return speed.words / speakingMin;
    const syllables = this.latestVoice?.syllables ?? 0;
    if (this.elapsed > 6 && syllables > 4) return syllables / 1.55 / speakingMin;
    return 0;
  }

  private emitMetrics() {
    if (this.latestMetrics) {
      this.latestMetrics.elapsed = Math.round(this.elapsed);
      this.latestMetrics.wordCount = this.speech.snapshot().words;
      this.latestMetrics.fillerCount = this.speech.totalFillers();
      this.cb.onMetrics?.(this.latestMetrics);
    }
  }

  private recordSample() {
    const m = this.latestMetrics;
    if (!m) return;
    const sample: FrameSample = {
      t: Math.round(this.elapsed),
      confidence: m.confidence,
      engagement: m.engagement,
      leadership: m.leadership,
      communication: m.communication,
      eyeContact: m.eyeContact,
      posture: m.posture,
      gestures: m.gestures,
      voice: m.voice,
      expression: m.expression,
      gaze: m.gaze,
      yaw: m.yaw,
      pitch: m.pitch,
      db: m.db,
      energy: m.energy,
      wpm: m.wpm,
      face: m.face,
      hands: m.hands,
      emotion: m.emotion,
      smiling: this.lastSmile,
    };
    this.c.samples.push(sample);
    this.cb.onSample?.(sample);
  }

  getMetrics() {
    return this.latestMetrics;
  }

  getSpeech() {
    return this.speech.snapshot();
  }

  getElapsed() {
    return this.elapsed;
  }

  getStatus() {
    return this.status;
  }

  finish(): SessionAggregate {
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.speech.stop();
    const voice = this.voice?.snapshot();
    const speech = this.speech.snapshot();
    const c = this.c;

    const faceFrames = Math.max(1, c.faceFrames);
    const postureFrames = Math.max(1, c.postureFrames);
    const smileFrames = Math.max(1, c.smileFrames);
    const durationMin = Math.max(1 / 60, this.elapsed / 60);

    const speakingMin = Math.max(1 / 60, ((voice?.speakingTimePct ?? 0) / 100) * this.elapsed / 60);
    const transcriptWpm = speech.words >= 6 ? speech.words / speakingMin : 0;
    const acousticWpm = voice && voice.syllables > 4 ? voice.syllables / 1.55 / speakingMin : 0;
    const wpm = transcriptWpm > 0 ? transcriptWpm : acousticWpm;

    const emotions = Object.fromEntries(
      EMOTIONS.map((e) => [e, c.faceFrames ? Math.round((c.emotionSum[e] / c.faceFrames) * 10) / 10 : 0]),
    ) as Record<EmotionLabel, number>;

    const avgSlope = c.slopeSum / postureFrames;
    const avgLean = c.leanSum / postureFrames;
    const swayIndex = clamp(this.swayStd * 900);

    this.voice?.dispose();
    this.face?.close();
    this.pose?.close();
    this.hand?.close();

    return {
      durationSec: Math.round(this.elapsed),
      analyzedFrames: c.faceFrames + postureFrames,
      faceVisiblePct: clamp((c.faceFrames / Math.max(1, c.steps)) * 100),
      eyeContactPct: (c.engagedFrames / faceFrames) * 100,
      gazeAwayCount: c.gazeAwayEvents,
      avgGazeAwaySec: c.awayDurations.length ? mean(c.awayDurations) : 0,
      blinkRatePerMin: (c.blinks / Math.max(1, this.elapsed)) * 60,
      smilePct: c.smileSum / smileFrames,
      expressionVariety: this.expressionVariety(),
      tension: c.tensionSum / smileFrames,
      headStabilityPct: (c.headStableFrames / faceFrames) * 100,
      avgShoulderSlopeDeg: avgSlope,
      avgLeanDeg: avgLean,
      uprightPct: (c.uprightFrames / postureFrames) * 100,
      headOverShouldersPct: (c.headOverFrames / postureFrames) * 100,
      swayIndex,
      alignmentScore: 100 - Math.min(100, Math.max(0, (avgSlope - 3) * 8)),
      gestureRatePerMin: c.gestureEvents / durationMin,
      handsVisiblePct: (c.handsVisibleFrames / Math.max(1, c.steps)) * 100,
      bothHandsPct: c.handsVisibleFrames ? (c.bothHandsFrames / c.handsVisibleFrames) * 100 : 0,
      openness: c.opennessFrames ? c.opennessSum / c.opennessFrames : 0,
      nervousness: c.jitterSamples.length ? mean(c.jitterSamples) : 0,
      voice: {
        speakingTimePct: voice?.speakingTimePct ?? 0,
        avgDb: voice?.avgDb ?? -60,
        volumeConsistency: voice?.volumeConsistency ?? 0,
        pitchVariation: voice?.pitchVariation ?? 0,
        pauseCount: voice?.pauseCount ?? 0,
        longPauseCount: voice?.longPauseCount ?? 0,
        avgPauseSec: voice?.avgPauseSec ?? 0,
        energy: voice?.energy ?? 0,
      },
      speech,
      wpm: Number.isFinite(wpm) ? Math.round(wpm) : 0,
      paceSource: transcriptWpm > 0 ? "transcript" : "acoustic",
      emotions,
      timeline: c.samples,
    };
  }

  abort() {
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.speech.stop();
    this.voice?.dispose();
    this.face?.close();
    this.pose?.close();
    this.hand?.close();
  }
}
