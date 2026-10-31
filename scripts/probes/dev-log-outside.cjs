// Runs `next dev` with its transcript written OUTSIDE the project tree.
//
// Purpose: prove (or refute) that the live transcript file is what makes the
// dev client full-reload in a loop. `run-dev.cjs` streams into
// docs/logs/dev-run.log, which sits inside the directory Turbopack watches; a
// growing watched file triggers a recompile, the dev client reloads, the reload
// re-requests the page, the wrapper logs more lines, and the page never settles.
// On a slow/network filesystem (this machine) the flapping is continuous.
//
//   node scripts/probes/dev-log-outside.cjs [port]
//
// The transcript path is printed, so it can be read after the fact.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const port = process.argv[2] ?? "3114";
const root = path.resolve(__dirname, "..", "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const transcript = path.join(os.tmpdir(), `vs-dev-${port}.log`);

const log = fs.createWriteStream(transcript, { flags: "w" });
log.write(`# transcript for next dev on ${port} (outside the project tree)\n# ${transcript}\n`);

const child = spawn(process.execPath, [nextBin, "dev", "-p", port], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});

child.stdout.pipe(log);
child.stderr.pipe(log);

child.on("exit", (code, signal) => {
  log.end(`\n[dev exited code=${code} signal=${signal}]\n`);
  process.exit(0);
});

setInterval(() => {}, 1 << 30);
