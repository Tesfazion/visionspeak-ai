// Starts `next dev` with its output discarded, so nothing is written into the
// project tree while it runs.
//
// Motivation: the normal wrapper (run-dev.cjs) streams the server transcript to
// docs/logs/dev-run.log — inside the directory Turbopack watches. This script
// exists to check whether that file growth is what keeps the dev client
// full-reloading the page (and therefore whether the reload loop is a harness
// artefact or an app bug).
//
// Usage: node scripts/probes/quiet-dev.cjs [port]
const { spawn } = require("node:child_process");
const path = require("node:path");

const port = process.argv[2] ?? "3112";
const root = path.resolve(__dirname, "..", "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, "dev", "-p", port], {
  cwd: root,
  stdio: "ignore",
  windowsHide: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});

const stop = () => {
  child.kill();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", () => process.exit(0));

// Keep this wrapper alive for as long as the server runs.
setInterval(() => {}, 1 << 30);
