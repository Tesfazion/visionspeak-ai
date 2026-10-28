import assert from "node:assert/strict";
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
  countUsers,
  createRateLimiter,
  createSessionToken,
  createUser,
  findUserByEmail,
  hashPassword,
  normaliseEmail,
  validateCredentials,
  verifyPassword,
  verifySessionToken,
} = await import("@/lib/auth-core");

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
  assert.equal(raw.length, 1);
  assert.ok(raw[0].passwordHash && !raw[0].password);
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

  // Signature tampering.
  const parts = token.split(".");
  assert.equal(await verifySessionToken(`${parts[0]}.${parts[1]}.deadbeef`), null);
  // Payload tampering (swap the user id, keep the old signature).
  assert.equal(await verifySessionToken(`u_evil.${parts[1]}.${parts[2]}`), null);
  // Malformed.
  assert.equal(await verifySessionToken("nonsense"), null);
  assert.equal(await verifySessionToken(""), null);
  assert.equal(await verifySessionToken(undefined), null);

  // Already expired.
  const expired = await createSessionToken("u_abc", -1000);
  assert.equal(await verifySessionToken(expired), null);
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
  const limiter = createRateLimiter({ limit: 2, windowMs: 40 });
  assert.equal(limiter.check("k").allowed, true);
  assert.equal(limiter.check("k").allowed, true);
  const blocked = limiter.check("k");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
  // A different key is unaffected.
  assert.equal(limiter.check("other").allowed, true);
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
