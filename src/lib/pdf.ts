/**
 * Dependency-free PDF rendering for report export.
 *
 * The project deliberately carries no native or heavy dependencies, and PDF is
 * a small enough format to write by hand: an object tree, one content stream
 * per page and a font. Everything is Helvetica (a base-14 font every PDF
 * viewer must provide), so there is nothing to embed and the output is a few
 * kilobytes even for a long report.
 *
 * Coordinates are in points (1/72"), y measured from the bottom of the page,
 * which is how PDF wants them. Helpers take a "top-down" y for sanity.
 */

import type { SessionRecord } from "@/lib/types";
import { formatDuration } from "@/lib/math";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LINE = 14;

type Color = [number, number, number];

const INK: Color = [0.09, 0.12, 0.16];
const FOG: Color = [0.45, 0.45, 0.52];
const BRAND: Color = [0.42, 0.31, 0.93];
const MINT: Color = [0.1, 0.62, 0.44];
const AMBER: Color = [0.78, 0.55, 0.1];
const ROSE: Color = [0.82, 0.24, 0.35];

/* ------------------------------------------------------------------ *
 * Text escaping and width measurement (Helvetica metrics)
 * ------------------------------------------------------------------ */

const escapeText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** Narrow ASCII widths (per 1000 units) for Helvetica; everything else ~556. */
const NARROW: Record<string, number> = {
  " ": 278,
  "!": 278,
  "'": 191,
  ",": 278,
  "-": 333,
  ".": 278,
  "/": 278,
  I: 278,
  J: 500,
  i: 222,
  j: 222,
  l: 222,
  f: 278,
  r: 333,
  t: 278,
  "(": 333,
  ")": 333,
  "[": 278,
  "]": 278,
  ":": 278,
  ";": 278,
  "|": 260,
};

const widthOf = (text: string, size: number, bold = false) => {
  const em = bold ? 0.54 : 0.5; // Helvetica is narrower than Bold
  let units = 0;
  for (const ch of text) units += NARROW[ch] ?? 556;
  return (units / 1000) * size * em;
};

/* ------------------------------------------------------------------ *
 * Content-stream builder
 * ------------------------------------------------------------------ */

class Content {
  private ops: string[] = [];

  fill(color: Color, x: number, yTop: number, w: number, h: number) {
    const [, , b] = color;
    const y = PAGE_H - yTop - h;
    this.ops.push(
      `${color.map((c) => c.toFixed(3)).join(" ")} rg`,
      `${round(x)} ${round(y)} ${round(w)} ${round(h)} re f`,
      `${b.toFixed(3)} G`, // restore a known stroke colour so `S` stays sane
    );
  }

  text(
    str: string,
    x: number,
    yTop: number,
    size: number,
    color: Color,
    bold = false,
  ) {
    const y = PAGE_H - yTop - size;
    this.ops.push(
      "BT",
      `/${bold ? "F2" : "F1"} ${round(size)} Tf`,
      `${color.map((c) => c.toFixed(3)).join(" ")} rg`,
      `1 0 0 1 ${round(x)} ${round(y)} Tm`,
      `(${escapeText(str)}) Tj`,
      "ET",
    );
  }

  /** Draws `text` inside `maxWidth`, wrapping on spaces. Returns lines used. */
  paragraph(
    str: string,
    x: number,
    y: number,
    size: number,
    color: Color,
    maxWidth = CONTENT_W,
    bold = false,
  ): number {
    const words = str.split(/\s+/).filter(Boolean);
    if (!words.length) return 0;
    let line = "";
    let lines = 0;
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (widthOf(candidate, size, bold) > maxWidth && line) {
        this.text(line, x, y + lines * (size * 1.45), size, color, bold);
        line = word;
        lines++;
      } else {
        line = candidate;
      }
    }
    if (line) {
      this.text(line, x, y + lines * (size * 1.45), size, color, bold);
      lines++;
    }
    return lines;
  }

  build(): string {
    return this.ops.join("\n");
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

const toneColor = (score: number): Color =>
  score >= 75 ? MINT : score >= 50 ? AMBER : ROSE;

/* ------------------------------------------------------------------ *
 * Page assembly
 * ------------------------------------------------------------------ */

function coverPage(session: SessionRecord): { content: Content; used: number } {
  const c = new Content();
  const r = session.report;
  let y = MARGIN;

  c.fill(BRAND, 0, 0, PAGE_W, 6);
  c.text("VISIONSPEAK — DELIVERY REPORT", MARGIN, y, 9, BRAND, true);
  y += 30;
  c.text(session.title, MARGIN, y, 24, INK, true);
  y += 34;
  const meta = `${session.speaker} · ${session.mode} · ${formatDuration(session.durationSec)} · ${new Date(session.createdAt).toLocaleDateString("en-GB")}`;
  c.text(meta, MARGIN, y, 10, FOG);
  y += 30;

  // Overall score band
  const tone = toneColor(r.overall);
  c.fill(tone, MARGIN, y, 130, 86);
  c.text(`${r.overall}`, MARGIN + 16, y + 16, 42, [1, 1, 1], true);
  c.text("/100", MARGIN + 92, y + 44, 12, [1, 1, 1]);
  c.text(`${r.grade} · ${r.gradeLabel}`, MARGIN + 150, y + 12, 18, INK, true);
  y += 96;

  const lines = c.paragraph(r.summary, MARGIN, y, 11, FOG);
  y += lines * 16 + 14;

  // Pillars
  const pillars: [string, number][] = [
    ["Confidence", r.pillars.confidence],
    ["Leadership", r.pillars.leadership],
    ["Communication", r.pillars.communication],
    ["Engagement", r.pillars.engagement],
    ["Eye contact", r.pillars.eyeContact],
    ["Posture", r.pillars.posture],
    ["Gestures", r.pillars.gestures],
    ["Voice", r.pillars.voice],
    ["Expression", r.pillars.expression],
  ];
  for (const [label, value] of pillars) {
    if (y > PAGE_H - MARGIN - 24) break;
    c.text(label, MARGIN, y + 3, 10.5, INK);
    c.text(
      `${value}`,
      PAGE_W - MARGIN - 28,
      y + 3,
      10.5,
      toneColor(value),
      true,
    );
    c.fill([0.93, 0.93, 0.95], MARGIN, y + 17, CONTENT_W, 4);
    c.fill(toneColor(value), MARGIN, y + 17, (CONTENT_W * value) / 100, 4);
    y += 26;
  }

  return { content: c, used: y };
}

function detailPages(session: SessionRecord, options: { redactTranscript?: boolean } = {}): Content[] {
  const r = session.report;
  const pages: Content[] = [];
  let c = new Content();
  let y = MARGIN;

  const startSection = (title: string) => {
    if (y > PAGE_H - MARGIN - 60) {
      pages.push(c);
      c = new Content();
      y = MARGIN;
    }
    c.text(title.toUpperCase(), MARGIN, y, 9, BRAND, true);
    y += 20;
  };

  const row = (label: string, value: string | number) => {
    if (y > PAGE_H - MARGIN - 20) {
      pages.push(c);
      c = new Content();
      y = MARGIN;
    }
    c.text(label, MARGIN, y, 10, FOG);
    c.text(String(value), PAGE_W - MARGIN - 60, y, 10, INK);
    y += LINE + 3;
  };

  startSection("Gaze & face");
  row("Eye contact", `${r.face.eyeContactPct}%`);
  row("Gaze breaks", `${r.face.gazeAwayCount} (avg ${r.face.avgGazeAwaySec}s)`);
  row("Blink rate", `${r.face.blinkRatePerMin}/min`);
  row("Smiling", `${r.face.smilePct}%`);
  row("Expression range", `${r.face.expressionVariety}/100`);
  row("Face visible", `${r.face.faceVisiblePct}%`);
  y += 10;

  startSection("Posture & movement");
  row("Alignment", `${r.pose.alignmentScore}/100`);
  row("Upright", `${r.pose.uprightPct}%`);
  row("Average lean", `${r.pose.avgLeanDeg}°`);
  row("Head over shoulders", `${r.pose.headOverShouldersPct}%`);
  row("Sway index", `${r.pose.swayIndex}/100`);
  y += 10;

  startSection("Voice & rhythm");
  row(
    "Speaking rate",
    r.voice.avgWpm ? `${r.voice.avgWpm} wpm` : "acoustic estimate",
  );
  row("Speaking time", `${r.voice.speakingTimePct}%`);
  row("Volume consistency", `${r.voice.volumeConsistency}/100`);
  row("Pitch variation", `${r.voice.pitchVariation} st`);
  row("Pauses", `${r.voice.pauseCount} (${r.voice.longPauseCount} long)`);
  row("Filler rate", `${r.speech.fillerRate}/100 words`);
  y += 12;

  for (const [title, items, accent] of [
    ["What is working", r.strengths, MINT],
    ["What to fix next", r.improvements, AMBER],
  ] as const) {
    startSection(title);
    if (!items.length) {
      c.paragraph(
        "Nothing notable was detected for this section.",
        MARGIN,
        y,
        10,
        FOG,
      );
      y += 24;
    }
    for (const item of items) {
      if (y > PAGE_H - MARGIN - 70) {
        pages.push(c);
        c = new Content();
        y = MARGIN;
      }
      c.fill(accent, MARGIN, y + 4, 3, 12);
      c.text(item.title, MARGIN + 12, y, 11, INK, true);
      y += 16;
      const lines = c.paragraph(item.detail, MARGIN + 12, y, 10, FOG);
      y += lines * 15 + 10;
    }
    y += 8;
  }

  startSection("Your next drills");
  for (const [i, action] of r.plan.entries()) {
    if (y > PAGE_H - MARGIN - 80) {
      pages.push(c);
      c = new Content();
      y = MARGIN;
    }
    c.text(
      `0${i + 1} · ${action.title} (${action.target})`,
      MARGIN,
      y,
      11,
      INK,
      true,
    );
    y += 16;
    const lines = c.paragraph(
      `${action.why} Drill: ${action.drill}`,
      MARGIN,
      y,
      10,
      FOG,
    );
    y += lines * 15 + 10;
  }

  if (r.speech.transcript && !options.redactTranscript) {
    startSection("Transcript");
    const lines = c.paragraph(r.speech.transcript, MARGIN, y, 9.5, FOG);
    y += lines * 13;
  }

  pages.push(c);
  return pages;
}

/* ------------------------------------------------------------------ *
 * PDF object assembly
 * ------------------------------------------------------------------ */

interface Obj {
  body?: string;
  stream?: string;
}

/** Serialises the document. Object 1 is the catalogue, 2 the page tree. */
function assemble(objects: Obj[]): Buffer {
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj.body}\nendobj\n`;
  });

  const xrefStart = body.length;
  const count = objects.length + 1;
  body += `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  // Latin-1 keeps byte offsets == string length, which xref requires.
  return Buffer.from(body, "latin1");
}

export async function renderReportPdf(
  session: SessionRecord,
  options: { redactTranscript?: boolean } = {},
): Promise<Buffer> {
  const cover = coverPage(session);
  const pages = [cover.content, ...detailPages(session, options)];

  const objects: Obj[] = [];
  const pageObjIds: number[] = [];
  const firstPageObj = 5; // 1 catalogue, 2 page tree, 3/4 fonts

  pages.forEach((_, i) => pageObjIds.push(firstPageObj + i * 2));

  objects.push({
    body: `<< /Type /Catalog /Pages 2 0 R >>`,
  });
  objects.push({
    body: `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  });
  objects.push({
    body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
  });
  objects.push({
    body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
  });

  pages.forEach((content, i) => {
    const streamObj = firstPageObj + i * 2;
    objects.push({
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${round(PAGE_W)} ${round(PAGE_H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamObj + 1} 0 R >>`,
    });
    objects.push({ stream: content.build() });
  });

  objects.push({
    body: `<< /Title (${escapeText(`${session.title} — VisionSpeak report`)}) /Producer (VisionSpeak AI) /CreationDate (D:${new Date().toISOString().slice(0, 19).replace(/[-:]/g, "")}Z) >>`,
  });

  // Resolve stream /Length against the final byte count of each stream body.
  const resolved = objects.map((obj) => {
    if (obj.stream === undefined) return { body: obj.body };
    const length = Buffer.byteLength(obj.stream, "latin1");
    return {
      body: `<< /Length ${length} >>\nstream\n${obj.stream}\nendstream`,
    };
  });
  return assemble(resolved);
}
