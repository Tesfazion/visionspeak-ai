export const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const round = (v: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

export const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

export const std = (arr: number[]) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / (arr.length - 1));
};

export const percentile = (arr: number[], p: number) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = clamp01(p) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : lerp(sorted[lo], sorted[hi], idx - lo);
};

/** Exponential moving average with a time-aware coefficient. */
export const ema = (prev: number, next: number, alpha: number) => prev + (next - prev) * clamp01(alpha);

/**
 * Maps a value onto 0..100 with a plateau between `good` and `goodMax`.
 * Below `bad` scores 0, above `badMax` scores 100, linear in between.
 */
export function bandScore(value: number, bad: number, badMax: number, good: number, goodMax: number) {
  if (value <= bad) return 0;
  if (value < badMax) return (100 * (value - bad)) / Math.max(1e-6, badMax - bad);
  if (value <= good) return 100;
  if (value < goodMax) return 100 - (100 * (value - good)) / Math.max(1e-6, goodMax - good);
  return 0;
}

/**
 * Distance-from-target score: 100 at `ideal`, decaying smoothly toward 0 as the
 * value moves away. Used instead of wide plateaus so a 60s sample can actually
 * discriminate between "good" and "excellent" delivery.
 */
export function atTarget(value: number, ideal: number, tolerance: number) {
  const d = Math.abs(value - ideal) / Math.max(1e-6, tolerance);
  return clamp(100 - Math.pow(d, 1.4) * 100);
}

/**
 * For metrics where *lower* is better: 100 while `<= ideal`, decaying to 0
 * once the value reaches `ideal + tolerance`.
 */
export function lowScore(value: number, ideal: number, tolerance: number) {
  if (value <= ideal) return 100;
  return clamp(100 - ((value - ideal) / Math.max(1e-6, tolerance)) * 100);
}

/** Score that peaks in a comfortable range and decays gently outside it. */
export function sweetSpot(value: number, min: number, max: number, tolerance: number) {
  if (value >= min && value <= max) return 100;
  const d = value < min ? min - value : value - max;
  return clamp(100 - (d / Math.max(1e-6, tolerance)) * 100);
}

export const deg = (rad: number) => (rad * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;

export function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
