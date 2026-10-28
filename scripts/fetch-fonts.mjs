/**
 * Downloads the exact font files the design needs and stores them locally so that
 * next/font/local can serve them without touching Google's CDN at build or run time.
 *
 * Usage: node scripts/fetch-fonts.mjs
 * Output: src/app/fonts/*.woff2 + docs/artifacts/fonts-report.json
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import diagnostics from "./lib/diagnostics.cjs";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "src", "app", "fonts");

// A modern browser UA makes the Google Fonts API return woff2 (and variable fonts).
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const families = [
  {
    file: "inter-latin.woff2",
    css: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap",
  },
  {
    file: "instrument-serif-latin.woff2",
    css: "https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap",
  },
  {
    file: "instrument-serif-italic-latin.woff2",
    css: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&display=swap",
  },
  {
    file: "jetbrains-mono-latin.woff2",
    css: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@100..800&display=swap",
  },
];

async function get(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

/** Picks the last `src: url(...)` block, which is the `/* latin *\/` subset. */
function latinUrl(css) {
  const blocks = css.split("@font-face").slice(1);
  const latin = blocks.filter((block) => block.includes("/* latin */"));
  const pick = (latin.length ? latin : blocks).at(-1);
  const match = pick?.match(/url\((https:[^)]+\.woff2)\)/);
  if (!match) throw new Error("no woff2 url found in CSS");
  return match[1];
}

const report = [];

await mkdir(outDir, { recursive: true });

for (const family of families) {
  const css = await (await get(family.css, { headers: { "User-Agent": UA } })).text();
  const url = latinUrl(css);
  const bytes = Buffer.from(await (await get(url, { headers: { "User-Agent": UA } })).arrayBuffer());
  await writeFile(path.join(outDir, family.file), bytes);
  report.push({ file: family.file, url, kb: Math.round(bytes.length / 1024) });
}

await writeFile(diagnostics.artifactPath("fonts-report.json"), JSON.stringify(report, null, 2), "utf8");
