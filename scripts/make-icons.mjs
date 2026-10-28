// Rasterises public/icons/mark.svg into the PNG sizes the web manifest and
// Apple touch icon need. Sharp ships with Next, so this adds no dependency.
//
// Usage: node scripts/make-icons.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "public", "icons");
const svg = await readFile(path.join(outDir, "mark.svg"));

await mkdir(outDir, { recursive: true });

/** Maskable icons must keep their content inside a 80% safe circle. */
async function maskable(size) {
  const inner = Math.round(size * 0.78);
  const padding = Math.round((size - inner) / 2);
  const layers = await sharp(svg).resize(inner, inner).png().toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 6, g: 6, b: 11, alpha: 1 },
    },
  })
    .composite([{ input: layers, top: padding, left: padding }])
    .png()
    .toBuffer();
}

const jobs = [
  ["icon-192.png", () => sharp(svg).resize(192, 192).png().toBuffer()],
  ["icon-512.png", () => sharp(svg).resize(512, 512).png().toBuffer()],
  ["maskable-512.png", () => maskable(512)],
  ["apple-touch-icon.png", () => sharp(svg).resize(180, 180).png().toBuffer()],
  ["favicon-32.png", () => sharp(svg).resize(32, 32).png().toBuffer()],
];

const report = [];
for (const [name, build] of jobs) {
  const buffer = await build();
  await writeFile(path.join(outDir, name), buffer);
  report.push({ file: name, bytes: buffer.length });
}

const diagnostics = await import("./lib/diagnostics.cjs");
await writeFile(
  diagnostics.default.artifactPath("icons-report.json"),
  JSON.stringify(report, null, 2),
  "utf8",
);
