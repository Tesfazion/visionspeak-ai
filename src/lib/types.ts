export type SessionMode = "practice" | "presentation" | "interview";

export type EmotionLabel = "neutral" | "happy" | "surprise" | "sad" | "angry" | "fear";

export const EMOTIONS: EmotionLabel[] = ["neutral", "happy", "surprise", "sad", "angry", "fear"];

/** One per-second slice of a session — the raw material for every chart. */
export interface FrameSample {
  t: number;
  confidence: number;
  engagement: number;
  leadership: number;
  communication: number;
  eyeContact: number;
  posture: number;
  gestures: number;
  voice: number;
  expression: number;
  gaze: number;
  yaw: number;
  pitch: number;
  db: number;
  energy: number;
  wpm: number;
  face: boolean;
  hands: number;
  emotion: EmotionLabel;
  smiling: number;
}

export interface PillarScores {
  eyeContact: number;
  posture: number;
  gestures: number;
  voice: number;
  expression: number;
  engagement: number;
  confidence: number;
  leadership: number;
  communication: number;
}

export interface VoiceStats {
  speakingTimePct: number;
  avgWpm: number;
  paceSource: "transcript" | "acoustic";
  avgDb: number;
  volumeConsistency: number;
  pitchVariation: number;
  pauseCount: number;
  longPauseCount: number;
  avgPauseSec: number;
  energy: number;
}

export interface FaceStats {
  eyeContactPct: number;
  gazeAwayCount: number;
  avgGazeAwaySec: number;
  blinkRatePerMin: number;
  smilePct: number;
  expressionVariety: number;
  headStabilityPct: number;
  faceVisiblePct: number;
}

export interface PoseStats {
  alignmentScore: number;
  uprightPct: number;
  avgLeanDeg: number;
  avgShoulderSlopeDeg: number;
  swayIndex: number;
  headOverShouldersPct: number;
}

export interface GestureStats {
  gestureRatePerMin: number;
  handsVisiblePct: number;
  bothHandsPct: number;
  avgOpenness: number;
  nervousnessIndex: number;
  symmetryPct: number;
}

export interface SpeechStats {
  transcript: string;
  wordCount: number;
  wpm: number;
  totalFillers: number;
  fillerRate: number;
  fillers: { word: string; count: number }[];
  longestPauseSec: number;
}

export interface TimelinePoint {
  t: number;
  confidence: number;
  engagement: number;
  leadership: number;
  communication: number;
  eyeContact: number;
  posture: number;
  gestures: number;
  voice: number;
  expression: number;
}

export interface Insight {
  icon: string;
  title: string;
  detail: string;
}

export interface CoachingAction {
  title: string;
  why: string;
  drill: string;
  target: string;
}

export interface ReportData {
  overall: number;
  grade: string;
  gradeLabel: string;
  summary: string;
  pillars: PillarScores;
  voice: VoiceStats;
  face: FaceStats;
  pose: PoseStats;
  gesture: GestureStats;
  speech: SpeechStats;
  emotions: Record<EmotionLabel, number>;
  dominantEmotion: EmotionLabel;
  timeline: TimelinePoint[];
  strengths: Insight[];
  improvements: Insight[];
  plan: CoachingAction[];
  benchmark: { metric: string; you: number; average: number }[];
  /** Which rubric the numbers were scored against. Missing on pre-rubric records. */
  rubric?: RubricInfo;
}

/** Recognisable name of the coaching rubric a report was scored against. */
export interface RubricInfo {
  mode: SessionMode;
  label: string;
  summary: string;
}

export interface SessionRecord {
  id: string;
  createdAt: string;
  speaker: string;
  title: string;
  mode: SessionMode;
  durationSec: number;
  source: "live" | "demo";
  notes: string;
  report: ReportData;
  /** Account that created the session. Absent on sample and pre-account records. */
  ownerId?: string;
}

export interface SessionSummaryInput {
  speaker: string;
  title: string;
  mode: SessionMode;
  durationSec: number;
  notes?: string;
}

export interface LiveMetrics {
  confidence: number;
  engagement: number;
  leadership: number;
  communication: number;
  eyeContact: number;
  posture: number;
  gestures: number;
  voice: number;
  expression: number;
  gaze: number;
  yaw: number;
  pitch: number;
  db: number;
  energy: number;
  wpm: number;
  face: boolean;
  hands: number;
  emotion: EmotionLabel;
  speaking: boolean;
  postureLabel: string;
  gazeLabel: string;
  blinkRate: number;
  fillerCount: number;
  wordCount: number;
  elapsed: number;
}

export interface Nudge {
  id: string;
  kind: "eyes" | "posture" | "hands" | "voice" | "pace" | "fillers" | "expression" | "praise";
  message: string;
  severity: "info" | "warn" | "good";
  at: number;
}

export type EngineStatus = "idle" | "loading" | "ready" | "running" | "paused" | "error";
