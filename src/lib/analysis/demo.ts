import type { SessionAggregate } from "./engine";
import { buildReport } from "./report";
import type { FrameSample, SessionRecord } from "@/lib/types";
import { clamp } from "@/lib/math";

/** Deterministic PRNG so the sample report looks identical on every machine. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TRANSCRIPT = `Good morning everyone, and thank you for making the time today.
When I joined this team eighteen months ago, the question I heard most often was
a simple one: where are we actually going? Not what are we shipping next quarter,
but where are we going. Um, so today I want to answer that directly.
We are moving from a company that reacts to a company that anticipates.
That shift is, like, the whole strategy in one sentence.
Over the next two quarters we will invest in three places. First, the platform
work that lets us see demand before it arrives. Second, the team that turns those
signals into decisions. And third, the discipline to say no to everything else.
You know, saying no is the part we have historically struggled with.
Every request feels urgent. Every customer feels important, and they are.
But focus is not a lack of care, it is a form of respect for the work that matters most.
So here is the commitment I am making to you. We will publish the priorities,
we will protect the time, and we will measure the outcomes honestly.
If we get this right, next year we will not be asking where we are going.
We will be asking whether we can move faster. Thank you.`;

function buildTimeline(duration: number, seed: number): FrameSample[] {
  const rand = mulberry32(seed);
  const points: FrameSample[] = [];
  const state = { confidence: 78, engagement: 82, leadership: 79, eye: 80, posture: 88, gestures: 70, voice: 79, expression: 78 };

  for (let t = 0; t < duration; t++) {
    const progress = t / duration;
    // Everyone gets a wobble right after the opening; the recovery is the story.
    const dip = progress > 0.3 && progress < 0.44 ? -7 : 0;
    const warm = progress < 0.08 ? -5 : 0;
    const target = t < duration / 2 ? 82 : 88;

    const drift = (key: keyof typeof state, goal: number, k: number) => {
      state[key] += (rand() - 0.5) * k + (goal - state[key]) * 0.035;
      return state[key];
    };

    drift("confidence", target + dip + warm, 3.4);
    drift("engagement", target + 4 + dip, 4.2);
    drift("leadership", target + 1 + dip, 3.6);
    drift("eye", 88 + dip + warm, 5);
    drift("posture", 91 + dip * 0.4, 2.4);
    drift("gestures", 74 + dip * 0.7, 6);
    drift("voice", 82 + dip * 0.6, 4);
    drift("expression", 80 + dip * 0.5, 5);

    const emotions = ["neutral", "happy", "surprise"] as const;
    points.push({
      t,
      confidence: Math.round(clamp(state.confidence)),
      engagement: Math.round(clamp(state.engagement)),
      leadership: Math.round(clamp(state.leadership)),
      eyeContact: Math.round(clamp(state.eye)),
      posture: Math.round(clamp(state.posture)),
      gestures: Math.round(clamp(state.gestures)),
      voice: Math.round(clamp(state.voice)),
      expression: Math.round(clamp(state.expression)),
      communication: Math.round(clamp((state.confidence + state.voice + state.engagement) / 3)),
      gaze: Math.round(clamp(state.eye + (rand() - 0.5) * 8)),
      yaw: Math.round((rand() - 0.5) * 16),
      pitch: Math.round((rand() - 0.5) * 10),
      db: -26 + Math.round((rand() - 0.5) * 6),
      energy: Math.round(clamp(62 + (rand() - 0.5) * 18)),
      wpm: Math.round(150 + (rand() - 0.5) * 34),
      face: rand() > 0.03,
      hands: rand() > 0.32 ? 1 : 0,
      emotion: emotions[Math.floor(rand() * 3)],
      smiling: Math.round(rand() * 46),
    });
  }
  return points;
}

export function buildDemoAggregate(): SessionAggregate {
  const duration = 600;
  const words = 1180;
  return {
    durationSec: duration,
    analyzedFrames: 14_820,
    faceVisiblePct: 96.4,
    eyeContactPct: 79.5,
    gazeAwayCount: 9,
    avgGazeAwaySec: 1.4,
    blinkRatePerMin: 19,
    smilePct: 20,
    expressionVariety: 46,
    tension: 16,
    headStabilityPct: 85,
    avgShoulderSlopeDeg: 3.2,
    avgLeanDeg: 5.4,
    uprightPct: 80,
    headOverShouldersPct: 80,
    swayIndex: 12,
    alignmentScore: 94,
    gestureRatePerMin: 8,
    handsVisiblePct: 68,
    bothHandsPct: 40,
    openness: 1.3,
    nervousness: 26,
    voice: {
      speakingTimePct: 76,
      avgDb: -26.2,
      volumeConsistency: 68,
      pitchVariation: 4.8,
      pauseCount: 14,
      longPauseCount: 2,
      avgPauseSec: 0.9,
      energy: 64,
    },
    speech: {
      transcript: TRANSCRIPT.replace(/\s+/g, " ").trim(),
      words,
      fillers: [
        { word: "um", count: 6 },
        { word: "like", count: 4 },
        { word: "you know", count: 2 },
        { word: "right", count: 1 },
      ],
      totalFillers: 13,
      fillerEvents: [],
      supported: true,
    },
    wpm: Math.round(words / ((duration * 0.76) / 60)),
    paceSource: "transcript",
    emotions: { neutral: 44, happy: 26, surprise: 8, sad: 8, angry: 6, fear: 8 },
    timeline: buildTimeline(duration, 20261027),
  };
}

export function buildDemoSession(): SessionRecord {
  const aggregate = buildDemoAggregate();
  const mode = "presentation" as const;
  const report = buildReport(aggregate, mode);
  return {
    id: "demo",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    speaker: "Tesfatseyon",
    title: "Q4 Kickoff — Where We're Going",
    mode,
    durationSec: aggregate.durationSec,
    source: "demo",
    notes: "Sample report generated from a full behavioural analysis run.",
    report,
  };
}

/** Extra demo sessions so the dashboard has a trend to draw on first load. */
export function buildDemoHistory(): SessionRecord[] {
  const base = buildDemoSession();
  const variants: { id: string; title: string; daysAgo: number; mode: SessionRecord["mode"]; shift: number }[] = [
    { id: "demo-2", title: "Team Standup — Roadmap", daysAgo: 3, mode: "practice", shift: -7 },
    { id: "demo-3", title: "Investor Update Rehearsal", daysAgo: 6, mode: "presentation", shift: -13 },
    { id: "demo-4", title: "Interview: Product Lead", daysAgo: 11, mode: "interview", shift: -19 },
  ];

  return [
    base,
    ...variants.map((v) => {
      const aggregate = buildDemoAggregate();
      const shift = v.shift;
      aggregate.timeline = aggregate.timeline.map((p) => ({
        ...p,
        confidence: Math.round(clamp(p.confidence + shift)),
        engagement: Math.round(clamp(p.engagement + shift * 0.9)),
        leadership: Math.round(clamp(p.leadership + shift)),
        communication: Math.round(clamp(p.communication + shift)),
      }));
      aggregate.eyeContactPct = clamp(aggregate.eyeContactPct + shift * 0.8);
      aggregate.gestureRatePerMin = clamp(aggregate.gestureRatePerMin + shift * 0.2, 0, 40);
      aggregate.voice.pitchVariation = clamp(aggregate.voice.pitchVariation + shift * 0.09, 0, 20);
      aggregate.voice.volumeConsistency = clamp(aggregate.voice.volumeConsistency + shift * 0.7);
      aggregate.avgLeanDeg = clamp(aggregate.avgLeanDeg - shift * 0.15, 0, 30);
      const report = buildReport(aggregate, v.mode);
      return {
        ...base,
        id: v.id,
        title: v.title,
        mode: v.mode,
        durationSec: 300 + v.daysAgo * 20,
        createdAt: new Date(Date.now() - v.daysAgo * 24 * 60 * 60 * 1000).toISOString(),
        report,
      };
    }),
  ];
}
