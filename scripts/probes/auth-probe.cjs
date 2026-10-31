// End-to-end probe of the auth gate: signed-out redirect, signup, login,
// cookie persistence, the protected pages and logout.
//
// Written because "login does nothing / dashboard never opens" has several
// possible causes (cookie rejected, signature mismatch, proxy not matching,
// page-level redirect instead of a real 307) that look identical in a browser.
// This distinguishes them by replaying the exact HTTP conversation a browser
// has, and records every status/location so the failing hop is obvious.
//
// Usage: node scripts/probes/auth-probe.cjs [baseUrl]
const { writeFileSync } = require("node:fs");
const { notePath } = require("../lib/diagnostics.cjs");

const base = (process.argv[2] ?? "http://localhost:3210").replace(/\/$/, "");
const out = [`base=${base}`, `when=${new Date().toISOString()}`, ""];

const cookieValue = (setCookie) => setCookie.split(";")[0];

const show = (label, res, extra = []) => {
  out.push(`${label}`);
  out.push(`  status=${res.status} location=${res.headers.get("location") ?? "-"}`);
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    // Never print the token itself; its presence and flags are what matter.
    const [pair, ...attrs] = c.split(";");
    const name = pair.split("=")[0];
    out.push(`  set-cookie: ${name}=<${pair.length - name.length - 1} chars> [${attrs.map((a) => a.trim()).join(" | ")}]`);
  }
  for (const line of extra) out.push(`  ${line}`);
  out.push("");
};

const post = (path, body, cookie) =>
  fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });

const get = (path, cookie) =>
  fetch(base + path, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });

(async () => {
  const email = process.env.PROBE_EMAIL ?? "probe@visionspeak.test";
  const password = "probe-password-123";

  try {
    // 1. Signed out, the gate must be a real 307 issued before rendering.
    const anon = await get("/dashboard");
    show("1. GET /dashboard (signed out)", anon, [
      `expect 307 -> /login, got ${anon.status}`,
    ]);

    // 2. A login attempt before any account exists must name that problem
    //    rather than blaming the password.
    const emptyStore = await post("/api/auth/login", { email, password });
    show("2. POST /api/auth/login (no accounts yet)", emptyStore, [
      `body=${(await emptyStore.text()).slice(0, 200)}`,
    ]);

    // 3. Make sure the account exists (signup is idempotent for the probe).
    const signup = await post("/api/auth/signup", { name: "Probe", email, password });
    const signupBody = await signup.text();
    show("3. POST /api/auth/signup", signup, [`body=${signupBody.slice(0, 200)}`]);

    // 4. The hop the user reports as broken.
    const login = await post("/api/auth/login", { email, password });
    const loginBody = await login.text();
    show("4. POST /api/auth/login", login, [`body=${loginBody.slice(0, 200)}`]);

    const setCookie = login.headers.getSetCookie?.() ?? [];
    const session = setCookie.find((c) => c.startsWith("vs_session="));
    if (!session) {
      out.push("VERDICT: FAIL â€” login returned no vs_session cookie; the browser");
      out.push("         therefore stays signed out and bounces back to /login.");
      return;
    }
    const cookie = cookieValue(session);

    // 5. Does the cookie resolve to a user?
    const me = await get("/api/auth/me", cookie);
    show("5. GET /api/auth/me (with cookie)", me, [`body=${(await me.text()).slice(0, 200)}`]);

    // 6. Protected pages with the cookie.
    for (const [label, path] of [
      ["6. GET /dashboard (signed in)", "/dashboard"],
      ["7. GET /studio (signed in)", "/studio"],
    ]) {
      const res = await get(path, cookie);
      const html = await res.text();
      show(label, res, [
        `expect 200, got ${res.status}`,
        `hasDashboardHeading=${html.includes("Practice history")}`,
        `hasEmptyState=${html.includes("No sessions yet")}`,
        `hasStudio=${html.includes("Live speaking analysis")}`,
        `isLoginPage=${html.includes("Welcome back")}`,
        `len=${html.length}`,
      ]);
    }

    // 8. Logout must actually clear the cookie.
    const logout = await post("/api/auth/logout", {}, cookie);
    show("8. POST /api/auth/logout", logout, [`body=${(await logout.text()).slice(0, 120)}`]);

    const cleared = (logout.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("vs_session="));
    out.push(
      cleared && /max-age=0/i.test(cleared)
        ? "logout clears the cookie: PASS"
        : "logout did NOT clear the cookie: FAIL",
    );
  } catch (err) {
    out.push(`VERDICT: ERROR â€” ${err.message}`);
    out.push("(is the server running on this base URL?)");
  }

  writeFileSync(notePath("auth-probe.txt"), out.join("\n"), "utf8");
})();
