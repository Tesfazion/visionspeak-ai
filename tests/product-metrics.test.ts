import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateProductMetrics, type MetricSession } from "@/lib/product-metrics";

test("product metrics count activation and return without exposing account identities", () => {
  const now = Date.parse("2026-11-07T12:00:00.000Z");
  const accounts = [
    { id: "activated", createdAt: "2026-10-25T10:00:00.000Z" },
    { id: "not-activated", createdAt: "2026-10-26T10:00:00.000Z" },
    { id: "too-recent", createdAt: "2026-11-02T10:00:00.000Z" },
    { id: "old", createdAt: "2026-01-01T10:00:00.000Z" },
  ];
  const sessions: MetricSession[] = [
    { ownerId: "activated", createdAt: "2026-10-26T10:00:00.000Z", mode: "practice", overall: 60 },
    { ownerId: "activated", createdAt: "2026-10-30T10:00:00.000Z", mode: "practice", overall: 70 },
    { ownerId: "too-recent", createdAt: "2026-11-03T10:00:00.000Z", mode: "practice", overall: 60 },
  ];
  const result = calculateProductMetrics(accounts, sessions, now);
  assert.equal(result.accounts, 2);
  assert.equal(result.activatedWithinSevenDays, 1);
  assert.equal(result.activationRate, 50);
  assert.equal(result.returnedWithinSevenDays, 1);
  assert.equal(result.returnRate, 100);
  assert.equal(result.returnEligible, 1);
});

test("return rate excludes accounts without a full seven-day return window", () => {
  const now = Date.parse("2026-11-07T12:00:00.000Z");
  const result = calculateProductMetrics(
    [{ id: "recent-session", createdAt: "2026-10-30T10:00:00.000Z" }],
    [{ ownerId: "recent-session", createdAt: "2026-11-05T10:00:00.000Z", mode: "practice", overall: 60 }],
    now,
  );
  assert.equal(result.activatedWithinSevenDays, 1);
  assert.equal(result.returnEligible, 0);
  assert.equal(result.returnRate, null);
});

test("score changes compare only same practice and capture mode with enough sessions", () => {
  const now = Date.parse("2026-11-07T12:00:00.000Z");
  const account = [{ id: "coach-client", createdAt: "2026-09-01T10:00:00.000Z" }];
  const sessions: MetricSession[] = [
    ...[40, 45, 50].map((overall, i) => ({
      ownerId: "coach-client",
      createdAt: new Date(now - (10 - i) * 86_400_000).toISOString(),
      mode: "practice",
      overall,
    })),
    ...[60, 65, 70].map((overall, i) => ({
      ownerId: "coach-client",
      createdAt: new Date(now - (3 - i) * 86_400_000).toISOString(),
      mode: "practice",
      analysisMode: "video",
      overall,
    })),
    ...[99, 99, 99].map((overall, i) => ({
      ownerId: "coach-client",
      createdAt: new Date(now - (20 - i) * 86_400_000).toISOString(),
      mode: "practice",
      analysisMode: "audio-only",
      overall,
    })),
  ];
  const result = calculateProductMetrics(account, sessions, now);
  assert.equal(result.comparableScoreUsers, 1);
  assert.equal(result.meanScoreDelta, 20);
});
