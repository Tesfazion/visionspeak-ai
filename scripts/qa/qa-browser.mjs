// Browser verification for the running platform.
//
//   node scripts/qa/qa-browser.mjs [origin] [--only=pages,studio,meeting]
//
// Drives real headless Chrome over CDP (the agent shell cannot run Playwright
// here â€” see the note in probe-reveal.mjs). Chrome is launched with
// `--use-fake-device-for-media-stream`, so getUserMedia returns a synthetic
// camera and the WebRTC path can be exercised without hardware.
//
// Results land in docs/notes/browser-qa.txt because child-process stdout is not
// captured in this environment.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import diagnostics from "../lib/diagnostics.cjs";

const origin = (process.argv[2] ?? "http://localhost:3145").replace(/\/$/, "");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;
// `cam`/`diag` are diagnostics, not part of the suite: they are slow and would
// compete with the studio and meeting browsers for CPU when run together.
const DIAGNOSTIC = new Set(["cam", "diag"]);
const wants = (name) =>
  DIAGNOSTIC.has(name) ? Boolean(only?.has(name)) : !only || only.has(name);

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
].find((p) => p && existsSync(p));

const lines = [`origin=${origin}`, `chrome=${CHROME ?? "NOT FOUND"}`, `at=${new Date().toISOString()}`];
let failures = 0;
let checksRun = 0;

const log = (msg) => lines.push(msg);
function check(ok, label, detail = "") {
  checksRun++;
  lines.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal CDP client over Node's global WebSocket. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.next = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(`${msg.error.message}`)) : resolve(msg.result);
        return;
      }
      for (const fn of this.listeners) fn(msg);
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
  on(fn) {
    this.listeners.push(fn);
  }
}

let portSeed = 9500;
/**
 * Chrome's synthetic device can degrade to a 2x2 frames and end the track in
 * headless, which makes it useless for proving the camera path. Feeding a real
 * Y4M file (looped by Chrome) gives a genuine 320x240 stream instead.
 */
function makeY4m(width = 320, height = 240, frames = 24, fps = 15) {
  const parts = [Buffer.from(`YUV4MPEG2 W${width} H${height} F${fps}:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < frames; f++) {
    const y = Buffer.alloc(width * height);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        y[r * width + c] = ((c + f * 10) % 80) < 40 ? 210 : 45;
      }
    }
    const chroma = Buffer.alloc((width * height) / 4, 128);
    parts.push(Buffer.from("FRAME\n"), y, chroma, chroma);
  }
  const file = path.join(mkdtempSync(path.join(tmpdir(), "vs-y4m-")), "fake.y4m");
  writeFileSync(file, Buffer.concat(parts));
  return file;
}

const FAKE_VIDEO_FILE = process.env.QA_NO_Y4M ? null : makeY4m();

async function launchChrome(label) {
  const port = 9600 + Math.floor(Math.random() * 2000);
  const profile = mkdtempSync(path.join(tmpdir(), `vs-qa-${label}-`));
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
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      ...(FAKE_VIDEO_FILE ? [`--use-file-for-fake-video-capture=${FAKE_VIDEO_FILE}`] : []),
      "--autoplay-policy=no-user-gesture-required",
      "--window-size=1440,900",
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );

  let version = null;
  for (let i = 0; i < 60 && !version; i++) {
    await sleep(250);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) version = await res.json();
    } catch {
      /* not up yet */
    }
  }
  if (!version) throw new Error(`chrome (${label}) did not expose CDP on ${port}`);

  const browser = await Cdp.connect(version.webSocketDebuggerUrl);
  const target = await browser.send("Target.createTarget", { url: "about:blank" });
  const attached = await browser.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attached.sessionId;

  const errors = [];
  browser.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      errors.push(`exception: ${d.exception?.description ?? d.text}`);
    }
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      errors.push(`log: ${msg.params.entry.text}`);
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      const line = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
      // MediaPipe reports its TFLite/XNNPACK bootstrap through console.error; it
      // is informational and would otherwise read as a page error.
      if (/XNNPACK|TensorFlow Lite|INFO:/i.test(line)) return;
      errors.push(`console: ${line}`);
    }
  });

  await browser.send("Page.enable", {}, sessionId);
  await browser.send("Runtime.enable", {}, sessionId);
  await browser.send("Log.enable", {}, sessionId);

  // Record every RTCPeerConnection so the test can inspect real ICE/media state.
  await browser.send(
    "Page.addScriptToEvaluateOnNewDocument",
    {
      source: `(() => {
        const Orig = window.RTCPeerConnection;
        window.__pcs = [];
        window.__stops = [];
        const origStop = MediaStreamTrack.prototype.stop;
        MediaStreamTrack.prototype.stop = function () {
          try {
            window.__stops.push({ kind: this.kind, stack: (new Error().stack || '').split('\\n').slice(1, 6).join(' | ') });
          } catch {}
          return origStop.call(this);
        };
        window.RTCPeerConnection = function (...args) {
          const pc = new Orig(...args);
          window.__pcs.push(pc);
          return pc;
        };
        window.RTCPeerConnection.prototype = Orig.prototype;
        Object.setPrototypeOf(window.RTCPeerConnection, Orig);
      })();`,
    },
    sessionId,
  );

  const page = {
    label,
    errors,
    async goto(url, { waitMs = 1200 } = {}) {
      errors.length = 0;
      await browser.send("Page.navigate", { url }, sessionId);
      await sleep(waitMs);
    },
    async eval(expression) {
      const res = await browser.send(
        "Runtime.evaluate",
        { expression, returnByValue: true, awaitPromise: true },
        sessionId,
      );
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
      }
      return res.result.value;
    },
    async setCookie(name, value) {
      const url = new URL(origin);
      await browser.send(
        "Network.setCookie",
        { name, value, domain: url.hostname, path: "/", httpOnly: true },
        sessionId,
      );
    },
    async waitFor(expression, { timeout = 20_000, interval = 400 } = {}) {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        try {
          if (await page.eval(expression)) return true;
        } catch {
          /* mid-navigation */
        }
        await sleep(interval);
      }
      return false;
    },
    async clickText(text) {
      return page.eval(`(() => {
        const wanted = ${JSON.stringify(text)};
        const el = [...document.querySelectorAll('button, a, [role=button]')]
          .find((n) => (n.textContent || '').trim().toLowerCase().includes(wanted.toLowerCase()));
        if (!el) return false;
        el.click();
        return true;
      })()`);
    },
    async close() {
      browser.ws.close();
      child.kill();
    },
  };
  return page;
}

/** Sign up via the HTTP API and return the raw cookie pair. */
async function signup(tag) {
  const email = `qa-${tag}-${Date.now()}@example.com`;
  const res = await fetch(`${origin}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: `Qa-browser-pass-${Date.now()}` }),
  });
  if (res.status !== 201) throw new Error(`signup ${tag} -> ${res.status}`);
  const raw = (res.headers.getSetCookie?.() ?? [])[0] ?? "";
  const match = raw.match(/vs_session=([^;]+)/);
  if (!match) throw new Error(`signup ${tag} set no session cookie`);
  return { email, cookie: match[1] };
}

async function createMeeting(cookie, title) {
  const res = await fetch(`${origin}/api/meetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `vs_session=${cookie}` },
    body: JSON.stringify({ title, mode: "practice" }),
  });
  const body = await res.json();
  if (!body?.meeting?.id) throw new Error(`create meeting -> ${res.status}`);
  return body.meeting.id;
}

const PAGE_CASES = [
  { path: "/", expect: /speak|visionspeak/i, name: "home" },
  { path: "/pricing", expect: /pricing|free/i, name: "pricing" },
  { path: "/login", expect: /sign in|password/i, name: "login" },
  { path: "/signup", expect: /sign up|create/i, name: "signup" },
  { path: "/report/demo", expect: /report|score/i, name: "report demo" },
];

try {
  if (!CHROME) throw new Error("no Chrome binary found");
  await fetch(`${origin}/api/health`).then((r) => {
    if (!r.ok) throw new Error(`health ${r.status}`);
  });

  const browser = await launchChrome("main");
  let mainClosed = false;
  try {
    if (wants("pages")) {
      for (const testCase of PAGE_CASES) {
        await browser.goto(`${origin}${testCase.path}`, { waitMs: 900 });
        // Wait for content rather than a fixed delay: a cold server can still be
        // parsing when a timer expires, and `document.body` is null until then.
        await browser.waitFor("!!document.body && document.body.innerText.length > 40", {
          timeout: 20_000,
        });
        const text = await browser.eval("document.body ? document.body.innerText : ''");
        check(text.length > 40, `${testCase.name}: renders content`, `${text.length} chars`);
        check(testCase.expect.test(text), `${testCase.name}: expected copy present`);
        check(browser.errors.length === 0, `${testCase.name}: no runtime errors`, browser.errors[0] ?? "");
      }

      // Protected routes must redirect a signed-out visitor.
      await browser.goto(`${origin}/meeting`, { waitMs: 2200 });
      const lobbyUrl = await browser.eval("location.pathname + location.search");
      check(lobbyUrl.startsWith("/login"), "signed-out /meeting redirects to login", lobbyUrl);

      await browser.goto(`${origin}/dashboard`, { waitMs: 2200 });
      const dashUrl = await browser.eval("location.pathname + location.search");
      check(dashUrl.startsWith("/login"), "signed-out /dashboard redirects to login", dashUrl);
    }

    if (wants("cam")) {
      // Is the 2x2/ended track the app's fault or the fake device's? Ask
      // getUserMedia directly on a blank page.
      // getUserMedia needs a secure context; about:blank is not one, localhost is.
      await browser.goto(`${origin}/offline`, { waitMs: 1200 });
      const cam = await browser.eval(`(async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const v = document.createElement('video');
        v.srcObject = stream;
        v.muted = true;
        v.playsInline = true;
        document.body.appendChild(v);
        await v.play().catch(() => undefined);
        await new Promise((r) => setTimeout(r, 3000));
        const track = stream.getVideoTracks()[0];
        return {
          settings: track.getSettings(),
          state: track.readyState,
          muted: track.muted,
          width: v.videoWidth,
          height: v.videoHeight,
          usingFile: ${JSON.stringify(Boolean(FAKE_VIDEO_FILE))},
        };
      })()`);
      log(`CAM ${JSON.stringify(cam)}`);
      check(cam.state === "live" && cam.width > 2, "fake camera produces a live stream", JSON.stringify(cam));
    }

    if (wants("diag")) {
      const account = await signup("diag");
      await browser.setCookie("vs_session", account.cookie);
      await browser.goto(`${origin}/studio`, { waitMs: 2500 });
      await browser.clickText("Enable camera & mic");
      for (let i = 0; i < 14; i++) {
        await sleep(2000);
        const snap = await browser.eval(`(() => {
          const v = document.querySelector('video');
          const text = document.body.innerText;
          return {
            t: ${i},
            video: v ? { w: v.videoWidth, h: v.videoHeight, readyState: v.readyState, src: v.srcObject ? v.srcObject.getTracks().map((x) => x.kind + ':' + x.readyState) : null } : 'none',
            liveWord: /\\blive\\b/i.test(text),
            error: /Camera unavailable/i.test(text),
            stops: window.__stops || [],
            snippet: text.replace(/\\s+/g, ' ').slice(0, 160),
          };
        })()`);
        log(`DIAG ${JSON.stringify(snap)}`);
        if (snap.error) break;
      }
    }

    if (wants("studio")) {
      const account = await signup("studio");
      await browser.setCookie("vs_session", account.cookie);
      await browser.goto(`${origin}/studio`, { waitMs: 2500 });
      check(!(await browser.eval("location.pathname")).startsWith("/login"), "studio: signed in");

      const clicked = await browser.clickText("Enable camera & mic");
      check(clicked, "studio: start button present");
      // Detect the *stage badge* (textContent "live"), not arbitrary page copy:
      // the marketing heading "Live speaking analysis" also contains the word.
      const live = await browser.waitFor(
        `!![...document.querySelectorAll('span')].find(
           (s) => s.textContent.trim().toLowerCase() === 'live' || s.textContent.trim().toLowerCase() === 'paused'
         ) && (document.querySelector('video')?.videoWidth || 0) > 2`,
        { timeout: 120_000 },
      );
      check(live, "studio: reaches the live stage with the fake camera");

      const media = await browser.eval(`(() => {
        const vids = [...document.querySelectorAll('video')].map((v) => ({
          w: v.videoWidth,
          h: v.videoHeight,
          readyState: v.readyState,
          paused: v.paused,
          tracks: v.srcObject ? v.srcObject.getTracks().map((t) => t.kind + ':' + t.readyState) : [],
        }));
        return { count: vids.length, vids };
      })()`);
      const painted = media.vids.filter((v) => v.w > 2);
      check(
        painted.length > 0,
        "studio: camera frames are flowing",
        `${painted.map((v) => `${v.w}x${v.h}`).join(",") || JSON.stringify(media)}`,
      );
      check(
        painted.length > 0 && painted.every((v) => v.tracks.some((t) => t === "video:live")),
        "studio: video track is live (not ended)",
        JSON.stringify(painted.map((v) => v.tracks)),
      );

      const metrics = await browser.eval(`(() => {
        const text = document.body.innerText;
        const nums = (text.match(/\\b\\d{1,3}\\b/g) || []).length;
        return { nums, hasSignals: /GAZE|POSTURE|VOICE|EXPRESSION/i.test(text) };
      })()`);
      check(metrics.hasSignals, "studio: signal tiles are rendered");
      check(metrics.nums > 5, "studio: live scores are numeric", `${metrics.nums} numbers`);

      const errText = await browser.eval("document.body.innerText");
      check(!/camera could not start|camera unavailable/i.test(errText), "studio: no camera error shown");
      check(browser.errors.length === 0, "studio: no runtime errors", browser.errors[0] ?? "");
    }

    if (wants("meeting")) {
      // Free the pages/studio browser first: this scenario needs two more Chrome
      // instances, and each one is expensive on a constrained machine.
      await browser.close();
      mainClosed = true;
      const host = await signup("host");
      const guest = await signup("guest");
      const meetingId = await createMeeting(host.cookie, "Browser QA room");

      const peerA = await launchChrome("peerA");
      const peerB = await launchChrome("peerB");
      try {
        await peerA.setCookie("vs_session", host.cookie);
        await peerB.setCookie("vs_session", guest.cookie);

        await peerA.goto(`${origin}/meeting/${meetingId}`, { waitMs: 3000 });
        await peerB.goto(`${origin}/meeting/${meetingId}`, { waitMs: 3000 });

        const titleA = await peerA.eval("document.body.innerText");
        check(/Browser QA room/.test(titleA), "room: title renders for the host");

        check(await peerA.clickText("Join room"), "room: host can join");
        check(await peerB.clickText("Join room"), "room: guest can join");

        const bothLive = await Promise.all([
          peerA.waitFor(`[...document.querySelectorAll('video')].some((v) => v.srcObject && v.videoWidth > 2)`, { timeout: 90_000 }),
          peerB.waitFor(`[...document.querySelectorAll('video')].some((v) => v.srcObject && v.videoWidth > 2)`, { timeout: 90_000 }),
        ]);
        check(bothLive.every(Boolean), "room: both tabs have a local camera");

        const localDims = await peerA.eval(`(() => {
          const vids = [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0);
          return vids.map((v) => v.videoWidth + 'x' + v.videoHeight);
        })()`);
        check(localDims.length > 0, "room: local video has frames", localDims.join(","));

        // The real proof: two RTCPeerConnections negotiating over the signaling hub.
        const connected = await peerA.waitFor(
          `(window.__pcs || []).some((pc) => pc.connectionState === 'connected' || pc.connectionState === 'completed')`,
          { timeout: 90_000, interval: 900 },
        );
        if (!connected) {
          const state = await peerA.eval(`({
            pcs: (window.__pcs || []).length,
            states: (window.__pcs || []).map((p) => p.connectionState + '/' + p.iceConnectionState + '/' + p.signalingState),
          })`).catch((e) => `eval failed: ${e.message}`);
          const guest = await peerB.eval(`({
            pcs: (window.__pcs || []).length,
            states: (window.__pcs || []).map((p) => p.connectionState + '/' + p.iceConnectionState + '/' + p.signalingState),
          })`).catch((e) => `eval failed: ${e.message}`);
          log(`RTC-DIAG host=${JSON.stringify(state)} guest=${JSON.stringify(guest)}`);
        }
        check(connected, "room: WebRTC peer connection reaches 'connected'");

        const rtc = await peerA.eval(`(async () => {
          const out = [];
          for (const pc of window.__pcs || []) {
            const stats = await pc.getStats();
            let inboundVideo = 0;
            let bytes = 0;
            stats.forEach((s) => {
              if (s.type === 'inbound-rtp' && s.kind === 'video') { inboundVideo++; bytes += s.bytesReceived || 0; }
            });
            out.push({
              connection: pc.connectionState,
              ice: pc.iceConnectionState,
              senders: pc.getSenders().length,
              inboundVideo,
              bytes,
            });
          }
          return out;
        })()`);
        const videoIn = rtc.some((p) => p.inboundVideo > 0 && p.bytes > 0);
        check(
          videoIn,
          "room: remote video is actually received (inbound-rtp bytes > 0)",
          JSON.stringify(rtc),
        );

        const remoteDims = await peerA.eval(`[...document.querySelectorAll('video')]
          .map((v) => ({ w: v.videoWidth, mirror: getComputedStyle(v).transform !== 'none' }))
          .filter((v) => v.w > 0).length`);
        check(remoteDims >= 1, "room: a video element is painting", `${remoteDims} painted`);

        // Chat through the real UI (controlled input needs the native setter).
        await peerA.clickText("Chat");
        await peerA.waitFor(`!!document.querySelector('aside[aria-label="Meeting chat"] input')`, {
          timeout: 10_000,
        });
        await peerA.eval(`(() => {
          const input = document.querySelector('aside[aria-label="Meeting chat"] input');
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'hello from the host');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        })()`);
        await sleep(300);
        const sent = await peerA.eval(`(() => {
          const btn = document.querySelector('aside[aria-label="Meeting chat"] button[title="Send"]');
          if (!btn) return false;
          btn.click();
          return true;
        })()`);
        check(sent, "chat: send button clicked on the host");
        const received = await peerB.waitFor(
          `document.body.innerText.includes('hello from the host')`,
          { timeout: 20_000 },
        );
        check(received, "chat: guest receives the message in its DOM");

        const roster = await peerA.eval(
          // innerText reflects CSS `text-transform: uppercase`, hence the /i flag.
          `(document.body.innerText.match(/(\\d+) in the room/i) || [])[1] || null`,
        );
        check(Number(roster) >= 2, "room: roster shows both participants", `count=${roster}`);

        check(peerA.errors.length === 0, "host tab: no runtime errors", peerA.errors[0] ?? "");
        check(peerB.errors.length === 0, "guest tab: no runtime errors", peerB.errors[0] ?? "");
      } finally {
        await peerA.close();
        await peerB.close();
      }
    }
  } finally {
    if (!mainClosed) await browser.close();
  }
} catch (err) {
  failures++;
  lines.push(`ERROR ${String(err?.stack ?? err)}`);
}

if (checksRun === 0) {
  failures++;
  lines.push("FAIL  no checks executed (bad --only filter?)");
}
lines.push(failures === 0 ? "RESULT all checks passed" : `RESULT ${failures} check(s) failed`);
mkdirSync(path.dirname(diagnostics.notePath("browser-qa.txt")), { recursive: true });
writeFileSync(diagnostics.notePath("browser-qa.txt"), lines.join("\n") + "\n", "utf8");
process.exit(failures === 0 ? 0 : 1);
