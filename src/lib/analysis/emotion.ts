import type { EmotionLabel } from "@/lib/types";
import { EMOTIONS } from "@/lib/types";
import { clamp, clamp01 } from "@/lib/math";

type BlendshapeCategory = { categoryName: string; score: number };

export type BlendshapeMap = Record<string, number>;

export function toBlendshapeMap(categories: BlendshapeCategory[] | undefined | null): BlendshapeMap {
  const out: BlendshapeMap = {};
  if (!categories) return out;
  for (const c of categories) out[c.categoryName] = c.score;
  return out;
}

const get = (m: BlendshapeMap, key: string) => m[key] ?? 0;
const two = (m: BlendshapeMap, a: string, b: string) => (get(m, a) + get(m, b)) / 2;

/**
 * Emotion inference from the 52 ARKit-style blendshapes produced by
 * MediaPipe Face Landmarker. This is the same signal set DeepFace/FER models
 * use (action units → emotion), computed on-device with zero upload.
 */
export function emotionFromBlendshapes(m: BlendshapeMap): Record<EmotionLabel, number> {
  const smile = two(m, "mouthSmileLeft", "mouthSmileRight");
  const frown = two(m, "mouthFrownLeft", "mouthFrownRight");
  const browDown = two(m, "browDownLeft", "browDownRight");
  const browInnerUp = get(m, "browInnerUp");
  const browOuterUp = two(m, "browOuterUpLeft", "browOuterUpRight");
  const eyeWide = two(m, "eyeWideLeft", "eyeWideRight");
  const eyeSquint = two(m, "eyeSquintLeft", "eyeSquintRight");
  const jawOpen = get(m, "jawOpen");
  const noseSneer = two(m, "noseSneerLeft", "noseSneerRight");
  const mouthPress = two(m, "mouthPressLeft", "mouthPressRight");

  const raw: Record<EmotionLabel, number> = {
    happy: 0.95 * smile + 0.22 * eyeSquint * (1 - jawOpen * 0.6),
    surprise: 0.52 * jawOpen + 0.48 * browOuterUp + 0.2 * eyeWide,
    sad: 0.72 * frown + 0.34 * browInnerUp * (1 - smile),
    angry: 0.68 * browDown + 0.34 * noseSneer + 0.3 * mouthPress,
    fear: 0.42 * browInnerUp + 0.38 * eyeWide + 0.22 * jawOpen,
    neutral: 0.34,
  };

  const total = EMOTIONS.reduce((acc, k) => acc + raw[k], 0) || 1;
  const out = {} as Record<EmotionLabel, number>;
  for (const k of EMOTIONS) out[k] = Math.round((raw[k] / total) * 1000) / 10;
  return out;
}

export function dominantEmotion(dist: Record<EmotionLabel, number>): EmotionLabel {
  let best: EmotionLabel = "neutral";
  let bestScore = -1;
  for (const k of EMOTIONS) {
    if (dist[k] > bestScore) {
      bestScore = dist[k];
      best = k;
    }
  }
  return best;
}

/** 0..1 scalar for how much the face is doing — drives "expression variety". */
export function expressiveness(m: BlendshapeMap) {
  const smile = two(m, "mouthSmileLeft", "mouthSmileRight");
  const frown = two(m, "mouthFrownLeft", "mouthFrownRight");
  const brow = two(m, "browInnerUp", "browOuterUpLeft") + get(m, "browOuterUpRight");
  return clamp01(smile * 1.1 + frown * 0.8 + brow * 0.7 + get(m, "jawOpen") * 0.6);
}

export function smileScore(m: BlendshapeMap) {
  return clamp(two(m, "mouthSmileLeft", "mouthSmileRight") * 100);
}

/** Facial tension: furrowed brows + pressed lips read as strain on camera. */
export function tensionScore(m: BlendshapeMap) {
  const browDown = two(m, "browDownLeft", "browDownRight");
  const press = two(m, "mouthPressLeft", "mouthPressRight");
  const squint = two(m, "eyeSquintLeft", "eyeSquintRight");
  return clamp((browDown * 0.5 + press * 0.3 + squint * 0.2) * 100);
}

export const EMOTION_META: Record<EmotionLabel, { label: string; color: string; emoji: string }> = {
  neutral: { label: "Neutral", color: "#8b8ba4", emoji: "•" },
  happy: { label: "Warm", color: "#34d399", emoji: "◡" },
  surprise: { label: "Surprised", color: "#fbbf24", emoji: "!" },
  sad: { label: "Concerned", color: "#60a5fa", emoji: "︵" },
  angry: { label: "Tense", color: "#fb7185", emoji: "︿" },
  fear: { label: "Anxious", color: "#c084fc", emoji: "◦" },
};
