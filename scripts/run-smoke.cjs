// Runs scripts/smoke.mjs as a child process and mirrors its output into smoke-run.log.
// (`smoke.mjs` also writes smoke.txt itself; this wrapper exists because the agent shell
// does not capture node's console output.)
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { root, logPath } = require("./lib/diagnostics.cjs");

const base = process.argv[2] ?? "http://localhost:3111";
const log = fs.createWriteStream(logPath("smoke-run.log"), { flags: "w" });

const child = spawn(process.execPath, [path.join(root, "scripts", "smoke.mjs"), base], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

child.stdout.pipe(log);
child.stderr.pipe(log);
child.on("exit", (code) => log.end(`\n[exit ${code}]\n`));
