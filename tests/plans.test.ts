import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PLANS,
  monthWindow,
  normalisePlan,
  planFor,
  quotaState,
  usedThisMonth,
  visibleHistory,
} from "@/lib/plans";
import type { SessionRecord } from "@/lib/types";

const now = new Date("2026-10-29T12:00:00.000Z");

const record = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: Math.random().toString(36).slice(2),
  createdAt: "2026-10-15T10:00:00.000Z",
  speaker: "Ada",
  title: "Session",
  mode: "practice",
  durationSec: 120,
  source: "live",
  notes: "",
  ownerId: "u_me",
  report: { overall: 80 } as SessionRecord["report"],
  ...over,
});

test("an unknown or missing plan is Free", () => {
  assert.equal(normalisePlan(undefined), "free");
  assert.equal(normalisePlan("enterprise"), "free");
  assert.equal(normalisePlan("pro"), "pro");
  assert.equal(planFor(null).id, "free");
  assert.equal(planFor("pro").maxSessionMinutes, PLANS.pro.maxSessionMinutes);
});

test("the quota counts only this account's live records in the current UTC month", () => {
  const records = [
    record({ id: "a" }),
    record({ id: "b" }),
    record({ id: "other", ownerId: "u_other" }),
    record({ id: "sample", source: "demo", ownerId: undefined }),
    record({ id: "last-month", createdAt: "2026-09-30T23:59:59.000Z" }),
  ];
  assert.equal(usedThisMonth(records, "u_me", now), 2);

  const quota = quotaState(records, "u_me", "free", now);
  assert.equal(quota.used, 2);
  assert.equal(quota.limit, PLANS.free.sessionsPerMonth);
  assert.equal(quota.remaining, PLANS.free.sessionsPerMonth - 2);
  assert.equal(quota.canStart, true);
  assert.equal(quota.maxSessionSec, PLANS.free.maxSessionMinutes * 60);
});

test("the quota closes exactly at the plan limit and reopens next month", () => {
  const full = Array.from({ length: PLANS.free.sessionsPerMonth }, () => record());
  const quota = quotaState(full, "u_me", "free", now);
  assert.equal(quota.remaining, 0);
  assert.equal(quota.canStart, false);
  assert.equal(quota.reason, "quota_exhausted");

  const nextMonth = new Date("2026-11-01T00:00:01.000Z");
  assert.equal(quotaState(full, "u_me", "free", nextMonth).canStart, true);
});

test("Pro raises the monthly limit and the per-session ceiling", () => {
  const records = Array.from({ length: PLANS.free.sessionsPerMonth }, () => record());
  const pro = quotaState(records, "u_me", "pro", now);
  assert.equal(pro.canStart, true);
  assert.equal(pro.limit, PLANS.pro.sessionsPerMonth);
  assert.ok(pro.maxSessionSec > quotaState(records, "u_me", "free", now).maxSessionSec);
});

test("the month window starts on the 1st (UTC) and points at the next reset", () => {
  const window = monthWindow(new Date("2026-02-14T23:30:00.000Z"));
  assert.equal(window.startIso, "2026-02-01T00:00:00.000Z");
  assert.equal(window.resetsAt, "2026-03-01T00:00:00.000Z");
});

test("Free history is 30 days; Pro history is unlimited; samples never appear", () => {
  const old = record({ id: "old", createdAt: "2026-08-01T10:00:00.000Z" });
  const recent = record({ id: "recent" });
  const sample = record({ id: "sample", source: "demo", ownerId: undefined });
  const foreign = record({ id: "foreign", ownerId: "u_other" });
  const records = [old, recent, sample, foreign];

  const freeIds = visibleHistory(records, "u_me", "free", now).map((r) => r.id);
  assert.deepEqual(freeIds, ["recent"]);

  const proIds = visibleHistory(records, "u_me", "pro", now).map((r) => r.id);
  assert.deepEqual(proIds, ["recent", "old"]);
});
