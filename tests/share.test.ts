import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";

import type { SessionRecord } from "@/lib/types";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const testRunId = randomUUID();
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

const {
  createShare,
  deleteSession,
  getSession,
  getSharedSession,
  isValidShareToken,
  revokeShare,
  saveSession,
} = await import("@/lib/store");
const { buildDemoAggregate } = await import("@/lib/analysis/demo");
const { buildReport } = await import("@/lib/analysis/report");
const { dbQuery } = await import("@/lib/db/postgres");

after(async () => {
  if (testDatabaseUrl) {
    await dbQuery("DELETE FROM sessions WHERE id LIKE $1", [`test-${testRunId}-%`]);
  }
});

const makeRecord = (id: string, ownerId?: string, overrides: Partial<SessionRecord> = {}): SessionRecord => {
  const aggregate = buildDemoAggregate();
  aggregate.durationSec = 90;
  return {
    id: `test-${testRunId}-${id}`,
    createdAt: new Date().toISOString(),
    speaker: "Share Tester",
    title: `Session ${id}`,
    mode: "practice",
    durationSec: 90,
    source: "live",
    notes: "",
    report: buildReport(aggregate, "practice"),
    ...(ownerId ? { ownerId: `test-${testRunId}-${ownerId}` } : {}),
    ...overrides,
  };
};

test("an owner can create a share link and it resolves the report", { skip: !testDatabaseUrl }, async () => {
  const record = makeRecord("share-1", "u_owner");
  const ownerId = `test-${testRunId}-u_owner`;
  await saveSession(record);
  const share = await createShare(record.id, ownerId, 7);
  assert.ok(share, "share must be created");
  assert.ok(isValidShareToken(share!.token));
  assert.ok(new Date(share!.expiresAt).getTime() > Date.now());

  const shared = await getSharedSession(record.id, share!.token);
  assert.equal(shared?.id, record.id);
  assert.equal(await getSharedSession(record.id, "not-a-real-token-but-long-enough"), null);
  assert.equal(await getSharedSession(record.id, undefined), null);
  const tampered = share!.token.slice(0, -1) + (share!.token.endsWith("A") ? "B" : "A");
  assert.equal(await getSharedSession(record.id, tampered), null);
});

test("a stranger can neither create nor revoke a share link", { skip: !testDatabaseUrl }, async () => {
  const record = makeRecord("share-2", "u_owner");
  await saveSession(record);
  assert.equal(await createShare(record.id, `test-${testRunId}-u_stranger`, 7), null);
  assert.equal(await revokeShare(record.id, `test-${testRunId}-u_stranger`), false);
  assert.equal(await createShare(`test-${testRunId}-missing-record`, `test-${testRunId}-u_owner`, 7), null);
  assert.equal(await createShare(record.id, `test-${testRunId}-u_owner`, 0), null);
});

test("revoking a link closes access immediately", { skip: !testDatabaseUrl }, async () => {
  const record = makeRecord("share-3", "u_owner");
  const ownerId = `test-${testRunId}-u_owner`;
  await saveSession(record);
  const share = await createShare(record.id, ownerId, 7);
  assert.ok(share);
  assert.equal(await revokeShare(record.id, ownerId), true);
  assert.equal(await getSharedSession(record.id, share!.token), null);
  // Revoking twice is a no-op, not a crash.
  assert.equal(await revokeShare(record.id, ownerId), false);
});

test("an expired link never resolves", { skip: !testDatabaseUrl }, async () => {
  const record = makeRecord("share-4", "u_owner", {
    share: {
      token: `expired-${testRunId}`,
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-08T00:00:00.000Z",
    },
  });
  await saveSession(record);
  assert.equal(await getSharedSession(record.id, `expired-${testRunId}`), null);
});

test("sample reports are read-only — nobody can delete shared seed data", { skip: !testDatabaseUrl }, async () => {
  const record = makeRecord("sample-1", undefined, { source: "demo" });
  const ownerId = `test-${testRunId}-u_owner`;
  await saveSession(record);
  assert.equal(await deleteSession(record.id, ownerId), false, "owner cannot delete a sample");
  assert.ok(await getSession(record.id, ownerId), "sample must survive");
  assert.equal(await createShare(record.id, ownerId, 7), null);
});
