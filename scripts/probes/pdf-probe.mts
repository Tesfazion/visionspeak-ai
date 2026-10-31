import { renderReportPdf } from "../../src/lib/pdf.ts";
import { buildDemoHistory } from "../../src/lib/analysis/demo.ts";
import { writeFileSync } from "node:fs";

const demo = buildDemoHistory();
const buf = await renderReportPdf(demo[0]);
writeFileSync("data/pdf-probe.pdf", buf);

const text = buf.toString("latin1");
const checks = [
  ["header", text.startsWith("%PDF-1.4")],
  ["eof", text.trimEnd().endsWith("%%EOF")],
  ["catalog", text.includes("/Type /Catalog")],
  ["page tree", text.includes("/Type /Pages")],
  [
    "fonts",
    text.includes("/BaseFont /Helvetica") && text.includes("/Helvetica-Bold"),
  ],
  ["streams", text.includes("stream")],
  ["xref present", text.includes("xref")],
  ["startxref present", text.includes("startxref")],
];
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) ok = false;
}
// xref offsets must point at "N 0 obj"
const xrefBlock = text.slice(text.indexOf("xref"));
const offsets = [...xrefBlock.matchAll(/^(\d{10}) 00000 n/gm)]
  .slice(1)
  .map((m) => Number(m[1]));
offsets.forEach((off, i) => {
  const found = text.slice(off).startsWith(`${i + 1} 0 obj`);
  console.log(`${found ? "PASS" : "FAIL"}  xref offset ${i + 1} -> ${off}`);
  if (!found) ok = false;
});
console.log(`bytes: ${buf.length}`);
process.exit(ok ? 0 : 1);
