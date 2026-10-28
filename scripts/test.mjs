// Runs the unit suite with Node's built-in test runner and mirrors the output
// into docs/logs/test.log (the agent shell does not capture child stdout).
//
// The child's exit code is propagated, so `npm test` fails CI when a test
// fails. Without that, the wrapper would exit 0 and a red suite would look
// green to npm and to GitHub Actions.
//
// Usage: node scripts/test.mjs [extra node args]
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import diagnostics from "./lib/diagnostics.cjs";

const root = path.resolve(import.meta.dirname, "..");
const testsDir = path.join(root, "tests");

if (!existsSync(testsDir)) {
  console.error("[test] no tests directory found");
  process.exit(1);
}

const files = readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => path.join(testsDir, name));

if (files.length === 0) {
  console.error("[test] no *.test.ts files found");
  process.exit(1);
}

const log = createWriteStream(diagnostics.logPath("test.log"), { flags: "w" });

const args = [
  "--experimental-transform-types",
  // Keep the transcript readable: these two are expected and not actionable.
  "--disable-warning=ExperimentalWarning",
  "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
  "--import",
  pathToFileURL(path.join(root, "scripts", "lib", "ts-resolve.mjs")).href,
  "--test",
  "--test-reporter=spec",
  ...files,
  ...process.argv.slice(2),
];

log.write(`node ${args.join(" ")}\n\n`);

const child = spawn(process.execPath, args, {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
});

child.stdout.pipe(log);
child.stderr.pipe(log);

child.on("error", (err) => {
  console.error("[test] failed to start the test runner:", err.message);
  log.end(`\n[spawn error] ${err.message}\n`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  log.end(`\n[exit ${code}${signal ? ` signal=${signal}` : ""}]\n`);
  if (code === 0) return;
  // A signal death (e.g. OOM) must not read as success either.
  process.exitCode = code ?? 1;
});
