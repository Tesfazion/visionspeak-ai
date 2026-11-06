import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const testRunId = randomUUID();
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

after(async () => {
  if (testDatabaseUrl) {
    await dbQuery("DELETE FROM sessions WHERE id LIKE $1", [`test-${testRunId}-%`]);
  }
});

const makeRecord = (id: string, ownerId?: string, clientSessionId?: string) => {
  const aggregate = buildDemoAggregate();
  aggregate.durationSec = 90;
  return {
    id: `test-${testRunId}-${id}`,
    createdAt: new Date().toISOString(),
    speaker: "Test Speaker",
    title: `Session ${id}`,
    mode: "practice" as const,
    durationSec: 90,
    source: "live" as const,
    notes: "",
    report: buildReport(aggregate, "practice"),
    ...(ownerId ? { ownerId: `test-${testRunId}-${ownerId}` } : {}),
    ...(clientSessionId ? { clientSessionId: `test-${testRunId}-${clientSessionId}` } : {}),
  };
};

test("PostgreSQL session records enforce ownership and sample visibility", {
  skip: !testDatabaseUrl,
}, async () => {
  const alphaRecord = makeRecord("own-alpha", "u_alpha");
  const betaRecord = makeRecord("own-beta", "u_beta");
  const alphaId = `test-${testRunId}-u_alpha`;
  const betaId = `test-${testRunId}-u_beta`;
  await saveSession(alphaRecord);
  await saveSession(betaRecord);
  const alpha = await listSessions(alphaId);
  assert.ok(alpha.some((record) => record.id === alphaRecord.id));
  assert.ok(!alpha.some((record) => record.id === betaRecord.id));
  const samples = await listSessions(null);
  assert.ok(samples.some((record) => record.id === "demo"), "sample reports are seeded alongside owned sessions");
  assert.ok(samples.every(isSample));
  assert.equal(await getSession(alphaRecord.id, betaId), null);
  assert.equal(await getSession(alphaRecord.id, null), null);
  assert.ok(await getSession(alphaRecord.id, alphaId));
});

test("session updates, idempotency, and deletes persist", {
  skip: !testDatabaseUrl,
}, async () => {
  const record = makeRecord("own-gamma", "u_gamma", "client-gamma");
  const ownerId = `test-${testRunId}-u_gamma`;
  const otherOwnerId = `test-${testRunId}-u_beta`;
  await saveSession(record);
  assert.equal((await findByClientSessionId(ownerId, `test-${testRunId}-client-gamma`))?.id, record.id);
  assert.equal(await updateSession(record.id, otherOwnerId, { title: "Not allowed" }), null);
  assert.equal((await updateSession(record.id, ownerId, { title: "Updated" }))?.title, "Updated");
  assert.equal(await deleteSession(record.id, otherOwnerId), false);
  assert.equal(await deleteSession(record.id, ownerId), true);
});

test("share links can be created, accessed, and revoked", {
  skip: !testDatabaseUrl,
}, async () => {
  const record = makeRecord("share-session", "u_share");
  const ownerId = `test-${testRunId}-u_share`;
  await saveSession(record);
  const share = await createShare(record.id, ownerId, 1);
  assert.ok(share);
  assert.ok(await getSharedSession(record.id, share.token));
  assert.equal(await createShare(record.id, `test-${testRunId}-u_other`, 1), null);
  assert.equal(await revokeShare(record.id, `test-${testRunId}-u_other`), false);
  assert.equal(await revokeShare(record.id, ownerId), true);
  assert.equal(await getSharedSession(record.id, share.token), null);
});

test("visibility helpers hide legacy ownerless sessions", () => {
  const legacy = makeRecord("legacy") as Parameters<typeof visibleTo>[0];
  assert.equal(visibleTo(legacy, "u_alpha"), false);
  assert.equal(visibleTo(legacy, null), false);
  assert.equal(writableBy(legacy, "u_alpha"), false);
});
