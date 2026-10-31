// Diagnoses status-code handling for the auth gate and notFound().
// Usage: node scripts/probes/probe-status.cjs [baseUrl]
const { writeFileSync } = require("node:fs");
const { notePath } = require("../lib/diagnostics.cjs");

const base = process.argv[2] ?? "http://localhost:3112";
const out = [];

(async () => {
  for (const path of ["/dashboard", "/studio", "/report/does-not-exist", "/report/demo"]) {
    const res = await fetch(base + path, { redirect: "manual" });
    const text = await res.text();
    out.push(`--- ${path}`);
    out.push(`status=${res.status} location=${res.headers.get("location") ?? "-"} len=${text.length}`);
    out.push(`hasSignIn=${text.includes("Welcome back")}`);
    out.push(`hasDashboard=${text.includes("Practice history")}`);
    out.push(`has404=${text.includes("never made it to the stage")}`);
    out.push(`hasErrorBoundary=${text.includes("failed to render")}`);
    out.push(`rscHeader=${res.headers.get("x-nextjs-prerender") ?? "-"}`);
    out.push(`cache=${res.headers.get("cache-control") ?? "-"}`);
    // A redirect rendered inside RSC shows up as a meta refresh or script push.
    const metaRefresh = /http-equiv="refresh"/i.test(text);
    out.push(`metaRefresh=${metaRefresh}`);
    const head = text.slice(0, 300).replace(/\s+/g, " ");
    out.push(`head=${head}`);
  }
  writeFileSync(notePath("probe-status.txt"), out.join("\n"), "utf8");
})();
