// Starts `next dev` and pipes stdout/stderr into dev-run.log.
// Node's own console output is not captured by the agent shell here, so the
// server transcript has to be written to a file by this wrapper.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { root, logPath } = require("./lib/diagnostics.cjs");

const port = process.argv[2] ?? "3111";

const log = fs.createWriteStream(logPath("dev-run.log"), { flags: "w" });
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, "dev", "-p", port], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});

child.stdout.pipe(log);
child.stderr.pipe(log);
child.on("exit", (code, signal) => {
  log.write(`\n[dev-server exited code=${code} signal=${signal}]\n`);
  log.end();
});
