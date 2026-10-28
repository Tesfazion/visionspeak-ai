// Re-seeds data/sessions.json without losing real (non-sample) sessions.
//
// The store only seeds when the file is empty, so a store seeded before the demo
// history included the flagship sample can never gain it. This script:
//   1. keeps every non-demo record,
//   2. moves the old file aside,
//   3. triggers a fresh seed through the running server,
//   4. merges the kept records back in (newest first).
//
// Usage: node scripts/reseed.cjs [baseUrl]
const fs = require("node:fs");
const path = require("node:path");
const { artifactPath } = require("./lib/diagnostics.cjs");

const root = path.resolve(__dirname, "..");
const file = path.join(root, "data", "sessions.json");
const aside = path.join(root, "data", "sessions.pre-reseed.json");
const base = process.argv[2] ?? "http://localhost:3111";

const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : []);
const writeJson = (p, value) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, p);
};

(async () => {
  const existing = readJson(file);
  const kept = existing.filter((r) => r.source !== "demo");
  if (fs.existsSync(file)) fs.renameSync(file, aside);

  const res = await fetch(`${base}/dashboard`);
  if (!res.ok) throw new Error(`dashboard responded ${res.status}`);
  await res.text();

  const reseeded = readJson(file);
  const merged = [...kept, ...reseeded]
    .filter((record, index, all) => all.findIndex((r) => r.id === record.id) === index)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  writeJson(file, merged);
  fs.rmSync(aside, { force: true });

  writeJson(artifactPath("reseed-report.json"), {
    kept: kept.map((r) => `${r.id} | ${r.title}`),
    seeded: reseeded.map((r) => `${r.id} | ${r.title}`),
    total: merged.length,
  });
})();
