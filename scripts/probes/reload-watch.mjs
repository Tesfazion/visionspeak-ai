// Is a file write inside the project what makes the dev client full-reload?
//
// Opens a page against the running dev server, records the document's
// performance.timeOrigin, appends lines to a log inside the project tree, then
// checks whether the document was replaced (timeOrigin changes on reload).
//
//   node scripts/probes/reload-watch.cjs [origin] [fileToGrow]
//
// Results land in docs/notes/reload-watch.txt.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import diagnostics from "../lib/diagnostics.cjs";

const origin = (process.argv[2] ?? "http://localhost:3112").replace(/\/$/, "");
const growFile = process.argv[3] ?? path.join(diagnostics.root, "docs", "logs", "watch-test.log");

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
].find((p) => p && existsSync(p));

const lines = [`origin=${origin} growFile=${growFile}`];
const log = (m) => lines.push(m);
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
      }, 60_000);
    });
  }
}

try {
  if (!CHROME) throw new Error("no Chrome binary found");
  const port = 9800 + Math.floor(Math.random() * 900);
  const profile = mkdtempSync(path.join(tmpdir(), "vs-reload-"));
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
      "--window-size=1200,800",
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
  await browser.send("Page.enable", {}, sid);
  await browser.send("Runtime.enable", {}, sid);

  const evalJs = async (expression) => {
    const res = await browser.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sid);
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    return res.result.value;
  };

  await browser.send("Page.navigate", { url: `${origin}/login` }, sid);
  await sleep(4000);

  const before = await evalJs("performance.timeOrigin");
  log(`timeOrigin before=${before}`);

  // Simulate the dev wrapper streaming request lines into its transcript.
  writeFileSync(growFile, "reload-watch start\n", "utf8");
  for (let i = 0; i < 12; i++) {
    await sleep(250);
    appendFileSync(growFile, ` GET /login 200 in 10ms (${i})\n`, "utf8");
  }
  await sleep(4000);

  const after = await evalJs("performance.timeOrigin").catch((e) => `eval failed: ${e.message}`);
  log(`timeOrigin after=${after}`);
  const reloaded = before !== after;
  log(reloaded ? "RESULT the document reloaded after the file grew" : "RESULT the document survived the file growth");
  log(`url=${await evalJs("location.pathname").catch(() => "?")}`);

  browser.ws.close();
  child.kill();
} catch (err) {
  log(`ERROR ${String(err?.stack ?? err)}`);
}

writeFileSync(diagnostics.notePath("reload-watch.txt"), lines.join("\n") + "\n", "utf8");
process.exit(0);
