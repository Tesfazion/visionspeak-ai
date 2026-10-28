import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const sandbox = await mkdtemp(path.join(tmpdir(), "vs-store-"));
process.env.VS_DATA_DIR = sandbox;

const { deleteSession, getSession, isSample, listSessions, saveSession, updateSession, visibleTo, writableBy } =
  await import("@/lib/store");
const { buildDemoAggregate } = await import("@/lib/analysis/demo");
const { buildReport } = await import("@/lib/analysis/report");

before(() => assert.ok(sandbox));
after(() => rm(sandbox, { recursive: true, force: true }));

const makeRecord = (id: string, ownerId?: string) => {
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
  };
};

test("an empty store seeds the sample history once", async () => {
  const sessions = await listSessions("u_alpha");
  assert.ok(sessions.length >= 4, `expected seeded samples, got ${sessions.length}`);
  assert.ok(sessions.every((s) => isSample(s)));

  // Newest first.
  for (let i = 1; i < sessions.length; i++) {
    assert.ok(sessions[i - 1].createdAt >= sessions[i].createdAt);
  }

  // A second call must not duplicate the seed.
  const again = await listSessions("u_alpha");
  assert.equal(again.length, sessions.length);
});

test("live sessions are private to their owner", async () => {
  await saveSession(makeRecord("own-alpha", "u_alpha"));
  await saveSession(makeRecord("own-beta", "u_beta"));

  const alpha = await listSessions("u_alpha");
  const beta = await listSessions("u_beta");
  const anon = await listSessions(null);

  assert.ok(alpha.some((s) => s.id === "own-alpha"));
  assert.ok(!alpha.some((s) => s.id === "own-beta"));
  assert.ok(beta.some((s) => s.id === "own-beta"));
  assert.ok(!beta.some((s) => s.id === "own-alpha"));
  // Anonymous visitors see samples only — never another account's history.
  assert.ok(anon.every((s) => isSample(s)));
});

test("getSession enforces visibility", async () => {
  assert.ok(await getSession("own-alpha", "u_alpha"));
  assert.equal(await getSession("own-alpha", "u_beta"), null);
  assert.equal(await getSession("own-alpha", null), null);
  assert.equal(await getSession("does-not-exist", "u_alpha"), null);
  // Samples are public.
  assert.ok(await getSession("demo", null));
});

test("deleteSession refuses another account's record", async () => {
  assert.equal(await deleteSession("own-alpha", "u_beta"), false);
  assert.ok(await getSession("own-alpha", "u_alpha"), "record must survive a foreign delete");
  assert.equal(await deleteSession("own-alpha", "u_alpha"), true);
  assert.equal(await getSession("own-alpha", "u_alpha"), null);
  assert.equal(await deleteSession("own-alpha", "u_alpha"), false);
});

test("updateSession only patches the owner's record", async () => {
  await saveSession(makeRecord("own-gamma", "u_gamma"));
  assert.equal(await updateSession("own-gamma", "u_beta", { title: "hijack" }), null);
  const patched = await updateSession("own-gamma", "u_gamma", { title: "Renamed" });
  assert.equal(patched?.title, "Renamed");
});

test("visibility helpers cover the legacy (no owner) case", () => {
  const legacy = makeRecord("legacy") as Parameters<typeof visibleTo>[0];
  // Records written before accounts existed have no ownerId.
  assert.equal(visibleTo(legacy, "u_alpha"), false);
  assert.equal(visibleTo(legacy, null), false);
  assert.equal(writableBy(legacy, "u_alpha"), false);
});

test("saving the same id twice replaces instead of duplicating", async () => {
  await saveSession(makeRecord("dup-1", "u_delta"));
  const updated = makeRecord("dup-1", "u_delta");
  updated.title = "Second write";
  await saveSession(updated);

  const mine = (await listSessions("u_delta")).filter((s) => s.id === "dup-1");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].title, "Second write");
});
