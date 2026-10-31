// Theme audit for the running platform.
//
//   node scripts/qa/qa-theme.mjs [origin] [--theme=dark] [--auth] [--seed]
//
// Loads each page with `visionspeak:theme=<theme>` pre-set in localStorage, then:
//   1. asserts the theme attribute and the resolved background token;
//   2. walks every visible text node and computes its contrast ratio against
//      the nearest painted ancestor background, flagging anything under the
//      WCAG AA threshold;
//   3. saves a full screenshot per page to docs/artifacts/<theme>-<name>.png.
//
// Real browser, real cascade — the point is to catch utilities that look right
// in the stylesheet but resolve to white-on-white once the theme flips.
// `--auth` signs a throwaway account up and adds the signed-in pages, which is
// where the score rings and charts live; `--seed` posts two sessions first so
// the dashboard paints its trend lines instead of an empty state.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import diagnostics from "../lib/diagnostics.cjs";

const origin = (process.argv[2] ?? "http://localhost:3111").replace(/\/$/, "");
const theme = process.argv.find((a) => a.startsWith("--theme="))?.split("=")[1] ?? "light";
const withAuth = process.argv.includes("--auth");
const withSeed = process.argv.includes("--seed");
// The one token each theme must resolve to; a stale build shows up here first.
const EXPECTED_BASE = { light: "#f4f4fa", dark: "#06060b" };
// Chart chrome, mirroring the palettes in src/components/site/theme.tsx.
const EXPECTED_GRID = { light: "rgba(20,18,30,0.08)", dark: "rgba(255,255,255,0.05)" };
const EXPECTED_AXIS = { light: "#6b6a83", dark: "#7a7a92" };

/**
 * A minimal-but-valid aggregate (the shape scripts/smoke.mjs proves the API
 * accepts). Two of these give the dashboard enough history for the trend chart,
 * score rings and pillar bars to actually paint — otherwise the pages this
 * audit most wants to check render an empty state.
 */
const seedAggregate = (durationSec, phase) => ({
  durationSec,
  analyzedFrames: 1200,
  faceVisiblePct: 92,
  eyeContactPct: 68 + phase,
  gazeAwayCount: 10,
  avgGazeAwaySec: 1.6,
  blinkRatePerMin: 19,
  smilePct: 16,
  expressionVariety: 36,
  tension: 21,
  headStabilityPct: 72,
  avgShoulderSlopeDeg: 5,
  avgLeanDeg: 8,
  uprightPct: 70,
  headOverShouldersPct: 75,
  swayIndex: 18,
  alignmentScore: 80,
  gestureRatePerMin: 12,
  handsVisiblePct: 57,
  bothHandsPct: 34,
  openness: 1.4,
  nervousness: 32,
  voice: {
    speakingTimePct: 67,
    avgDb: -31,
    volumeConsistency: 60,
    pitchVariation: 6.2,
    pauseCount: 8,
    longPauseCount: 1,
    avgPauseSec: 0.8,
    energy: 56,
  },
  speech: {
    transcript: "today I want to walk through three ideas and why they matter",
    words: 12,
    fillers: [{ word: "um", count: 2 }],
    totalFillers: 2,
    fillerEvents: [],
    supported: true,
    language: "en-US",
  },
  wpm: 145,
  paceSource: "transcript",
  emotions: { neutral: 50, happy: 18, surprise: 6, sad: 9, angry: 8, fear: 9 },
  timeline: Array.from({ length: durationSec }, (_, t) => ({
    t,
    confidence: 60 + phase + Math.round(10 * Math.sin(t / 9)),
    engagement: 62 + phase + Math.round(9 * Math.cos(t / 7)),
    leadership: 58 + phase + Math.round(8 * Math.sin(t / 11)),
    communication: 63 + Math.round(7 * Math.cos(t / 8)),
    eyeContact: 65 + Math.round(12 * Math.sin(t / 6)),
    posture: 70 + Math.round(7 * Math.cos(t / 5)),
    gestures: 55 + Math.round(11 * Math.sin(t / 4)),
    voice: 60 + Math.round(9 * Math.cos(t / 6)),
    expression: 58 + Math.round(8 * Math.sin(t / 7)),
    gaze: 70,
    yaw: 4,
    pitch: -2,
    db: -31,
    energy: 56,
    wpm: 145,
    face: true,
    hands: 1,
    emotion: "neutral",
    smiling: 14,
  })),
});

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
].find((p) => p && existsSync(p));

const PAGES = [
  { path: "/", name: "home" },
  { path: "/pricing", name: "pricing" },
  // /login is meaningless while signed in (it redirects), so it is only part of
  // the signed-out sweep.
  ...(withAuth ? [] : [{ path: "/login", name: "login" }]),
  { path: "/report/demo", name: "report" },
  ...(withAuth
    ? [
        { path: "/dashboard", name: "dashboard" },
        { path: "/studio", name: "studio" },
        { path: "/account", name: "account" },
      ]
    : []),
];

const lines = [
  `origin=${origin}`,
  `theme=${theme} auth=${withAuth}`,
  `chrome=${CHROME ?? "NOT FOUND"}`,
  `at=${new Date().toISOString()}`,
];
let failures = 0;
const record = (line) => lines.push(line);
const check = (ok, label, detail = "") => {
  lines.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.next = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    });
  }
  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener("open", () => resolve(new Cdp(ws)));
      ws.addEventListener("error", () => reject(new Error("cdp socket failed")));
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`cdp timeout: ${method}`));
        }
      }, 120_000);
    });
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Runs in the page: worst contrast ratios for visible text. */
const AUDIT = `(() => {
  const parseColor = (value) => {
    const m = String(value).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const parts = m[1].split(/[,/\\s]+/).filter(Boolean).map(Number);
    if (parts.length < 3) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const ratio = (fg, bg) => {
    const a = luminance(fg);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const blend = (fg, bg) => {
    const a = fg.a;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  // A gradient has no backgroundColor to read. Averaging its stops (weighted by
  // alpha, then composited over whatever is behind it) is close enough to catch
  // white-on-white — the failure this audit exists for.
  const gradientStops = (image) =>
    [...String(image).matchAll(/rgba?\\(([^)]+)\\)/g)]
      .map((m) => m[1].split(/[,/\\s]+/).filter(Boolean).map(Number))
      .filter((p) => p.length >= 3)
      .map((p) => ({ r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }))
      .filter((p) => p.a > 0.005);

  const paintedBackground = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const style = getComputedStyle(node);
      const solid = parseColor(style.backgroundColor);
      const hasImage = style.backgroundImage && style.backgroundImage !== "none";
      const stops = hasImage ? gradientStops(style.backgroundImage) : [];

      if (stops.length) {
        const weight = stops.reduce((n, s) => n + s.a, 0);
        const average = {
          r: stops.reduce((n, s) => n + s.r * s.a, 0) / weight,
          g: stops.reduce((n, s) => n + s.g * s.a, 0) / weight,
          b: stops.reduce((n, s) => n + s.b * s.a, 0) / weight,
          a: weight / stops.length,
        };
        const behind = paintedBackground(node.parentElement ?? document.body);
        return over(average, solid && solid.a > 0.05 ? over(solid, behind) : behind);
      }

      if (solid && solid.a > 0.55) return solid;
      if (solid && solid.a > 0.05) {
        return over(solid, paintedBackground(node.parentElement ?? document.body));
      }
      node = node.parentElement;
    }
    const body = parseColor(getComputedStyle(document.body).backgroundColor);
    return body ?? { r: 255, g: 255, b: 255, a: 1 };
  };

  const findings = [];
  let measured = 0;
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) < 0.5) continue;
    // Only elements that directly hold text.
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if (rect.bottom < -50 || rect.top > window.innerHeight + 4000) continue;

    // Camera stages keep dark chrome by design — their HUD text is white on
    // video and cannot be measured against a backgroundColor.
    if (el.closest(".dark-stage")) continue;
    // Gradient-filled text (background-clip: text) reports a transparent colour
    // by design; the visible fill is a background, not a colour.
    if (style.webkitBackgroundClip === "text" || style.backgroundClip === "text") continue;

    const fgRaw = parseColor(style.color);
    if (!fgRaw) continue;
    const bg = paintedBackground(el);
    const fg = fgRaw.a < 0.99 ? blend(fgRaw, bg) : fgRaw;
    const value = ratio(fg, bg);
    measured++;
    const size = parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const threshold = large ? 3 : 4.5;
    if (value < threshold) {
      const key = el.className + "|" + el.textContent.trim().slice(0, 24);
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        ratio: Math.round(value * 100) / 100,
        color: style.color,
        bg: \`rgb(\${Math.round(bg.r)},\${Math.round(bg.g)},\${Math.round(bg.b)})\`,
        size: Math.round(size * 10) / 10,
        text: el.textContent.trim().replace(/\\s+/g, " ").slice(0, 48),
        cls: String(el.className).slice(0, 90),
      });
    }
  }
  findings.sort((a, b) => a.ratio - b.ratio);

  const root = getComputedStyle(document.documentElement);
  return {
    theme: document.documentElement.dataset.theme,
    base: root.getPropertyValue("--color-base").trim(),
    ink: root.getPropertyValue("--color-ink").trim(),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    panelBg: document.querySelector(".panel")
      ? getComputedStyle(document.querySelector(".panel")).backgroundImage.slice(0, 60)
      : null,
    measured,
    worst: findings.slice(0, 12),
    failCount: findings.length,
    snippet: document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 180),
  };
})()`;

try {
  if (!CHROME) throw new Error("no Chrome binary found");
  const port = await freePort();
  const profile = mkdtempSync(path.join(tmpdir(), "vs-light-"));
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
      "--hide-scrollbars",
      "--window-size=1440,1000",
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );

  let version = null;
  for (let i = 0; i < 120 && !version; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) version = await res.json();
    } catch {
      /* not up yet */
    }
  }
  if (!version) throw new Error(`chrome did not expose CDP on ${port}`);

  const browser = await Cdp.connect(version.webSocketDebuggerUrl);
  const target = await browser.send("Target.createTarget", { url: "about:blank" });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;

  await browser.send("Page.enable", {}, sessionId);
  await browser.send("Runtime.enable", {}, sessionId);
  // Pre-seed the stored theme so themeInitScript paints it on the first frame.
  await browser.send(
    "Page.addScriptToEvaluateOnNewDocument",
    { source: `try { localStorage.setItem("visionspeak:theme", ${JSON.stringify(theme)}); } catch (e) {}` },
    sessionId,
  );

  const evaluate = async (expression) => {
    const res = await browser.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    return res.result.value;
  };

  mkdirSync(path.join("docs", "artifacts"), { recursive: true });

  if (withAuth) {
    const email = `qa-theme-${Date.now()}@example.com`;
    const res = await fetch(`${origin}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: `Qa-theme-pass-${Date.now()}` }),
    });
    if (res.status !== 201) throw new Error(`signup -> ${res.status}`);
    const raw = (res.headers.getSetCookie?.() ?? [])[0] ?? "";
    const token = raw.match(/vs_session=([^;]+)/)?.[1];
    if (!token) throw new Error("signup set no session cookie");
    await browser.send(
      "Network.setCookie",
      { name: "vs_session", value: token, domain: new URL(origin).hostname, path: "/", httpOnly: true },
      sessionId,
    );
    record(`signed in as ${email}`);

    if (withSeed) {
      for (const [index, phase] of [0, 6].entries()) {
        const created = await fetch(`${origin}/api/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: `vs_session=${token}` },
          body: JSON.stringify({
            aggregate: seedAggregate(60 + index * 30, phase),
            meta: { title: `Theme audit ${index + 1}`, mode: "practice", speaker: "QA" },
          }),
        });
        if (created.status !== 201) throw new Error(`seed session -> ${created.status}`);
      }
      record("seeded 2 sessions");
    }
  }

  for (const page of PAGES) {
    // Stamp the *current* document, then wait for it to disappear: without this
    // the "page is ready" poll is satisfied by the outgoing page and the audit
    // measures a half-swapped DOM.
    const navToken = `${Date.now()}-${Math.random()}`;
    await evaluate(`window.__auditNav = ${JSON.stringify(navToken)}`).catch(() => undefined);
    await browser.send("Page.navigate", { url: `${origin}${page.path}` }, sessionId);

    // Server components stream: the layout header paints long before the page
    // body arrives, so "has text" is not "is done". Wait for the text length to
    // settle across two polls and for the document to finish loading.
    let previousLength = -1;
    for (let i = 0; i < 60; i++) {
      await sleep(600);
      const state = await evaluate(`(() => {
        if (window.__auditNav === ${JSON.stringify(navToken)}) return null;
        return {
          length: document.body ? document.body.innerText.length : 0,
          complete: document.readyState === "complete",
          theme: document.documentElement.dataset.theme,
        };
      })()`).catch(() => null);
      if (!state) continue;
      if (state.complete && state.length > 120 && state.length === previousLength && state.theme === theme) break;
      previousLength = state.length;
    }
    // Hydration replaces the header and charts mount after their data resolves.
    await sleep(1400);

    const audit = await evaluate(AUDIT);
    // Charts paint through SVG attributes rather than classes, so assert their
    // resolved colours too — this is the one surface the CSS cascade cannot fix.
    const charts = await evaluate(`(() => {
      const attr = (sel, name) => document.querySelector(sel)?.getAttribute(name) ?? null;
      return {
        grid: attr(".recharts-cartesian-grid line", "stroke") ?? attr(".recharts-polar-grid line", "stroke"),
        tick: attr(".recharts-cartesian-axis-tick-value", "fill"),
        line: attr(".recharts-line-curve", "stroke") ?? attr(".recharts-area-curve", "stroke"),
      };
    })()`);
    const chartsPresent = Boolean(charts.grid || charts.line);
    record(`charts grid=${charts.grid} tick=${charts.tick} line=${charts.line}`);
    if (chartsPresent) {
      check(
        charts.grid === EXPECTED_GRID[theme],
        `${page.name}: chart grid uses the ${theme} palette`,
        String(charts.grid),
      );
      check(
        charts.tick === EXPECTED_AXIS[theme],
        `${page.name}: chart axis labels use the ${theme} palette`,
        String(charts.tick),
      );
    }
    record("");
    record(`--- ${page.path} (${page.name}) ---`);
    record(`theme=${audit.theme} base=${audit.base} body=${audit.bodyBg} text=${audit.bodyColor}`);
    record(`panel=${audit.panelBg ?? "(none)"}`);
    record(`text=${audit.snippet}`);
    record(`text nodes measured=${audit.measured} below-AA=${audit.failCount}`);
    for (const f of audit.worst) {
      record(`  ${f.ratio}:1  ${f.size}px  ${f.color} on ${f.bg}  "${f.text}"  [${f.cls}]`);
    }

    check(audit.theme === theme, `${page.name}: ${theme} theme applied`, audit.theme);
    check(
      audit.base === EXPECTED_BASE[theme],
      `${page.name}: base token resolves for ${theme}`,
      audit.base,
    );
    check(audit.measured > 10, `${page.name}: page rendered measurable text`, `${audit.measured} nodes`);
    check(audit.failCount === 0, `${page.name}: no text below WCAG AA`, `${audit.failCount} finding(s)`);

    const shot = await browser.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: true },
      sessionId,
    );
    const file = diagnostics.artifactPath(`${theme}-${page.name}.png`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    record(`screenshot=${file}`);
  }

  browser.ws.close();
  child.kill();
} catch (err) {
  failures++;
  lines.push(`ERROR ${String(err?.stack ?? err)}`);
}

lines.push(failures === 0 ? `RESULT ${theme} theme checks passed` : `RESULT ${failures} check(s) failed`);
mkdirSync(path.dirname(diagnostics.notePath("light-theme.txt")), { recursive: true });
writeFileSync(
  diagnostics.notePath(withAuth ? `theme-audit-${theme}-auth.txt` : `light-theme${theme === "dark" ? "-dark" : ""}.txt`),
  lines.join("\n") + "\n",
  "utf8",
);
process.exit(failures === 0 ? 0 : 1);
