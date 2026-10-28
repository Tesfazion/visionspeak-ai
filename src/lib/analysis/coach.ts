import type { Nudge, SessionMode } from "@/lib/types";

export interface CoachContext {
  now: number;
  elapsed: number;
  faceVisible: boolean;
  eyeEngaged: boolean;
  eyesAwayMs: number;
  eyeContactPct: number;
  blinkRate: number;
  posture: number;
  lean: number;
  slope: number;
  hands: number;
  handsHiddenMs: number;
  nervousness: number;
  db: number;
  speaking: boolean;
  wpm: number;
  fillersRecent: number;
  smilePct: number;
}

type Rule = {
  id: string;
  cooldownMs: number;
  test: (c: CoachContext) => boolean;
  build: (c: CoachContext) => Nudge;
};

/**
 * Live-coaching thresholds per mode. The rules are the same behaviour checks in
 * every mode — only what counts as "late" or "low" changes, because a stage
 * presentation tolerates a broader pace and more movement than an interview.
 */
interface Tuning {
  eyesAwayMs: number;
  eyeContactFloor: number;
  fillerLimit: number;
  paceMax: number;
  paceMin: number;
  smileFloor: number;
  projectDb: number;
  handsHiddenMs: number;
  copy: {
    eyesAway: string;
    eyeContactLow: string;
    fillers: string;
    project: string;
    paceFast: string;
    smile: string;
    handsHidden: string;
  };
}

const TUNING: Record<SessionMode, Tuning> = {
  practice: {
    eyesAwayMs: 2600,
    eyeContactFloor: 45,
    fillerLimit: 3,
    paceMax: 188,
    paceMin: 92,
    smileFloor: 6,
    projectDb: -40,
    handsHiddenMs: 11000,
    copy: {
      eyesAway: "Eyes off the lens — bring them back to the room.",
      eyeContactLow: "Eye contact is under 45%. Pick real points and hold each for a breath.",
      fillers: "Filler words are clustering. Swap them for a silent beat.",
      project: "Volume is dropping. Project from the diaphragm, not the throat.",
      paceFast: "Pace is quick. Land your key phrases with a half-second pause.",
      smile: "Let your face join the message — warmth reads as confidence.",
      handsHidden: "Hands are out of frame — bring them in to support the point.",
    },
  },
  presentation: {
    eyesAwayMs: 2400,
    eyeContactFloor: 45,
    fillerLimit: 3,
    paceMax: 185,
    paceMin: 95,
    smileFloor: 6,
    projectDb: -38,
    handsHiddenMs: 10000,
    copy: {
      eyesAway: "Eyes off the lens — sweep the room, then come back to a face.",
      eyeContactLow: "Eye contact is under 45%. Hold one person for a full sentence before moving on.",
      fillers: "Filler words are clustering. Swap them for a silent beat.",
      project: "Project to the back row — this room is bigger than it feels.",
      paceFast: "Pace is quick. Land your key phrase, then let the room catch up.",
      smile: "Let your face join the message — the back row needs to read it.",
      handsHidden: "Hands are out of frame — open them toward the audience.",
    },
  },
  interview: {
    eyesAwayMs: 2000,
    eyeContactFloor: 55,
    fillerLimit: 2,
    paceMax: 172,
    paceMin: 100,
    smileFloor: 8,
    projectDb: -42,
    handsHiddenMs: 9000,
    copy: {
      eyesAway: "Eyes off the lens — the camera is the interviewer's face.",
      eyeContactLow: "Eye contact is under 55%. Answer to the lens, not to your notes.",
      fillers: "Fillers are clustering. Pause, breathe, then start the answer cleanly.",
      project: "Speak up slightly — interview audio is judged on clarity.",
      paceFast: "Slow down. A measured answer reads as considered, not rehearsed.",
      smile: "Add a little warmth — composure plus warmth reads as senior.",
      handsHidden: "Keep your hands in frame — they carry the answer.",
    },
  },
};

let seq = 0;
const nudge = (
  kind: Nudge["kind"],
  severity: Nudge["severity"],
  message: string,
  now: number,
): Nudge => ({ id: `${kind}-${seq++}`, kind, severity, message, at: now });

function rulesFor(mode: SessionMode): Rule[] {
  const t = TUNING[mode];

  const rules: Rule[] = [
    {
      id: "eyes-away",
      cooldownMs: mode === "interview" ? 15000 : 20000,
      test: (c) => c.faceVisible && !c.eyeEngaged && c.eyesAwayMs > t.eyesAwayMs,
      build: (c) => nudge("eyes", "warn", t.copy.eyesAway, c.now),
    },
    {
      id: "eye-contact-low",
      cooldownMs: 35000,
      test: (c) => c.elapsed > 35 && c.eyeContactPct < t.eyeContactFloor,
      build: (c) => nudge("eyes", "info", t.copy.eyeContactLow, c.now),
    },
    {
      id: "praise-eyes",
      cooldownMs: 45000,
      test: (c) => c.elapsed > 20 && c.eyeContactPct > 85 && c.eyeEngaged,
      build: (c) =>
        nudge(
          "praise",
          "good",
          mode === "interview" ? "Gaze is steady on the lens — exactly what an interviewer reads as confidence." : "Eye contact locked in — you own the room.",
          c.now,
        ),
    },
    {
      id: "blink",
      cooldownMs: 45000,
      test: (c) => c.blinkRate > 34,
      build: (c) => nudge("eyes", "info", "Blink rate is high — relax your eyes and breathe out slowly.", c.now),
    },
    {
      id: "lean",
      cooldownMs: 25000,
      test: (c) => c.faceVisible && c.lean > 13,
      build: (c) => nudge("posture", "warn", "You're leaning. Stack your ribs over your hips.", c.now),
    },
    {
      id: "slope",
      cooldownMs: 35000,
      test: (c) => c.faceVisible && c.slope > 9,
      build: (c) => nudge("posture", "info", "Shoulders are uneven — level them and widen your stance.", c.now),
    },
    {
      id: "praise-posture",
      cooldownMs: 60000,
      test: (c) => c.posture > 88,
      build: (c) => nudge("praise", "good", "Posture is grounded and authoritative.", c.now),
    },
    {
      id: "hands-hidden",
      cooldownMs: 22000,
      test: (c) => c.handsHiddenMs > t.handsHiddenMs,
      build: (c) => nudge("hands", "warn", t.copy.handsHidden, c.now),
    },
    {
      id: "hands-chaos",
      cooldownMs: 35000,
      test: (c) => c.nervousness > (mode === "interview" ? 45 : 58),
      build: (c) =>
        nudge(
          "hands",
          "info",
          mode === "interview" ? "Hands are busy. Rest them between points — stillness reads as composure." : "Hands are moving fast. Slow them: one gesture, one idea.",
          c.now,
        ),
    },
    {
      id: "project",
      cooldownMs: 25000,
      test: (c) => c.speaking && c.db < t.projectDb,
      build: (c) => nudge("voice", "warn", t.copy.project, c.now),
    },
    {
      id: "pace-fast",
      cooldownMs: 30000,
      test: (c) => c.speaking && c.wpm > t.paceMax,
      build: (c) => nudge("pace", "info", t.copy.paceFast, c.now),
    },
    {
      id: "pace-slow",
      cooldownMs: 30000,
      test: (c) => c.speaking && c.wpm > 0 && c.wpm < t.paceMin,
      build: (c) =>
        nudge(
          "pace",
          "info",
          mode === "interview" ? "Add a little momentum — keep the answer moving forward." : "Add momentum — your ideas need more forward drive.",
          c.now,
        ),
    },
    {
      id: "fillers",
      cooldownMs: 28000,
      test: (c) => c.fillersRecent >= t.fillerLimit,
      build: (c) => nudge("fillers", "info", t.copy.fillers, c.now),
    },
    {
      id: "expression",
      cooldownMs: 60000,
      test: (c) => c.elapsed > 60 && c.faceVisible && c.smilePct < t.smileFloor,
      build: (c) => nudge("expression", "info", t.copy.smile, c.now),
    },
  ];

  if (mode === "interview") {
    rules.push({
      id: "praise-composure",
      cooldownMs: 75000,
      test: (c) => c.elapsed > 45 && c.posture > 88 && c.nervousness < 14,
      build: (c) => nudge("praise", "good", "Composed hands and grounded posture — that reads as senior.", c.now),
    });
  }

  if (mode === "presentation") {
    rules.push({
      id: "praise-presence",
      cooldownMs: 75000,
      test: (c) => c.elapsed > 30 && c.eyeContactPct > 80 && c.posture > 85,
      build: (c) => nudge("praise", "good", "Strong presence — gaze and stance are holding the room.", c.now),
    });
    rules.push({
      id: "praise-projection",
      cooldownMs: 60000,
      test: (c) => c.speaking && c.db > -26,
      build: (c) => nudge("praise", "good", "Voice is filling the room — keep that projection.", c.now),
    });
  }

  return rules;
}

/**
 * Stateful coach: applies cooldowns so the same advice never spams the feed,
 * and only surfaces one nudge per evaluation to keep attention on delivery.
 */
export function createCoach(mode: SessionMode = "practice") {
  const rules = rulesFor(mode);
  const lastFired = new Map<string, number>();
  return {
    evaluate(ctx: CoachContext): Nudge[] {
      const eligible = rules.filter((r) => {
        const last = lastFired.get(r.id) ?? 0;
        if (ctx.now - last < r.cooldownMs) return false;
        return r.test(ctx);
      });
      if (!eligible.length) return [];
      // Prefer warnings over praise/info when several fire at once.
      const rank = { warn: 0, good: 1, info: 2 } as const;
      eligible.sort((a, b) => rank[a.build(ctx).severity] - rank[b.build(ctx).severity]);
      const chosen = eligible[0];
      lastFired.set(chosen.id, ctx.now);
      return [chosen.build(ctx)];
    },
    reset() {
      lastFired.clear();
    },
  };
}

export type Coach = ReturnType<typeof createCoach>;
