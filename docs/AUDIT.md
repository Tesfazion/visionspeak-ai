# Business-readiness audit

What stands between this build and a platform someone can pay for, and what has already
been closed. First written after a full run of the product on 29 October 2026; updated
after the second pass on 31 October 2026 and the coach-practice implementation pass on
7 November 2026.

**Severity** — `BLOCKER` cannot launch, `HIGH` loses money or trust, `MEDIUM` maturity,
`LOW` polish. **Status** — ✅ shipped, ⬜ open, ◐ partial (what is missing is named).

---

## 1. Verified state

Run on 31 October 2026, in this environment (8 GB RAM, ~0.5–1 GB free — see the build row).

Implementation checks on 7 November 2026: typecheck, lint, 16 focused report/metrics/billing tests,
and a two-worker production build passed. The full `npm test` suite was not run because
`TEST_DATABASE_URL` is not configured in this environment; provider test-mode billing and real
camera/microphone behavior also remain unverified.

| Check | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | 0 errors |
| Lint | `npx eslint .` | 0 errors, 0 warnings |
| Unit + integration | `npm test` | 81 / 81 pass |
| HTTP smoke | `node scripts/smoke.mjs http://localhost:3115` (prod build) | 112 / 112 pass |
| Meeting end-to-end | `node scripts/qa/qa-meeting.mjs` | 24 / 24 checks pass (lobby, auth, roster, signaling, chat, end) |
| Build | `set "NEXT_BUILD_WORKERS=2" && npx next build` | success, 44 routes |
| Assets | crawl of 8 pages + 16 explicit files (29 Oct) | 66 / 66 return 200 |

The deployment instructions and health endpoint now require PostgreSQL (`DATABASE_URL`).

Not verified here: real camera/mic media over WebRTC (no webcam in this environment — the
meeting QA proves signaling, roster and chat, not A/V), Safari/Firefox speech fallbacks,
an SMTP round-trip against a real provider, and multi-instance behaviour. Do not claim
those until a human runs them.

> **Trap worth remembering (build):** `next build` forks one static-generation worker per
> CPU minus one. With 7 workers this box dies mid-generation with `exit 3221226505` and
> `memory allocation of 39116 bytes failed` in stderr — no failing route, no stack.
> `NEXT_BUILD_WORKERS=2` makes the same build succeed. Details in `docs/README.md`.

> **Trap worth remembering (smoke):** `scripts/run-smoke.cjs` passes its argument straight
> to `fetch`, so it needs a full origin (`http://localhost:3111`), not a port. Given a port
> it crashes *before writing* `docs/logs/smoke.txt`, and the stale file reads as a green
> run. Use `node scripts/run-probe.cjs smoke node scripts/smoke.mjs http://host:port`,
> which waits and records the exit code. The 112/112 result above is from a prod build
> served on port 3115; two of those checks are the dashboard's live-room callout.
>
> **Trap worth remembering (install):** `npm ci` fails with `EPERM: unlink` on
> `node_modules/@next/swc-win32-x64-msvc/next-swc.win32-x64-msvc.node` while any
> `next dev`/`next start` process is up, and it leaves a half-written `node_modules`
> behind — no `next/package.json`, no `.package-lock.json`, and every `next/*` import
> fails in the editor. Stop the servers, then re-run `npm ci`.

---

## 2. Fixed

### Pass 1 — 29 October

| Fix | Why it mattered |
| --- | --- |
| ✅ Missing `language` on the studio preview aggregate | `npm run verify` failed at typecheck; the build could not ship. |
| ✅ `setState` inside an effect in `theme.tsx` | Lint failed, so CI failed. |
| ✅ Samples were deletable and counted as the user's history | Any account could erase shared seed data, and every dashboard showed "Q4 Kickoff" as the user's own work — a lie about their results. Samples are now read-only and excluded from history, quota and streaks (`src/lib/store.ts`, `src/app/dashboard/page.tsx`). |
| ✅ No plan, quota or entitlement model | Added `src/lib/plans.ts` (Free: 5/month, 10 min, 30-day history; Pro: 200/month, 60 min, unlimited, CSV). Enforced by the API, not just advertised. |
| ✅ API accepted any shaped payload | `src/lib/api-guard.ts` bounds every number, string, depth and array; refuses >2 MB bodies with `413`; refuses over-plan sessions with `422`/`session_too_long`. |
| ✅ Retrying a save created duplicates | `clientSessionId` idempotency; a retry returns the original report (`200`, same id) instead of spending quota twice. |
| ✅ A failed save destroyed the session | The aggregate is stashed on-device with a recovery banner and a working "Retry save" (`src/app/studio/page.tsx`). |
| ✅ No way to hand a report to a coach | Revocable, expiring share links (`POST/DELETE /api/sessions/[id]/share`, `?share=` view, `noindex`). |
| ✅ Unlimited signup/save abuse | Signup 20/hour/IP (valid submissions only), saves 30/hour/account; login limiter unchanged. |
| ✅ No legal surface | `/privacy`, `/terms`, footer links, and env-driven operator/contact fields. |
| ✅ Contact-free upgrades | `/pricing` is generated from the enforced plan object; Lemon Squeezy checkout is available only when provider and signed-webhook configuration are present. |
| ✅ Unfalsifiable deploys | `/api/health` reports the build SHA; API events are single-line JSON (`src/lib/log.ts`). |
| ✅ `robots.txt` blocked the only indexable report | `/report/demo` and the new public pages are allowed, per-user reports stay out. |

### Pass 2 — 31 October

| Fix | Why it mattered |
| --- | --- |
| ✅ No password reset | One-hour single-use token, emailed when SMTP is configured; the request form never reveals whether an address exists. |
| ✅ No email verification | Seven-day token, `/verify-email/[token]`, `emailVerifiedAt` on the user row. |
| ✅ No account deletion (GDPR art. 17) | `DELETE /api/auth/me/delete` erases the account, its sessions, tokens and share links after the user types their own email to confirm. A self-serve *export* (art. 20) is still open. |
| ✅ Leaked session cookies stayed valid for 30 days | Token now carries `issuedAt`; "sign out everywhere" writes a per-account cut-off that `verifySessionToken` enforces, then re-issues this device's cookie. Logout revokes the token instead of only clearing the cookie. Legacy three-part tokens are honoured until a cut-off exists. |
| ✅ Every report claimed "Unverified — numbers may have been edited" | The save path hashed the whole aggregate while the verifier re-hashed `{durationSec, mode, timeline}`, so the two could never match. Both now call `reportIntegrityHash()`; the badge is computed server-side, so a shared report verifies for anonymous readers instead of 401-ing into a false warning. What it detects — and what it does not — is stated in the route. |
| ✅ PDF was `window.print()` | `GET /api/sessions/[id]/pdf` renders a branded document from the stored report — owner-only, behind the Pro `pdfExport` entitlement. |
| ✅ No email delivery | `src/lib/email.ts` — zero-dependency SMTP with implicit TLS (465) or STARTTLS (587, default). A server that offers neither gets no password; the caller sees `not_configured` instead of a silent no-op. |
| ✅ Billing webhook was a URL seam only | `POST /api/billing/webhook` is the only writer of `plan`, guarded by a constant-time secret compare and `410` when unconfigured. |
| ✅ Crash reporting stopped at the server | `/api/errors` + `global-error.tsx` + a client sink carry a bounded, rate-limited envelope into the same log stream. |
| ✅ Dashboard rendered every saved session | `GET /api/sessions` is paginated and the dashboard pages with `LoadMore`. |
| ✅ No edit path for a saved session | `PATCH /api/sessions/[id]` (title, speaker, notes) behind owner-only `updateSession`. |
| ✅ Charts had no accessible alternative | Both charts render a real `<table>` with a `<caption>`, visible on request and always available to a screen reader. |
| ✅ UI was English-only | `en/es/fr/am` catalogues behind `useI18n`/`getI18n` and a language switcher. Long-form marketing and legal pages are still English (see #25). |
| ✅ No structured data for pricing | `Product`/`Offer` JSON-LD generated from the same plan object the API enforces. |
| ✅ No live co-coaching surface | `/meeting` lobby + `/meeting/[id]` room: roster, chat, presence and an ended state over HTTP long-poll signaling (`src/lib/meeting/`), with a WebRTC mesh (`src/hooks/useWebRtc.ts`, trickle-ICE buffering) for media. Media is unverified here — see §1. |
| ✅ The dashboard read as a mirror, not a room | Everything above the fold reported on past sessions, so the product looked like a mirror you speak into alone and the meeting surface was unreachable from the page users land on. `src/components/dashboard/meeting-callout.tsx` now sits on both the empty state and the populated dashboard, in all four locales, with two entries into `/meeting`. Smoke asserts the copy and the link. |
| ✅ Account settings lacked profile/password controls and a complete export | Profile edits and password changes are available in `/account`; `/api/auth/me/export` downloads the account, saved sessions, attended meetings, and safe AI-key metadata without share tokens or provider credentials. |

---

## 3. Still open

| # | Gap | Sev | Status |
| --- | --- | --- | --- |
| 1 | Password reset | BLOCKER | ✅ |
| 2 | Email verification | BLOCKER | ✅ |
| 3 | Account deletion / export (art. 17/20) | BLOCKER | ✅ — account deletion API and self-serve JSON export; deletion remains support-assisted in the current UI |
| 4 | Session revocation | HIGH | ✅ |
| 5 | Password change, profile edit, MFA, idle timeout | MEDIUM | ◐ — profile edit and password change shipped; MFA and idle timeout remain open |
| 6 | Admin/role/audit surface | HIGH | ⬜ — `teamId`/`teamRole` exist on the user row, nothing reads them |
| 7 | Real payment provider (webhook, invoices, dunning, refunds) | BLOCKER | ◐ — authenticated Lemon Squeezy checkout and signed, deduplicated subscription updates are implemented; merchant configuration and test-mode lifecycle verification remain before live sales; invoices, dunning and refunds remain open |
| 8 | Usage metering beyond the monthly session count | MEDIUM | ✅ — API enforces both session and analysed-minute quotas; dashboard usage detail remains limited |
| 9 | Team/org/seat model, cohort dashboard | HIGH | ⬜ |
| 10 | Persistence was single-process, not multi-instance safe | HIGH | ✅ — application persistence migrated to PostgreSQL |
| 11 | No schema version in `sessions.json` | HIGH | ✅ — session and meeting records persist in PostgreSQL |
| 12 | No backup, restore or retention job | HIGH | ✅ manual backup/restore; no scheduled job |
| 13 | Dashboard rendered every row | MEDIUM | ✅ |
| 14 | No edit path for a saved session | LOW | ✅ |
| 15 | PDF was `window.print()` | HIGH | ✅ |
| 16 | No email delivery of a report | HIGH | ✅ (weekly digest still open) |
| 17 | No embeds, no white-label | MEDIUM | ◐ — brand name/tagline are configurable; `frame-ancestors 'none'` still forbids embeds |
| 18 | Transcript exported with no redaction option | MEDIUM | ⬜ |
| 19 | Client-submitted aggregates cannot prove measurement authenticity | HIGH | ◐ — reports now explain that scores are practice indicators and fixed reference values are illustrative, not population comparisons; a crafted POST can still submit fabricated measurements. No certification claim is made. |
| 20 | One camera+mic prompt, no audio-only fallback | HIGH | ✅ — explicit audio-only capture, voice-only reports and camera-denial fallback |
| 21 | Offline support is a shell page only | MEDIUM | ⬜ |
| 22 | No error tracking / product analytics | HIGH | ◐ — crash envelope, structured logs and private aggregate activation/return metrics exist; there is no third-party event tracking, and the metrics only reflect saved sessions |
| 23 | Only a root error boundary | MEDIUM | ✅ (`global-error.tsx`; per-segment boundaries still open) |
| 24 | Silent client session cap | LOW | ⬜ |
| 25 | UI was English-only | HIGH | ◐ — catalogues and switcher exist; long-form pages and emails are English |
| 26 | Charts had no accessible alternative | MEDIUM | ✅ |
| 27 | No pricing/legal JSON-LD, no blog | LOW | ◐ — pricing JSON-LD done; no content programme |
| 28 | Dates hard-coded to `en-GB` | LOW | ⬜ |
| 29 | No browser E2E for camera denial, speech absence, print | MEDIUM | ◐ — `scripts/qa/qa-browser.mjs` and `qa-meeting.mjs` drive real Chrome over CDP; no Playwright suite |
| 30 | No test for a payment webhook | HIGH | ◐ — signature, event parsing, entitlement and deduplication helpers are unit-tested; a real provider test-mode lifecycle run and route-level integration test remain |
| 31 | No load/concurrency test of the store | HIGH | ⬜ |

---

## 4. Recommended order

1. **Verify Lemon Squeezy in test mode** (#7): complete checkout and exercise renewal,
   cancellation, expiration and failed-payment behavior before enabling live charges.
2. **Run a consented, coach-reviewed scoring pilot** (#19) before making reliability,
   improvement or certification claims. Current tests validate code paths, not measurement
   quality or causality.
3. **Use the aggregate product metrics** (#22) to measure activation and return, then conduct
   customer interviews and iterate on onboarding and the practice-feedback-retry loop.
4. **MFA + idle timeout** (#5) — profile editing and password changes are available in account
   settings.
5. **Teams/seats** (#9) only after confirming demand from paying coaches or organizations.
6. **Scheduled backups and store load/concurrency tests** (#12, #31) remain operational work.

Everything else is maturity, not a gate.
