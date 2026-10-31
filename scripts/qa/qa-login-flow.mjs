// Drives the real login form in headless Chrome over CDP.
//
// Answers "I type my password, press Sign in, and the dashboard never comes":
// it submits the form exactly as a user does and reports the resulting URL,
// any inline error text and every runtime/console error.
//
//   node scripts/qa/qa-login-flow.mjs [origin] [email] [password]
//
// With no email/password it creates a throwaway account through the API first,
// so the run never depends on a seeded credential. Results land in
// docs/notes/login-flow.txt (child stdout is not captured here).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import diagnostics from "../lib/diagnostics.cjs";

const origin = (process.argv[2] ?? "http://localhost:3111").replace(/\/$/, "");
const providedEmail = process.argv[3];
const providedPassword = process.argv[4];

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
].find((p) => p && existsSync(p));

const lines = [`origin=${origin}`, `chrome=${CHROME ?? "NOT FOUND"}`, `at=${new Date().toISOString()}`];
const log = (msg) => lines.push(msg);
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
      }, 120_000);
    });
  }
  on(fn) {
    this.listeners.push(fn);
  }
}

async function launchChrome() {
  const port = 9600 + Math.floor(Math.random() * 2000);
  // Memory: headless Chrome needs its own profile dir in this environment.
  const profile = mkdtempSync(path.join(tmpdir(), "vs-login-flow-"));
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
      /* not up yet */
    }
  }
  if (!version) throw new Error(`chrome did not expose CDP on ${port}`);

  const browser = await Cdp.connect(version.webSocketDebuggerUrl);
  const target = await browser.send("Target.createTarget", { url: "about:blank" });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;

  const errors = [];
  const dialogs = [];
  const requests = [];
  browser.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Network.requestWillBeSent") {
      const r = msg.params.request;
      if (msg.params.type === "Document" || /\/api\//.test(r.url)) {
        requests.push(`${r.method} ${r.url.replace(origin, "")}`);
      }
    }
    if (msg.method === "Network.responseReceived") {
      const r = msg.params.response;
      if (msg.params.type === "Document" || /\/api\//.test(r.url)) {
        requests.push(`<- ${r.status} ${r.url.replace(origin, "")}`);
      }
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      errors.push(`exception: ${d.exception?.description ?? d.text}`);
    }
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      // The browser itself complains that COOP needs a trustworthy origin; an
      // http LAN address is exactly the case under test, not a page bug.
      if (/Cross-Origin-Opener-Policy header has been ignored/i.test(msg.params.entry.text)) return;
      errors.push(`log: ${msg.params.entry.text}`);
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      errors.push(`console: ${msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
    }
    if (msg.method === "Page.javascriptDialogOpening") {
      dialogs.push(`${msg.params.type}: ${msg.params.message}`);
      browser.send("Page.handleJavaScriptDialog", { accept: true }, sessionId).catch(() => {});
    }
  });

  await browser.send("Page.enable", {}, sessionId);
  await browser.send("Runtime.enable", {}, sessionId);
  await browser.send("Log.enable", {}, sessionId);
  await browser.send("Network.enable", {}, sessionId);

  const evalJs = async (expression) => {
    const res = await browser.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    }
    return res.result.value;
  };

  return {
    errors,
    dialogs,
    requests,
    eval: evalJs,
    async goto(url, waitMs = 1500) {
      await browser.send("Page.navigate", { url }, sessionId);
      await sleep(waitMs);
    },
    async waitFor(expression, timeout = 25_000) {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        try {
          if (await evalJs(expression)) return true;
        } catch {
          /* mid-navigation */
        }
        await sleep(400);
      }
      return false;
    },
    async close() {
      browser.ws.close();
      child.kill();
    },
  };
}

async function makeAccount() {
  const email = providedEmail ?? `login-flow-${Date.now()}@example.com`;
  const password = providedPassword ?? "LoginFlowPass123!";
  if (!providedEmail) {
    const res = await fetch(`${origin}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Login Flow", email, password }),
    });
    if (res.status !== 201) throw new Error(`signup -> ${res.status} ${await res.text()}`);
  }
  return { email, password };
}

try {
  if (!CHROME) throw new Error("no Chrome binary found");
  const { email, password } = await makeAccount();
  log(`account=${email}`);

  const page = await launchChrome();
  try {
    await page.goto(`${origin}/login`, 2500);
    await page.waitFor("!!document.querySelector('input[type=email], input[autocomplete=email]')");

    // Wait for React to take over the form. Until it does, the button is a
    // native submit — a GET reload that discards what was typed and never
    // reaches the API. Measuring this is the whole point of the probe.
    const startedAt = Date.now();
    const hydrated = await page.waitFor(
      "!!Object.keys(document.querySelector('form') || {}).find((k) => k.startsWith('__react'))",
      180_000,
    );
    log(`hydrated=${hydrated} after ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

    // Fill the controlled React inputs through the native setter, then submit
    // the form the way a click on the button does.
    const filled = await page.eval(`(() => {
      const inputs = [...document.querySelectorAll('input')];
      const email = inputs.find((i) => i.type === 'email');
      const password = inputs.find((i) => i.type === 'password');
      if (!email || !password) return { ok: false, types: inputs.map((i) => i.type) };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(email, ${JSON.stringify(email)});
      email.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(password, ${JSON.stringify(password)});
      password.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: true, email: email.value, passwordLength: password.value.length };
    })()`);
    log(`fill=${JSON.stringify(filled)}`);

    const forms = await page.eval(`(() => [...document.querySelectorAll('form')].map((f, i) => ({
      i,
      inputs: [...f.querySelectorAll('input')].map((x) => x.type),
      buttons: [...f.querySelectorAll('button')].map((b) => ({ type: b.type, text: (b.textContent || '').trim().slice(0, 40), disabled: b.disabled })),
    })))()`);
    log(`forms=${JSON.stringify(forms, null, 2)}`);

    const clicked = await page.eval(`(() => {
      const form = [...document.querySelectorAll('form')]
        .find((f) => f.querySelector('input[type=password]'));
      if (!form) return 'no-password-form';
      const btn = form.querySelector('button[type=submit]') || form.querySelector('button');
      if (!btn) return 'no-button';
      const info = { type: btn.type, text: (btn.textContent || '').trim(), disabled: btn.disabled };
      btn.click();
      return info;
    })()`);
    log(`submit=${JSON.stringify(clicked)}`);

    const navigated = await page.waitFor("location.pathname === '/dashboard'", 25_000);
    log(`reached-dashboard=${navigated}`);
    await sleep(2000);
    log(`final-url=${await page.eval("location.pathname + location.search").catch((e) => `eval failed: ${e.message}`)}`);
    log(`network=${JSON.stringify(page.requests, null, 2)}`);
    // The login form is gone on /dashboard, so check whether React owns whatever
    // element the destination page renders.
    const pageHydrated = await page
      .eval(`(() => {
        const el = document.querySelector('main, nav, header, form');
        return el ? Object.keys(el).some((k) => k.startsWith('__react')) : false;
      })()`)
      .catch((e) => `eval failed: ${e.message}`);
    log(`page-hydrated=${pageHydrated}`);

    // Does a plain fetch from this page reach the login API at all (service
    // worker interception, CSP, CSP-report-only, offline cache)?
    const direct = await page.eval(`(async () => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} }),
        });
        const text = await res.text();
        return { status: res.status, body: text.slice(0, 200), controlled: !!navigator.serviceWorker?.controller };
      } catch (e) {
        return { error: String(e), controlled: !!navigator.serviceWorker?.controller };
      }
    })()`);
    log(`direct-fetch=${JSON.stringify(direct)}`);

    const state = await page.eval(`(() => ({
      url: location.pathname + location.search,
      heading: (document.body ? document.body.innerText : '').split('\\n').filter(Boolean).slice(0, 8),
      errorText: (document.querySelector('[aria-live=polite]') || {}).innerText || null,
      hasForm: !!document.querySelector('form input[type=password]'),
      htmlLength: document.documentElement.outerHTML.length,
    }))()`);
    log(`state=${JSON.stringify(state, null, 2)}`);
    log(`dialogs=${JSON.stringify(page.dialogs)}`);
    log(`errors=${JSON.stringify(page.errors, null, 2)}`);
    log(
      navigated && page.errors.length === 0
        ? "RESULT login reaches the dashboard with no runtime errors"
        : "RESULT login did NOT reach a clean dashboard",
    );
  } finally {
    await page.close();
  }
} catch (err) {
  log(`ERROR ${String(err?.stack ?? err)}`);
  log("RESULT login flow errored");
}

writeFileSync(diagnostics.notePath("login-flow.txt"), lines.join("\n") + "\n", "utf8");
process.exit(0);
