// Minimal ripgrep stand-in: searches files for a literal/regex pattern and writes
// matches to grep.txt. Needed because external process output is not captured here.
// Usage: node scripts/probes/grep.cjs "<pattern>" <file-or-dir> [...]
const fs = require("node:fs");
const path = require("node:path");
const { notePath } = require("../lib/diagnostics.cjs");

const [pattern, ...targets] = process.argv.slice(2);
const outFile = notePath("grep.txt");
if (!pattern || targets.length === 0) {
  fs.writeFileSync(outFile, "usage: node scripts/probes/grep.cjs <pattern> <path...>", "utf8");
  process.exit(0);
}

const re = new RegExp(pattern, "i");
const exts = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".css", ".json", ".md"]);
const skip = new Set(["node_modules", ".next", ".git", "data"]);

const files = [];
const walk = (p) => {
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    if (skip.has(path.basename(p))) return;
    for (const entry of fs.readdirSync(p)) walk(path.join(p, entry));
  } else if (exts.has(path.extname(p))) {
    files.push(p);
  }
};

for (const t of targets) if (fs.existsSync(t)) walk(t);

const out = [];
for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (re.test(line)) out.push(`${file}:${i + 1}: ${line.trim().slice(0, 220)}`);
  });
}

fs.writeFileSync(outFile, out.length ? out.join("\n") : `no matches for ${pattern}`, "utf8");
