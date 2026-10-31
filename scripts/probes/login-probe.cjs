// End-to-end auth probe: sign up, sign out, sign in, then request /dashboard.
//
// Child-process stdout is not captured by the agent shell in this project, so
// the report lands in docs/artifacts/login-probe.json (see scripts/lib/diagnostics.cjs).
//
// Usage: node scripts/probes/login-probe.cjs [origin]   (default http://localhost:3111)
const diagnostics = require("../lib/diagnostics.cjs");

const origin = process.argv[2] ?? "http://localhost:3111";
const stamp = Date.now();
const email = `login-probe-${stamp}@example.com`;
const password = "ProbePass123!";

const out = [];

function record(label, data) {
  out.push({ label, ...data });
}

function cookieFrom(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  const list = raw.length ? raw : [res.headers.get("set-cookie") ?? ""].filter(Boolean);
  return list.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

async function get(path, cookie) {
  const res = await fetch(origin + path, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
  const body = await res.text();
  return {
    status: res.status,
    location: res.headers.get("location"),
    hasDashboardTitle: /Practice history|dash\.title|Your practice/i.test(body),
    hasLoginForm: /Sign in|auth\.signInButton/i.test(body),
    snippet: body.slice(0, 300),
  };
}

async function post(path, payload) {
  const res = await fetch(origin + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "manual",
  });
  const text = await res.text();
  return { status: res.status, cookie: cookieFrom(res), body: text.slice(0, 300) };
}

(async () => {
  try {
    const anonymous = await get("/dashboard", "");
    record("dashboard while signed out", anonymous);

    const signup = await post("/api/auth/signup", { name: "Login Probe", email, password });
    record("signup", signup);

    const afterSignup = await get("/dashboard", signup.cookie);
    record("dashboard with signup cookie", afterSignup);

    const me = await get("/api/auth/me", signup.cookie);
    record("api/auth/me with signup cookie", me);

    const login = await post("/api/auth/login", { email, password });
    record("login", login);

    const afterLogin = await get("/dashboard", login.cookie);
    record("dashboard with login cookie", afterLogin);

    const me2 = await get("/api/auth/me", login.cookie);
    record("api/auth/me with login cookie", me2);
  } catch (err) {
    record("probe error", { error: String(err) });
  }

  const fs = require("node:fs");
  fs.writeFileSync(
    diagnostics.artifactPath("login-probe.json"),
    JSON.stringify({ origin, email, results: out }, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})();
