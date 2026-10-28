# Docs & diagnostics

This folder keeps the repository root clean. The project itself lives in `src/`,
`public/`, `data/` and `scripts/` — anything written for *inspection* rather than
*shipping* belongs here.

```
docs/
├── README.md        this file (tracked)
├── notes/           scratch .txt notes: command output, greps, package probes
├── logs/            transcripts: dev server, build, typecheck, smoke test
└── artifacts/       machine-readable reports: fonts, network probes, reseed
```

Everything except this README is generated and git-ignored. Deleting a subfolder
is always safe: the next script run recreates it.

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
| `scripts/http-probe.cjs` | `logs/http-probe.log` |
| `scripts/grep.cjs` | `notes/grep.txt` |
| `scripts/log-filter.cjs` | `notes/dev-errors.txt` |
| `scripts/net-probe.cjs` | `artifacts/net-probe.json` |
| `scripts/reseed.cjs` | `artifacts/reseed-report.json` |
| `scripts/fetch-fonts.mjs` | `artifacts/fonts-report.json` |
| `scripts/kill-port.cjs` | `logs/kill-port.log` |
| `scripts/responsive-check.cjs` | `notes/responsive-check.txt` |

Paths are centralised in `scripts/lib/diagnostics.cjs` — new scripts must use
`notePath()`, `logPath()` or `artifactPath()` rather than writing to the root.

## Housekeeping

These files are disposable. To reset everything:

```bash
rmdir /s /q docs\notes docs\logs docs\artifacts
```

The folders reappear on the next build, test or probe run.
