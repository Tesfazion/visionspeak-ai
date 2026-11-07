# The scoring model

```text
confidence      = 0.30·eye + 0.25·posture + 0.20·gestures + 0.15·voice + 0.10·expression
engagement      = 0.30·energy + 0.20·movement + 0.25·eye + 0.15·pitchVariation + 0.10·gestureActivity
leadership      = 0.35·confidence + 0.25·eye + 0.20·posture + 0.10·voice + 0.10·gestures
communication   = 0.30·confidence + 0.25·engagement + 0.25·voice + 0.20·bodyLanguage
overall         = 0.35·confidence + 0.25·communication + 0.20·leadership + 0.20·engagement
```

Each primitive is scored with a **distance-from-target curve** (`atTarget` in
`src/lib/math.ts`) rather than a wide plateau, so "good" (75–85) and "excellent" (90+) stay
distinguishable instead of collapsing into the nineties.

Grades map to `RATINGS` in `src/lib/analysis/scoring.ts`; every sentence in a report is derived
from a measured value by `buildStrengths`, `buildImprovements` and `buildPlan` in
`src/lib/analysis/report.ts`.

These are practice indicators built from device-measured cues, not validated measures of
personality, audience reaction, or speaking ability. Camera framing, lighting, background noise,
and browser support can affect results. Facial-expression categories are simplified movement
heuristics, not reliable emotion detection. The report's comparison values are fixed internal
references, not results from a representative speaker study.

The weights are asserted by unit tests, so a refactor cannot silently change every score in the
product. These tests verify the implementation; they do not establish that the cues predict
real-world speaking outcomes or that scores are reliable across devices and environments.

## Audio-only reports

When camera access is declined or unavailable, an audio-only session is an explicit capture mode.
It does not load visual models, and its headline indicator is the voice score only. Visual pillars,
composite interpretation, visual trend lines, and visual benchmark comparisons are not presented
as measured results. Older reports without a capture-mode field are treated as camera sessions.

Camera and audio-only scores are kept separate in dashboard and product score comparisons. Any
claim that scores reflect improvement still needs a consented, coach-reviewed pilot; synthetic
tests alone cannot validate measurement quality or causality.

## Mode rubrics

The composite weights are fixed by the spec. What changes with the mode you pick in the studio is
what **"good"** looks like:

| Mode             | Target profile                                                          |
| ---------------- | ----------------------------------------------------------------------- |
| **Practice**     | Baseline — eye contact ≈ 92%, 16 gestures/min, 150 wpm                  |
| **Presentation** | Reach — more movement and gesture range, projection-friendly pace       |
| **Interview**    | Composure — 96% lens time, ~10 gestures/min, 142 wpm, warmer expression |

The rubric follows the session: the API passes `mode` into `buildReport(aggregate, mode)`, the
report stores `report.rubric`, the header states which rubric produced the numbers, and
rubric-specific drills (STAR answers for interviews, a back-row projection pass for presentations)
are added to the coaching plan. Live coach thresholds move too — an interview tolerates less
fidgeting than a keynote.

Reports saved before rubrics existed have no `rubric` field and still render.
