# Docs & diagnostics

This folder keeps the repository root clean. The project itself lives in `src/`,
`public/`, `data/` and `scripts/` — anything written for *inspection* rather than
*shipping* belongs here.

```
docs/
├── README.md        this file (tracked)
├── AUDIT.md         business-readiness audit: verified state, gaps, order (tracked)
├── notes/           scratch .txt notes: command output, greps, package probes
├── logs/            transcripts: dev server, build, typecheck, smoke test
└── artifacts/       machine-readable reports: fonts, network probes, reseed
```

Everything except `README.md` and `AUDIT.md` is generated and git-ignored. Deleting a
subfolder is always safe: the next script run recreates it.

## Why these files exist

The agent shell used to develop this project cannot capture stdout from child
processes (`node`, `npm`, `curl`), so command output has to be persisted to a
file to be readable. Each wrapper script writes its transcript here instead of
the repository root.

| Script | Writes |
| --- | --- |
| `scripts/run-dev.cjs` | `logs/dev-run.log` |
| `scripts/run-build.cjs` | `logs/build-run.log` |
| `scripts/run-start.cjs` | `logs/start-run.log` |
| `scripts/run-tsc.cjs` | `logs/tsc-report.log` |
| `scripts/run-smoke.cjs` | `logs/smoke-run.log` + `logs/smoke.txt` |
| `scripts/test.mjs` | `logs/test.log` |
| `scripts/http-probe.cjs` | `logs/http-probe.log` |
| `scripts/run-probe.cjs` | `notes/probe-<name>.txt` |
| `scripts/grep.cjs` | `notes/grep.txt` |
| `scripts/log-filter.cjs` | `notes/dev-errors.txt` |
| `scripts/net-probe.cjs` | `artifacts/net-probe.json` |
| `scripts/reseed.cjs` | `artifacts/reseed-report.json` |
| `scripts/fetch-fonts.mjs` | `artifacts/fonts-report.json` |
| `scripts/make-icons.mjs` | `artifacts/icons-report.json` |
| `scripts/kill-port.cjs` | `logs/kill-port.log` |
| `scripts/responsive-check.cjs` | `notes/responsive-check.txt` |
| `scripts/probe-status.cjs` | `notes/probe-status.txt` |
| `scripts/auth-probe.cjs` | `notes/auth-probe.txt` |
| `scripts/ci-repro.cjs` | `notes/ci-repro.txt` |

Paths are centralised in `scripts/lib/diagnostics.cjs` — new scripts must use
`notePath()`, `logPath()` or `artifactPath()` rather than writing to the root.

`scripts/run-probe.cjs <name> <command…>` is the general-purpose wrapper: it runs any
command and captures its output to `notes/probe-<name>.txt`, which is how a check like
`npm run verify` or `npx eslint .` can be read in this environment.

## Logs are ignored by git

Everything in `notes/`, `logs/` and `artifacts/` is generated per machine and listed in
`.gitignore`. The CI workflow uploads `docs/logs/` as a build artifact instead, so the
history contains code, never transcripts.

`scripts/run-smoke.cjs` takes a **full origin** (`http://localhost:3111`), not a port: it is
handed straight to `fetch`, and a bare port crashes before `logs/smoke.txt` is rewritten,
leaving a stale (green) file behind. Use `node scripts/run-probe.cjs smoke node
scripts/smoke.mjs http://host:port` when you need the exit code too.

## Housekeeping

These files are disposable. To reset everything:

```bash
rmdir /s /q docs\notes docs\logs docs\artifacts
```

The folders reappear on the next build, test or probe run.
