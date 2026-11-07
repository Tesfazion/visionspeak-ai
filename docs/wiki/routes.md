# Routes

| Route | Access | What it is |
| --- | --- | --- |
| `/` | public | Marketing site + live scoring preview |
| `/pricing` | public | Plan comparison; the numbers here are the numbers the API enforces |
| `/login` · `/signup` | public | Account access |
| `/forgot-password` · `/reset-password/[token]` | public | Password reset, one-hour single-use token |
| `/verify-email/[token]` | public | Confirms address ownership after signup |
| `/account` | **required** | Profile, plan/billing status, "sign out everywhere" |
| `/studio` | **required** | Real-time analysis studio — camera, overlays, live coach |
| `/ai` | **required** | BYOK provider-key management, AI chat and saved-session feedback |
| `/report/[id]` | owner | Full session report (`/report/demo` is public; `?share=<token>` is a link-only view) |
| `/dashboard` | **required** | Session history, plan usage, trends, pillar averages (paginated) |
| `/admin/metrics` | allowlisted account | Aggregate activation, return, and same-mode score trends; requires `ANALYTICS_ADMIN_EMAIL` |
| `/meeting` · `/meeting/[id]` | **required** | Co-coaching lobby and room: roster, chat, presence, WebRTC media |
| `/privacy` · `/terms` | public | Privacy policy and terms of service |
| `/offline` | public | Service-worker fallback |
| `/api/health` | public | Liveness + storage + build probe |
| `/api/auth/me/export` | **required** | Downloads the signed-in account's JSON data archive |
| `/api/billing/checkout` | **required** | Creates an authenticated monthly or yearly Lemon Squeezy checkout for the signed-in account |
| `/api/sessions/[id]/pdf` | owner, Pro | Server-rendered PDF report |
| `/api/sessions/[id]/verify` | owner | Re-hashes the stored inputs; the report badge is computed server-side |
| `/api/ai/keys` · `/api/ai/keys/[id]` | owner | Manage encrypted provider keys and models |
| `/api/ai/chatbot` | owner | Chat using the selected owner's provider key |
| `/api/ai/mentor` | owner | Generate feedback from an owner-verified saved session report |
| `/api/report/[id]/email` | owner | Emails a report (or a download link) when SMTP is configured |
| `/api/billing/webhook` | Lemon Squeezy | Verifies `X-Signature`; synchronizes subscription events; `410` until billing config is present |
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
| Price | $0 | $12/month or $108/year (696 ETB/month or 6264 ETB/year) |

- **Enforcement** — `POST /api/sessions` returns `402` with `code: "quota_exceeded"` once the
  monthly allowance is spent, and `422` + `code: "session_too_long"` for an over-length
  session. A session that fails to save never consumes quota.
- **Idempotency** — the studio sends a `clientSessionId`; a retried save returns the original
  report instead of creating a duplicate or spending a second unit of quota.
- **Plan changes** — `POST /api/billing/webhook` is the only billing writer of `plan`; it verifies
  Lemon Squeezy's `X-Signature`, checks the configured store and recurring variant, and deduplicates
  subscription events. Checkout remains disabled unless the API key, store, monthly variant, and
  webhook secret are configured. Validate checkout and subscription lifecycle events in provider
  test mode before enabling live charges.
