// Runs `next build` and streams its output into build-run.log.
// Launch it in its own console (`start "" /min cmd /c node scripts/run-build.cjs`) so a
// Ctrl+C aimed at the agent's shell cannot kill the build workers mid-run.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { root, logPath } = require("./lib/diagnostics.cjs");

const log = fs.createWriteStream(logPath("build-run.log"), { flags: "w" });

const child = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "build"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});

child.stdout.pipe(log);
child.stderr.pipe(log);
child.on("exit", (code) => log.end(`\n[exit ${code}]\n`));
