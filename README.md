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
[![Tests](https://img.shields.io/badge/tests-72%20unit%20%C2%B7%20110%20e2e-34d399.svg)](#testing)

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

> There is no seeded, demo or admin login: `/login` only accepts an account that already exists in
> `data/users.json`, so a fresh checkout must go through `/signup` once. Signing in lands on
> `/dashboard` (session history), and `?next=/studio` takes you straight to the camera.

Want to see the output first? **`/report/demo`** is a public, fully scored sample session — no
sign-in required.

**Requirements:** a Chromium browser (Chrome or Edge), a webcam and a microphone. A GPU is used
when available; the engine falls back to CPU automatically.

The Free plan allows five analyses a month and ten minutes per session; `/pricing` lists
what Pro adds. Quotas are enforced server-side, not hidden behind a paywall banner.

---

## Routes

| Route | Access | What it is |
| --- | --- | --- |
| `/` | public | Marketing site + live scoring preview |
| `/pricing` | public | Plan comparison; the numbers here are the numbers the API enforces |
| `/login` · `/signup` | public | Account access |
| `/forgot-password` · `/reset-password/[token]` | public | Password reset, one-hour single-use token |
| `/verify-email/[token]` | public | Confirms address ownership after signup |
| `/account` | **required** | Profile, plan/billing status, "sign out everywhere" |
| `/studio` | **required** | Real-time analysis studio — camera, overlays, live coach |
| `/report/[id]` | owner | Full session report (`/report/demo` is public; `?share=<token>` is a link-only view) |
| `/dashboard` | **required** | Session history, plan usage, trends, pillar averages (paginated) |
| `/meeting` · `/meeting/[id]` | **required** | Co-coaching lobby and room: roster, chat, presence, WebRTC media |
| `/privacy` · `/terms` | public | Privacy policy and terms of service |
| `/offline` | public | Service-worker fallback |
| `/api/health` | public | Liveness + storage + build probe |
| `/api/sessions/[id]/pdf` | owner, Pro | Server-rendered PDF report |
| `/api/sessions/[id]/verify` | owner | Re-hashes the stored inputs; the report badge is computed server-side |
| `/api/report/[id]/email` | owner | Emails a report (or a download link) when SMTP is configured |
| `/api/billing/webhook` | provider | The only writer of `plan`; `410` unless `BILLING_WEBHOOK_SECRET` is set |
| `/api/errors` | public | Rate-limited crash sink for the client error boundary |

---

## Plans & quotas

The product ships with two commercial plans, defined once in `src/lib/plans.ts` and
enforced by the API — the pricing page is generated from the same object, so a plan
cannot advertise a limit it does not apply.

| | Free | Pro |
| --- | --- | --- |
| Analyses per calendar month (UTC) | 5 | 200 |
| Minutes analysed per month | 60 | 2 000 |
| Maximum session length | 10 min | 60 min |
| History retained | 30 days | unlimited |
| Share links | 7 days | 30 days, revocable |
| CSV export | — | ✅ |
| PDF report download | — | ✅ |
| Price | $0 | $12/month or $108/year |

- **Enforcement** — `POST /api/sessions` returns `402` with `code: "quota_exceeded"` once the
  monthly allowance is spent, and `422` + `code: "session_too_long"` for an over-length
  session. A session that fails to save never consumes quota.
- **Idempotency** — the studio sends a `clientSessionId`; a retried save returns the original
  report instead of creating a duplicate or spending a second unit of quota.
- **Plan changes** — `POST /api/billing/webhook` is the only writer of `plan` (constant-time
  secret compare, `410` when unconfigured). Set `NEXT_PUBLIC_PRO_CHECKOUT_URL` to a real payment
  link and `/pricing` sells Pro; leave it unset and the page says billing is not enabled.

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
| `NEXT_PUBLIC_SITE_URL` | production | Absolute origin for OpenGraph URLs, share links, `robots.txt` and `sitemap.xml`. |
| `VS_DATA_DIR` | optional | Where `sessions.json` / `users.json` are written. Defaults to `<repo>/data` locally and the OS temp dir on serverless. |
| `NEXT_PUBLIC_PRO_CHECKOUT_URL` | to sell | Checkout link for Pro. Unset ⇒ `/pricing` states that billing is not enabled. |
| `BILLING_WEBHOOK_SECRET` | to sell | Shared secret the provider sends as `x-billing-signature` to `POST /api/billing/webhook`. Unset ⇒ that route answers `410`. |
| `SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` · `SMTP_PASS` · `SMTP_FROM` | to email | Sends verification, reset and report emails. Port 587 upgrades with STARTTLS; port 465 (or `SMTP_SECURE=1`) uses implicit TLS. Without these nothing is sent and the UI says so. |
| `NEXT_PUBLIC_BRAND_NAME` · `NEXT_PUBLIC_BRAND_TAGLINE` | optional | White-label the product name and tagline. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | production | Contact address on `/privacy` and `/terms`, and for deletion requests. |
| `NEXT_PUBLIC_LEGAL_ENTITY` · `NEXT_PUBLIC_LEGAL_JURISDICTION` | production | Operator name and governing law shown on the legal pages. |

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
>
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
npm test          # 81 unit/integration tests — Node's built-in runner, no extra dependency
npm run lint      # ESLint flat config: next/core-web-vitals + typescript
npm run typecheck # tsc --noEmit
npm run verify    # typecheck → lint → test → build (the CI order)

node scripts/smoke.mjs http://localhost:3000   # 110 end-to-end checks, against a running server
node scripts/qa/qa-meeting.mjs                 # 24 checks: lobby, auth, roster, signaling, chat, end
```

**Unit suite** — covers what is otherwise invisible:

| Area | What is asserted |
| --- | --- |
| Scoring | the published weights, bounds for extreme input, grade boundaries |
| Rubrics | interview is stricter on gaze, presentation rewards movement, unknown modes fall back to practice |
| Reports | complete output for a demo session, valid output for an *empty* session, emotion shares normalise to 100% |
| Plans | month window, quota counting (own live records only), Free/Pro ceilings, history cutoff |
| Aggregates | every malformed, over-long, non-finite or over-plan payload is refused; body-size ceiling |
| Sharing | token round-trip, tampering, expiry, revoke, stranger cannot create, samples are read-only |
| Auth | scrypt round-trip, duplicate rejection, token tampering/expiry, secret persistence, rate limiter, sign-out-everywhere cut-off |
| Integrity | the saved report re-hashes to its stored digest; one edited sample fails it; key order does not change it |
| Meetings | signaling auth, roster, chat isolation, ended-state `410`, long-poll cursor |
| Store | seed-once, per-owner isolation, foreign delete/update refused, idempotent saves |
| Storage | Vercel/Lambda/Netlify fall back to temp; `VS_DATA_DIR` overrides and is durable |

**End-to-end suite** — drives a real server through the whole product: security headers, the auth
gate (`307` + preserved `next=`), signup, saving a session, the generated report, cross-account
isolation, idempotent retries, share links (create → anonymous read → wrong token → revoke), the
monthly quota (`402`), body/plan limits (`413`/`422`), read-only samples, logout, and the PWA/SEO
routes. It exits non-zero on any failure.

**CI** (`.github/workflows/ci.yml`) runs on every push and pull request: install → typecheck →
lint → unit tests → build, then a second job that boots the production server and runs the smoke
suite. Logs are uploaded as artifacts.

---

## Privacy & security

- **Camera frames, audio and landmarks never leave the device.** There is no upload path in the
  code. Only the derived aggregate (numbers + transcript text) is sent when you press
  *End & analyse*.
- **Samples are read-only.** Seeded sample reports are shared reference material, cannot be
  deleted or edited by an account, and never appear in a user's own history or averages.
- **Share links are explicit and revocable** — an unguessable token plus the report id, expiring
  after 7 days (Free) or 30 days (Pro), revocable from the report page. Shared pages are
  `noindex`.
- **Passwords** are hashed with `scrypt` and a per-user salt; hashes are never returned by an API.
- **Sessions** are HMAC-SHA256 signed, expiring tokens in `httpOnly`, `SameSite=Lax`,
  `Secure`-in-production cookies — stateless, so there is no session table to leak. Each token
  carries its issue time, and *sign out everywhere* stores a per-account cut-off, so a copied
  cookie stops working instead of living out its 30 days. Logout revokes the token, not just the
  cookie.
- **Report integrity** — the server stores a hash of the inputs a report was built from and
  re-computes it for the badge. It makes edited stored inputs visible; it does **not** make
  client-computed scores trustworthy, which is why nothing here claims to be certified.
- **Email** — SMTP is plain Node, and a server that offers neither implicit TLS nor STARTTLS
  never receives a password. Billing webhooks are compared in constant time, and `/api/errors`
  is rate-limited because it writes attacker-supplied text into the ops log.
- **Login throttling** — 8 attempts per 15 minutes per IP+email, `429` with `Retry-After`.
  Signup is limited per address (20/hour) and saves are limited per account (30/hour).
- **Payload limits** — a save body above 2 MB is refused with `413` before it is parsed, and the
  aggregate is bounds-checked (finite numbers, depth, array length, transcript length, plan
  duration) rather than cast from JSON.
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

## Internationalisation

The product ships with four languages, chosen so every region gets a familiar script:

| Code | Language | Script | Coverage |
| --- | --- | --- | --- |
| `en` | English | Latin | 100% (source of truth) |
| `am` | Amharic | አማርኛ | partial |
| `es` | Spanish | Español | partial |
| `fr` | French | Français | partial |

- **Switcher** — a listbox in the header and mobile drawer, showing each language in its own
  script (አማርኛ, Español, Français) with a checkmark on the active choice. Keyboard: `Escape` closes,
  arrow keys move, every row is a 44px target.
- **Persistence** — the choice is written to a cookie (`vs_locale`, one year, `SameSite=lax`) so the
  *first* server render is already in the right language, and mirrored to `localStorage` so a stale
  cookie cannot win over an explicit choice. The server reads the cookie; the client provider
  refreshes the tree on change, so server-rendered pages (dashboard, report, pricing) switch too.
- **Fallback** — a missing key degrades to English, never to a blank or a raw key. Coverage is
  reported per locale by `npm run i18n:coverage`.
- **Adding a language** — drop a `messages/<code>.ts` file (partial or full copy of `en.ts`) and
  append an entry to `LOCALES` in `src/lib/i18n/locales.ts`. Nothing else enumerates languages.

---

## User-facing language

The product states outcomes, never implementation. Library, framework and model names appear only
in `README.md` and `docs/`, where a developer is the reader. In the UI you will see:

- Voice Analysis · Speech Evaluation · Performance Tracking · AI Coaching
- Communication Insights · Learning Progress · Professional Feedback

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
| `npm run backup` | copy `data/` into `backups/<timestamp>/`, keeping the last 30 |
| `npm run restore -- <dir>` | copy a backup back into the data dir (files absent from the backup are left alone) |

Diagnostic wrappers (`scripts/run-*.cjs`, `smoke`, `test`) write their transcripts to
`docs/logs`, `docs/notes` and `docs/artifacts` — never the repository root. See
[`docs/README.md`](docs/README.md).

On a memory-constrained machine `next build` can die mid-render with
`memory allocation of N bytes failed` (one static worker per CPU). Limit the workers:

```bash
set "NEXT_BUILD_WORKERS=2" && npm run build     # Windows
export NEXT_BUILD_WORKERS=2 && npm run build    # POSIX
```

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
  scoring model; team and cohort comparisons.
- **Phase 3** — mobile capture, multi-language transcription, personalised coaching plans,
  longitudinal improvement roadmaps.

Shipped so far: per-mode rubrics, accounts with per-account isolation, security headers and CSP,
installable PWA with an offline shell, generated OpenGraph card, loading and error boundaries, a
print stylesheet, Free/Pro plans with server-enforced quotas, idempotent saves, on-device draft
recovery, revocable report share links, legal pages, structured logging, password reset, email
verification, account deletion, "sign out everywhere", server-rendered PDF export, SMTP delivery,
a billing webhook seam, a rate-limited crash sink, paginated history, `en/es/fr/am` UI catalogues,
accessible chart tables, co-coaching meeting rooms, and an 81-test unit suite plus a 110-check
end-to-end suite and a 24-check meeting suite wired into CI.

---

## License

[MIT](LICENSE) © 2026 Tesfatseyon Merkineh

Built as a real product, not a demo: every score in the UI traces back to a model output.
