import type { SessionRecord } from "./types";

/**
 * Plans, quotas and entitlements.
 *
 * Deliberately pure — no `node:` imports and no framework code — so the same
 * rules drive the API gate (server), the dashboard usage meter and the pricing
 * page. A quota that the pricing page advertises and the API does not enforce
 * is worse than no quota at all, so both read from this file.
 *
 * Billing itself is intentionally not wired to a provider here: the platform
 * ships with `NEXT_PUBLIC_PRO_CHECKOUT_URL` as the seam (see `.env.example`).
 * Without it the upgrade CTA falls back to a sales contact, never a fake
 * checkout that silently charges nobody.
 */

export type PlanId = "free" | "pro";

export interface Plan {
  id: PlanId;
  label: string;
  tagline: string;
  priceMonthlyUsd: number;
  priceYearlyUsd: number;
  /** Analyses a single account may save per calendar month (UTC). */
  sessionsPerMonth: number;
  /** Hard ceiling on one analysed session, enforced by the API. */
  maxSessionMinutes: number;
  /** Monthly ceiling on total analysed minutes (across all sessions). */
  maxMinutesPerMonth: number;
  /** How far back the dashboard reads. `null` = the whole history. */
  historyDays: number | null;
  /** Lifetime of a report share link. 0 disables sharing. */
  shareLinkDays: number;
  /** CSV history export. */
  csvExport: boolean;
  /** PDF report export. */
  pdfExport: boolean;
  seats: number;
  support: string;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    label: "Free",
    tagline: "Prove it to yourself in one session.",
    priceMonthlyUsd: 0,
    priceYearlyUsd: 0,
    sessionsPerMonth: 5,
    maxSessionMinutes: 10,
    maxMinutesPerMonth: 60,
    historyDays: 30,
    shareLinkDays: 7,
    csvExport: false,
    pdfExport: false,
    seats: 1,
    support: "Community",
    features: [
      "5 analysed sessions per month",
      "Sessions up to 10 minutes",
      "All nine live scores and the coach feed",
      "Full report with drills after every session",
      "30 days of history",
      "7-day share links",
    ],
  },
  pro: {
    id: "pro",
    label: "Pro",
    tagline: "For speakers, coaches and interview candidates who train weekly.",
    priceMonthlyUsd: 12,
    priceYearlyUsd: 108,
    sessionsPerMonth: 200,
    maxSessionMinutes: 60,
    maxMinutesPerMonth: 2000,
    historyDays: null,
    shareLinkDays: 30,
    csvExport: true,
    pdfExport: true,
    seats: 1,
    support: "Email, 1 business day",
    features: [
      "200 analysed sessions per month",
      "Sessions up to 60 minutes",
      "Unlimited history and pillar trends",
      "30-day share links with revoke",
      "CSV export for coaches and spreadsheets",
      "Server-rendered PDF report download",
      "Custom session titles and notes",
    ],
  },
};

export const PLAN_IDS: PlanId[] = ["free", "pro"];

/** Anything unrecognised (legacy accounts, a tampered cookie) is Free. */
export function normalisePlan(value: unknown): PlanId {
  return value === "pro" ? "pro" : "free";
}

export function planFor(value: unknown): Plan {
  return PLANS[normalisePlan(value)];
}

/** First instant of the current UTC month — one predictable reset boundary. */
export function monthWindow(now: Date = new Date()) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
    resetsAt: new Date(end).toISOString(),
  };
}

/** Live records this account owns — the only thing quota may ever count. */
export const isMetered = (record: SessionRecord, userId: string) =>
  record.source !== "demo" && record.ownerId === userId;

export function usedThisMonth(records: SessionRecord[], userId: string, now: Date = new Date()) {
  const { startIso, endIso } = monthWindow(now);
  return records.filter((r) => isMetered(r, userId) && r.createdAt >= startIso && r.createdAt < endIso).length;
}

export interface QuotaState {
  plan: PlanId;
  label: string;
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
  maxSessionSec: number;
  durationSec: number;
  durationLimitSec: number;
  minutesRemaining: number;
  canStart: boolean;
  reason: "ok" | "quota_exhausted";
}

export function usedDurationThisMonth(records: SessionRecord[], userId: string, now: Date = new Date()) {
  const { startIso, endIso } = monthWindow(now);
  return records
    .filter((r) => isMetered(r, userId) && r.createdAt >= startIso && r.createdAt < endIso)
    .reduce((acc, r) => acc + (r.durationSec || 0), 0);
}

export function quotaState(
  records: SessionRecord[],
  userId: string,
  planValue: unknown,
  now: Date = new Date(),
): QuotaState {
  const plan = planFor(planValue);
  const used = usedThisMonth(records, userId, now);
  const durationSec = usedDurationThisMonth(records, userId, now);
  const minutesRemaining = Math.max(0, plan.maxMinutesPerMonth - Math.floor(durationSec / 60));
  const remaining = Math.max(0, plan.sessionsPerMonth - used);
  return {
    plan: plan.id,
    label: plan.label,
    used,
    limit: plan.sessionsPerMonth,
    remaining,
    resetsAt: monthWindow(now).resetsAt,
    maxSessionSec: plan.maxSessionMinutes * 60,
    durationSec,
    durationLimitSec: plan.maxSessionMinutes * 60 * plan.sessionsPerMonth,
    minutesRemaining,
    canStart: remaining > 0 && minutesRemaining > 0,
    reason: remaining > 0 && minutesRemaining > 0 ? "ok" : "quota_exhausted",
  };
}

/** Records the dashboard may read for this plan, newest first. */
export function visibleHistory(
  records: SessionRecord[],
  userId: string,
  planValue: unknown,
  now: Date = new Date(),
): SessionRecord[] {
  const plan = planFor(planValue);
  const mine = records.filter((r) => isMetered(r, userId));
  const cutoff =
    plan.historyDays === null ? null : new Date(now.getTime() - plan.historyDays * 86_400_000).toISOString();
  return (cutoff ? mine.filter((r) => r.createdAt >= cutoff) : mine).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export const formatUsd = (value: number) => (value === 0 ? "Free" : `$${value}`);
