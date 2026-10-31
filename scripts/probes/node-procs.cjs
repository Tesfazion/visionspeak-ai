// Lists node processes with their command lines so repeated probe/build runs can
// be told apart from the dev server that should stay running.
//
//   node scripts/probes/node-procs.cjs
//
// Results land in docs/notes/node-procs.txt.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const diagnostics = require("../lib/diagnostics.cjs");

const script = [
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\"",
  "| Select-Object ProcessId,CreationDate,CommandLine",
  "| ConvertTo-Json -Compress -Depth 3",
].join(" ");

const result = spawnSync("powershell", ["-NoProfile", "-Command", script], {
  encoding: "utf8",
  timeout: 60_000,
  windowsHide: true,
});

let rows = [];
try {
  const parsed = JSON.parse((result.stdout || "[]").trim() || "[]");
  rows = Array.isArray(parsed) ? parsed : [parsed];
} catch {
  rows = [];
}

const lines = [`total=${rows.length}`, ""];
for (const row of rows) {
  lines.push(`${row.ProcessId}\t${String(row.CommandLine || "").slice(0, 170)}`);
}

fs.writeFileSync(diagnostics.notePath("node-procs.txt"), lines.join("\n") + "\n", "utf8");
