# Architecture

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
