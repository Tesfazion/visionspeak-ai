# Architecture

```text
Browser — all inference, nothing uploaded
├── MediaPipe Tasks Vision (WASM)   face · pose · hands   src/lib/analysis/engine.ts
├── Web Audio analyser              loudness · pitch · pauses   src/lib/analysis/voice.ts
├── Web Speech recogniser           transcript · fillers   src/lib/analysis/speech.ts
├── Scoring + coaching rules        pillars · nudges   src/lib/analysis/{scoring,coach}.ts
└── 1 Hz session samples ─────────┐
                                 ▼
Next.js route handlers    POST /api/sessions → buildReport() → PostgreSQL
                          GET  /api/sessions · GET/DELETE /api/sessions/[id]
                          POST /api/auth/{signup,login,logout} · GET /api/auth/me
                                  ▼
Server-rendered report & dashboard    src/app/report/[id] · src/app/dashboard
```

PostgreSQL is the sole persistent store. A shared connection pool serves all application instances;
schema initialization creates the required tables and indexes, and record-level transactions protect
session and meeting updates.

**Visibility rules.** Sample records are shared so the product is explorable immediately. Live
records carry an `ownerId` and are readable only by their owner — enforced in the store, not just
in the UI. Records written before accounts existed have no owner and are therefore private, hidden
rather than exposed to the next signup.
