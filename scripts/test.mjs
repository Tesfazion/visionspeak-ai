// Runs the unit suite with Node's built-in test runner and writes output to
// both stdout and docs/logs/test.log.
//
// The child's exit code is propagated, so `npm test` fails CI when a test
// fails. Without that, the wrapper would exit 0 and a red suite would look
// green to npm and to GitHub Actions.
//
// Usage: node scripts/test.mjs [extra node args]
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import diagnostics from "./lib/diagnostics.cjs";

const root = path.resolve(import.meta.dirname, "..");
const testsDir = path.join(root, "tests");
const localEnvFile = path.join(root, ".env.local");

if (existsSync(localEnvFile)) {
  for (const key of ["DATABASE_URL", "TEST_DATABASE_URL"]) {
    if (!process.env[key]?.trim()) delete process.env[key];
  }
  process.loadEnvFile(localEnvFile);
  const bomDatabaseUrl = process.env["\uFEFFDATABASE_URL"];
  if (!process.env.DATABASE_URL?.trim() && bomDatabaseUrl?.trim()) {
    process.env.DATABASE_URL = bomDatabaseUrl;
    delete process.env["\uFEFFDATABASE_URL"];
  }
}

function fail(message) {
  const failure = `[test] ${message}\n`;
  console.error(failure.trimEnd());
  writeFileSync(diagnostics.logPath("test.log"), failure, "utf8");
  process.exit(1);
}

function neonEndpointId(hostname) {
  const endpoint = hostname.toLowerCase().split(".")[0].replace(/-pooler$/, "");
  return /^ep-[a-z0-9-]+$/.test(endpoint) ? endpoint : null;
}

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

if (!process.env.TEST_DATABASE_URL?.trim()) {
  fail("TEST_DATABASE_URL must point to a dedicated disposable Neon database before tests can run.");
}
if (!process.env.DATABASE_URL?.trim()) {
  fail("DATABASE_URL must be configured so tests can verify they are isolated from the application database.");
}

let testDatabase;
try {
  testDatabase = new URL(process.env.TEST_DATABASE_URL);
} catch {
  fail("TEST_DATABASE_URL must be a valid PostgreSQL connection URL.");
}
if (
  !["postgres:", "postgresql:"].includes(testDatabase.protocol) ||
  !testDatabase.hostname.toLowerCase().endsWith(".neon.tech")
) {
  fail("TEST_DATABASE_URL must point to a remote Neon PostgreSQL database.");
}

if (process.env.GITHUB_ACTIONS !== "true") {
  let applicationDatabase;
  try {
    applicationDatabase = new URL(process.env.DATABASE_URL);
  } catch {
    fail("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  const applicationEndpointId = neonEndpointId(applicationDatabase.hostname);
  const testEndpointId = neonEndpointId(testDatabase.hostname);
  const sameNeonEndpoint =
    applicationEndpointId && testEndpointId
      ? applicationEndpointId === testEndpointId
      : testDatabase.hostname.toLowerCase() === applicationDatabase.hostname.toLowerCase();
  if (sameNeonEndpoint) {
    fail(
      "TEST_DATABASE_URL targets the same Neon endpoint as DATABASE_URL. Changing the password does not select a branch; choose test-ci in Neon Console and copy its endpoint-specific connection string. No tests were started.",
    );
  }
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
  "--test-concurrency=1",
  "--test-reporter=spec",
  ...files,
  ...process.argv.slice(2),
];

log.write(`node ${args.join(" ")}\n\n`);

const child = spawn(process.execPath, args, {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, NODE_ENV: "test", NO_COLOR: "1", FORCE_COLOR: "0" },
});

child.stdout.on("data", (chunk) => {
  log.write(chunk);
  process.stdout.write(chunk);
});
child.stderr.on("data", (chunk) => {
  log.write(chunk);
  process.stderr.write(chunk);
});

child.on("error", (err) => {
  console.error("[test] failed to start the test runner:", err.message);
  log.write(`\n[spawn error] ${err.message}\n`);
  process.exitCode = 1;
});

child.on("close", (code, signal) => {
  log.end(`\n[exit ${code}${signal ? ` signal=${signal}` : ""}]\n`);
  if (code !== 0) {
    // A signal death (e.g. OOM) must not read as success either.
    process.exitCode = code ?? 1;
  }
});
