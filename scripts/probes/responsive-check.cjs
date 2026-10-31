// Verifies that the responsive design-system classes actually reach the browser.
// Prints which utilities exist in the served CSS for each breakpoint rule.
// Usage: node scripts/probes/responsive-check.cjs [baseUrl]
const { writeFileSync } = require("node:fs");
const { notePath } = require("../lib/diagnostics.cjs");

const base = process.argv[2] ?? "http://localhost:3111";

const checks = [
  [".container-page", /\.container-page\s*\{/],
  [".container-wide", /\.container-wide\s*\{/],
  [".safe-b", /\.safe-b\s*\{/],
  [".overscroll-contain-y", /\.overscroll-contain-y\s*\{/],
  ["3xl breakpoint (120rem)", /120rem/],
  ["container-page 1920 canvas (100rem)", /max-width:\s*100rem/],
  ["container-wide 1920 canvas (110rem)", /max-width:\s*110rem/],
  ["1200px+ gutter rule (2rem inline padding)", /padding-inline:\s*2rem/],
];

(async () => {
  const out = [`base=${base}`];
  try {
    const html = await (await fetch(`${base}/`)).text();
    const hrefs = [...html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) => m[1]);
    out.push(`css files=${hrefs.length}`);
    let css = "";
    for (const href of hrefs) css += await (await fetch(base + href)).text();
    out.push(`css bytes=${css.length}`);
    out.push("--- design system ---");
    for (const [label, re] of checks) out.push(`${re.test(css) ? "PASS" : "FAIL"} ${label}`);

    out.push("--- routes ---");
    for (const route of ["/", "/studio", "/dashboard", "/report/demo"]) {
      const res = await fetch(base + route);
      const body = await res.text();
      out.push(`${res.status === 200 ? "PASS" : "FAIL"} ${res.status} ${route} (${body.length} bytes)`);
    }
  } catch (err) {
    out.push(`ERROR ${err.message}`);
  }
  writeFileSync(notePath("responsive-check.txt"), out.join("\n"), "utf8");
})();
