// Reproduces the GitHub Actions job locally, from a clean checkout.
//
// CI failed three times at the "Unit tests" step while the same suite passed
// here, because the working tree contains generated folders (docs/logs,
// docs/notes) that are git-ignored and therefore absent from a fresh clone.
// Any script that writes a transcript without creating its directory crashes
// there and nowhere else.
//
// This script clones the pushed branch into a temp directory and runs the exact
// CI sequence, writing a verdict to docs/notes/ci-repro.txt.
//
// Usage: node scripts/ci-repro.cjs [remoteUrl] [branch]
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { notePath } = require("./lib/diagnostics.cjs");

const remote = process.argv[2] ?? "https://github.com/Tesfazion/visionspeak-ai.git";
const branch = process.argv[3] ?? "main";

const out = [`remote=${remote}`, `branch=${branch}`, `started=${new Date().toISOString()}`];

// Persist after every step: a run that is interrupted (or a clone/npm ci that
// takes longer than the caller's patience) must still leave a readable
// transcript of how far it got, not an empty file.
const write = () => fs.writeFileSync(notePath("ci-repro.txt"), out.join("\n"), "utf8");
write();

const run = (label, command, args, cwd, timeout = 900_000) => {
  const started = Date.now();
  const r = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    shell: process.platform === "win32",
    timeout,
    env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1" },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const ok = r.status === 0;
  out.push(`${ok ? "PASS" : "FAIL"} ${label} (exit=${r.status}, ${seconds}s)`);
  if (!ok) {
    const tail = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim().split(/\r?\n/).slice(-25).join("\n");
    out.push("--- output tail ---", tail || "(none)", "--- end ---");
  }
  write();
  return ok;
};

(async () => {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "vs-ci-"));
  const clone = path.join(workdir, "repo");

  try {
    if (!run("git clone", "git", ["clone", "--depth", "1", "--branch", branch, remote, clone], workdir)) {
      throw new Error("clone failed");
    }

    // The whole point: prove the ignored, generated folders are absent.
    const ignored = ["docs/logs", "docs/notes", "docs/artifacts", "data"].filter((p) =>
      fs.existsSync(path.join(clone, p)),
    );
    out.push(`clean checkout: ${ignored.length === 0 ? "PASS" : "FAIL"} ignored dirs present=${ignored.length ? ignored.join(",") : "none"}`);
    write();

    const checks = [
      ["npm ci", "npm", ["ci", "--ignore-scripts"], 1_200_000],
      ["node scripts/setup-assets.mjs", "node", ["scripts/setup-assets.mjs"], 300_000],
      ["npm run typecheck", "npm", ["run", "typecheck"], 600_000],
      ["npm run lint", "npm", ["run", "lint"], 600_000],
      ["npm test", "npm", ["test"], 600_000],
      ["npm run build", "npm", ["run", "build"], 900_000],
    ];

    let failed = null;
    for (const [label, cmd, args, timeout] of checks) {
      if (!run(label, cmd, args, clone, timeout)) {
        failed = label;
        break;
      }
    }

    if (failed) {
      out.push("", `VERDICT: FAIL — ${failed}`);
    } else {
      // Record the numbers CI would report.
      const testLog = path.join(clone, "docs", "logs", "test.log");
      if (fs.existsSync(testLog)) {
        const totals = fs
          .readFileSync(testLog, "utf8")
          .split(/\r?\n/)
          .filter((l) => /^. (tests|pass|fail) /.test(l));
        out.push("", "unit totals:", ...totals);
      }
      out.push("", "VERDICT: PASS — a clean checkout builds and passes CI");
    }
  } catch (err) {
    out.push("", `VERDICT: ERROR — ${err.message}`);
  } finally {
    // Cleanup is best-effort. On Windows a build worker or the antivirus can
    // still hold a handle inside the tree, and a throwing rm here used to
    // reject the whole script *after* the verdict was computed — the run then
    // exited 1 with no note at all, which reads exactly like a CI failure.
    try {
      fs.rmSync(workdir, { recursive: true, force: true });
    } catch (err) {
      out.push("", `cleanup: could not remove ${workdir} (${err.message}) — delete it manually`);
    }
  }

  write();
})();
