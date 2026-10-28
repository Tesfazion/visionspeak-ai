import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RUBRICS,
  benchmarkFor,
  composite,
  ratingFor,
  rubricFor,
  scoreExpression,
  scoreEyeContact,
  scoreGestures,
  scoreMovement,
  scorePace,
  scoreVoice,
} from "@/lib/analysis/scoring";

const primitives = { eyeContact: 80, posture: 70, gestures: 60, voice: 90, expression: 50 };
const extras = { energy: 70, movement: 60, voiceVariation: 50, gestureActivity: 40 };

test("composite follows the published weights exactly", () => {
  const p = composite(primitives, extras);

  const confidence = 80 * 0.3 + 70 * 0.25 + 60 * 0.2 + 90 * 0.15 + 50 * 0.1;
  const engagement = 70 * 0.3 + 60 * 0.2 + 80 * 0.25 + 50 * 0.15 + 40 * 0.1;
  const leadership = confidence * 0.35 + 80 * 0.25 + 70 * 0.2 + 90 * 0.1 + 60 * 0.1;
  const bodyLanguage = (70 + 60) / 2;
  const communication = confidence * 0.3 + engagement * 0.25 + 90 * 0.25 + bodyLanguage * 0.2;

  assert.equal(p.confidence, Math.round(confidence));
  assert.equal(p.engagement, Math.round(engagement));
  assert.equal(p.leadership, Math.round(leadership));
  assert.equal(p.communication, Math.round(communication));
  // Primitives pass through unchanged (rounded).
  assert.equal(p.eyeContact, 80);
  assert.equal(p.voice, 90);
});

test("composite stays inside 0..100 for extreme inputs", () => {
  const low = composite(
    { eyeContact: 0, posture: 0, gestures: 0, voice: 0, expression: 0 },
    { energy: 0, movement: 0, voiceVariation: 0, gestureActivity: 0 },
  );
  const high = composite(
    { eyeContact: 100, posture: 100, gestures: 100, voice: 100, expression: 100 },
    { energy: 100, movement: 100, voiceVariation: 100, gestureActivity: 100 },
  );
  for (const value of Object.values(low)) assert.equal(value, 0);
  for (const value of Object.values(high)) assert.equal(value, 100);
});

test("ratingFor maps boundaries to the right grade", () => {
  assert.equal(ratingFor(100).grade, "A+");
  assert.equal(ratingFor(90).grade, "A+");
  assert.equal(ratingFor(89).grade, "A");
  assert.equal(ratingFor(82).grade, "A");
  assert.equal(ratingFor(81).grade, "B+");
  assert.equal(ratingFor(0).grade, "E");
});

test("benchmarkFor exposes six comparable metrics", () => {
  const rows = benchmarkFor(composite(primitives, extras));
  assert.equal(rows.length, 6);
  for (const row of rows) {
    assert.ok(row.you >= 0 && row.you <= 100);
    assert.ok(row.average >= 0 && row.average <= 100);
  }
});

test("rubricFor falls back to practice", () => {
  assert.equal(rubricFor("interview").mode, "interview");
  // @ts-expect-error — unknown modes must not throw.
  assert.equal(rubricFor("podcast").mode, "practice");
  assert.equal(rubricFor(null).mode, "practice");
  assert.equal(rubricFor(undefined).mode, "practice");
});

test("the interview rubric is stricter on gaze than practice", () => {
  const practice = scoreEyeContact(80, 17, RUBRICS.practice);
  const interview = scoreEyeContact(80, 17, RUBRICS.interview);
  assert.ok(interview < practice, `${interview} should be < ${practice}`);
  // A perfect lens time still earns full marks in both.
  assert.ok(scoreEyeContact(96, 17, RUBRICS.interview) > scoreEyeContact(96, 17, RUBRICS.practice));
});

test("the interview rubric punishes large gesture counts that practice tolerates", () => {
  const input = {
    gestureRatePerMin: 26,
    handsVisiblePct: 80,
    bothHandsPct: 60,
    avgOpenness: 1.4,
    nervousnessIndex: 20,
  };
  assert.ok(scoreGestures(input, RUBRICS.interview) < scoreGestures(input, RUBRICS.practice));
});

test("presentation rubric rewards more movement than interview", () => {
  assert.ok(scoreMovement(20, RUBRICS.presentation) > scoreMovement(20, RUBRICS.interview));
  assert.ok(scorePace(170, RUBRICS.interview) < scorePace(170, RUBRICS.practice));
});

test("scoreVoice and scoreExpression return bounded values", () => {
  const voice = scoreVoice({
    volumeConsistency: 95,
    energy: 68,
    pitchVariation: 9,
    speakingTimePct: 78,
    fillerPer100: 0.8,
  });
  assert.ok(voice > 90 && voice <= 100, `ideal voice scored ${voice}`);

  const expression = scoreExpression({ smilePct: 30, variety: 55, tension: 6 });
  assert.ok(expression > 90 && expression <= 100, `ideal expression scored ${expression}`);

  for (const value of [0, 50, 100, 250]) {
    assert.ok(scoreExpression({ smilePct: value, variety: value, tension: value }) >= 0);
  }
});
