// Serves the production build (`next start`) with its output mirrored into start-run.log.
// Launch in its own console: start "" /min cmd /c node scripts/run-start.cjs 3112
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { root, logPath } = require("./lib/diagnostics.cjs");

const port = process.argv[2] ?? "3112";
const log = fs.createWriteStream(logPath("start-run.log"), { flags: "w" });

const child = spawn(
  process.execPath,
  [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", port],
  {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  },
);

child.stdout.pipe(log);
child.stderr.pipe(log);
child.on("exit", (code, signal) => log.end(`\n[server exited code=${code} signal=${signal}]\n`));
