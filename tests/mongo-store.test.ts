import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

// The Mongo adapters resolve their data directory at import time, so the
// sandbox must exist before the module is loaded. The suite runs against a
// real local MongoDB when one answers on MONGO_TEST_URI (or the default local
// URI); with VS_STORAGE=json it exercises the JSON reference path instead, so
// the same assertions gate both stores in CI and on a laptop.
const sandbox = await mkdtemp(path.join(tmpdir(), "vs-mongo-"));
process.env.VS_DATA_DIR = sandbox;
process.env.AUTH_SECRET = "mongo-store-test-secret-0123456789";
if (!process.env.MONGO_TEST_URI) process.env.MONGODB_URI = "mongodb://localhost:27017/visionspeak-test";

// Reachability is probed once: an unreachable server skips the Mongo branch
// rather than failing CI on a laptop that never installed MongoDB.
let mongoUp = false;
if (process.env.VS_STORAGE !== "json") {
  try {
    const { MongoClient } = await import("mongodb");
    const probe = new MongoClient(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 2000 });
    await probe.connect();
    await probe.db().command({ ping: 1 });
    await probe.close();
    mongoUp = true;
  } catch {
    mongoUp = false;
  }
}
if (!mongoUp) process.env.VS_STORAGE = "json";

const { createUser, findUserByEmail, findUserById, authenticate, deleteAccount, toPublicUser } =
  await import("@/lib/mongo-auth");
const { saveSession, getSession, listSessions, deleteSession } = await import("@/lib/mongo-store");
const { buildDemoAggregate } = await import("@/lib/analysis/demo");

before(() => assert.ok(sandbox));

after(async () => {
  // Give any pending MongoDB operations a moment to complete before cleanup
  await new Promise((r) => setTimeout(r, 100));
  try {
    await rm(sandbox, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; on Windows rm -rf may fail if files are locked.
    // CI will still pass; the sandbox is ephemeral.
  }
});

test("createUser stores the account with the app's own id as _id", async () => {
  const created = await createUser({ email: "mongo@example.com", password: "longenough", name: "Mongo" });
  assert.ok("user" in created);
  if (!("user" in created)) return;
  assert.equal(created.user.email, "mongo@example.com");
  assert.match(created.user.id, /^u_/);

  if (mongoUp) {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(process.env.MONGODB_URI!);
    try {
      const doc = await client.db().collection("users").findOne({ _id: created.user.id } as never);
      assert.ok(doc, "the account must be in MongoDB, not only in the JSON file");
      assert.equal(doc.email, "mongo@example.com");
      assert.ok(doc.passwordHash && !doc.password, "only the hash is stored");
    } finally {
      await client.close();
    }
  }

  const duplicate = await createUser({ email: "MONGO@example.com", password: "longenough", name: "Dupe" });
  assert.ok("error" in duplicate);
});

test("find/authenticate round-trip through the active store", async () => {
  const user = await findUserByEmail("mongo@example.com");
  assert.ok(user);
  assert.equal((await findUserById(user.id))?.id, user.id);
  assert.equal((await authenticate("mongo@example.com", "longenough"))?.email, "mongo@example.com");
  assert.equal(await authenticate("mongo@example.com", "wrong-password"), null);
});

test("a saved session is visible to its owner and hidden from everyone else", async () => {
  const owner = await findUserByEmail("mongo@example.com");
  assert.ok(owner);
  const aggregate = buildDemoAggregate();
  aggregate.durationSec = 60;
  const record = {
    id: `s_mongo_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    speaker: "Mongo Tester",
    title: "Mongo adapter session",
    mode: "practice" as const,
    durationSec: 60,
    source: "live" as const,
    notes: "",
    ownerId: owner.id,
    report: { overall: 70 } as unknown as never,
  };

  await saveSession(record as never);
  assert.ok(await getSession(record.id, owner.id), "the owner reads their own record");
  assert.equal(await getSession(record.id, "u_stranger"), null, "a stranger cannot read it");
  assert.equal(await getSession(record.id, null), null, "an anonymous visitor cannot read it");
  const list = await listSessions(owner.id, { includeSamples: false });
  assert.ok(list.some((s) => s.id === record.id));
  assert.equal(await deleteSession(record.id, "u_stranger"), false, "a stranger cannot delete it");
  assert.equal(await deleteSession(record.id, owner.id), true, "the owner can delete it");
  assert.equal(await getSession(record.id, owner.id), null, "a deleted record is gone");
});

test("deleteAccount anonymises the row", async () => {
  const created = await createUser({ email: "gone@example.com", password: "longenough", name: "Gone" });
  assert.ok("user" in created);
  if (!("user" in created)) return;
  assert.equal(await deleteAccount(created.user.id), true);
  const row = await findUserById(created.user.id);
  assert.ok(row);
  assert.equal(row.name, "[deleted]");
  assert.ok(row.email.startsWith("deleted-"), "the address is anonymised");
  assert.equal(row.passwordHash, "");
  assert.equal(toPublicUser(row).email.startsWith("deleted-"), true);
});
