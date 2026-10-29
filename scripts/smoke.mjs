/**
 * End-to-end smoke test against a running dev/prod server.
 * Usage: node scripts/smoke.mjs [baseUrl]
 *
 * Covers, in order: health + security headers, the public marketing surface,
 * the auth gate, signup → session save → report → delete, cross-account
 * isolation, and the PWA/SEO routes. Writes its transcript to docs/logs/smoke.txt
 * and exits non-zero on any FAIL so CI can gate on it.
 */
import { writeFileSync } from "node:fs";
import diagnostics from "./lib/diagnostics.cjs";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const out = [];
let failures = 0;

const log = (...args) => out.push(args.join(" "));
const pass = (ok, label) => {
  if (!ok) failures++;
  log(`${ok ? "PASS" : "FAIL"} ${label}`);
};

/* ------------------------------------------------------------------ *
 * Cookie-aware fetch (Node has no browser jar)
 * ------------------------------------------------------------------ */
let jar = new Map();

const rememberCookies = (res) => {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const index = pair.indexOf("=");
    if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
  return res;
};

const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

async function request(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (jar.size) headers.cookie = cookieHeader();
  return rememberCookies(await fetch(base + path, { ...init, headers, redirect: "manual" }));
}

async function page(path) {
  const started = Date.now();
  try {
    const res = await request(path);
    const text = await res.text();
    log(`INFO ${res.status} ${path} ${Date.now() - started}ms len=${text.length}`);
    return { status: res.status, text, res };
  } catch (err) {
    log(`FAIL 000 ${path} ${err.message}`);
    failures++;
    return { status: 0, text: "", res: null };
  }
}

const expect = (actual, wanted, label) => pass(actual === wanted, `${label} (${actual}, expected ${wanted})`);

/* ------------------------------------------------------------------ *
 * 1. Health, headers, static surface
 * ------------------------------------------------------------------ */
const health = await request("/api/health");
const healthBody = await health.json().catch(() => ({}));
pass(health.status === 200 && healthBody.ok === true, `GET /api/health -> ${health.status} ${healthBody.service ?? ""}`);
pass(healthBody.signedIn === false, "anonymous health probe reports signedOut");

const home = await page("/");
const csp = home.res?.headers.get("content-security-policy") ?? "";
pass(csp.includes("default-src 'self'"), "CSP header present");
pass(csp.includes("wasm-unsafe-eval"), "CSP allows WebAssembly (MediaPipe)");
pass(csp.includes("frame-ancestors 'none'"), "CSP blocks framing");
expect(home.res?.headers.get("x-content-type-options"), "nosniff", "X-Content-Type-Options");
expect(home.res?.headers.get("x-frame-options"), "DENY", "X-Frame-Options");
pass(
  (home.res?.headers.get("permissions-policy") ?? "").includes("camera=(self)"),
  "Permissions-Policy permits camera for self only",
);
pass(!home.res?.headers.get("x-powered-by"), "x-powered-by header removed");

for (const needle of ["Deliver like the room is", "Live score", "container-page"]) {
  pass(home.text.includes(needle), `home contains "${needle}"`);
}
pass(home.text.includes("viewport-fit=cover"), "viewport opts into safe-area insets");
expect((home.text.match(/aria-controls="mobile-nav"/g) ?? []).length, 1, "exactly one mobile menu trigger");
pass(home.text.includes('id="mobile-nav"'), "mobile drawer present");
pass(/og:image/.test(home.text), "OpenGraph image tag present");
pass(home.text.includes("summary_large_image"), "Twitter card metadata present");

// SEO + PWA routes
const manifest = await request("/manifest.webmanifest");
const manifestBody = await manifest.json().catch(() => ({}));
expect(manifest.status, 200, "GET /manifest.webmanifest");
pass(Array.isArray(manifestBody.icons) && manifestBody.icons.length >= 3, "manifest declares 3+ icons");
pass(manifestBody.icons?.some((i) => i.purpose === "maskable"), "manifest declares a maskable icon");
pass(manifestBody.display === "standalone", "manifest is installable (standalone)");

const robots = await request("/robots.txt");
const robotsText = await robots.text();
expect(robots.status, 200, "GET /robots.txt");
pass(robotsText.includes("Disallow: /dashboard"), "robots.txt hides private routes");
pass(robotsText.includes("Sitemap:"), "robots.txt references the sitemap");

expect((await request("/sitemap.xml")).status, 200, "GET /sitemap.xml");
expect((await request("/sw.js")).status, 200, "GET /sw.js");
for (const icon of ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"]) {
  expect((await request(icon)).status, 200, `GET ${icon}`);
}
const og = await request("/opengraph-image");
pass(og.status === 200 && (og.headers.get("content-type") ?? "").startsWith("image/"), `GET /opengraph-image -> ${og.status}`);
expect((await page("/offline")).status, 200, "offline fallback page");

/* ------------------------------------------------------------------ *
 * 2. Public report + 404 + auth pages
 * ------------------------------------------------------------------ */
const demo = await page("/report/demo");
for (const needle of [
  "Excellent Speaker",
  "What is working",
  "What is costing you",
  "Your next three drills",
  "Transcript &amp; filler words",
  "confidence = 0.30",
  "Presentation rubric",
]) {
  pass(demo.text.includes(needle), `demo report contains "${needle}"`);
}

const missing = await page("/report/does-not-exist");
expect(missing.status, 404, "unknown report");
// Every page's RSC payload embeds the not-found boundary, so the phrase alone
// proves nothing — the status is what makes this a real 404.
pass(missing.text.includes("never made it to the stage"), "404 page content");
pass(demo.text.includes("never made it to the stage") === missing.text.includes("never made it to the stage"), "valid report and 404 use the same boundary (sanity)");

const loginPage = await page("/login");
expect(loginPage.status, 200, "GET /login");
pass(loginPage.text.includes("Welcome back"), "login form renders");

const signupPage = await page("/signup");
expect(signupPage.status, 200, "GET /signup");
pass(signupPage.text.includes("Create your account"), "signup form renders");

/* ------------------------------------------------------------------ *
 * 3. The auth gate
 * ------------------------------------------------------------------ */
for (const route of ["/studio", "/dashboard"]) {
  const res = await request(route);
  const location = res.headers.get("location") ?? "";
  pass(res.status === 307, `${route} redirects anonymous visitors (${res.status})`);
  pass(location.includes("/login"), `${route} redirect points at /login (${location || "-"})`);
  pass(location.includes("next="), `${route} preserves the return path`);
  await res.text();
}

expect((await request("/api/sessions")).status, 401, "GET /api/sessions without a session");
expect(
  (
    await request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aggregate: { durationSec: 5, timeline: [1, 2, 3] } }),
    })
  ).status,
  401,
  "POST /api/sessions without a session",
);

/* ------------------------------------------------------------------ *
 * 4. Signup → save → report → delete
 * ------------------------------------------------------------------ */
const stamp = Date.now().toString(36);
const emailA = `smoke-a-${stamp}@example.com`;
const emailB = `smoke-b-${stamp}@example.com`;
const password = "smoke-test-password";

const signup = await request("/api/auth/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: emailA, password, name: "Smoke A" }),
});
expect(signup.status, 201, "POST /api/auth/signup");
await signup.text();
pass(jar.has("vs_session"), "signup sets the session cookie");

const me = await request("/api/auth/me");
const meBody = await me.json().catch(() => ({}));
pass(meBody.user?.email === emailA, "GET /api/auth/me returns the new account");
pass(!JSON.stringify(meBody).includes("passwordHash"), "the API never exposes a password hash");

const dash = await page("/dashboard");
expect(dash.status, 200, "GET /dashboard while signed in");
pass(dash.text.includes("Practice history"), "dashboard heading present");
// A brand-new account's history is its own work: no seeded sample may be
// presented as if the user had recorded it.
pass(!dash.text.includes("Q4 Kickoff"), "a fresh dashboard shows no borrowed sample history");
pass(dash.text.includes("No sessions yet"), "a fresh dashboard shows the empty state");
pass(dash.text.includes("Free plan"), "the dashboard states the active plan");
pass((await page("/report/demo")).status === 200, "the sample report is still one click away");

const studio = await page("/studio");
expect(studio.status, 200, "GET /studio while signed in");
pass(studio.text.includes("Live speaking analysis"), "studio heading present");
pass(studio.text.includes("Practice rubric"), "studio names the active rubric");

// --- API round trip ---------------------------------------------------
const aggregate = {
  durationSec: 95,
  analyzedFrames: 2400,
  faceVisiblePct: 94,
  eyeContactPct: 71,
  gazeAwayCount: 12,
  avgGazeAwaySec: 1.8,
  blinkRatePerMin: 21,
  smilePct: 14,
  expressionVariety: 38,
  tension: 22,
  headStabilityPct: 74,
  avgShoulderSlopeDeg: 5.1,
  avgLeanDeg: 8.2,
  uprightPct: 71,
  headOverShouldersPct: 76,
  swayIndex: 19,
  alignmentScore: 82,
  gestureRatePerMin: 11,
  handsVisiblePct: 58,
  bothHandsPct: 35,
  openness: 1.42,
  nervousness: 34,
  voice: {
    speakingTimePct: 68,
    avgDb: -31.2,
    volumeConsistency: 61,
    pitchVariation: 6.4,
    pauseCount: 9,
    longPauseCount: 1,
    avgPauseSec: 0.8,
    energy: 57,
  },
  speech: {
    transcript: "so um today I want to talk about like three things and you know why they matter",
    words: 16,
    fillers: [{ word: "um", count: 1 }, { word: "like", count: 1 }, { word: "you know", count: 1 }],
    totalFillers: 3,
    fillerEvents: [],
    supported: true,
    language: "en-US",
  },
  wpm: 148,
  paceSource: "transcript",
  emotions: { neutral: 48, happy: 18, surprise: 7, sad: 9, angry: 8, fear: 10 },
  timeline: Array.from({ length: 95 }, (_, t) => ({
    t,
    confidence: 60 + Math.round(12 * Math.sin(t / 9)),
    engagement: 62 + Math.round(10 * Math.cos(t / 7)),
    leadership: 58 + Math.round(9 * Math.sin(t / 11)),
    communication: 63 + Math.round(8 * Math.cos(t / 8)),
    eyeContact: 65 + Math.round(15 * Math.sin(t / 6)),
    posture: 70 + Math.round(8 * Math.cos(t / 5)),
    gestures: 55 + Math.round(14 * Math.sin(t / 4)),
    voice: 60 + Math.round(10 * Math.cos(t / 6)),
    expression: 58 + Math.round(9 * Math.sin(t / 7)),
    gaze: 70,
    yaw: 4,
    pitch: -2,
    db: -31,
    energy: 57,
    wpm: 148,
    face: true,
    hands: 1,
    emotion: "neutral",
    smiling: 12,
  })),
};

async function createSession(meta) {
  const res = await request("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ aggregate, meta }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const created = await createSession({ speaker: "Smoke A", title: "Automated smoke session", mode: "practice" });
expect(created.status, 201, "POST /api/sessions");
const sessionId = created.body.id;
pass(typeof sessionId === "string" && sessionId.length > 4, "created session has an id");
pass(typeof created.body.overall === "number", `scored overall=${created.body.overall}`);

const savedReport = await page(`/report/${sessionId}`);
expect(savedReport.status, 200, "GET the saved report");
pass(savedReport.text.includes("Automated smoke session"), "saved report renders its title");

const list = await request("/api/sessions");
const listBody = await list.json().catch(() => []);
pass(Array.isArray(listBody) && listBody.some((s) => s.id === sessionId), "GET /api/sessions includes the new session");

// --- invalid payload --------------------------------------------------
const bad = await request("/api/sessions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ aggregate: { durationSec: 3 } }),
});
expect(bad.status, 422, "POST malformed payload is rejected");
await bad.text();

/* ------------------------------------------------------------------ *
 * 5. Cross-account isolation
 * ------------------------------------------------------------------ */
const cookieA = cookieHeader();
jar = new Map(); // fresh browser

const signupB = await request("/api/auth/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: emailB, password, name: "Smoke B" }),
});
expect(signupB.status, 201, "second account can sign up");
await signupB.text();

const bReport = await page(`/report/${sessionId}`);
expect(bReport.status, 404, "account B cannot read account A's report");
expect((await page("/report/demo")).status, 200, "account B can still read the sample report");

const listB = await request("/api/sessions");
const listBBody = await listB.json().catch(() => []);
pass(
  Array.isArray(listBBody) && !listBBody.some((s) => s.id === sessionId),
  "account B's session list excludes account A's session",
);
pass(Array.isArray(listBBody) && listBBody.length === 0, "a new account's history starts empty, not filled with samples");

expect(
  (await request(`/api/sessions/${sessionId}`, { method: "DELETE" })).status,
  404,
  "account B cannot delete account A's session",
);

const dup = await request("/api/auth/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: emailA.toUpperCase(), password, name: "Dupe" }),
});
expect(dup.status, 409, "duplicate signup rejected (case-insensitive)");
await dup.text();

const badPassword = await request("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: emailA, password: "definitely-wrong" }),
});
expect(badPassword.status, 401, "wrong password rejected");
await badPassword.text();

const shortPassword = await request("/api/auth/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `x-${stamp}@example.com`, password: "short", name: "X" }),
});
expect(shortPassword.status, 422, "short password rejected");
await shortPassword.text();

/* ------------------------------------------------------------------ *
 * 6. Clean up: sign back in as A and delete the smoke session
 * ------------------------------------------------------------------ */
jar = new Map();
const relogin = await request("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: emailA, password }),
});
expect(relogin.status, 200, "sign back in as account A");
await relogin.text();
pass(cookieHeader().includes("vs_session="), "login restores the session cookie");

/* ------------------------------------------------------------------ *
 * 6b. Business rules — share links, plan limits, read-only samples
 * ------------------------------------------------------------------ */
for (const route of ["/pricing", "/privacy", "/terms"]) {
  expect((await page(route)).status, 200, `GET ${route}`);
}

// Shared seed reports belong to nobody, so nobody may delete them.
expect(
  (await request("/api/sessions/demo", { method: "DELETE" })).status,
  404,
  "a sample report cannot be deleted by a user",
);

// A session longer than the Free ceiling is refused before it is scored.
const tooLong = await request("/api/sessions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    aggregate: { ...aggregate, durationSec: 60 * 60 },
    meta: { title: "Too long", mode: "practice" },
  }),
});
const tooLongBody = await tooLong.json().catch(() => ({}));
expect(tooLong.status, 422, "a session beyond the plan ceiling is refused");
pass(tooLongBody.code === "session_too_long", "over-length session reports its reason");

// A body above the size ceiling is cut off, not parsed.
const oversize = await request("/api/sessions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: `{"aggregate":"${"x".repeat(2 * 1024 * 1024 + 64)}"}`,
});
expect(oversize.status, 413, "an oversized save body is refused");
await oversize.text();

// Idempotency: the same browser session saved twice returns the first report.
const clientSessionId = `smoke-${stamp}-retry`;
const first = await createSession({ title: "Idempotent save", mode: "practice", clientSessionId });
expect(first.status, 201, "first save with a client session id");
const second = await createSession({ title: "Idempotent save", mode: "practice", clientSessionId });
expect(second.status, 200, "retried save is answered with the original report");
pass(second.body.id === first.body.id, "retry returns the same report id, not a duplicate");

// Share link: works for an anonymous visitor, revocable, and closed afterwards.
const shareRes = await request(`/api/sessions/${first.body.id}/share`, { method: "POST" });
const shareBody = await shareRes.json().catch(() => ({}));
expect(shareRes.status, 201, "owner can create a share link");
const shareToken = shareBody.url ? new URL(shareBody.url).searchParams.get("share") : null;
pass(Boolean(shareToken), "share link carries a token");

const jarA = new Map(jar);
jar = new Map();
const sharedView = await page(`/report/${first.body.id}?share=${shareToken}`);
expect(sharedView.status, 200, "anonymous visitor can read a shared report");
expect((await page(`/report/${first.body.id}?share=wrong-token-000000000000`)).status, 404, "a wrong share token is refused");
expect((await page(`/report/${first.body.id}`)).status, 404, "a live report stays private without a token");
jar = jarA;
expect((await request(`/api/sessions/${first.body.id}/share`, { method: "DELETE" })).status, 200, "owner can revoke sharing");
jar = new Map();
expect((await page(`/report/${first.body.id}?share=${shareToken}`)).status, 404, "a revoked link stops working");
jar = jarA;

// Quota: Free allows 5 analyses a month; the sixth save is refused with 402.
const createdIds = [first.body.id];
for (let i = 0; i < 3; i++) {
  const extra = await createSession({ title: `Quota filler ${i + 1}`, mode: "practice" });
  expect(extra.status, 201, `save ${i + 2} of the Free quota`);
  createdIds.push(extra.body.id);
}
const overQuota = await createSession({ title: "Over quota", mode: "practice" });
expect(overQuota.status, 402, "the save past the monthly quota is refused");
pass(overQuota.body.code === "quota_exceeded", "the refusal names the quota");

for (const id of createdIds) await request(`/api/sessions/${id}`, { method: "DELETE" });

expect((await request(`/api/sessions/${sessionId}`, { method: "DELETE" })).status, 200, "owner can delete the session");
expect((await request(`/api/sessions/${sessionId}`)).status, 404, "deleted session is gone");

const logout = await request("/api/auth/logout", { method: "POST" });
expect(logout.status, 200, "POST /api/auth/logout");
await logout.text();
const afterLogout = await request("/api/sessions");
expect(afterLogout.status, 401, "sessions API is closed after sign-out");
await afterLogout.text();

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */
log("");
log(failures === 0 ? `RESULT: all ${out.filter((l) => l.startsWith("PASS")).length} checks passed` : `RESULT: ${failures} FAILED`);

writeFileSync(diagnostics.logPath("smoke.txt"), out.join("\n"), "utf8");
console.log(out.join("\n"));
process.exit(failures === 0 ? 0 : 1);
