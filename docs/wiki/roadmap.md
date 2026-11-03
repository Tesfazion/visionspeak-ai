# Roadmap

- **Phase 2** — uploaded-recording batch analysis (Whisper + librosa + DeepFace) reusing the same
  scoring model; team and cohort comparisons.
- **Phase 3** — mobile capture, multi-language transcription, personalised coaching plans,
  longitudinal improvement roadmaps.

## Shipped

Per-mode rubrics, accounts with per-account isolation, security headers and CSP,
installable PWA with an offline shell, generated OpenGraph card, loading and error boundaries, a
print stylesheet, Free/Pro plans with server-enforced quotas, idempotent saves, on-device draft
recovery, revocable report share links, legal pages, structured logging, password reset, email
verification, account deletion, "sign out everywhere", server-rendered PDF export, SMTP delivery,
a billing webhook seam, a rate-limited crash sink, paginated history, `en/es/fr/am` UI catalogues,
accessible chart tables, co-coaching meeting rooms, and a full unit suite plus an end-to-end suite
and a meeting QA suite wired into CI.

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
| `npm run backup` | copy `data/` into `backups/<timestamp>/`, keeping the last 30 |
| `npm run restore -- <dir>` | copy a backup back into the data dir (files absent from the backup are left alone) |

Diagnostic wrappers (`scripts/run-*.cjs`, `smoke`, `test`) write their transcripts to
`docs/logs`, `docs/notes` and `docs/artifacts` — never the repository root. See
[`docs/README.md`](../README.md).
