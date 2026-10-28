# VisionSpeak AI

**An intelligent public speaking coach that measures what an audience actually feels.**

VisionSpeak AI watches and listens while you speak — then tells you the truth about how you land:
eye contact, posture, gestures, vocal delivery and facial expression, folded into the three
composite scores people read in a room: **confidence**, **engagement** and **leadership presence**.

Every score traces back to a model output. Nothing is mocked, randomised or invented for show.

[![CI](https://github.com/Tesfazion/visionspeak-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Tesfazion/visionspeak-ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-7c5cff.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16.4-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.3-087ea4?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.json)
[![Tests](https://img.shields.io/badge/tests-52%20unit%20%C2%B7%2085%20e2e-34d399.svg)](#testing)

---

## Table of contents

- [Why it exists](#why-it-exists)
- [What is actually measured](#what-is-actually-measured)
- [Quick start](#quick-start)
- [Routes](#routes)
- [The scoring model](#the-scoring-model)
- [Mode rubrics](#mode-rubrics)
- [Architecture](#architecture)
- [Project layout](#project-layout)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Testing](#testing)
- [Privacy & security](#privacy--security)
- [Responsive & accessible](#responsive--accessible)
- [Scripts](#scripts)
- [Browser support](#browser-support)
- [Roadmap](#roadmap)
- [License](#license)

---

## Why it exists

Feedback on speaking is either absent or polite. A mirror cannot tell you that your gaze left the
lens eleven times, that your pitch moved across four semitones when you needed nine, or that you
were upright only 71% of the session. Those are the things audiences notice and speakers never see.

VisionSpeak measures them continuously, scores them against a published model, and turns each
measurement into a specific drill — then keeps the history so you can see whether the habit you
fixed last month is still fixed today.

**Everything runs on-device.** The MediaPipe models load once into your browser as WebAssembly and
infer there; no frame, no audio, no landmark ever reaches a server.

---

## What is actually measured

| Signal | Source (on-device) | Metrics |
| --- | --- | --- |
| **Eye contact & gaze** | MediaPipe Face Landmarker — 478 landmarks + iris | lens time %, gaze breaks + durations, blink rate, head stability |
| **Head orientation** | facial transformation matrix | yaw / pitch / roll in degrees |
| **Facial expression** | 52 ARKit-style blendshapes | smile presence, expression range, tension, 6-way emotion distribution |
| **Posture** | MediaPipe Pose Landmarker — 33 landmarks | shoulder slope, torso lean, head-over-shoulders, upright %, sway |
| **Gestures** | MediaPipe Hand Landmarker — 21 points × 2 | gestures/min, hands-in-frame %, openness, nervousness index, symmetry |
| **Voice** | Web Audio API `AnalyserNode` | loudness (dBFS), energy, volume consistency, pitch variation in semitones, pauses, speaking-time ratio |
| **Speech** | Web Speech API | transcript, WPM, filler words per 100 words |

> **Why the browser instead of Python?** The original spec called for MediaPipe + TensorFlow +
> DeepFace + Whisper in Python. Those wheels do not exist for this stack, so a Python service could
> not actually run. Executing the *identical* MediaPipe models through WebAssembly is faster (no
> upload, no round trip), fully private, and still genuine inference. A server-side batch pipeline
> for uploaded recordings is the natural Phase 2 — the scoring model is model-agnostic.

---

## Quick start

```bash
npm install      # copies the MediaPipe WASM runtime, fetches the 3 model bundles
npm run dev      # http://localhost:3000
```

Create an account at **`/signup`**, open **Studio → Enable camera & mic**, and speak for a minute.

Want to see the output first? **`/report/demo`** is a public, fully scored sample session — no
sign-in required.

**Requirements:** a Chromium browser (Chrome or Edge), a webcam and a microphone. A GPU is used
when available; the engine falls back to CPU automatically.

---

## Routes

| Route | Access | What it is |
| --- | --- | --- |
| `/` | public | Marketing site + live scoring preview |
| `/login` · `/signup` | public | Account access |
| `/studio` | **required** | Real-time analysis studio — camera, overlays, live coach |
| `/report/[id]` | owner | Full session report (`/report/demo` is public) |
| `/dashboard` | **required** | Session history, trends, pillar averages |
| `/offline` | public | Service-worker fallback |
| `/api/health` | public | Liveness + storage-mode probe |

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
`src/lib/math.ts`) rather than a wide plateau, so "good" (75–85) and "excellent" (90+) stay
distinguishable instead of collapsing into the nineties.

Grades map to `RATINGS` in `src/lib/analysis/scoring.ts`; every sentence in a report is derived
from a measured value by `buildStrengths`, `buildImprovements` and `buildPlan` in
`src/lib/analysis/report.ts`.

The weights are asserted by unit tests, so a refactor cannot silently change every score in the
product.

---

## Mode rubrics

The composite weights are fixed by the spec. What changes with the mode you pick in the studio is
what **"good"** looks like:

| Mode | Target profile |
| --- | --- |
| **Practice** | Baseline — eye contact ≈ 92%, 16 gestures/min, 150 wpm |
| **Presentation** | Reach — more movement and gesture range, projection-friendly pace |
| **Interview** | Composure — 96% lens time, ~10 gestures/min, 142 wpm, warmer expression |

The rubric follows the session: the API passes `mode` into `buildReport(aggregate, mode)`, the
report stores `report.rubric`, the header states which rubric produced the numbers, and
rubric-specific drills (STAR answers for interviews, a back-row projection pass for presentations)
are added to the coaching plan. Live coach thresholds move too — an interview tolerates less
fidgeting than a keynote.

Reports saved before rubrics existed have no `rubric` field and still render.

---

## Architecture

```text
Browser — all inference, nothing uploaded
├── MediaPipe Tasks Vision (WASM)   face · pose · hands   src/lib/analysis/engine.ts
├── Web Audio analyser              loudness · pitch · pauses   src/lib/analysis/voice.ts
├── Web Speech recogniser           transcript · fillers   src/lib/analysis/speech.ts
├── Scoring + coaching rules        pillars · nudges   src/lib/analysis/{scoring,coach}.ts
└── 1 Hz session samples ─────────┐
                                  ▼
Next.js route handlers    POST /api/sessions → buildReport() → data/sessions.json
                          GET  /api/sessions · GET/DELETE /api/sessions/[id]
                          POST /api/auth/{signup,login,logout} · GET /api/auth/me
                                  ▼
Server-rendered report & dashboard    src/app/report/[id] · src/app/dashboard
```

Persistence is a JSON file store — deliberately dependency-free: no native modules, no database
server. Every write is serialised through a promise queue so concurrent requests cannot interleave
read-modify-write cycles, and writes are atomic (temp file + rename, with retry for Windows
contention).

**Visibility rules.** Sample records are shared so the product is explorable immediately. Live
records carry an `ownerId` and are readable only by their owner — enforced in the store, not just
in the UI. Records written before accounts existed have no owner and are therefore private, hidden
rather than exposed to the next signup.

---

## Project layout

```text
src/
  app/
    api/auth/{signup,login,logout,me}/   account endpoints
    api/health/                          liveness + storage-mode probe
    api/sessions/[id]/                   read & delete one session
    dashboard/                           history, trends, pillar averages
    login/ · signup/                     account pages
    report/[id]/                         full session report
    studio/                              live analysis (client) + auth layout (server)
    offline/                             service-worker fallback
    fonts/                               self-hosted woff2 (scripts/fetch-fonts.mjs)
    globals.css · layout.tsx · error.tsx · manifest.ts · robots.ts · sitemap.ts
    opengraph-image.tsx                  generated social card
  components/  ui primitives · studio panels · report charts · site chrome · auth form
  hooks/useVisionSession.ts              camera lifecycle + engine wiring
  lib/
    analysis/
      engine.ts      frame loop, aggregation, live metrics
      landmarks.ts   geometry (gaze, ear, posture, hand openness)
      emotion.ts     blendshape → emotion distribution
      scoring.ts     weights, primitive scorers, rubrics, ratings
      report.ts      aggregate → report narrative
      coach.ts       rate-limited, mode-aware real-time nudges
      overlay.ts     canvas mesh/skeleton rendering
      voice.ts       Web Audio analyser
      speech.ts      Web Speech wrapper
      demo.ts        deterministic sample dataset
    auth-core.ts     hashing, user store, signed tokens, rate limiter (testable, no Next.js)
    auth.ts          cookie ↔ user glue (server only)
    data-dir.ts      storage path resolution (local vs serverless)
    store.ts         session store + per-account visibility
    math.ts · types.ts
  proxy.ts           auth gate → real 307 before render
tests/               52 unit tests (math, scoring, report, auth, store, data-dir)
public/
  sw.js              static-asset cache + offline shell
  icons/             generated PWA icons
  mediapipe/         WASM runtime + models (restored by npm install)
scripts/             build/test/smoke/probe wrappers — see docs/README.md
docs/                generated diagnostics (git-ignored)
```

---

## Configuration

All variables are optional for local development. Copy `.env.example` to `.env.local`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUTH_SECRET` | production | Signs session cookies. Without it a random secret is generated once into `data/auth-secret` — fine locally, but on a serverless host that means every cold start signs everyone out. |
| `NEXT_PUBLIC_SITE_URL` | production | Absolute origin for OpenGraph URLs, `robots.txt` and `sitemap.xml`. |
| `VS_DATA_DIR` | optional | Where `sessions.json` / `users.json` are written. Defaults to `<repo>/data` locally and the OS temp dir on serverless. |

Generate a secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

---

## Deployment

### Vercel — one click after import

1. Import the repository at [vercel.com/new](https://vercel.com/new). The framework preset and
   build command are already declared in `vercel.json`.
2. Add environment variables (Project → Settings → Environment Variables):
   - `AUTH_SECRET` — a 64-character hex secret (see above). **Without this, sign-ins break on
     every cold start.**
   - `NEXT_PUBLIC_SITE_URL` — `https://<your-domain>`.
3. Deploy. `npm install` runs `scripts/setup-assets.mjs`, which copies the WASM runtime and
   bundles the three model files into the deployment.

Verify a deployment in one request:

```bash
curl -s https://<your-domain>/api/health
# {"ok":true,"service":"visionspeak-ai","storage":"ephemeral","durable":false,...}
```

> ### ⚠️ Serverless storage is ephemeral
>
> A deployment bundle is **read-only**, so the JSON store falls back to the OS temp directory. That
> keeps the app fully functional — signup, sessions and reports all work — but the data lives only
> as long as the instance stays warm. A cold start resets it.
>
> `/api/health` reports `"durable": false` and the dashboard shows a **temporary storage** badge in
> this state, so it is never a silent surprise.
>
> For data that must survive, pick one:
> - **Set `VS_DATA_DIR`** to a mounted persistent volume (Fly.io, Railway, Render, a VM).
> - **Back the store with a database.** `src/lib/store.ts` is ~130 lines behind five functions
>   (`listSessions`, `getSession`, `saveSession`, `deleteSession`, `updateSession`) — swapping in
>   Postgres or SQLite is a contained change, and `src/lib/auth-core.ts` is the same for users.

### Self-hosting (Node)

```bash
npm ci
npm run build
AUTH_SECRET=$(openssl rand -hex 32) npm start   # http://localhost:3000
```

`data/` is writable here, so sessions and accounts persist across restarts. Put the app behind a
reverse proxy with TLS — `getUserMedia` requires a secure context.

### Docker

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
```

Mount a volume at `/app/data` (or set `VS_DATA_DIR`) to keep the JSON store durable.

### Testing the studio from another device

`getUserMedia` is only available in a secure context, so a phone cannot open the studio over a
plain-HTTP LAN address. Use:

```bash
npm run dev:https     # self-signed HTTPS origin your browser will accept for local dev
```

---

## Testing

```bash
npm test          # 52 unit tests — Node's built-in runner, no extra dependency
npm run lint      # ESLint flat config: next/core-web-vitals + typescript
npm run typecheck # tsc --noEmit
npm run verify    # typecheck → lint → test → build (the CI order)

node scripts/smoke.mjs http://localhost:3000   # 85 end-to-end checks
```

**Unit suite** — covers what is otherwise invisible:

| Area | What is asserted |
| --- | --- |
| Scoring | the published weights, bounds for extreme input, grade boundaries |
| Rubrics | interview is stricter on gaze, presentation rewards movement, unknown modes fall back to practice |
| Reports | complete output for a demo session, valid output for an *empty* session, emotion shares normalise to 100% |
| Auth | scrypt round-trip, duplicate rejection, token tampering/expiry, secret persistence, rate limiter |
| Store | seed-once, per-owner isolation, foreign delete/update refused, idempotent saves |
| Storage | Vercel/Lambda/Netlify fall back to temp; `VS_DATA_DIR` overrides and is durable |

**End-to-end suite** — drives a real server through the whole product: security headers, the auth
gate (`307` + preserved `next=`), signup, saving a session, the generated report, cross-account
isolation, logout, and the PWA/SEO routes. It exits non-zero on any failure.

**CI** (`.github/workflows/ci.yml`) runs on every push and pull request: install → typecheck →
lint → unit tests → build, then a second job that boots the production server and runs the smoke
suite. Logs are uploaded as artifacts.

---

## Privacy & security

- **Camera frames, audio and landmarks never leave the device.** There is no upload path in the
  code. Only the derived aggregate (numbers + transcript text) is sent when you press
  *End & analyse*.
- **Passwords** are hashed with `scrypt` and a per-user salt; hashes are never returned by an API.
- **Sessions** are HMAC-SHA256 signed, expiring tokens in `httpOnly`, `SameSite=Lax`,
  `Secure`-in-production cookies — stateless, so there is no session table to leak.
- **Login throttling** — 8 attempts per 15 minutes per IP+email, `429` with `Retry-After`.
- **No account enumeration** — unknown email and wrong password return the same `401`, and unknown
  emails still pay a dummy hash so response timing does not leak.
- **Route gating** happens in `src/proxy.ts` before rendering, so it is a real `307` rather than a
  client-side redirect; the page-level check is a second layer.
- **Headers** — CSP (with `wasm-unsafe-eval`, required for MediaPipe), HSTS in production,
  `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and a `Permissions-Policy` that allows
  only camera, microphone and display-capture, for same-origin only.

---

## Responsive & accessible

One horizontal scale is shared by every route (`src/app/globals.css`):

| Width | Gutter | Canvas |
| --- | --- | --- |
| < 640px (phone) | 16px | fluid |
| 640px+ | 24px | fluid |
| 1024px+ (laptop) | 32px | fluid |
| 1248px+ (desktop) | — | 1248px |
| 1536px+ (wide) | — | 1376px |
| 1920px+ (ultra-wide, `3xl`) | — | 1600px |

The studio opts into a wider variant (up to 1760px) because it is a workspace rather than a page.

- **Navigation** renders exactly one menu control at every width; the drawer locks body scroll,
  closes on Escape, and every row is a 44px target.
- **Studio** docks the control bar to the bottom of the viewport on phones (with
  `env(safe-area-inset-bottom)` clearance) and puts the live score directly under the camera, so
  pause/end and your score stay reachable mid-session.
- **Charts** scale from 200px on a phone to 290px on an ultra-wide display.
- **Motion** respects `prefers-reduced-motion`; `Reveal` shows content unconditionally if
  `IntersectionObserver` is unavailable.
- **Screen readers** — the coach feed is a polite live region, score rings are `role="meter"` with
  labels, and focus is visible everywhere.
- **Printing** a report produces an A4 document (dedicated `@page` rules), not a screenshot of the
  dark theme.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | dev server on :3000 |
| `npm run dev:https` | dev server over self-signed HTTPS (camera from other devices) |
| `npm run build` / `npm start` | production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | unit suite |
| `npm run verify` | typecheck + lint + test + build |
| `npm run fonts` | re-download the self-hosted webfonts |
| `npm run icons` | re-rasterise the PWA icons from `public/icons/mark.svg` |

Diagnostic wrappers (`scripts/run-*.cjs`, `smoke`, `test`) write their transcripts to
`docs/logs`, `docs/notes` and `docs/artifacts` — never the repository root. See
[`docs/README.md`](docs/README.md).

---

## Browser support

| Browser | Studio | Report & dashboard |
| --- | --- | --- |
| Chrome / Edge (desktop) | ✅ full — including transcript + filler detection | ✅ |
| Chrome (Android) | ✅ over HTTPS | ✅ |
| Safari | ⚠️ Web Speech is unsupported — pace falls back to the acoustic estimator, filler counts are unavailable | ✅ |
| Firefox | ⚠️ same Web Speech limitation | ✅ |

Without Web Speech the session still scores: pace and pauses are derived from the audio envelope,
and the report states which estimator produced them (`paceSource`).

---

## Roadmap

- **Phase 2** — uploaded-recording batch analysis (Whisper + librosa + DeepFace) reusing the same
  scoring model; team and cohort comparisons; server-rendered PDF export.
- **Phase 3** — mobile capture, multi-language transcription, personalised coaching plans,
  longitudinal improvement roadmaps.

Shipped so far: per-mode rubrics, accounts with per-account isolation, security headers and CSP,
installable PWA with an offline shell, generated OpenGraph card, loading and error boundaries, a
print stylesheet, and a 52-test unit suite plus an 85-check end-to-end suite wired into CI.

---

## License

[MIT](LICENSE) © 2026 Tesfazion

Built as a real product, not a demo: every score in the UI traces back to a model output.
