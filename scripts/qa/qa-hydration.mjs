// Does the login page hydrate at all? Polls for React's fiber marker on the
// form and reports the client bundle requests, so a missing/hydration-broken
// bundle is distinguishable from "the dev server is just slow".
//
//   node scripts/qa/qa-hydration.mjs [origin] [path] [timeoutSeconds]
//
// Results land in docs/notes/hydration.txt.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import diagnostics from "../lib/diagnostics.cjs";

const origin = (process.argv[2] ?? "http://localhost:3111").replace(/\/$/, "");
const targetPath = process.argv[3] ?? "/login";
const budgetSec = Number(process.argv[4] ?? 90);

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
].find((p) => p && existsSync(p));

const lines = [`origin=${origin} path=${targetPath} budget=${budgetSec}s`];
const log = (m) => lines.push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
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
      }, 180_000);
    });
  }
  on(fn) {
    this.listeners.push(fn);
  }
}

try {
  if (!CHROME) throw new Error("no Chrome binary found");
  const port = 9700 + Math.floor(Math.random() * 1500);
  const profile = mkdtempSync(path.join(tmpdir(), "vs-hydration-"));
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
      /* not up */
    }
  }
  if (!version) throw new Error(`chrome did not expose CDP on ${port}`);

  const browser = await Cdp.connect(version.webSocketDebuggerUrl);
  const target = await browser.send("Target.createTarget", { url: "about:blank" });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sid = attached.sessionId;

  const errors = [];
  const scripts = [];
  browser.on((msg) => {
    if (msg.sessionId !== sid) return;
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      errors.push(`exception: ${d.exception?.description ?? d.text}`);
    }
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      errors.push(`log: ${msg.params.entry.text}`);
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      errors.push(`console: ${msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
    }
    if (msg.method === "Network.responseReceived" && msg.params.type === "Script") {
      scripts.push(`${msg.params.response.status} ${msg.params.response.url.replace(origin, "")}`);
    }
    if (msg.method === "Network.loadingFailed") {
      if (msg.params.type === "Script" || msg.params.type === "Document") {
        errors.push(`load-failed ${msg.params.type}: ${msg.params.errorText}`);
      }
    }
  });
  await browser.send("Page.enable", {}, sid);
  await browser.send("Runtime.enable", {}, sid);
  await browser.send("Log.enable", {}, sid);
  await browser.send("Network.enable", {}, sid);

  const evalJs = async (expression) => {
    const res = await browser.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      sid,
    );
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    return res.result.value;
  };

  const health = `(() => {
    const el = document.querySelector('form');
    const fiberKey = el ? Object.keys(el).find((k) => k.startsWith('__react')) : null;
    return {
      readyState: document.readyState,
      url: location.pathname,
      nextChunks: performance.getEntriesByType('resource')
        .filter((e) => e.name.includes('/_next/static/') && e.name.endsWith('.js')).length,
      fiberKey: fiberKey || null,
      hasBody: !!document.body,
    };
  })()`;

  await browser.send("Page.navigate", { url: `${origin}${targetPath}` }, sid);

  const started = Date.now();
  let hydratedAt = null;
  let last = null;
  while ((Date.now() - started) / 1000 < budgetSec) {
    try {
      last = await evalJs(health);
      if (last.fiberKey) {
        hydratedAt = ((Date.now() - started) / 1000).toFixed(1);
        break;
      }
    } catch {
      /* mid-navigation */
    }
    await sleep(1000);
  }

  log(`hydratedAt=${hydratedAt ?? "NEVER"}`);
  log(`last=${JSON.stringify(last)}`);
  log(`scripts=${JSON.stringify(scripts, null, 2)}`);
  log(`errors=${JSON.stringify(errors, null, 2)}`);
  log(hydratedAt ? "RESULT hydrated" : "RESULT NOT hydrated");

  browser.ws.close();
  child.kill();
} catch (err) {
  log(`ERROR ${String(err?.stack ?? err)}`);
}

writeFileSync(diagnostics.notePath("hydration.txt"), lines.join("\n") + "\n", "utf8");
process.exit(0);
