// Probes outbound connectivity to the hosts this project depends on at build time.
// Writes results to net-probe.json (stdout is not captured by the agent shell here).
const { writeFileSync } = require("node:fs");
const { artifactPath } = require("../lib/diagnostics.cjs");

const targets = [
  "https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap",
  "https://fonts.gstatic.com/s/instrumentserif/v5/jizBRFtNs2ka5fXjeivQ4LroWlx-6zsTjnTLgNuZ5w.woff2",
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
];

async function probe(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    return { url, status: res.status, ms: Date.now() - started };
  } catch (err) {
    return { url, error: String(err && err.message ? err.message : err), ms: Date.now() - started };
  }
}

(async () => {
  const results = [];
  for (const url of targets) results.push(await probe(url));
  writeFileSync(artifactPath("net-probe.json"), JSON.stringify(results, null, 2), "utf8");
})();
