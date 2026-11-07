# Roadmap

- **Phase 2** — uploaded-recording batch analysis (Whisper + librosa + DeepFace) reusing the same
  scoring model; team and cohort comparisons only after coach/organization demand is validated.
- **Phase 3** — mobile capture, multi-language transcription, personalised coaching plans,
  longitudinal improvement roadmaps.

## Shipped

Per-mode rubrics, accounts with per-account isolation, security headers and CSP,
installable PWA with an offline shell, generated OpenGraph card, loading and error boundaries, a
print stylesheet, Free/Pro plans with server-enforced quotas, idempotent saves, on-device draft
recovery, revocable report share links, legal pages, structured logging, password reset, email
verification, account deletion, "sign out everywhere", server-rendered PDF export, SMTP delivery,
Lemon Squeezy checkout and signed subscription webhooks, explicit audio-only practice, comparable
same-mode score trends, privacy-preserving activation/return metrics, a rate-limited crash sink,
paginated history, `en/es/fr/am` UI catalogues, accessible chart tables, co-coaching meeting rooms,
and a full unit suite plus an end-to-end suite and a meeting QA suite wired into CI. Scoring
reliability still requires a consented, coach-reviewed pilot; live billing still requires provider
test-mode verification and merchant configuration.

---

# Scripts

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
[`docs/README.md`](../README.md).
