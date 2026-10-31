import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/api-guard";
import { createRateLimiter } from "@/lib/auth-core";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * 30 reports per minute per address: enough headroom for a crash loop, far too
 * little to use the log stream as free storage for an attacker's payloads.
 */
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

/**
 * Client-side error sink.
 *
 * The global-error boundary posts here so a crash in the UI is recorded in the
 * same log stream as server events. It accepts a small envelope — no stack
 * frames beyond what the boundary already has, no PII — and writes one
 * structured log line. No auth required: a broken page cannot always fetch the
 * current user. It is rate-limited per address because the input is
 * attacker-controlled text and the sink is shared with the ops log.
 */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();

  const gate = limiter.check(clientIp(request));
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "Too many error reports.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }

  let body: {
    message?: unknown;
    stack?: unknown;
    componentStack?: unknown;
    path?: unknown;
    userAgent?: unknown;
    fingerprint?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.slice(0, 500) : "";
  if (!message) {
    return NextResponse.json({ error: "A message is required." }, { status: 422 });
  }

  const entry = {
    requestId,
    message,
    stack: typeof body.stack === "string" ? body.stack.slice(0, 4000) : undefined,
    componentStack: typeof body.componentStack === "string"
      ? body.componentStack.slice(0, 2000)
      : undefined,
    path: typeof body.path === "string" ? body.path.slice(0, 200) : undefined,
    userAgent: typeof body.userAgent === "string"
      ? body.userAgent.slice(0, 300)
      : undefined,
    fingerprint: typeof body.fingerprint === "string" ? body.fingerprint.slice(0, 100) : undefined,
    receivedAt: new Date().toISOString(),
  };

  logEvent("error", "client.error_reported", entry);

  return NextResponse.json({ ok: true });
}