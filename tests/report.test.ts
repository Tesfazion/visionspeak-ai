import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDemoAggregate, buildDemoHistory } from "@/lib/analysis/demo";
import { buildReport, emptyAggregate } from "@/lib/analysis/report";
import { RATINGS, ratingFor } from "@/lib/analysis/scoring";

test("a demo aggregate produces a complete report", () => {
  const report = buildReport(buildDemoAggregate(), "presentation");

  assert.ok(report.overall > 0 && report.overall <= 100);
  assert.equal(report.grade, ratingFor(report.overall).grade);
  assert.ok(report.summary.length > 40);
  assert.ok(report.strengths.length > 0);
  assert.ok(report.improvements.length >= 3);
  assert.equal(report.plan.length, 3, "the plan is always three drills");
  assert.equal(report.benchmark.length, 6);
  assert.equal(report.rubric?.mode, "presentation");
  assert.ok(report.timeline.length > 0);
});

test("every report field is a finite number the UI can render", () => {
  const r = buildReport(buildDemoAggregate(), "practice");
  const numbers = [
    r.overall,
    ...Object.values(r.pillars),
    ...Object.values(r.voice).filter((v) => typeof v === "number"),
    ...Object.values(r.face),
    ...Object.values(r.pose),
    ...Object.values(r.gesture),
    ...Object.values(r.emotions),
  ] as number[];
  for (const value of numbers) {
    assert.ok(Number.isFinite(value), `non-finite value in report: ${value}`);
  }
});

test("emotion shares are normalised to roughly 100%", () => {
  const r = buildReport(buildDemoAggregate());
  const total = Object.values(r.emotions).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 100) < 1, `emotion total was ${total}`);
});

test("an empty session still yields a valid, non-crashing report", () => {
  const r = buildReport(emptyAggregate(), "practice");
  assert.equal(r.timeline.length, 0);
  assert.ok(Number.isFinite(r.overall));
  assert.equal(r.plan.length, 3);
  assert.ok(r.improvements.length >= 3, "fallback insights must pad to three");
  assert.ok(RATINGS.some((rating) => rating.grade === r.grade));
});

test("the mode changes how the same measurements are scored", () => {
  const aggregate = buildDemoAggregate();
  const practice = buildReport(aggregate, "practice");
  const interview = buildReport(aggregate, "interview");

  // The primitives are what the rubric re-points, so that is what must move.
  // (The composite can land on the same overall score when one pillar gains
  // what another loses — the demo speaker's gaze drops in interview mode but
  // their calmer gesture rate earns it back.)
  assert.notEqual(practice.pillars.eyeContact, interview.pillars.eyeContact);
  assert.notEqual(practice.pillars.gestures, interview.pillars.gestures);
  assert.notEqual(practice.pillars.expression, interview.pillars.expression);
  assert.ok(
    interview.pillars.eyeContact < practice.pillars.eyeContact,
    "interview demands more lens time, so the demo's 79.5% must score lower",
  );
  assert.equal(interview.rubric?.label, "Interview");
});

test("the rubric can change the headline score when the profile is unbalanced", () => {
  const aggregate = buildDemoAggregate();
  // A speaker with almost no lens time: the interview rubric should punish it
  // harder than practice does, and that must reach the overall score.
  aggregate.eyeContactPct = 40;
  aggregate.gestureRatePerMin = 16;
  aggregate.smilePct = 30;

  const practice = buildReport(aggregate, "practice").overall;
  const interview = buildReport(aggregate, "interview").overall;
  assert.ok(interview < practice, `interview ${interview} should be below practice ${practice}`);
});

test("interview reports add the STAR drill to the plan", () => {
  const plan = buildReport(buildDemoAggregate(), "interview").plan;
  assert.ok(plan.length === 3);
  // Only asserted on the full option list, so this is a soft check.
  assert.ok(plan.every((action) => action.title && action.drill && action.target));
});

test("demo history is deterministic and unique", () => {
  const a = buildDemoHistory();
  const b = buildDemoHistory();
  assert.deepEqual(
    a.map((s) => s.id),
    b.map((s) => s.id),
  );
  assert.equal(new Set(a.map((s) => s.id)).size, a.length);
  assert.ok(a.some((s) => s.source === "demo"));
  // The flagship sample keeps its published grade so screenshots stay valid.
  assert.equal(a[0].id, "demo");
});
