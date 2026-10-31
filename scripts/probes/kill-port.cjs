// Kills whatever is listening on a TCP port (Windows).
// Usage: node scripts/probes/kill-port.cjs 3111
// Needed because a `next dev` child outlives the wrapper process when the agent shell exits.
const { execSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const { logPath } = require("../lib/diagnostics.cjs");

const port = process.argv[2] ?? "3111";

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true });
  return { out: r.stdout ?? "", err: r.stderr ?? "", status: r.status };
};

const netstat = run("netstat", ["-ano"]);
const rawLines = netstat.out
  .split(/\r?\n/)
  .filter((line) => line.includes(`:${port}`) && line.includes("LISTENING"));

const pids = new Set();
for (const line of rawLines) {
  const pid = line.trim().split(/\s+/).pop();
  if (/^\d+$/.test(pid) && pid !== "0") pids.add(pid);
}

// netstat is missing or its output could not be read â€” ask the TCP table via PowerShell.
if (pids.size === 0) {
  const ps = run("powershell", [
    "-NoProfile",
    "-Command",
    `Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object -ExpandProperty OwningProcess`,
  ]);
  for (const line of ps.out.split(/\r?\n/)) {
    const pid = line.trim();
    if (/^\d+$/.test(pid) && pid !== "0") pids.add(pid);
  }
}

const results = [];
for (const pid of pids) {
  const r = run("taskkill", ["/PID", String(pid), "/T", "/F"]);
  results.push({ pid, status: r.status, out: r.out.trim(), err: r.err.trim() });
}

fs.writeFileSync(
  logPath("kill-port.log"),
  JSON.stringify(
    {
      port,
      netstatStatus: netstat.status,
      netstatMatches: rawLines,
      netstatError: netstat.err.trim().slice(0, 300),
      results: results.length ? results : "no listener found",
    },
    null,
    2,
  ),
  "utf8",
);
