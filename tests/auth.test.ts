import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

// auth-core resolves its data directory at import time, so the sandbox must
// exist before the module is loaded.
const sandbox = await mkdtemp(path.join(tmpdir(), "vs-auth-"));
process.env.VS_DATA_DIR = sandbox;
delete process.env.AUTH_SECRET;

const {
  MIN_PASSWORD,
  authenticate,
  changePassword,
  countUsers,
  createRateLimiter,
  createSessionToken,
  createUser,
  findUserByEmail,
  hashPassword,
  isSecureRequest,
  normaliseEmail,
  revokeOtherSessions,
  updateProfile,
  validateCredentials,
  verifyPassword,
  verifySessionToken,
} = await import("@/lib/auth-core");
type PasswordChangeError = Awaited<ReturnType<typeof changePassword>> extends
  | { ok: true }
  | { error: infer E }
  ? E
  : never;

before(() => assert.ok(sandbox));
after(() => rm(sandbox, { recursive: true, force: true }));

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

test("createUser stores the account and rejects duplicates", async () => {
  const created = await createUser({ email: "first@example.com", password: "longenough", name: "First" });
  assert.ok("user" in created);
  if (!("user" in created)) return;
  assert.equal(created.user.email, "first@example.com");
  assert.equal(created.user.name, "First");
  assert.ok(!("passwordHash" in created.user), "public user must not leak the hash");

  const duplicate = await createUser({ email: "FIRST@example.com", password: "longenough", name: "Dupe" });
  assert.ok("error" in duplicate);
  assert.match(duplicate.error, /already exists/);

  assert.equal(await countUsers(), 1);
  const raw = JSON.parse(await readFile(path.join(sandbox, "users.json"), "utf8"));
  const records = Array.isArray(raw) ? raw : raw.records;
  assert.equal(records.length, 1);
  assert.ok(records[0].passwordHash && !records[0].password);
});

test("authenticate accepts the right password only", async () => {
  await createUser({ email: "login@example.com", password: "supersecret", name: "Login" });

  const ok = await authenticate("LOGIN@example.com", "supersecret");
  assert.equal(ok?.email, "login@example.com");

  assert.equal(await authenticate("login@example.com", "supersecreT"), null);
  assert.equal(await authenticate("ghost@example.com", "supersecret"), null);
});

test("session tokens are signed, expire and reject tampering", async () => {
  const token = await createSessionToken("u_abc", 60_000);
  assert.equal(await verifySessionToken(token), "u_abc");

  const parts = token.split(".");
  assert.equal(parts.length, 4, "userId.issuedAt.expiry.signature");

  // Signature tampering.
  assert.equal(await verifySessionToken(`${parts.slice(0, -1).join(".")}.deadbeef`), null);
  // Payload tampering (swap the user id, keep the old signature).
  assert.equal(await verifySessionToken(`u_evil.${parts.slice(1).join(".")}`), null);
  // Malformed, and a pre-`issuedAt` three-part token with a broken signature.
  assert.equal(await verifySessionToken("nonsense"), null);
  assert.equal(await verifySessionToken(""), null);
  assert.equal(await verifySessionToken(undefined), null);
  assert.equal(await verifySessionToken(`u_abc.${parts[2]}.deadbeef`), null);

  // Already expired.
  const expired = await createSessionToken("u_abc", -1000);
  assert.equal(await verifySessionToken(expired), null);
});

test("signing out everywhere invalidates earlier tokens but keeps the new one", async () => {
  const created = await createUser({ email: "revoke@example.com", password: "longenough", name: "Revoke" });
  assert.ok("user" in created);
  if (!("user" in created)) return;
  const userId = created.user.id;

  const before = await createSessionToken(userId, 60_000);
  assert.equal(await verifySessionToken(before), userId);

  assert.equal(await revokeOtherSessions(userId), true);
  assert.equal(await verifySessionToken(before), null, "a token issued before the cut-off must die");

  const after = await createSessionToken(userId, 60_000);
  assert.equal(await verifySessionToken(after), userId, "the device that pressed the button stays signed in");
});

test("a pre-issuedAt token is honoured until a cut-off is set", async () => {
  const created = await createUser({ email: "legacy@example.com", password: "longenough", name: "Legacy" });
  assert.ok("user" in created);
  if (!("user" in created)) return;
  const userId = created.user.id;

  // Exactly what the previous token format produced: no issuedAt segment.
  const secret = (await readFile(path.join(sandbox, "auth-secret"), "utf8")).trim();
  const expiry = Date.now() + 60_000;
  const payload = `${userId}.${expiry}`;
  const legacy = `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;

  assert.equal(await verifySessionToken(legacy), userId);
  await revokeOtherSessions(userId);
  assert.equal(await verifySessionToken(legacy), null, "a cut-off invalidates legacy tokens too");
});

test("the signing secret is persisted so restarts keep sessions valid", async () => {
  const secret = await readFile(path.join(sandbox, "auth-secret"), "utf8");
  assert.ok(secret.trim().length >= 16);
});

test("the secret is created once and reused", async () => {
  const token = await createSessionToken("u_stable", 60_000);
  const first = await readFile(path.join(sandbox, "auth-secret"), "utf8");
  assert.equal(await verifySessionToken(token), "u_stable");
  const second = await readFile(path.join(sandbox, "auth-secret"), "utf8");
  assert.equal(first, second);
});

test("rate limiter blocks after the limit and recovers after the window", () => {
  // A long window keeps this deterministic: with a 40ms window a stalled CI
  // runner could let the window expire between two checks and the test would
  // fail for no real reason.
  const limiter = createRateLimiter({ limit: 2, windowMs: 10_000 });
  assert.equal(limiter.check("k").allowed, true);
  assert.equal(limiter.check("k").allowed, true);
  const blocked = limiter.check("k");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
  // A different key is unaffected.
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

test("a corrupt users file degrades to empty instead of throwing", async () => {
  await writeFile(path.join(sandbox, "users.json"), "{not json", "utf8");
  assert.equal(await countUsers(), 0);
  assert.equal(await findUserByEmail("first@example.com"), null);
});

test("the session cookie is only marked Secure when the request arrived over TLS", async () => {
  const req = (url: string, headers: Record<string, string> = {}) =>
    new Request(url, { headers });

  // A production build served over plain HTTP (the "Network" URL `next start`
  // prints) must not send a Secure cookie: the browser would drop it and the
  // user would bounce from /login straight back to /login.
  assert.equal(isSecureRequest(req("http://192.168.1.20:3000/api/auth/login")), false);
  assert.equal(isSecureRequest(req("https://visionspeak.example/api/auth/login")), true);

  // Behind a TLS-terminating proxy the scheme is in the header, not the URL.
  assert.equal(
    isSecureRequest(req("http://10.0.0.5:3000/api/auth/login", { "x-forwarded-proto": "https" })),
    true,
  );
  assert.equal(
    isSecureRequest(req("http://10.0.0.5:3000/api/auth/login", { "x-forwarded-proto": "https, http" })),
    true,
  );
  assert.equal(
    isSecureRequest(req("http://10.0.0.5:3000/api/auth/login", { "x-forwarded-proto": "http" })),
    false,
  );

  // A URL that cannot be parsed must not silently opt into Secure (nor throw).
  assert.equal(isSecureRequest({ headers: new Headers(), url: "not a url" } as unknown as Request), false);
});

test("updateProfile changes the display name only", async () => {
  const created = await createUser({ email: "profile@example.com", password: "longenough", name: "Before" });
  assert.ok("user" in created);
  if (!("user" in created)) return;

  const updated = await updateProfile(created.user.id, { name: "  After  " });
  assert.equal(updated?.name, "After");

  // An empty or absent name leaves the record untouched rather than blanking it.
  assert.equal((await updateProfile(created.user.id, {}))?.name, "After");
  assert.equal(await updateProfile("u_ghost", { name: "Ghost" }), null);
});

test("changePassword requires the current password and rotates the hash", async () => {
  const created = await createUser({ email: "pwchange@example.com", password: "oldpassword", name: "Pw" });
  assert.ok("user" in created);
  if (!("user" in created)) return;
  const userId = created.user.id;

  const expectError = async (
    promise: Promise<{ ok: true } | { error: PasswordChangeError }>,
    expected: PasswordChangeError,
  ) => {
    const result = await promise;
    assert.ok("error" in result, `expected error ${expected}`);
    if (!("error" in result)) return;
    assert.equal(result.error, expected);
  };

  await expectError(changePassword(userId, "wrongpassword", "newpassword1"), "wrong_current");
  await expectError(changePassword(userId, "oldpassword", "short"), "too_short");
  await expectError(changePassword(userId, "oldpassword", "x".repeat(201)), "too_long");

  const ok = await changePassword(userId, "oldpassword", "newpassword1");
  assert.ok("ok" in ok);
  assert.equal((await authenticate("pwchange@example.com", "newpassword1"))?.id, userId);
  assert.equal(await authenticate("pwchange@example.com", "oldpassword"), null);

  // A password change cuts off earlier session tokens, like "sign out everywhere".
  // A token minted BEFORE the change was requested: the cookie the browser held.
  const held = await createSessionToken(userId, 60_000);
  assert.equal(await verifySessionToken(held), userId, "the old cookie works before the cut-off");

  await changePassword(userId, "newpassword1", "newpassword2");
  assert.equal(await verifySessionToken(held), null, "the old cookie dies after a second change");
  const fresh = await createSessionToken(userId, 60_000);
  assert.equal(await verifySessionToken(fresh), userId, "a cookie minted after the cut-off survives");

  await expectError(changePassword("u_ghost", "x", "longenough"), "account_missing");
});
