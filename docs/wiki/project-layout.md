# Project layout

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
tests/               unit tests (math, scoring, report, auth, store, data-dir)
public/
  sw.js              static-asset cache + offline shell
  icons/             generated PWA icons
  mediapipe/         WASM runtime + models (restored by npm install)
scripts/             build/test/smoke/probe wrappers — see docs/README.md
docs/                this wiki + generated diagnostics (git-ignored)
```
