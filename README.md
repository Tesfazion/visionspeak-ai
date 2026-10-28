# VisionSpeak AI

**An intelligent public speaking coach using computer vision, behavioural analytics and AI.**

VisionSpeak AI watches and listens while you speak, then tells you the truth about how you
land: eye contact, posture, gestures, vocal delivery, facial expression — and the three
composite scores audiences actually feel (confidence, engagement, leadership presence).

Everything is measured. Nothing is mocked.

---

## Quick start

```bash
npm install      # copies the MediaPipe WASM runtime and fetches the 3 model bundles
npm run dev      # http://localhost:3000
```

Fonts are self-hosted in `src/app/fonts` (Inter, JetBrains Mono, Instrument Serif — latin
subsets, loaded through `next/font/local`), so neither the build nor the browser depends on
fonts.googleapis.com being reachable. Refreshed with `npm run fonts`.

Then create an account at **/signup**, open **Studio → Enable camera & mic**, and speak for a
minute. Sessions are private to the account that recorded them; the sample reports
(`/report/demo`) are shared so the product is explorable without signing in.

| Route | Auth | What it is |
| --- | --- | --- |
| `/` | public | Marketing site + live scoring preview |
| `/login`, `/signup` | public | Account access |
| `/studio` | required | Real-time analysis studio (camera, overlays, live coach) |
| `/report/[id]` | owner | Full session report (`/report/demo` is public) |
| `/dashboard` | required | Session history, trends, pillar averages |
| `/offline` | public | Service-worker fallback |
| `/api/health` | public | Liveness probe |

**Requirements:** Chrome or Edge, a webcam + microphone, and a secure context
(`http://localhost` counts). A GPU is used when available and the engine falls back to CPU
automatically. To open the studio from a phone on your LAN you need HTTPS — `next dev
--experimental-https` — because browsers refuse `getUserMedia` on a plain HTTP origin.

---

## What is actually measured

| Signal | Source (on-device) | Metrics |
| --- | --- | --- |
| Eye contact & gaze | MediaPipe Face Landmarker — 478 landmarks + iris | lens time %, gaze breaks + durations, blink rate, head stability |
| Head orientation | facial transformation matrix | yaw / pitch / roll in degrees |
| Facial expression | 52 ARKit-style blendshapes | smile presence, expression range, tension, 6-way emotion distribution |
| Posture | MediaPipe Pose Landmarker — 33 landmarks | shoulder slope, torso lean, head-over-shoulders, upright %, sway |
| Gestures | MediaPipe Hand Landmarker — 21 points × 2 | gestures/min, hands-in-frame %, openness, nervousness index, symmetry |
| Voice | Web Audio API (`AnalyserNode`) | loudness (dBFS), energy, volume consistency, pitch variation in semitones, pause count/duration, speaking-time ratio |
| Speech | Web Speech API | transcript, WPM, filler words per 100 words |

**Why in the browser rather than Python?** The spec's Python stack (MediaPipe, TensorFlow,
DeepFace, Whisper) has no wheels for Python 3.14, so a Python service could not actually run
here. Running the *identical* MediaPipe models via WebAssembly is faster (no upload, no round
trip), fully private, and still genuine inference. A server-side batch pipeline
(Whisper + librosa + DeepFace) is the natural Phase-2 addition for uploaded recordings — the
scoring model is model-agnostic and unchanged.

---

## The scoring model

```text
confidence      = 0.30·eye + 0.25·posture + 0.20·gestures + 0.15·voice + 0.10·expression
engagement      = 0.30·energy + 0.20·movement + 0.25·eye + 0.15·pitchVariation + 0.10·gestureActivity
leadership      = 0.35·confidence + 0.25·eye + 0.20·posture + 0.10·voice + 0.10·gestures
communication   = 0.30·confidence + 0.25·engagement + 0.25·voice + 0.20·bodyLanguage
overall         = 0.35·confidence + 0.25·communication + 0.20·leadership + 0.20·engagement
```

Each primitive is scored with a **distance-from-target curve** (`atTarget` in
`src/lib/math.ts`) instead of a wide plateau, so "good" (75–85) and "excellent" (90+) stay
distinguishable. Grades map to `RATINGS` in `src/lib/analysis/scoring.ts`.

Every sentence in a report is derived from a measured value — see
`buildStrengths`, `buildImprovements` and `buildPlan` in `src/lib/analysis/report.ts`.

### Mode rubrics

The composite weights are fixed by the spec; the **targets** are not. The mode you pick in
the studio selects a rubric (`RUBRICS` in `scoring.ts`) that re-points the primitive scorers
and the live-coach thresholds:

| Mode | What "good" means |
| --- | --- |
| Practice | Baseline: eye contact ≈92%, 16 gestures/min, 150 wpm. |
| Presentation | Reach: more movement and gesture range, projection-friendly pace. |
| Interview | Composure: 96% lens time, ~10 gestures/min, 142 wpm, warmer expression. |

The rubric travels with the session: `POST /api/sessions` passes the mode into
`buildReport(aggregate, mode)`, the report stores `report.rubric`, and the report header
states which rubric produced the numbers. Rubric-specific drills (STAR answers for
interviews, a back-row projection pass for presentations) are added to the coaching plan.
Reports saved before rubrics existed have no `rubric` field and still render.

## Responsive design

One horizontal scale is shared by every route (`src/app/globals.css`):

| Width | Gutter | Canvas (`container-page`) |
| --- | --- | --- |
| < 640px (phone) | 16px | fluid |
| 640px+ (large phone) | 24px | fluid |
| 1024px+ (laptop) | 32px | fluid |
| 1248px+ (desktop) | — | 1248px |
| 1536px+ (wide) | — | 1376px |
| 1920px+ (ultra-wide, `3xl`) | — | 1600px |

The studio opts into the wider variant (`container-wide`, up to 1760px) because it is a
workspace rather than a page. Layout rules that follow from it:

- **Navigation** renders exactly one menu control at every width — a hamburger below
  `lg`, with the primary CTA alongside it from `md`. The drawer locks body scroll,
  closes on Escape, and every row is a 44px tap target.
- **Studio** docks the control bar to the bottom of the viewport on phones (with
  `env(safe-area-inset-bottom)` clearance) and shows the live score directly under the
  camera, so pause/end and your score are always reachable mid-session.
- **Charts** are `ResponsiveContainer` wrapped and grow from 200px on a phone to 290px on
  an ultra-wide display.
- **Type** scales down to a 320px viewport: the hero is 32px there and 68px at `2xl`.

```bash
node scripts/responsive-check.cjs http://localhost:3000   # asserts the scale reaches the CSS
```

---

## Architecture

```text
Browser (all inference)
├── MediaPipe Tasks Vision (WASM)  face · pose · hands      src/lib/analysis/engine.ts
├── Web Audio analyser              loudness · pitch · pauses src/lib/analysis/voice.ts
├── Web Speech recogniser           transcript · fillers      src/lib/analysis/speech.ts
├── Scoring + coaching rules        pillars · nudges          src/lib/analysis/{scoring,coach}.ts
└── 1 Hz session samples ──────────┐
                                   ▼
Next.js route handlers  POST /api/sessions → buildReport() → data/sessions.json
                         GET  /api/sessions, GET/DELETE /api/sessions/[id]
                                   ▼
Server-rendered report & dashboard (src/app/report/[id], src/app/dashboard)
```

Persistence is a single JSON file (`data/sessions.json`, auto-seeded with five sample
sessions). It is deliberately dependency-free: no native modules, no database server, and
every write is serialised through a promise queue to avoid interleaved read-modify-write.

### Project layout

```text
src/
  app/                     routes (landing, studio, report, dashboard, api)
    fonts/                 self-hosted woff2 (see scripts/fetch-fonts.mjs)
  components/              ui primitives, studio panels, report charts, site chrome
  hooks/useVisionSession   camera lifecycle + engine wiring
  lib/
    analysis/
      engine.ts            frame loop, aggregation, live metrics
      landmarks.ts         geometry (gaze, ear, posture, hand openness)
      emotion.ts           blendshape → emotion distribution
      scoring.ts           weights + primitive scorers + ratings
      report.ts            aggregate → report narrative
      coach.ts             rate-limited real-time nudges
      overlay.ts           canvas mesh/skeleton rendering
      demo.ts              deterministic sample dataset
    store.ts               JSON session store, per-account visibility
    auth-core.ts           hashing, user store, signed tokens, rate limiter
    auth.ts                cookie ↔ user glue (server only)
    types.ts               shared domain model
  proxy.ts                 auth gate → real 307 before render
  app/
    api/auth/{signup,login,logout,me}   account endpoints
    api/health             liveness probe
    login/, signup/        account pages
    offline/               service-worker fallback
    opengraph-image.tsx    generated social card
    manifest.ts, robots.ts, sitemap.ts  PWA + SEO routes
  middleware → proxy      (Next 16 naming)
tests/                     Node test-runner suite (math, scoring, report, auth, store)
public/sw.js               static-asset cache + offline shell
scripts/setup-assets.mjs   copies WASM + downloads models on install
scripts/fetch-fonts.mjs    refreshes the self-hosted font files
scripts/make-icons.mjs     rasterises the PWA icons
scripts/smoke.mjs          end-to-end route + API + auth smoke test
scripts/test.mjs           unit-test runner (writes docs/logs/test.log)
scripts/lib/               shared helpers (diagnostics paths, TS resolver)
docs/                      generated diagnostics — see docs/README.md
```

---

## Privacy

- Camera frames, audio and landmarks **never leave the device**. There is no upload path in
  the code.
- Only the derived session aggregate (numbers + transcript text) is sent to
  `POST /api/sessions`, and only when you press *End & analyse*.
- `data/sessions.json` stays on your machine. Every live record carries an `ownerId`, and the
  store refuses to read, list or delete one for anyone else (see `src/lib/store.ts`).
- Records written before accounts existed have no `ownerId` and are therefore private —
  hidden rather than exposed to the next account that signs up.

---

## Accounts & security

| Concern | How it is handled |
| --- | --- |
| Password storage | `scrypt` with a per-user 16-byte salt; the hash is never returned by an API (`src/lib/auth-core.ts`) |
| Sessions | HMAC-SHA256 signed, expiring token in an `httpOnly`, `SameSite=Lax`, `Secure`-in-prod cookie. Stateless — no session table to leak |
| Login throttling | 8 attempts / 15 min per IP+email, `429` with `Retry-After` |
| Account enumeration | Identical `401` for unknown email and wrong password; unknown emails still pay a dummy hash so timing does not leak |
| Route gating | `src/proxy.ts` (Next 16's renamed middleware) issues a real `307` before render; the page check is a second layer |
| Transport | CSP (with `wasm-unsafe-eval` for MediaPipe), HSTS in production, `nosniff`, `DENY` framing, `Referrer-Policy`, and a `Permissions-Policy` that allows only camera/mic/display-capture for same-origin |

`AUTH_SECRET` is optional: without it a random secret is generated once into
`data/auth-secret`. Set it explicitly for any deployment with more than one process.

---

## Testing & CI

```bash
npm test         # 45 unit tests, Node's built-in runner (no extra dependency)
npm run lint     # eslint flat config: next/core-web-vitals + typescript
npm run typecheck
npm run verify   # typecheck + lint + test + build
node scripts/smoke.mjs http://localhost:3000   # 85 end-to-end checks
```

The unit suite covers the pieces whose correctness is otherwise invisible: the scoring
weights, the rubric re-targeting, report generation from an empty session, password hashing
and token forgery, rate limiting, and the store's per-account visibility rules.

The smoke suite drives a real server through the whole product — health, security headers,
the auth gate (`307` + preserved `next=`), signup, saving a session, the generated report,
cross-account isolation, logout, and the PWA/SEO routes. It exits non-zero on any failure, and
`.github/workflows/ci.yml` runs typecheck → lint → tests → build → smoke on every push.

---

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm start          # run the production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # unit tests
npm run verify     # everything, in CI order
npm run fonts      # re-download the self-hosted webfonts
npm run icons      # re-rasterise the PWA icons from public/icons/mark.svg
node scripts/smoke.mjs http://localhost:3000   # route + API + auth smoke test
node scripts/responsive-check.cjs http://localhost:3000   # asserts the layout scale reaches the CSS
```

Because this environment cannot capture child-process stdout, the wrapper scripts in
`scripts/` write their transcripts to `docs/logs`, `docs/notes` and `docs/artifacts`
instead of the repository root. See [`docs/README.md`](docs/README.md).

If the model download during `npm install` fails (offline), the engine transparently falls
back to Google's model CDN at runtime.

---

## Roadmap

- **Phase 2** — uploaded-recording batch analysis (Whisper + librosa + DeepFace) reusing the
  same scoring model; team/cohort comparisons; server-rendered PDF export.
- **Phase 3** — mobile capture, multi-language transcription, personalised coaching plans,
  longitudinal improvement roadmaps.

Shipped since the first cut: per-mode rubrics (practice / presentation / interview) that
re-target the scorers and the live coach, accounts with per-user session isolation, security
headers + CSP, installable PWA with an offline shell, generated OpenGraph card, route-level
loading/error states, a 45-test unit suite and an 85-check end-to-end suite wired into CI.

---

Built as a real product, not a demo: every score in the UI traces back to a model output.
