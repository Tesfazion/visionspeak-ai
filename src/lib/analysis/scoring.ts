import { atTarget, clamp, clamp01, lowScore, sweetSpot, bandScore } from "@/lib/math";
import type { PillarScores, SessionMode } from "@/lib/types";

/**
 * VisionSpeak scoring model.
 *
 * Composite weights follow the product spec:
 *   Confidence  = 30% eye contact + 25% posture + 20% gestures + 15% voice + 10% expression
 * Engagement, Leadership Presence and Communication Effectiveness are derived on
 * top of the same five primitives so every number in the UI reconciles.
 *
 * Primitive scorers use a distance-from-target curve rather than wide plateaus:
 * 100 is reserved for genuinely optimal behaviour, so the report can separate
 * "good" from "excellent" instead of flattening everyone into the 90s.
 */

export interface Primitives {
  eyeContact: number;
  posture: number;
  gestures: number;
  voice: number;
  expression: number;
}

export interface CompositeExtras {
  /** 0-100 vocal energy relative to the speaker's own baseline. */
  energy: number;
  /** 0-100 purposeful body movement (some motion is good, jitter is not). */
  movement: number;
  /** 0-100 pitch/volume variation. */
  voiceVariation: number;
  /** 0-100 gesture activity. */
  gestureActivity: number;
}

export const WEIGHTS = {
  confidence: { eyeContact: 0.3, posture: 0.25, gestures: 0.2, voice: 0.15, expression: 0.1 },
  engagement: { energy: 0.3, movement: 0.2, eyeContact: 0.25, voiceVariation: 0.15, gestureActivity: 0.1 },
  leadership: { confidence: 0.35, eyeContact: 0.25, posture: 0.2, voice: 0.1, gestures: 0.1 },
  communication: { confidence: 0.3, engagement: 0.25, voice: 0.25, bodyLanguage: 0.2 },
} as const;

/* ------------------------------------------------------------------ *
 * Mode rubrics
 * ------------------------------------------------------------------ */

/**
 * A rubric re-targets the primitive scorers; it never changes the composite
 * weights above, because those are the product spec. What changes is what
 * "good" looks like for the situation: an interview rewards stillness and a
 * near-unbroken gaze, a stage presentation rewards reach and movement.
 */
export interface Rubric {
  mode: SessionMode;
  label: string;
  /** One-line description surfaced in the studio and on the report. */
  summary: string;
  eyeContact: { ideal: number; tolerance: number };
  gestureRate: { ideal: number; tolerance: number };
  smile: { ideal: number; tolerance: number };
  movement: { ideal: number; tolerance: number };
  pace: { ideal: number; tolerance: number };
}

export const RUBRICS: Record<SessionMode, Rubric> = {
  practice: {
    mode: "practice",
    label: "Practice",
    summary: "Baseline coaching — build the fundamentals with no audience pressure.",
    eyeContact: { ideal: 92, tolerance: 58 },
    gestureRate: { ideal: 16, tolerance: 18 },
    smile: { ideal: 30, tolerance: 25 },
    movement: { ideal: 14, tolerance: 32 },
    pace: { ideal: 150, tolerance: 65 },
  },
  presentation: {
    mode: "presentation",
    label: "Presentation",
    summary: "Stage delivery — reach, movement and projection that carry to the back row.",
    eyeContact: { ideal: 90, tolerance: 55 },
    gestureRate: { ideal: 19, tolerance: 20 },
    smile: { ideal: 32, tolerance: 26 },
    movement: { ideal: 17, tolerance: 30 },
    pace: { ideal: 152, tolerance: 68 },
  },
  interview: {
    mode: "interview",
    label: "Interview",
    summary: "On-camera answers — steady gaze, composed hands and a measured pace.",
    eyeContact: { ideal: 96, tolerance: 52 },
    gestureRate: { ideal: 10, tolerance: 16 },
    smile: { ideal: 38, tolerance: 28 },
    movement: { ideal: 9, tolerance: 26 },
    pace: { ideal: 142, tolerance: 60 },
  },
};

/** Falls back to the practice rubric for unknown or missing modes. */
export function rubricFor(mode?: SessionMode | null): Rubric {
  return (mode && RUBRICS[mode]) || RUBRICS.practice;
}

export function composite(p: Primitives, extras: CompositeExtras): PillarScores {
  const confidence = clamp(
    p.eyeContact * 0.3 + p.posture * 0.25 + p.gestures * 0.2 + p.voice * 0.15 + p.expression * 0.1,
  );
  const engagement = clamp(
    extras.energy * 0.3 +
      extras.movement * 0.2 +
      p.eyeContact * 0.25 +
      extras.voiceVariation * 0.15 +
      extras.gestureActivity * 0.1,
  );
  const leadership = clamp(
    confidence * 0.35 + p.eyeContact * 0.25 + p.posture * 0.2 + p.voice * 0.1 + p.gestures * 0.1,
  );
  const bodyLanguage = (p.posture + p.gestures) / 2;
  const communication = clamp(
    confidence * 0.3 + engagement * 0.25 + p.voice * 0.25 + bodyLanguage * 0.2,
  );

  return {
    eyeContact: Math.round(p.eyeContact),
    posture: Math.round(p.posture),
    gestures: Math.round(p.gestures),
    voice: Math.round(p.voice),
    expression: Math.round(p.expression),
    confidence: Math.round(confidence),
    engagement: Math.round(engagement),
    leadership: Math.round(leadership),
    communication: Math.round(communication),
  };
}

/* ------------------------------------------------------------------ *
 * Aggregate (end-of-session) scorers
 * ------------------------------------------------------------------ */

/**
 * Eye contact is measured as lens time, so the curve is deliberately generous:
 * anything above ~70% is genuinely strong. Blink rate is a strain signal and
 * carries a 20% penalty weight.
 */
export function scoreEyeContact(eyeContactPct: number, blinkRate: number, rubric: Rubric = RUBRICS.practice) {
  const lens = atTarget(eyeContactPct, rubric.eyeContact.ideal, rubric.eyeContact.tolerance);
  const blink = atTarget(blinkRate, 17, 26);
  return clamp(lens * 0.82 + blink * 0.18);
}

export function scorePosture(input: {
  avgShoulderSlopeDeg: number;
  avgLeanDeg: number;
  headOverShouldersPct: number;
  uprightPct: number;
  alignmentScore: number;
}) {
  return clamp(
    atTarget(input.avgShoulderSlopeDeg, 2, 14) * 0.28 +
      atTarget(input.avgLeanDeg, 3, 16) * 0.28 +
      atTarget(input.headOverShouldersPct, 95, 40) * 0.16 +
      atTarget(input.uprightPct, 92, 42) * 0.16 +
      atTarget(input.alignmentScore, 97, 30) * 0.12,
  );
}

export function scoreGestures(
  input: {
    gestureRatePerMin: number;
    handsVisiblePct: number;
    bothHandsPct: number;
    avgOpenness: number;
    nervousnessIndex: number;
  },
  rubric: Rubric = RUBRICS.practice,
) {
  return clamp(
    atTarget(input.gestureRatePerMin, rubric.gestureRate.ideal, rubric.gestureRate.tolerance) * 0.3 +
      atTarget(input.handsVisiblePct, 92, 55) * 0.22 +
      atTarget(input.avgOpenness, 1.55, 0.85) * 0.18 +
      atTarget(input.nervousnessIndex, 8, 55) * 0.18 +
      atTarget(input.bothHandsPct, 70, 60) * 0.12,
  );
}

export function scoreVoice(input: {
  volumeConsistency: number;
  energy: number;
  pitchVariation: number;
  speakingTimePct: number;
  fillerPer100: number;
}) {
  return clamp(
    atTarget(input.volumeConsistency, 95, 45) * 0.26 +
      atTarget(input.energy, 68, 50) * 0.24 +
      atTarget(input.pitchVariation, 9, 11) * 0.2 +
      atTarget(input.speakingTimePct, 78, 45) * 0.16 +
      atTarget(input.fillerPer100, 0.8, 7) * 0.14,
  );
}

export function scoreExpression(
  input: { smilePct: number; variety: number; tension: number },
  rubric: Rubric = RUBRICS.practice,
) {
  return clamp(
    atTarget(input.smilePct, rubric.smile.ideal, rubric.smile.tolerance) * 0.38 +
      atTarget(input.variety, 55, 45) * 0.34 +
      atTarget(input.tension, 6, 40) * 0.28,
  );
}

/** Movement quality: purposeful motion is engaging, constant jitter is not. */
export function scoreMovement(swayIndex: number, rubric: Rubric = RUBRICS.practice) {
  return atTarget(swayIndex, rubric.movement.ideal, rubric.movement.tolerance);
}

export function scoreVocalEnergy(energy: number) {
  return atTarget(energy, 70, 55);
}

export function scorePitchVariation(pitchVariation: number) {
  return atTarget(pitchVariation, 9, 11);
}

export function scoreGestureActivity(ratePerMin: number, rubric: Rubric = RUBRICS.practice) {
  return atTarget(ratePerMin, rubric.gestureRate.ideal, rubric.gestureRate.tolerance);
}

export function scorePace(wpm: number, rubric: Rubric = RUBRICS.practice) {
  return atTarget(wpm, rubric.pace.ideal, rubric.pace.tolerance);
}

/* ------------------------------------------------------------------ *
 * Ratings
 * ------------------------------------------------------------------ */

export const RATINGS: { min: number; grade: string; label: string; blurb: string }[] = [
  {
    min: 90,
    grade: "A+",
    label: "Exceptional Speaker",
    blurb: "Commanding, warm and precise — this is presentation-level delivery.",
  },
  {
    min: 82,
    grade: "A",
    label: "Excellent Speaker",
    blurb: "Polished and credible. A few refinements would make it unforgettable.",
  },
  {
    min: 72,
    grade: "B+",
    label: "Strong Communicator",
    blurb: "Clear presence, with a couple of habits still siphoning authority.",
  },
  {
    min: 62,
    grade: "B",
    label: "Capable Presenter",
    blurb: "The message lands; delivery needs consistency to match the content.",
  },
  {
    min: 50,
    grade: "C",
    label: "Emerging Speaker",
    blurb: "Real potential — the fundamentals need deliberate repetition.",
  },
  {
    min: 38,
    grade: "D",
    label: "Developing",
    blurb: "Delivery is working against the message. Start with posture and gaze.",
  },
  {
    min: 0,
    grade: "E",
    label: "Foundation Stage",
    blurb: "Everything to gain. Build the base one habit at a time.",
  },
];

export function ratingFor(score: number) {
  return RATINGS.find((r) => score >= r.min) ?? RATINGS[RATINGS.length - 1];
}

/** Human benchmarks used for the "you vs. the room" comparison bars. */
export function benchmarkFor(pillars: PillarScores) {
  return [
    { metric: "Eye contact", you: pillars.eyeContact, average: 54 },
    { metric: "Posture", you: pillars.posture, average: 61 },
    { metric: "Gestures", you: pillars.gestures, average: 49 },
    { metric: "Vocal delivery", you: pillars.voice, average: 58 },
    { metric: "Expression", you: pillars.expression, average: 52 },
    { metric: "Engagement", you: pillars.engagement, average: 56 },
  ];
}

export const clampScore = (v: number) => clamp(Math.round(v));
export const normalise = (v: number) => Math.round(clamp01(v / 100) * 100);

/** Exposed for the calibration script and the landing-page sample. */
export const scoringHelpers = { atTarget, lowScore, sweetSpot, bandScore };
