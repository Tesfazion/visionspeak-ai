import { NextResponse } from "next/server";
import { createUser, createRateLimiter, validateCredentials } from "@/lib/auth-core";
import { clientIp } from "@/lib/api-guard";
import { setSessionCookie } from "@/lib/auth";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * 20 accounts per hour per address. Generous enough for a shared office NAT or a
 * CI runner, low enough that a script cannot farm accounts. Only valid-looking
 * submissions consume the budget — malformed requests are rejected anyway.
 */
const limiter = createRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });

export async function POST(request: Request) {
  const requestId = newRequestId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = validateCredentials(body as Record<string, unknown>);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const gate = limiter.check(clientIp(request));
  if (!gate.allowed) {
    return NextResponse.json(
      { error: `Too many sign-up attempts. Try again in ${gate.retryAfterSec}s.`, code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }

  try {
    const result = await createUser(parsed);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    await setSessionCookie(result.user.id);
    logEvent("info", "auth.signup", { requestId, userId: result.user.id, plan: result.user.plan });
    return NextResponse.json({ user: result.user }, { status: 201 });
  } catch (err) {
    logEvent("error", "auth.signup_failed", { requestId, error: String(err) });
    return NextResponse.json({ error: "The account could not be created." }, { status: 500 });
  }
}
