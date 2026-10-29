import { NextResponse } from "next/server";
import { buildReport } from "@/lib/analysis/report";
import { getCurrentUser } from "@/lib/auth";
import { createRateLimiter } from "@/lib/auth-core";
import { readClientSessionId, parseAggregate, readJsonLimited } from "@/lib/api-guard";
import { logEvent, newRequestId } from "@/lib/log";
import { uid } from "@/lib/math";
import { planFor, quotaState } from "@/lib/plans";
import { findByClientSessionId, listSessions, saveSession } from "@/lib/store";
import type { SessionMode, SessionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

const MODES: SessionMode[] = ["practice", "presentation", "interview"];
const PAGE_LIMIT_DEFAULT = 50;
const PAGE_LIMIT_MAX = 200;

/**
 * Saves are cheap for one speaker and expensive in bulk. 30/hour is far above
 * any real practice cadence and stops a script from filling the store.
 */
const saveLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 });

const clampInt = (raw: string | null, min: number, max: number, fallback: number) => {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to list sessions." }, { status: 401 });

  const url = new URL(request.url);
  const limit = clampInt(url.searchParams.get("limit"), 1, PAGE_LIMIT_MAX, PAGE_LIMIT_DEFAULT);
  const offset = clampInt(url.searchParams.get("offset"), 0, 1_000_000, 0);
  const includeSamples = url.searchParams.get("samples") === "1";

  try {
    const sessions = await listSessions(user.id, { includeSamples });
    const page = sessions.slice(offset, offset + limit);
    return NextResponse.json(page, {
      headers: {
        "Cache-Control": "no-store",
        // Total lets a client page without fetching everything first.
        "X-Total-Count": String(sessions.length),
        "X-Page-Limit": String(limit),
        "X-Page-Offset": String(offset),
      },
    });
  } catch (err) {
    logEvent("error", "sessions.list_failed", { requestId: newRequestId(), userId: user.id, error: String(err) });
    return NextResponse.json({ error: "Could not read sessions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to save a session." }, { status: 401 });

  const gate = saveLimiter.check(user.id);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: `Too many saved sessions. Try again in ${gate.retryAfterSec}s.`, code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }

  const body = await readJsonLimited(request);
  if (!body.ok) {
    logEvent("warn", "sessions.rejected", { requestId, userId: user.id, code: body.code, status: body.status });
    return NextResponse.json({ error: body.error, code: body.code }, { status: body.status });
  }

  const payload = body.value as { aggregate?: unknown; meta?: Record<string, unknown> };
  const plan = planFor(user.plan);
  const parsed = parseAggregate(payload?.aggregate, { maxDurationSec: plan.maxSessionMinutes * 60 });
  if (!parsed.ok) {
    logEvent("warn", "sessions.rejected", { requestId, userId: user.id, code: parsed.code, status: parsed.status });
    return NextResponse.json({ error: parsed.error, code: parsed.code }, { status: parsed.status });
  }
  const aggregate = parsed.value;

  const meta = payload.meta ?? {};
  const mode = MODES.includes(meta.mode as SessionMode) ? (meta.mode as SessionMode) : "practice";
  const speaker = String(meta.speaker ?? "Speaker").slice(0, 60).trim() || "Speaker";
  const title = String(meta.title ?? "Untitled session").slice(0, 120).trim() || "Untitled session";
  const notes = String(meta.notes ?? "").slice(0, 1000);
  const clientSessionId = readClientSessionId(meta.clientSessionId);

  try {
    // A retried save (network blip, double click, "Retry save") must return the
    // original report instead of spending another unit of the monthly quota.
    if (clientSessionId) {
      const existing = await findByClientSessionId(user.id, clientSessionId);
      if (existing) {
        logEvent("info", "sessions.idempotent_hit", { requestId, userId: user.id, sessionId: existing.id });
        return NextResponse.json(
          { id: existing.id, overall: existing.report.overall, duplicate: true },
          { status: 200 },
        );
      }
    }

    const own = await listSessions(user.id, { includeSamples: false });
    const quota = quotaState(own, user.id, user.plan);
    if (!quota.canStart) {
      logEvent("warn", "sessions.quota_exceeded", {
        requestId,
        userId: user.id,
        plan: quota.plan,
        used: quota.used,
        limit: quota.limit,
      });
      return NextResponse.json(
        {
          error: `You have used all ${quota.limit} analyses on the ${quota.label} plan this month. It resets on ${quota.resetsAt.slice(0, 10)}.`,
          code: "quota_exceeded",
          quota,
        },
        { status: 402 },
      );
    }

    const report = buildReport(aggregate, mode);
    const record: SessionRecord = {
      id: uid(),
      createdAt: new Date().toISOString(),
      speaker,
      title,
      mode,
      durationSec: Math.round(aggregate.durationSec),
      source: "live",
      notes,
      report,
      ownerId: user.id,
      ...(clientSessionId ? { clientSessionId } : {}),
    };
    await saveSession(record);

    logEvent("info", "sessions.saved", {
      requestId,
      userId: user.id,
      sessionId: record.id,
      durationSec: record.durationSec,
      mode,
      overall: report.overall,
      plan: quota.plan,
    });

    return NextResponse.json(
      { id: record.id, overall: report.overall, quota: { ...quota, used: quota.used + 1, remaining: quota.remaining - 1 } },
      { status: 201 },
    );
  } catch (err) {
    logEvent("error", "sessions.save_failed", { requestId, userId: user.id, error: String(err) });
    return NextResponse.json({ error: "The report could not be generated." }, { status: 500 });
  }
}
