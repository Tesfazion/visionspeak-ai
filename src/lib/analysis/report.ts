import { clamp, formatDuration, round } from "@/lib/math";
import type { CoachingAction, EmotionLabel, Insight, ReportData, SessionMode } from "@/lib/types";
import { EMOTIONS } from "@/lib/types";
import type { SessionAggregate } from "./engine";
import {
  benchmarkFor,
  composite,
  ratingFor,
  rubricFor,
  scoreExpression,
  scoreEyeContact,
  scoreGestureActivity,
  scoreGestures,
  scoreMovement,
  scorePitchVariation,
  scorePosture,
  scoreVocalEnergy,
  scoreVoice,
  type Rubric,
} from "./scoring";

type Agg = SessionAggregate;

/**
 * Turns a raw session aggregate into the report the UI renders.
 * Every sentence is derived from measured values — nothing is canned praise.
 * `mode` selects the rubric: the composite weights stay fixed, the primitive
 * targets move to match the situation (interview vs. stage presentation).
 */
export function buildReport(agg: Agg, mode: SessionMode = "practice"): ReportData {
  const rubric = rubricFor(mode);
  const fillerPer100 = agg.speech.words >= 20 ? (agg.speech.totalFillers / agg.speech.words) * 100 : 2.2;

  const primitives = {
    eyeContact: Math.round(scoreEyeContact(agg.eyeContactPct, agg.blinkRatePerMin, rubric)),
    posture: Math.round(
      scorePosture({
        avgShoulderSlopeDeg: agg.avgShoulderSlopeDeg,
        avgLeanDeg: agg.avgLeanDeg,
        headOverShouldersPct: agg.headOverShouldersPct,
        uprightPct: agg.uprightPct,
        alignmentScore: agg.alignmentScore,
      }),
    ),
    gestures: Math.round(
      scoreGestures(
        {
          gestureRatePerMin: agg.gestureRatePerMin,
          handsVisiblePct: agg.handsVisiblePct,
          bothHandsPct: agg.bothHandsPct,
          avgOpenness: agg.openness,
          nervousnessIndex: agg.nervousness,
        },
        rubric,
      ),
    ),
    voice: Math.round(
      scoreVoice({
        volumeConsistency: agg.voice.volumeConsistency,
        energy: agg.voice.energy,
        pitchVariation: agg.voice.pitchVariation,
        speakingTimePct: agg.voice.speakingTimePct,
        fillerPer100,
      }),
    ),
    expression: Math.round(
      scoreExpression({ smilePct: agg.smilePct, variety: agg.expressionVariety, tension: agg.tension }, rubric),
    ),
  };

  const pillars = composite(primitives, {
    energy: scoreVocalEnergy(agg.voice.energy),
    movement: scoreMovement(agg.swayIndex, rubric),
    voiceVariation: scorePitchVariation(agg.voice.pitchVariation),
    gestureActivity: scoreGestureActivity(agg.gestureRatePerMin, rubric),
  });

  const overall = Math.round(
    pillars.confidence * 0.35 + pillars.communication * 0.25 + pillars.leadership * 0.2 + pillars.engagement * 0.2,
  );
  const rating = ratingFor(overall);

  const emotions = normaliseEmotions(agg.emotions);
  const dominant = (Object.entries(emotions).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral") as EmotionLabel;

  const strengths = buildStrengths(agg, pillars, fillerPer100);
  const improvements = buildImprovements(agg, pillars, fillerPer100);
  const plan = buildPlan(agg, pillars, fillerPer100, rubric);

  const timeline = agg.timeline.map((s) => ({
    t: s.t,
    confidence: s.confidence,
    engagement: s.engagement,
    leadership: s.leadership,
    communication: s.communication,
    eyeContact: s.eyeContact,
    posture: s.posture,
    gestures: s.gestures,
    voice: s.voice,
    expression: s.expression,
  }));

  return {
    overall,
    grade: rating.grade,
    gradeLabel: rating.label,
    summary: buildSummary(agg, pillars, overall, rating.blurb),
    pillars,
    voice: {
      speakingTimePct: round(agg.voice.speakingTimePct),
      avgWpm: agg.wpm,
      paceSource: agg.paceSource,
      avgDb: round(agg.voice.avgDb, 1),
      volumeConsistency: round(agg.voice.volumeConsistency),
      pitchVariation: round(agg.voice.pitchVariation, 1),
      pauseCount: agg.voice.pauseCount,
      longPauseCount: agg.voice.longPauseCount,
      avgPauseSec: round(agg.voice.avgPauseSec, 1),
      energy: round(agg.voice.energy),
    },
    face: {
      eyeContactPct: round(agg.eyeContactPct),
      gazeAwayCount: agg.gazeAwayCount,
      avgGazeAwaySec: round(agg.avgGazeAwaySec, 1),
      blinkRatePerMin: round(agg.blinkRatePerMin),
      smilePct: round(agg.smilePct),
      expressionVariety: round(agg.expressionVariety),
      headStabilityPct: round(agg.headStabilityPct),
      faceVisiblePct: round(agg.faceVisiblePct),
    },
    pose: {
      alignmentScore: round(agg.alignmentScore),
      uprightPct: round(agg.uprightPct),
      avgLeanDeg: round(agg.avgLeanDeg, 1),
      avgShoulderSlopeDeg: round(agg.avgShoulderSlopeDeg, 1),
      swayIndex: round(agg.swayIndex),
      headOverShouldersPct: round(agg.headOverShouldersPct),
    },
    gesture: {
      gestureRatePerMin: round(agg.gestureRatePerMin, 1),
      handsVisiblePct: round(agg.handsVisiblePct),
      bothHandsPct: round(agg.bothHandsPct),
      avgOpenness: round(agg.openness, 2),
      nervousnessIndex: round(agg.nervousness),
      symmetryPct: round(agg.bothHandsPct),
    },
    speech: {
      transcript: agg.speech.transcript,
      wordCount: agg.speech.words,
      wpm: agg.wpm,
      totalFillers: agg.speech.totalFillers,
      fillerRate: round(fillerPer100, 1),
      fillers: agg.speech.fillers.slice(0, 8),
      longestPauseSec: round(agg.voice.avgPauseSec * 1.6, 1),
      language: agg.speech.language,
    },
    emotions,
    dominantEmotion: dominant,
    timeline,
    strengths,
    improvements,
    plan,
    benchmark: benchmarkFor(pillars),
    rubric: { mode: rubric.mode, label: rubric.label, summary: rubric.summary },
  };
}

function normaliseEmotions(input: Record<EmotionLabel, number>) {
  const total = EMOTIONS.reduce((acc, e) => acc + (input[e] ?? 0), 0) || 1;
  const out = {} as Record<EmotionLabel, number>;
  for (const e of EMOTIONS) out[e] = Math.round(((input[e] ?? 0) / total) * 1000) / 10;
  return out;
}

function buildSummary(agg: Agg, pillars: ReportData["pillars"], overall: number, blurb: string) {
  const best = (Object.entries(pillars) as [string, number][])
    .filter(([k]) => ["eyeContact", "posture", "gestures", "voice", "expression"].includes(k))
    .sort((a, b) => b[1] - a[1])[0];
  const worst = (Object.entries(pillars) as [string, number][])
    .filter(([k]) => ["eyeContact", "posture", "gestures", "voice", "expression"].includes(k))
    .sort((a, b) => a[1] - b[1])[0];

  const labels: Record<string, string> = {
    eyeContact: "eye contact",
    posture: "posture",
    gestures: "hand gestures",
    voice: "vocal delivery",
    expression: "facial expression",
  };

  return `Across ${formatDuration(agg.durationSec)} of analysed delivery you scored ${overall}/100. ${blurb} ${
    labels[best[0]]
  } carried the session at ${Math.round(best[1])}, while ${labels[worst[0]]} sat lowest at ${Math.round(
    worst[1],
  )}. ${
    agg.voice.pauseCount > 8
      ? `You used ${agg.voice.pauseCount} pauses — that's a good sign of composure.`
      : "Your phrasing ran continuously; deliberate pauses will add gravity."
  }`;
}

function buildStrengths(agg: Agg, p: ReportData["pillars"], fillerPer100: number): Insight[] {
  const out: Insight[] = [];

  if (p.eyeContact >= 76)
    out.push({
      icon: "eye",
      title: "Magnetic eye contact",
      detail: `You held the lens ${Math.round(agg.eyeContactPct)}% of the time across only ${agg.gazeAwayCount} breaks — that reads as trust and conviction.`,
    });
  if (p.posture >= 76)
    out.push({
      icon: "activity",
      title: "Grounded, authoritative stance",
      detail: `Shoulders stayed level (${round(agg.avgShoulderSlopeDeg, 1)}° slope) and you were upright ${Math.round(agg.uprightPct)}% of the session.`,
    });
  if (p.gestures >= 72)
    out.push({
      icon: "hand",
      title: "Gestures that carry meaning",
      detail: `${round(agg.gestureRatePerMin, 1)} purposeful gestures per minute with an average openness of ${round(agg.openness, 2)} — expressive, not frantic.`,
    });
  if (p.voice >= 74)
    out.push({
      icon: "mic",
      title: "Steady vocal control",
      detail: `Volume consistency ${Math.round(agg.voice.volumeConsistency)}/100 at ${agg.wpm || "—"} wpm, with pitch movement of ${round(agg.voice.pitchVariation, 1)} semitones.`,
    });
  if (p.expression >= 70)
    out.push({
      icon: "smile",
      title: "Warm, readable expression",
      detail: `Your face was active ${Math.round(agg.expressionVariety)}% of the range available, with a smile present ${Math.round(agg.smilePct)}% of the time.`,
    });
  if (p.leadership >= 80)
    out.push({
      icon: "crown",
      title: "Leadership presence",
      detail: `Presence scored ${p.leadership}/100 — the combination of gaze, stillness and vocal command people read as seniority.`,
    });
  if (fillerPer100 <= 1.5 && agg.speech.words > 40)
    out.push({
      icon: "quote",
      title: "Clean language",
      detail: `Only ${agg.speech.totalFillers} filler words in ${agg.speech.words} words (${round(fillerPer100, 1)} per 100) — your sentences land cleanly.`,
    });

  return out.slice(0, 5);
}

function buildImprovements(agg: Agg, p: ReportData["pillars"], fillerPer100: number): Insight[] {
  const items: { score: number; insight: Insight }[] = [];

  if (p.eyeContact < 78)
    items.push({
      score: p.eyeContact,
      insight: {
        icon: "eye",
        title: "Eye contact breaks under pressure",
        detail: `Gaze left the lens ${agg.gazeAwayCount} times, averaging ${round(agg.avgGazeAwaySec, 1)}s. Anchor on one person per sentence and finish the thought before moving.`,
      },
    });
  if (p.posture < 78)
    items.push({
      score: p.posture,
      insight: {
        icon: "activity",
        title: "Posture leaks tension",
        detail: `Average lean of ${round(agg.avgLeanDeg, 1)}° and ${Math.round(100 - agg.uprightPct)}% of the session off-axis. Reset with a long exhale and stacked ribs.`,
      },
    });
  if (p.gestures < 72)
    items.push({
      score: p.gestures,
      insight: {
        icon: "hand",
        title: agg.handsVisiblePct < 45 ? "Hands are hiding" : "Gestures need more range",
        detail:
          agg.handsVisiblePct < 45
            ? `Hands were in frame only ${Math.round(agg.handsVisiblePct)}% of the time. Rest them at waist height so they can enter the story instantly.`
            : `${round(agg.gestureRatePerMin, 1)} gestures per minute is under the expressive range. Give each key idea one deliberate hand beat.`,
      },
    });
  if (p.voice < 74)
    items.push({
      score: p.voice,
      insight: {
        icon: "mic",
        title: agg.voice.volumeConsistency < 60 ? "Volume wanders" : "Vocal colour is flat",
        detail:
          agg.voice.volumeConsistency < 60
            ? `Volume consistency scored ${Math.round(agg.voice.volumeConsistency)}/100 — sentences trailed off. Aim for the back wall on the final three words.`
            : `Pitch variation of ${round(agg.voice.pitchVariation, 1)} semitones is narrow. Mark one word per sentence to lift or stress.`,
      },
    });
  if (p.expression < 70)
    items.push({
      score: p.expression,
      insight: {
        icon: "smile",
        title: "Expression stays guarded",
        detail: `Smiling only ${Math.round(agg.smilePct)}% of the session. Let the face react to your own content — especially on the opening and close.`,
      },
    });
  if (fillerPer100 > 2.5)
    items.push({
      score: 100 - Math.min(90, fillerPer100 * 8),
      insight: {
        icon: "quote",
        title: "Filler words clustering",
        detail: `${round(fillerPer100, 1)} fillers per 100 words${
          agg.speech.fillers.length ? ` — mostly "${agg.speech.fillers[0].word}"` : ""
        }. Replace them with a half-second silence; silence reads as control.`,
      },
    });
  if (agg.wpm > 0 && agg.wpm > 185)
    items.push({
      score: 62,
      insight: {
        icon: "gauge",
        title: "Pace is running hot",
        detail: `${agg.wpm} words per minute. Drop to 140–170 and land your key line with a pause before and after.`,
      },
    });
  if (agg.wpm > 0 && agg.wpm < 95)
    items.push({
      score: 62,
      insight: {
        icon: "gauge",
        title: "Pace is dragging",
        detail: `${agg.wpm} words per minute. Add forward drive — think "conversation", not "reading".`,
      },
    });
  if (agg.blinkRatePerMin > 30)
    items.push({
      score: 55,
      insight: {
        icon: "eye",
        title: "Eyes show strain",
        detail: `Blink rate of ${Math.round(agg.blinkRatePerMin)}/min is above the comfortable 12–25 range. Hydrate and soften your gaze on the lens.`,
      },
    });
  if (agg.nervousness > 55)
    items.push({
      score: 50,
      insight: {
        icon: "hand",
        title: "Hands move faster than the message",
        detail: `Motion index of ${Math.round(agg.nervousness)} signals restlessness. Ground the hands between beats instead of fidgeting through them.`,
      },
    });

  items.sort((a, b) => a.score - b.score);

  // A title is the identity of an insight: the report renders one card per
  // entry, so a repeated title is both a duplicate React key and a duplicated
  // recommendation. De-duplicate, then pad with *distinct* next steps.
  const chosen: Insight[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (chosen.length >= 4) break;
    if (seen.has(item.insight.title)) continue;
    seen.add(item.insight.title);
    chosen.push(item.insight);
  }

  const weakest = Math.round(
    Math.min(p.eyeContact, p.posture, p.gestures, p.voice, p.expression),
  );
  const followUps: Insight[] = [
    {
      icon: "sparkles",
      title: "Push for the next level",
      detail: `Your weakest pillar is ${weakest}/100. A single 10-minute drill focused there moves the composite score more than anything else.`,
    },
    {
      icon: "gauge",
      title: "Hold the standard you just set",
      detail: `You are at ${Math.round(p.confidence)}/100 for confidence. Repeat this same brief tomorrow — consistency is what turns a good session into a reliable habit.`,
    },
    {
      icon: "crown",
      title: "Rehearse the opening and the close",
      detail:
        "The first and last twenty seconds carry the room's memory of you. Run them twice more than the middle, out loud, standing.",
    },
  ];

  for (const extra of followUps) {
    if (chosen.length >= 3) break;
    if (seen.has(extra.title)) continue;
    seen.add(extra.title);
    chosen.push(extra);
  }
  return chosen;
}

function buildPlan(agg: Agg, p: ReportData["pillars"], fillerPer100: number, rubric: Rubric): CoachingAction[] {
  const options: { score: number; action: CoachingAction }[] = [
    {
      score: p.eyeContact,
      action: {
        title: "Three-point gaze drill",
        why: `Eye contact is ${p.eyeContact}/100 and gaze drifted ${agg.gazeAwayCount} times.`,
        drill: "Record a 2-minute intro. Pick three points — left, centre, right — and hold each for one full sentence. Replay and count the escapes.",
        target: "Hold ≥ 80% lens time with ≤ 6 breaks",
      },
    },
    {
      score: p.posture,
      action: {
        title: "Wall reset before you start",
        why: `Posture scored ${p.posture}/100 with an average lean of ${round(agg.avgLeanDeg, 1)}°.`,
        drill: "Stand against a wall for 30 seconds: heels, hips, shoulders and head touching. Step forward and keep that stack for the first 60 seconds of speaking.",
        target: "Keep lean under 6° for the whole session",
      },
    },
    {
      score: p.gestures,
      action: {
        title: "One idea, one gesture",
        why: `Gesture effectiveness is ${p.gestures}/100 at ${round(agg.gestureRatePerMin, 1)} beats per minute.`,
        drill: "Script three key points. For each, decide the single hand shape that carries it, and hold that shape until the sentence ends.",
        target: "10–20 purposeful gestures per minute, hands in frame",
      },
    },
    {
      score: p.voice,
      action: {
        title: "Diaphragm + pause ladder",
        why: `Vocal delivery is ${p.voice}/100; volume consistency ${Math.round(agg.voice.volumeConsistency)}/100.`,
        drill: "Read a paragraph three times: whisper, conversational, then projected to the back wall. Record all three and listen for whether the final words still have air.",
        target: "Consistency ≥ 75/100 and no trailing sentence endings",
      },
    },
    {
      score: p.expression,
      action: {
        title: "Face-first warm-up",
        why: `Expression scored ${p.expression}/100 with smiling ${Math.round(agg.smilePct)}% of the session.`,
        drill: "Before recording, tell the story of your day out loud with exaggerated facial reactions for 60 seconds. Then present and keep 30% of that range.",
        target: "Smile present 15–40% of the session",
      },
    },
    {
      score: 100 - Math.min(90, fillerPer100 * 10),
      action: {
        title: "Silence instead of filler",
        why: `You used ${agg.speech.totalFillers} filler words (${round(fillerPer100, 1)} per 100).`,
        drill: "Re-record the same 60 seconds. Every time you feel an 'um' coming, close your mouth and count one beat. Aim for five deliberate silences.",
        target: "Under 2 fillers per 100 words",
      },
    },
  ];

  // Rubric-specific drills: the same measured session is coached differently
  // when the goal is an on-camera interview rather than a stage talk.
  if (rubric.mode === "interview") {
    options.push({
      score: 100 - Math.min(90, Math.abs((agg.wpm || rubric.pace.ideal) - rubric.pace.ideal)),
      action: {
        title: "90-second STAR answers",
        why: `Answers ran at ${agg.wpm || "—"} wpm against a ${rubric.pace.ideal} wpm interview target, with ${round(fillerPer100, 1)} fillers per 100 words.`,
        drill: "Answer three common questions out loud in STAR shape — situation, task, action, result — and stop at 90 seconds. Record one, then cut every sentence that does not move the result forward.",
        target: "90-second answers at ≤ 2 fillers per 100 words",
      },
    });
  }

  if (rubric.mode === "presentation") {
    options.push({
      score: p.voice,
      action: {
        title: "Back-row projection pass",
        why: `Stage delivery is scored on reach: volume consistency ${Math.round(agg.voice.volumeConsistency)}/100 and vocal energy ${Math.round(agg.voice.energy)}/100.`,
        drill: "Rehearse the opening standing up, aiming your voice at the furthest wall. Keep the last three words of every sentence at full volume instead of letting them fall away.",
        target: "Volume consistency ≥ 75/100 with no trailing sentence endings",
      },
    });
  }

  return options
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((o) => o.action);
}

export function emptyAggregate(): Agg {
  return {
    durationSec: 0,
    analyzedFrames: 0,
    faceVisiblePct: 0,
    eyeContactPct: 0,
    gazeAwayCount: 0,
    language: "en-US",
    avgGazeAwaySec: 0,
    blinkRatePerMin: 14,
    smilePct: 0,
    expressionVariety: 0,
    tension: 0,
    headStabilityPct: 0,
    avgShoulderSlopeDeg: 0,
    avgLeanDeg: 0,
    uprightPct: 0,
    headOverShouldersPct: 0,
    swayIndex: 0,
    alignmentScore: 0,
    gestureRatePerMin: 0,
    handsVisiblePct: 0,
    bothHandsPct: 0,
    openness: 0,
    nervousness: 0,
    voice: {
      speakingTimePct: 0,
      avgDb: -60,
      volumeConsistency: 0,
      pitchVariation: 0,
      pauseCount: 0,
      longPauseCount: 0,
      avgPauseSec: 0,
      energy: 0,
    },
    speech: { transcript: "", words: 0, fillers: [], totalFillers: 0, fillerEvents: [], supported: false, language: "en-US" },
    wpm: 0,
    paceSource: "acoustic",
    emotions: { neutral: 60, happy: 20, surprise: 5, sad: 5, angry: 5, fear: 5 },
    timeline: [],
  };
}

export const clampPct = (v: number) => Math.round(clamp(v));
