// Reports free memory plus the largest chrome/node processes, and optionally
// clears orphaned headless-Chrome instances left by browser QA runs.
//   node scripts/probes/memcheck.cjs [--clean]
const fs = require("node:fs");
const os = require("node:os");
const cp = require("node:child_process");

const clean = process.argv.includes("--clean");
const out = [];

const freeMb = () => Math.round(os.freemem() / 1048576);
out.push(`free MB: ${freeMb()} of ${Math.round(os.totalmem() / 1048576)}`);

function listing(image) {
  const raw = cp.execSync(`tasklist /FI "IMAGENAME eq ${image}" /FO CSV /NH`, { encoding: "utf8" });
  return raw
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.includes(","))
    .map((line) => line.split(",").map((cell) => cell.replace(/"/g, "")))
    .map((cells) => ({
      image: cells[0],
      pid: cells[1],
      kb: Number(String(cells[4] ?? "0").replace(/[^\d]/g, "")),
    }))
    .filter((p) => Number.isFinite(p.kb) && p.kb > 0)
    .sort((a, b) => b.kb - a.kb);
}

if (clean) {
  // Only processes launched by this repo's QA runs are targeted: the QA driver
  // uses a `vs-qa-*` user-data-dir, so a plain browsing session is untouched.
  const ps = [
    "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\"",
    " | Where-Object { $_.CommandLine -match 'vs-qa-' }",
    " | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join("");
  try {
    cp.execFileSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
    out.push("cleaned orphaned vs-qa chrome instances");
  } catch (err) {
    out.push(`clean failed: ${err.message}`);
  }
}

for (const image of ["node.exe", "chrome.exe"]) {
  let rows = [];
  try {
    rows = listing(image).slice(0, 10);
  } catch {
    rows = [];
  }
  out.push(`${image}: ${rows.length ? "" : "(none)"}`);
  for (const p of rows) out.push(`  pid ${p.pid}  ${(p.kb / 1024).toFixed(0)} MB`);
}

out.push(`free MB after: ${freeMb()}`);
fs.writeFileSync("docs/notes/memcheck.txt", out.join("\n") + "\n", "utf8");
