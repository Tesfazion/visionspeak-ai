// Fetches a URL and writes the status, headers and first slice of the body to http-probe.log.
// Usage: node scripts/http-probe.cjs http://localhost:3111/ [bytes]
const { writeFileSync } = require("node:fs");
const { logPath } = require("./lib/diagnostics.cjs");

const url = process.argv[2] ?? "http://localhost:3111/";
const limit = Number(process.argv[3] ?? 4000);
const outFile = logPath("http-probe.log");

(async () => {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
    const body = await res.text();
    writeFileSync(
      outFile,
      [
        `url=${url}`,
        `status=${res.status}`,
        `ms=${Date.now() - started}`,
        `len=${body.length}`,
        "--- body ---",
        body.slice(0, limit),
      ].join("\n"),
      "utf8",
    );
  } catch (err) {
    writeFileSync(outFile, `url=${url}\nERROR ${String(err)}\n`, "utf8");
  }
})();
