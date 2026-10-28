// Runs `tsc --noEmit` and writes its output to tsc-report.log.
// Node's stdout is not captured by the agent shell in this environment, so the
// result is persisted to a file instead.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { root, logPath } = require("./lib/diagnostics.cjs");

const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");

const result = spawnSync(process.execPath, [tsc, "--noEmit"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
});

const output = [
  `exit=${result.status}`,
  `--- stdout ---`,
  result.stdout || "",
  `--- stderr ---`,
  result.stderr || "",
].join("\n");

fs.writeFileSync(logPath("tsc-report.log"), output, "utf8");
