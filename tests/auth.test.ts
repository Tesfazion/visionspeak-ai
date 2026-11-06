import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const testRunId = randomUUID();
const testEmail = (scenario: string) => `test-${testRunId}-${scenario}@example.com`;
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;
process.env.AUTH_SECRET = "auth-test-secret-0123456789abcdef";

const {
  MIN_PASSWORD,
  authenticate,
  changePassword,
  createRateLimiter,
  createSessionToken,
  createUser,
  findUserByEmail,
  getAuthSecret,
  hashPassword,
  isAuthSecretConfigured,
  isSecureRequest,
  normaliseEmail,
  revokeOtherSessions,
  updateProfile,
  validateCredentials,
  verifyPassword,
  verifySessionToken,
} = await import("@/lib/auth-core");
const { dbQuery } = await import("@/lib/db/postgres");

after(async () => {
  if (!testDatabaseUrl) return;
  const emailPattern = `test-${testRunId}-%@example.com`;
  await dbQuery(
    "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)",
    [emailPattern],
  );
  await dbQuery("DELETE FROM users WHERE email LIKE $1", [emailPattern]);
});

test("validateCredentials rejects bad input", () => {
  assert.match(validateCredentials({ email: "nope", password: "longenough" }).error ?? "", /valid email/);
  assert.match(validateCredentials({ email: "a@b.co", password: "short" }).error ?? "", /at least 8/);
  assert.ok("email" in validateCredentials({ email: "A@B.co ", password: "longenough" }));
});

test("validateCredentials normalises email and defaults the name", () => {
  const parsed = validateCredentials({ email: "  User@Example.COM ", password: "longenough" });
  assert.ok("email" in parsed);
  if (!("email" in parsed)) return;
  assert.equal(parsed.email, "user@example.com");
  assert.equal(parsed.name, "user");
  assert.equal(MIN_PASSWORD, 8);
  assert.equal(normaliseEmail(" X@Y.Z "), "x@y.z");
});

test("hashPassword/verifyPassword round-trip without storing plaintext", async () => {
  const { salt, passwordHash } = await hashPassword("correct horse battery");
  assert.equal(salt.length, 32);
  assert.equal(passwordHash.length, 128);
  assert.ok(!passwordHash.includes("correct horse"));
  assert.equal(await verifyPassword("correct horse battery", { salt, passwordHash }), true);
  assert.equal(await verifyPassword("wrong password", { salt, passwordHash }), false);
});

test("createUser stores a hashed account and rejects duplicate email", {
  skip: !testDatabaseUrl,
}, async () => {
  const created = await createUser({
    email: testEmail("first"),
    password: "longenough",
    name: "First",
  });
  assert.ok("user" in created);
  if (!("user" in created)) return;
  assert.ok(!("passwordHash" in created.user));
  const stored = await findUserByEmail(created.user.email);
  assert.ok(stored?.passwordHash);
  assert.ok(!("password" in (stored ?? {})));
  const duplicate = await createUser({ email: created.user.email.toUpperCase(), password: "longenough", name: "Dupe" });
  assert.ok("error" in duplicate);
});

test("authenticate accepts the right password only", { skip: !testDatabaseUrl }, async () => {
  const email = testEmail("login");
  await createUser({ email, password: "supersecret", name: "Login" });
  assert.equal((await authenticate(email.toUpperCase(), "supersecret"))?.email, email);
  assert.equal(await authenticate(email, "wrong-password"), null);
  assert.equal(await authenticate(testEmail("ghost"), "supersecret"), null);
});

test("session tokens are signed, expire and reject tampering", { skip: !testDatabaseUrl }, async () => {
  const created = await createUser({ email: testEmail("token"), password: "longenough", name: "Token" });
  assert.ok("user" in created);
  if (!("user" in created)) return;
  const token = await createSessionToken(created.user.id, 60_000);
  assert.equal(await verifySessionToken(token), created.user.id);
  const parts = token.split(".");
  assert.equal(parts.length, 4);
  assert.equal(await verifySessionToken(`${parts.slice(0, -1).join(".")}.deadbeef`), null);
  assert.equal(await verifySessionToken(`u_evil.${parts.slice(1).join(".")}`), null);
  assert.equal(await verifySessionToken("nonsense"), null);
  assert.equal(await verifySessionToken(""), null);
  assert.equal(await verifySessionToken(undefined), null);
  assert.equal(await verifySessionToken(await createSessionToken(created.user.id, -1000)), null);
});

test("signing out everywhere invalidates earlier tokens", { skip: !testDatabaseUrl }, async () => {
  const created = await createUser({ email: testEmail("revoke"), password: "longenough", name: "Revoke" });
  assert.ok("user" in created);
  if (!("user" in created)) return;
  const before = await createSessionToken(created.user.id, 60_000);
  assert.equal(await verifySessionToken(before), created.user.id);
  assert.equal(await revokeOtherSessions(created.user.id), true);
  assert.equal(await verifySessionToken(before), null);
  const after = await createSessionToken(created.user.id, 60_000);
  assert.equal(await verifySessionToken(after), created.user.id);
});

test("the configured signing secret is reused", async () => {
  assert.equal(await getAuthSecret(), process.env.AUTH_SECRET);
  assert.equal(await getAuthSecret(), process.env.AUTH_SECRET);
});

test("auth secret readiness requires at least 16 non-whitespace characters", () => {
  assert.equal(isAuthSecretConfigured(undefined), false);
  assert.equal(isAuthSecretConfigured("   "), false);
  assert.equal(isAuthSecretConfigured("short"), false);
  assert.equal(isAuthSecretConfigured("1234567890123456"), true);
  assert.equal(isAuthSecretConfigured("  1234567890123456  "), true);
});

test("rate limiter blocks after the limit and recovers after the window", () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 10_000 });
  assert.equal(limiter.check("k").allowed, true);
  assert.equal(limiter.check("k").allowed, true);
  const blocked = limiter.check("k");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
  assert.equal(limiter.check("other").allowed, true);
});

test("rate limiter allows again once the window has elapsed", async () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 30 });
  assert.equal(limiter.check("k").allowed, true);
  assert.equal(limiter.check("k").allowed, false);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(limiter.check("k").allowed, true);
});

test("rate limiter resets a cleared key", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 10_000 });
  assert.equal(limiter.check("k").allowed, true);
  assert.equal(limiter.check("k").allowed, false);
  limiter.reset("k");
  assert.equal(limiter.check("k").allowed, true);
});

test("the session cookie is Secure only for HTTPS requests", () => {
  assert.equal(isSecureRequest(new Request("http://localhost/")), false);
  assert.equal(isSecureRequest(new Request("https://example.com/")), true);
  assert.equal(
    isSecureRequest(new Request("http://internal/", { headers: { "x-forwarded-proto": "https" } })),
    true,
  );
});

test("profile edits and password changes persist in PostgreSQL", { skip: !testDatabaseUrl }, async () => {
  const email = testEmail("profile");
  const created = await createUser({ email, password: "original-pass", name: "Before" });
  assert.ok("user" in created);
  if (!("user" in created)) return;
  assert.equal((await updateProfile(created.user.id, { name: "After" }))?.name, "After");
  assert.deepEqual(await changePassword(created.user.id, "wrong", "new-password"), { error: "wrong_current" });
  assert.deepEqual(await changePassword(created.user.id, "original-pass", "new-password"), { ok: true });
  assert.equal((await authenticate(email, "new-password"))?.email, email);
});
