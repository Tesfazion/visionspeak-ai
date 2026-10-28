// Runs a command and writes its combined output to docs/notes/probe-<name>.txt.
// The agent shell here does not capture child-process stdout, so every check
// needs to land in a file to be readable.
// Usage: node scripts/run-probe.cjs <name> <command> [args...]
const { spawnSync } = require("node:child_process");
const { notePath } = require("./lib/diagnostics.cjs");

const [name, cmd, ...args] = process.argv.slice(2);
const out = [`$ ${cmd} ${args.join(" ")}`];

try {
  const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, shell: true, timeout: 300000 });
  out.push(`exit=${r.status}`, "--- stdout ---", r.stdout ?? "", "--- stderr ---", r.stderr ?? "");
} catch (err) {
  out.push(`ERROR ${String(err)}`);
}

require("node:fs").writeFileSync(notePath(`probe-${name || "out"}.txt`), out.join("\n"), "utf8");
