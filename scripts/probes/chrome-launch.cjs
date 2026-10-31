// One-off: launch headless Chrome the way qa-browser.mjs does, capture its
// stderr, and report whether CDP ever came up. Writes docs/notes/chrome-launch.txt.
//
//   node scripts/probes/chrome-launch.cjs [--instances=2]
const { spawn } = require("node:child_process");
const { mkdtempSync, existsSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const diagnostics = require("../lib/diagnostics.cjs");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const countArg = process.argv.find((a) => a.startsWith("--instances="));
const count = Number(countArg?.slice("--instances=".length) ?? 1);
const y4mArg = process.argv.find((a) => a.startsWith("--y4m="));
const y4m = y4mArg?.slice("--y4m=".length) ?? null;

/** Same synthetic clip qa-browser.mjs writes, so the probe can replay it. */
function ensureY4m(file, width = 320, height = 240, frames = 24, fps = 15) {
  if (existsSync(file)) return;
  const parts = [Buffer.from(`YUV4MPEG2 W${width} H${height} F${fps}:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < frames; f++) {
    const y = Buffer.alloc(width * height);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) y[r * width + c] = ((c + f * 10) % 80) < 40 ? 210 : 45;
    }
    const chroma = Buffer.alloc((width * height) / 4, 128);
    parts.push(Buffer.from("FRAME\n"), y, chroma, chroma);
  }
  writeFileSync(file, Buffer.concat(parts));
}
if (y4m) ensureY4m(y4m);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launch(label) {
  const port = 9600 + Math.floor(Math.random() * 2000);
  const profile = mkdtempSync(path.join(tmpdir(), `vs-cl-${label}-`));
  const err = [];
  const child = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-sync",
      "--disable-extensions",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      ...(y4m ? [`--use-file-for-fake-video-capture=${y4m}`] : []),
      "--autoplay-policy=no-user-gesture-required",
      "--window-size=1440,900",
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  child.stdout.on("data", (b) => err.push(b.toString()));
  child.stderr.on("data", (b) => err.push(b.toString()));
  child.on("exit", (code, signal) => err.push(`\n[exit code=${code} signal=${signal}]`));
  return { label, port, profile, child, err };
}

(async () => {
  const out = [];
  const instances = Array.from({ length: count }, (_, i) => launch(`i${i}`));
  for (const inst of instances) {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      await sleep(250);
      try {
        const res = await fetch(`http://127.0.0.1:${inst.port}/json/version`);
        if (res.ok) up = true;
      } catch {
        /* not yet */
      }
    }
    out.push(`--- ${inst.label} port=${inst.port} cdp=${up ? "UP" : "DOWN"} ---`);
    out.push(inst.err.join("").trim().slice(0, 2000) || "(no output)");
  }
  for (const inst of instances) inst.child.kill();
  writeFileSync(diagnostics.notePath("chrome-launch.txt"), out.join("\n") + "\n", "utf8");
  process.exit(0);
})();
