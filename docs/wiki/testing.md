# Testing

```bash
npm test          # unit/integration tests — Node's built-in runner, no extra dependency
npm run lint      # ESLint flat config: next/core-web-vitals + typescript
npm run typecheck # tsc --noEmit
npm run verify    # typecheck → lint → test → build (the CI order)

node scripts/smoke.mjs http://localhost:3000   # end-to-end checks, against a running server
node scripts/qa/qa-meeting.mjs                 # checks: lobby, auth, roster, signaling, chat, end
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
| Auth | scrypt round-trip, duplicate rejection, token tampering/expiry, secret persistence, rate limiter, sign-out-everywhere cut-off, password change |
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

## Memory-constrained builds

`next build` forks one static-generation worker per CPU minus one, and each worker loads the whole
app. On a small machine those workers exhaust RAM and the build dies with
`memory allocation of N bytes failed` — no stack, no failing route. Limit the workers:

```bash
set "NEXT_BUILD_WORKERS=2" && npm run build     # Windows
export NEXT_BUILD_WORKERS=2 && npm run build    # POSIX
```
