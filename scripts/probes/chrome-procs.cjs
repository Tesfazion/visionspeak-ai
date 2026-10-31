// Lists Chrome processes together with their command line, so probe-launched
// headless instances can be told apart from a browser the user opened.
//
//   node scripts/probes/chrome-procs.cjs
//
// Results land in docs/notes/chrome-procs.txt.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const diagnostics = require("../lib/diagnostics.cjs");

const script = [
  "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\"",
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

const headless = rows.filter((r) => /--headless/.test(r.CommandLine || ""));
const lines = [
  `total=${rows.length} headless=${headless.length}`,
  `stderr=${(result.stderr || "").trim().slice(0, 300)}`,
  "",
  ...rows.map((r) => {
    const cmd = String(r.CommandLine || "");
    const profile = (cmd.match(/--user-data-dir=("[^"]+"|\S+)/) || [])[1] || "";
    const port = (cmd.match(/--remote-debugging-port=(\d+)/) || [])[1] || "";
    return `${r.ProcessId}\t${r.CreationDate}\t${port ? `port=${port}` : "no-port"}\t${profile ? `profile=${profile}` : ""}`;
  }),
];

fs.writeFileSync(diagnostics.notePath("chrome-procs.txt"), lines.join("\n") + "\n", "utf8");
