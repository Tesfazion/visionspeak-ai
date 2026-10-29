import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import type { SessionRecord } from "@/lib/types";

const sandbox = await mkdtemp(path.join(tmpdir(), "vs-share-"));
process.env.VS_DATA_DIR = sandbox;

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

before(() => assert.ok(sandbox));
after(() => rm(sandbox, { recursive: true, force: true }));

const makeRecord = (id: string, ownerId?: string, overrides: Partial<SessionRecord> = {}): SessionRecord => {
  const aggregate = buildDemoAggregate();
  aggregate.durationSec = 90;
  return {
    id,
    createdAt: new Date().toISOString(),
    speaker: "Share Tester",
    title: `Session ${id}`,
    mode: "practice",
    durationSec: 90,
    source: "live",
    notes: "",
    report: buildReport(aggregate, "practice"),
    ...(ownerId ? { ownerId } : {}),
    ...overrides,
  };
};

test("an owner can create a share link and it resolves the report", async () => {
  await saveSession(makeRecord("share-1", "u_owner"));
  const share = await createShare("share-1", "u_owner", 7);
  assert.ok(share, "share must be created");
  assert.ok(isValidShareToken(share!.token));
  assert.ok(new Date(share!.expiresAt).getTime() > Date.now());

  const shared = await getSharedSession("share-1", share!.token);
  assert.equal(shared?.id, "share-1");
  assert.equal(await getSharedSession("share-1", "not-a-real-token-but-long-enough"), null);
  assert.equal(await getSharedSession("share-1", undefined), null);
  const tampered = share!.token.slice(0, -1) + (share!.token.endsWith("A") ? "B" : "A");
  assert.equal(await getSharedSession("share-1", tampered), null);
});

test("a stranger can neither create nor revoke a share link", async () => {
  await saveSession(makeRecord("share-2", "u_owner"));
  assert.equal(await createShare("share-2", "u_stranger", 7), null);
  assert.equal(await revokeShare("share-2", "u_stranger"), false);
  assert.equal(await createShare("missing-record", "u_owner", 7), null);
  assert.equal(await createShare("share-2", "u_owner", 0), null);
});

test("revoking a link closes access immediately", async () => {
  await saveSession(makeRecord("share-3", "u_owner"));
  const share = await createShare("share-3", "u_owner", 7);
  assert.ok(share);
  assert.equal(await revokeShare("share-3", "u_owner"), true);
  assert.equal(await getSharedSession("share-3", share!.token), null);
  // Revoking twice is a no-op, not a crash.
  assert.equal(await revokeShare("share-3", "u_owner"), false);
});

test("an expired link never resolves", async () => {
  await saveSession(
    makeRecord("share-4", "u_owner", {
      share: {
        token: "expired-token-1234567890",
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-08T00:00:00.000Z",
      },
    }),
  );
  assert.equal(await getSharedSession("share-4", "expired-token-1234567890"), null);
});

test("sample reports are read-only — nobody can delete shared seed data", async () => {
  await saveSession(makeRecord("sample-1", undefined, { source: "demo" }));
  assert.equal(await deleteSession("sample-1", "u_owner"), false, "owner cannot delete a sample");
  assert.ok(await getSession("sample-1", "u_owner"), "sample must survive");
  assert.equal(await createShare("sample-1", "u_owner", 7), null);
});
