// Watches the project tree and reports which files change on their own.
//
// The dev client full-reloads whenever Turbopack sees a watched file change,
// and the reload re-triggers whatever writes the file — a loop that reads as
// "the login page keeps refreshing itself". This snapshots mtimes, waits, and
// prints what moved, so the writer is identified instead of guessed at.
//
//   node scripts/probes/mtime-watch.cjs [seconds] [dir...]
//
// Results land in docs/notes/mtime-watch.txt.
const fs = require("node:fs");
const path = require("node:path");
const diagnostics = require("../lib/diagnostics.cjs");

const seconds = Number(process.argv[2] ?? 12);
const roots = process.argv.slice(3);
const targets = roots.length ? roots : ["."];

const SKIP = new Set(["node_modules", ".git", ".next", ".kilo"]);

function snapshot(dir, out = new Map()) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      snapshot(full, out);
    } else {
      try {
        const stat = fs.statSync(full);
        out.set(full, `${stat.mtimeMs}:${stat.size}`);
      } catch {
        /* vanished mid-scan */
      }
    }
  }
  return out;
}

const before = new Map();
for (const t of targets) snapshot(path.resolve(diagnostics.root, t), before);

setTimeout(() => {
  const after = new Map();
  for (const t of targets) snapshot(path.resolve(diagnostics.root, t), after);

  const lines = [`window=${seconds}s roots=${targets.join(",")} files=${before.size}`];
  let changed = 0;
  for (const [file, stamp] of after) {
    const previous = before.get(file);
    if (previous !== stamp) {
      changed++;
      lines.push(`${previous === undefined ? "NEW " : "MOD "} ${path.relative(diagnostics.root, file)}  ${previous ?? "-"} -> ${stamp}`);
    }
  }
  for (const file of before.keys()) {
    if (!after.has(file)) {
      changed++;
      lines.push(`GONE ${path.relative(diagnostics.root, file)}`);
    }
  }
  lines.push(changed === 0 ? "RESULT nothing changed while idle" : `RESULT ${changed} file(s) changed while idle`);
  fs.writeFileSync(diagnostics.notePath("mtime-watch.txt"), lines.join("\n") + "\n", "utf8");
  process.exit(0);
}, seconds * 1000);
