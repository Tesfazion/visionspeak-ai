// Filters a log file for error-ish lines and writes the unique matches plus a short
// tail to dev-errors.txt. External command output cannot be captured in this
// environment, so all log inspection happens in-process.
const fs = require("node:fs");
const { notePath, logPath } = require("./lib/diagnostics.cjs");

const file = process.argv[2] ?? logPath("dev-run.log");
const raw = fs.readFileSync(file, "utf8").replace(/\u001b\[[0-9;]*m/g, "");
const lines = raw.split(/\r?\n/);

const needles = ["Error:", "Module not found", "Failed to download", "⨯", "warn", "Warning:", "GET /", "POST /", "exit"];
const hits = [];
const seen = new Map();
for (const line of lines) {
  const trimmed = line.trim();
  if (!needles.some((n) => trimmed.includes(n))) continue;
  if (trimmed.length > 240) continue;
  const count = (seen.get(trimmed) ?? 0) + 1;
  seen.set(trimmed, count);
  if (count === 1) hits.push(trimmed);
}
const summary = [...seen.entries()]
  .map(([line, count]) => `${count > 1 ? `[x${count}] ` : ""}${line}`)
  .join("\n");

fs.writeFileSync(
  notePath("dev-errors.txt"),
  [`bytes=${raw.length} lines=${lines.length}`, "--- unique matches ---", summary, "--- tail ---", lines.slice(-25).join("\n")].join("\n"),
  "utf8",
);
