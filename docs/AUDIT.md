# Business-readiness audit

What stands between this build and a platform someone can pay for, and what has already
been closed. Written after a full run of the product (typecheck, lint, unit, e2e, build,
asset crawl) on 29 October 2026.

**Severity** — `BLOCKER` cannot launch, `HIGH` loses money or trust, `MEDIUM` maturity,
`LOW` polish. **Status** — ✅ shipped in this pass, ⬜ open.

---

## 1. Verified state

| Check | Command | Result |
| --- | --- | --- |
| Types | `tsc --noEmit` | 0 errors |
| Lint | `eslint .` | 0 errors, 0 warnings |
| Unit | `npm test` | 72 / 72 pass |
| End-to-end | `node scripts/smoke.mjs http://localhost:3111` | 110 / 110 pass, exit 0 |
| Build | `next build` | success, 22 routes |
| Assets | crawl of 8 pages + 16 explicit files | 66 / 66 return 200 |

`/api/health` reports `{"ok":true,"storage":"local","durable":true,"build":"dev"}`.

Not verified here: an actual camera session (no webcam in this environment), Safari/Firefox
speech fallbacks, and multi-instance behaviour. Do not claim those until a human runs them.

> **Trap worth remembering:** `scripts/run-smoke.cjs` passes its argument straight to
> `fetch`, so it needs a full origin (`http://localhost:3111`), not a port. When it is given
> a port it crashes *before writing* `docs/logs/smoke.txt`, and the stale file reads as a
> green run. Use `node scripts/run-probe.cjs smoke node scripts/smoke.mjs http://host:port`,
> which waits and records the exit code.

---

## 2. Fixed in this pass

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
| ✅ Contact-free upgrades | `/pricing` generated from the same plan object the API enforces; checkout is a real seam (`NEXT_PUBLIC_PRO_CHECKOUT_URL`) and says so when unset. |
| ✅ Unfalsifiable deploys | `/api/health` reports the build SHA; API events are single-line JSON (`src/lib/log.ts`). |
| ✅ `robots.txt` blocked the only indexable report | `/report/demo` and the new public pages are allowed, per-user reports stay out. |

---

## 3. Still open

### Accounts (the launch gates)

| # | Gap | Sev | Effort |
| --- | --- | --- | --- |
| 1 | ⬜ No password reset — a locked-out customer cannot be recovered | BLOCKER | M |
| 2 | ⬜ No email verification — ownership of the address is never proven; makes reset and receipts untrustworthy | BLOCKER | M |
| 3 | ⬜ No account deletion / full data export (GDPR art. 17/20) — sessions can be deleted, the account cannot | BLOCKER | M |
| 4 | ⬜ No session revocation — a leaked cookie stays valid for 30 days; logout only clears it locally | HIGH | M |
| 5 | ⬜ No password change, profile edit, MFA or idle timeout | MEDIUM | M |
| 6 | ⬜ No admin/role/audit surface — support cannot inspect or disable an account | HIGH | M |

### Monetisation

| # | Gap | Sev | Effort |
| --- | --- | --- | --- |
| 7 | ⬜ No payment provider wired — checkout is a URL seam only; no webhook, invoice, dunning or refund path | BLOCKER | L |
| 8 | ⬜ No usage metering beyond the monthly session count (minutes analysed not recorded) | MEDIUM | S |
| 9 | ⬜ No team/org/seat model — Pro is one person; no cohort dashboard for a coach or L&D buyer | HIGH | L |

### Data & scale

| # | Gap | Sev | Effort |
| --- | --- | --- | --- |
| 10 | ⬜ JSON store is per-process and not multi-instance safe; two instances interleave writes | HIGH | L |
| 11 | ⬜ No migrations or schema version in `sessions.json` / `users.json` | HIGH | M |
| 12 | ⬜ No backup, restore or retention job; serverless storage stays ephemeral unless `VS_DATA_DIR` is set | HIGH | M |
| 13 | ⬜ `GET /api/sessions` is now paginated, but the dashboard still renders every row (windowed only by plan history) | MEDIUM | S |
| 14 | ⬜ No edit path for a saved session's title/speaker/notes (`updateSession` exists, is unused) | LOW | S |

### Report as a product

| # | Gap | Sev | Effort |
| --- | --- | --- | --- |
| 15 | ⬜ PDF is `window.print()` — no server-rendered, branded document for a coach or client | HIGH | M |
| 16 | ⬜ No email delivery of a report or a weekly digest | HIGH | M |
| 17 | ⬜ No embeds (`frame-ancestors 'none'`) and no white-label branding | MEDIUM | L |
| 18 | ⬜ Transcript is exported verbatim with no redaction option | MEDIUM | S |

### Trust & integrity

| # | Gap | Sev | Effort |
| --- | --- | --- | --- |
| 19 | ⬜ Scores are computed in the browser and trusted by the server — a crafted POST can store any score. Fine for self-coaching; not for certified or comparative results | HIGH | L |
| 20 | ⬜ Single-permission camera+mic prompt, no audio-only fallback, no per-permission retry | HIGH | S |
| 21 | ⬜ Offline support is a shell page only; a session cannot be captured offline and queued | MEDIUM | L |
| 22 | ⬜ No error tracking (Sentry/OTel) and no product analytics — activation and retention are unmeasurable | HIGH | M |
| 23 | ⬜ Only a root error boundary; no `global-error.tsx`, no segment boundaries for studio/dashboard/report | MEDIUM | S |
| 24 | ⬜ Session-length cap in the client (~2 h of samples) is silent; the server now enforces the plan cap | LOW | S |

### Reach

| # | Gap | Sev | Effort |
| --- | --- | --- | --- |
| 25 | ⬜ UI is English-only while speech supports `en-US` + `am-ET`; no i18n catalogue | HIGH | L |
| 26 | ⬜ Charts have no accessible table/description alternative | MEDIUM | M |
| 27 | ⬜ No pricing/legal JSON-LD, no blog or case studies; sitemap is six URLs | LOW | M |
| 28 | ⬜ Dates hard-coded to `en-GB` while speech defaults to `en-US` | LOW | S |

### Test coverage for money paths

| # | Gap | Sev | Effort |
| --- | --- | --- | --- |
| 29 | ⬜ No browser E2E (Playwright): camera denial, Web Speech absence, print quality are untested | MEDIUM | M |
| 30 | ⬜ No test for a payment webhook, plan change or refund (nothing exists to test yet) | HIGH | L |
| 31 | ⬜ No load/concurrency test of the store beyond the single-process queue | HIGH | M |

---

## 4. Recommended order

1. **Password reset + email verification + account deletion** (1–3). Without these, support
   cannot help a paying customer and the privacy policy promises more than the product does.
2. **Billing integration** (7) behind the existing `setUserPlan` seam, with a webhook that is
   the only writer of `plan`. Add tests for upgrade, downgrade, failed payment.
3. **Server-rendered PDF + email delivery** (15–16) — the artefacts a coach or a client
   actually keeps.
4. **Postgres (or SQLite on a single VM) behind the five store functions** (10–12). Until
   then, be explicit that this is a single-instance deployment.
5. **Error tracking + analytics** (22) before spending on acquisition.
6. **Teams/seats** (9) once individual Pro has a paying cohort.

Everything else is maturity, not a gate — but 19 (client-trusted scores) must be closed
before any "certified" or comparative claim is made.
