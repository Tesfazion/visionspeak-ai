import type { Landmark } from "./landmarks";
import { EYES, HAND_CONNECTIONS, POSE_CONNECTIONS } from "./landmarks";

export interface OverlayFrame {
  face?: Landmark[];
  pose?: Landmark[];
  hands: Landmark[][];
  engaged: boolean;
  yaw: number;
  pitch: number;
  faceVisible: boolean;
  handsVisible: number;
  analyzing: boolean;
}

const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150,
  136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

const V = {
  face: "rgba(167,139,250,0.55)",
  faceDim: "rgba(167,139,250,0.22)",
  engaged: "rgba(52,211,153,0.95)",
  disengaged: "rgba(251,113,133,0.9)",
  pose: "rgba(52,211,153,0.72)",
  hand: "rgba(34,211,238,0.8)",
  bracket: "rgba(255,255,255,0.32)",
};

/**
 * Draws the analysis overlay on top of the mirrored video.
 *
 * The stage uses `object-fit: cover`, so normalized landmarks are mapped
 * through the same crop the browser applies — the mesh always stays glued to
 * the face regardless of camera aspect ratio.
 */
export function drawOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement, frame: OverlayFrame) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const stageW = canvas.clientWidth;
  const stageH = canvas.clientHeight;
  if (!stageW || !stageH) return;

  if (canvas.width !== Math.round(stageW * dpr) || canvas.height !== Math.round(stageH * dpr)) {
    canvas.width = Math.round(stageW * dpr);
    canvas.height = Math.round(stageH * dpr);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, stageW, stageH);

  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const scale = Math.max(stageW / vw, stageH / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const ox = (stageW - dw) / 2;
  const oy = (stageH - dh) / 2;

  // Mirror horizontally to match the flipped preview.
  const px = (x: number) => ox + (1 - x) * dw;
  const py = (y: number) => oy + y * dh;

  const line = (a: Landmark, b: Landmark, color: string, width: number) => {
    ctx.beginPath();
    ctx.moveTo(px(a.x), py(a.y));
    ctx.lineTo(px(b.x), py(b.y));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.stroke();
  };

  const dot = (p: Landmark, color: string, r: number) => {
    ctx.beginPath();
    ctx.arc(px(p.x), py(p.y), r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };

  // ---- Pose skeleton -------------------------------------------------
  if (frame.pose && frame.pose.length > 24) {
    for (const [a, b] of POSE_CONNECTIONS) {
      const p1 = frame.pose[a];
      const p2 = frame.pose[b];
      if (!p1 || !p2) continue;
      const vis = Math.min(p1.visibility ?? 1, p2.visibility ?? 1);
      if (vis < 0.35) continue;
      line(p1, p2, `rgba(52,211,153,${0.18 + vis * 0.5})`, 2.2);
    }
    for (const idx of [11, 12, 13, 14, 15, 16, 23, 24, 0]) {
      const p = frame.pose[idx];
      if (p && (p.visibility ?? 1) > 0.4) dot(p, "rgba(52,211,153,0.9)", 2.6);
    }
  }

  // ---- Hands ---------------------------------------------------------
  for (const hand of frame.hands) {
    for (const [a, b] of HAND_CONNECTIONS) {
      const p1 = hand[a];
      const p2 = hand[b];
      if (p1 && p2) line(p1, p2, "rgba(34,211,238,0.55)", 1.8);
    }
    for (const p of hand) dot(p, V.hand, 1.9);
  }

  // ---- Face ----------------------------------------------------------
  if (frame.face && frame.face.length > 400) {
    const face = frame.face;
    const accent = frame.engaged ? V.engaged : V.disengaged;

    // Sparse mesh: enough to read as "tracked", cheap enough for 30fps.
    for (let i = 0; i < 468; i += 6) dot(face[i], V.faceDim, 1.1);

    ctx.beginPath();
    FACE_OVAL.forEach((idx, i) => {
      const p = face[idx];
      if (!p) return;
      const x = px(p.x);
      const y = py(p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = V.face;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Eye rings — mint when the speaker is on the lens, rose when drifting.
    for (const eye of [EYES.a, EYES.b] as const) {
      const outer = face[eye.outer];
      const inner = face[eye.inner];
      const upper = face[eye.upper];
      const lower = face[eye.lower];
      if (!outer || !inner || !upper || !lower) continue;
      const cx = px((outer.x + inner.x) / 2);
      const cy = py((outer.y + inner.y) / 2);
      const rx = Math.abs(px(outer.x) - px(inner.x)) * 0.78;
      const ry = Math.abs(py(lower.y) - py(upper.y)) * 0.95 + 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 3), Math.max(ry, 2), 0, 0, Math.PI * 2);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // Mouth line gives the face a readable expression in the preview.
    const mL = face[61];
    const mR = face[291];
    const mTop = face[13];
    const mBot = face[14];
    if (mL && mR && mTop && mBot) {
      ctx.beginPath();
      ctx.moveTo(px(mL.x), py(mL.y));
      ctx.quadraticCurveTo(px(mTop.x), py(mTop.y), px(mR.x), py(mR.y));
      ctx.quadraticCurveTo(px(mBot.x), py(mBot.y), px(mL.x), py(mL.y));
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  // ---- HUD (not mirrored) -------------------------------------------
  if (frame.analyzing) {
    const cx = stageW / 2;
    const cy = stageH * 0.46;
    const w = stageW * 0.2;
    const h = stageH * 0.34;
    const len = 18;
    ctx.strokeStyle = frame.engaged ? "rgba(52,211,153,0.55)" : V.bracket;
    ctx.lineWidth = 1.5;
    const corners: [number, number, number, number][] = [
      [cx - w, cy - h, 1, 1],
      [cx + w, cy - h, -1, 1],
      [cx - w, cy + h, 1, -1],
      [cx + w, cy + h, -1, -1],
    ];
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + len * sx, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + len * sy);
      ctx.stroke();
    }

    ctx.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.textBaseline = "bottom";
    ctx.fillText(`YAW ${frame.yaw.toFixed(0)}°  PITCH ${frame.pitch.toFixed(0)}°`, 14, stageH - 14);
    ctx.textAlign = "right";
    ctx.fillText(`${frame.handsVisible} HAND${frame.handsVisible === 1 ? "" : "S"}`, stageW - 14, stageH - 14);
    ctx.textAlign = "left";
  }
}
