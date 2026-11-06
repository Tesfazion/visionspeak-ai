import assert from "node:assert/strict";
import { before, test } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

const {
  createShare,
  deleteSession,
  findByClientSessionId,
  getSession,
  getSharedSession,
  isSample,
  listSessions,
  revokeShare,
  saveSession,
  updateSession,
  visibleTo,
  writableBy,
} = await import("@/lib/store");
const { dbQuery } = await import("@/lib/db/postgres");
const { buildDemoAggregate } = await import("@/lib/analysis/demo");
const { buildReport } = await import("@/lib/analysis/report");

before(async () => {
  if (testDatabaseUrl) await dbQuery("TRUNCATE sessions");
});

const makeRecord = (id: string, ownerId?: string, clientSessionId?: string) => {
  const aggregate = buildDemoAggregate();
  aggregate.durationSec = 90;
  return {
    id,
    createdAt: new Date().toISOString(),
    speaker: "Test Speaker",
    title: `Session ${id}`,
    mode: "practice" as const,
    durationSec: 90,
    source: "live" as const,
    notes: "",
    report: buildReport(aggregate, "practice"),
    ...(ownerId ? { ownerId } : {}),
    ...(clientSessionId ? { clientSessionId } : {}),
  };
};

test("PostgreSQL session records enforce ownership and sample visibility", {
  skip: !testDatabaseUrl,
}, async () => {
  await saveSession(makeRecord("own-alpha", "u_alpha"));
  await saveSession(makeRecord("own-beta", "u_beta"));
  const alpha = await listSessions("u_alpha");
  assert.ok(alpha.some((record) => record.id === "own-alpha"));
  assert.ok(!alpha.some((record) => record.id === "own-beta"));
  assert.ok((await listSessions(null)).every(isSample));
  assert.equal(await getSession("own-alpha", "u_beta"), null);
  assert.equal(await getSession("own-alpha", null), null);
  assert.ok(await getSession("own-alpha", "u_alpha"));
});

test("session updates, idempotency, and deletes persist", {
  skip: !testDatabaseUrl,
}, async () => {
  const record = makeRecord("own-gamma", "u_gamma", "client-gamma");
  await saveSession(record);
  assert.equal((await findByClientSessionId("u_gamma", "client-gamma"))?.id, record.id);
  assert.equal(await updateSession(record.id, "u_beta", { title: "Not allowed" }), null);
  assert.equal((await updateSession(record.id, "u_gamma", { title: "Updated" }))?.title, "Updated");
  assert.equal(await deleteSession(record.id, "u_beta"), false);
  assert.equal(await deleteSession(record.id, "u_gamma"), true);
});

test("share links can be created, accessed, and revoked", {
  skip: !testDatabaseUrl,
}, async () => {
  const record = makeRecord("share-session", "u_share");
  await saveSession(record);
  const share = await createShare(record.id, "u_share", 1);
  assert.ok(share);
  assert.ok(await getSharedSession(record.id, share.token));
  assert.equal(await createShare(record.id, "u_other", 1), null);
  assert.equal(await revokeShare(record.id, "u_other"), false);
  assert.equal(await revokeShare(record.id, "u_share"), true);
  assert.equal(await getSharedSession(record.id, share.token), null);
});

test("visibility helpers hide legacy ownerless sessions", () => {
  const legacy = makeRecord("legacy") as Parameters<typeof visibleTo>[0];
  assert.equal(visibleTo(legacy, "u_alpha"), false);
  assert.equal(visibleTo(legacy, null), false);
  assert.equal(writableBy(legacy, "u_alpha"), false);
});
