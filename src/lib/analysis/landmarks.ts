/**
 * Geometric helpers for MediaPipe landmarks.
 *
 * MediaPipe returns normalized coordinates (0..1) in image space, with `y`
 * increasing downward. All helpers here are pure functions so they can be
 * unit-reasoned about and reused by both the live engine and the overlay.
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);

const mid = (a: Landmark, b: Landmark): Landmark => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
});

/** Projection of point p onto the segment a→b, expressed as 0..1. */
function segmentRatio(p: Landmark, a: Landmark, b: Landmark) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-9) return 0.5;
  return ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
}

/* ------------------------------------------------------------------ *
 * Face
 * ------------------------------------------------------------------ */

/** Can'tonical left-eye and right-eye landmark groups (image space). */
export const EYES = {
  a: { outer: 33, inner: 133, upper: 159, lower: 145 },
  b: { outer: 263, inner: 362, upper: 386, lower: 374 },
} as const;

export const IRIS_CANDIDATES = [468, 473];

export interface GazeReading {
  /** 0 = looking toward the outer corner, 1 = toward the inner corner. */
  horizontal: number;
  /** 0 = looking up, 1 = looking down. */
  vertical: number;
  /** 0..1 confidence that the eyes are engaged with the lens. */
  centered: number;
  ear: number;
  hasIris: boolean;
}

function irisForEye(lm: Landmark[], eye: { outer: number; inner: number }) {
  const outer = lm[eye.outer];
  const inner = lm[eye.inner];
  if (!outer || !inner) return null;
  const center = mid(outer, inner);
  let best: Landmark | null = null;
  let bestD = Infinity;
  for (const idx of IRIS_CANDIDATES) {
    const p = lm[idx];
    if (!p) continue;
    const d = dist(p, center);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  // Iris landmarks sit within the eye opening; anything further is a false match.
  return bestD < Math.abs(inner.x - outer.x) * 1.4 ? best : null;
}

export function readGaze(lm: Landmark[]): GazeReading {
  const readings: { h: number; v: number }[] = [];

  for (const eye of [EYES.a, EYES.b] as const) {
    const outer = lm[eye.outer];
    const inner = lm[eye.inner];
    const upper = lm[eye.upper];
    const lower = lm[eye.lower];
    if (!outer || !inner || !upper || !lower) continue;
    const iris = irisForEye(lm, eye);
    if (!iris) continue;
    const h = segmentRatio(iris, outer, inner);
    const v = segmentRatio(iris, upper, lower);
    readings.push({ h, v });
  }

  if (!readings.length) {
    // Iris refinement disabled — fall back to head-relative geometry only.
    return { horizontal: 0.5, vertical: 0.5, centered: 0, ear: eyeAspectRatio(lm), hasIris: false };
  }

  // Eye corner ordering flips between the two eyes, so normalize direction:
  // take the reading whose horizontal value is closest to the centre for both.
  const horizontal = avg(readings.map((r) => r.h));
  const vertical = avg(readings.map((r) => r.v));
  const hDev = Math.abs(horizontal - 0.5);
  const vDev = Math.abs(vertical - 0.5);
  const centered = Math.max(0, 1 - hDev / 0.3) * Math.max(0, 1 - vDev / 0.34);

  return { horizontal, vertical, centered, ear: eyeAspectRatio(lm), hasIris: true };
}

export function eyeAspectRatio(lm: Landmark[]) {
  const ratioFor = (eye: { outer: number; inner: number; upper: number; lower: number }) => {
    const o = lm[eye.outer];
    const i = lm[eye.inner];
    const u = lm[eye.upper];
    const l = lm[eye.lower];
    if (!o || !i || !u || !l) return 0;
    const width = dist(o, i);
    return width < 1e-6 ? 0 : dist(u, l) / width;
  };
  return avg([ratioFor(EYES.a), ratioFor(EYES.b)]);
}

/** Mouth width / face width — cheap fallback smile signal when blendshapes are off. */
export function mouthWidthRatio(lm: Landmark[]) {
  const left = lm[61];
  const right = lm[291];
  const cheekL = lm[234];
  const cheekR = lm[454];
  if (!left || !right || !cheekL || !cheekR) return 0;
  return dist(left, right) / Math.max(1e-6, dist(cheekL, cheekR));
}

/**
 * Yaw / pitch / roll in degrees from MediaPipe's facial transformation matrix.
 * `data` is a column-major 4×4 matrix.
 */
export function headPoseFromMatrix(data: number[] | undefined) {
  if (!data || data.length < 16) return { yaw: 0, pitch: 0, roll: 0, valid: false };
  // Columns of the rotation block: right (0-2), up (4-6), forward (8-10).
  const fx = data[8];
  const fy = data[9];
  const fz = data[10];
  const rx = data[0];
  const ry = data[1];

  const yaw = (Math.atan2(fx, fz) * 180) / Math.PI;
  const pitch = (-Math.asin(clampUnit(fy)) * 180) / Math.PI;
  const roll = (Math.atan2(ry, rx) * 180) / Math.PI;
  return { yaw, pitch, roll, valid: true };
}

/** Head yaw estimated from nose position when the matrix is unavailable. */
export function headYawFromGeometry(lm: Landmark[]) {
  const nose = lm[1];
  const left = lm[234];
  const right = lm[454];
  if (!nose || !left || !right) return 0;
  const width = Math.abs(right.x - left.x);
  if (width < 1e-6) return 0;
  const centre = (left.x + right.x) / 2;
  return ((nose.x - centre) / width) * 120;
}

const clampUnit = (v: number) => Math.min(1, Math.max(-1, v));

/* ------------------------------------------------------------------ *
 * Pose
 * ------------------------------------------------------------------ */

export const POSE = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
} as const;

export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [24, 26],
  [25, 27],
  [26, 28],
];

export interface PostureReading {
  shoulderSlopeDeg: number;
  leanDeg: number;
  headOffset: number;
  shoulderWidth: number;
  visible: boolean;
  shoulderMid: Landmark;
}

export function readPosture(lm: Landmark[]): PostureReading {
  const ls = lm[POSE.leftShoulder];
  const rs = lm[POSE.rightShoulder];
  const lh = lm[POSE.leftHip];
  const rh = lm[POSE.rightHip];
  const nose = lm[POSE.nose];

  const shoulderMid = ls && rs ? mid(ls, rs) : { x: 0.5, y: 0.5, z: 0 };
  if (!ls || !rs) {
    return {
      shoulderSlopeDeg: 0,
      leanDeg: 0,
      headOffset: 0,
      shoulderWidth: 0,
      visible: false,
      shoulderMid,
    };
  }

  const shoulderWidth = Math.max(1e-6, dist(ls, rs));
  const shoulderSlopeDeg = Math.abs((Math.atan2(rs.y - ls.y, rs.x - ls.x) * 180) / Math.PI);

  let leanDeg = 0;
  if (lh && rh) {
    const hipMid = mid(lh, rh);
    const dx = hipMid.x - shoulderMid.x;
    const dy = hipMid.y - shoulderMid.y;
    leanDeg = Math.abs((Math.atan2(dx, Math.max(1e-6, dy)) * 180) / Math.PI);
  }

  const headOffset = nose ? (nose.x - shoulderMid.x) / shoulderWidth : 0;

  return { shoulderSlopeDeg, leanDeg, headOffset, shoulderWidth, visible: true, shoulderMid };
}

/* ------------------------------------------------------------------ *
 * Hands
 * ------------------------------------------------------------------ */

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

const FINGERTIPS = [4, 8, 12, 16, 20];
const PALM = [0, 5, 9, 13, 17];

/**
 * Gesture openness: how far the fingertips sit from the palm centre,
 * scaled by hand size. ~0.7 = closed fist, ~1.6+ = open, expressive hand.
 */
export function handOpenness(lm: Landmark[]) {
  if (lm.length < 21) return 0;
  const palm = PALM.map((i) => lm[i]);
  const palmCentre = {
    x: avg(palm.map((p) => p.x)),
    y: avg(palm.map((p) => p.y)),
    z: 0,
  };
  const scale = Math.max(1e-6, dist(lm[0], lm[9]));
  const spread = avg(FINGERTIPS.map((i) => dist(lm[i], palmCentre)));
  return spread / scale;
}

export const handCentre = (lm: Landmark[]) =>
  lm.length ? { x: avg(lm.map((p) => p.x)), y: avg(lm.map((p) => p.y)), z: 0 } : { x: 0, y: 0, z: 0 };

export const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

export const distance = dist;
