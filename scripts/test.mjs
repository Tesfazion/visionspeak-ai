// Runs the unit suite with Node's built-in test runner and mirrors the output
// into docs/logs/test.log (the agent shell does not capture child stdout).
//
// Usage: node scripts/test.mjs [extra node args]
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const testsDir = path.join(root, "tests");
const log = createWriteStream(path.join(root, "docs", "logs", "test.log"), { flags: "w" });

const files = readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => path.join(testsDir, name));

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
child.on("exit", (code) => log.end(`\n[exit ${code}]\n`));
