import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDemoAggregate } from "@/lib/analysis/demo";
import { buildReport } from "@/lib/analysis/report";
import {
  MAX_TIMELINE_POINTS,
  aggregateHash,
  parseAggregate,
  readClientSessionId,
  readJsonLimited,
  reportIntegrityHash,
} from "@/lib/api-guard";

const limits = { maxDurationSec: 3600 };

test("a real aggregate passes validation untouched", () => {
  const aggregate = buildDemoAggregate();
  const result = parseAggregate(aggregate, limits);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value, aggregate);
});

test("a non-object or a too-short payload is refused", () => {
  assert.equal(parseAggregate(null, limits).ok, false);
  assert.equal(parseAggregate("session", limits).ok, false);

  const short = { ...buildDemoAggregate(), timeline: buildDemoAggregate().timeline.slice(0, 2) };
  assert.equal(parseAggregate(short, limits).ok, false);
});

test("a session longer than the plan ceiling is refused with a specific code", () => {
  const aggregate = buildDemoAggregate();
  const result = parseAggregate(aggregate, { maxDurationSec: 5 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "session_too_long");
    assert.match(result.error, /minutes/);
  }
});

test("missing statistics are refused rather than silently scored as zero", () => {
  const noVoice = { ...buildDemoAggregate(), voice: undefined };
  assert.equal(parseAggregate(noVoice, limits).ok, false);

  const noEmotion = { ...buildDemoAggregate(), emotions: { neutral: 100 } };
  assert.equal(parseAggregate(noEmotion, limits).ok, false);

  const noTranscript = { ...buildDemoAggregate(), speech: { words: 10 } };
  assert.equal(parseAggregate(noTranscript, limits).ok, false);
});

test("non-finite numbers and oversized arrays are refused", () => {
  const aggregate = buildDemoAggregate();
  const broken = {
    ...aggregate,
    timeline: aggregate.timeline.map((sample, i) => (i === 1 ? { ...sample, eyeContact: Number.NaN } : sample)),
  };
  assert.equal(parseAggregate(broken, limits).ok, false);

  const tooMany = {
    ...aggregate,
    timeline: Array.from({ length: MAX_TIMELINE_POINTS + 1 }, () => aggregate.timeline[0]),
  };
  assert.equal(parseAggregate(tooMany, limits).ok, false);
});

test("an over-long transcript is refused", () => {
  const aggregate = buildDemoAggregate();
  const verbose = {
    ...aggregate,
    speech: { ...aggregate.speech, transcript: "a".repeat(50_000) },
  };
  assert.equal(parseAggregate(verbose, limits).ok, false);
});

test("readJsonLimited parses a normal body and refuses an oversized one", async () => {
  const ok = await readJsonLimited(
    new Request("http://local/api", { method: "POST", body: JSON.stringify({ hello: "world" }) }),
  );
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.value, { hello: "world" });

  const huge = await readJsonLimited(
    new Request("http://local/api", { method: "POST", body: "x".repeat(4096) }),
    1024,
  );
  assert.equal(huge.ok, false);
  if (!huge.ok) {
    assert.equal(huge.status, 413);
    assert.equal(huge.code, "body_too_large");
  }
});

test("readJsonLimited rejects malformed JSON instead of throwing", async () => {
  const bad = await readJsonLimited(new Request("http://local/api", { method: "POST", body: "{nope" }));
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.status, 400);
});

test("the idempotency key is validated, not trusted", () => {
  assert.equal(readClientSessionId("0f8fad5b-d9cb-469f-a165-70867728950e"), "0f8fad5b-d9cb-469f-a165-70867728950e");
  assert.equal(readClientSessionId("short"), null);
  assert.equal(readClientSessionId("has spaces in it"), null);
  assert.equal(readClientSessionId(undefined), null);
  assert.equal(readClientSessionId(42), null);
});

// Regression: the save path used to hash the raw aggregate while the verifier
// re-hashed {durationSec, mode, timeline}, so every report rendered "Unverified".
// Both sides must hash the subset that is actually persisted.
test("a saved report verifies against the record it produced", () => {
  const aggregate = buildDemoAggregate();
  const report = buildReport(aggregate, "practice");
  const record = {
    durationSec: Math.round(aggregate.durationSec),
    mode: "practice",
    timeline: report.timeline,
  };

  const stored = reportIntegrityHash(record);
  assert.equal(reportIntegrityHash({ ...record }), stored);

  // Hashing the raw aggregate — the old bug — can never match the stored record.
  assert.notEqual(aggregateHash(aggregate), stored);

  // One edited sample is enough to fail the check.
  const tampered = report.timeline.map((sample, i) =>
    i === 0 ? { ...sample, eyeContact: sample.eyeContact + 5 } : sample,
  );
  assert.notEqual(reportIntegrityHash({ ...record, timeline: tampered }), stored);

  // Key order and JSON round-tripping must not change the digest.
  const roundTripped = JSON.parse(JSON.stringify(record)) as typeof record;
  assert.equal(reportIntegrityHash(roundTripped), stored);
});
