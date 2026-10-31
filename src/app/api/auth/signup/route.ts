import { NextResponse } from "next/server";
import { createUser, createRateLimiter, validateCredentials, createToken, VERIFY_TTL_MS } from "@/lib/auth-core";
import { clientIp } from "@/lib/api-guard";
import { setSessionCookie } from "@/lib/auth";
import { sendEmail, emailConfigured } from "@/lib/email";
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
    // Send email verification link
    const token = await createToken("verify", result.user.id, VERIFY_TTL_MS);
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const verifyLink = `${base}/verify-email/${token}`;
    if (emailConfigured()) {
      await sendEmail({
        to: result.user.email,
        subject: "VisionSpeak — Verify your email address",
        text: `Click this link to verify your email address: ${verifyLink}\n\nIf you did not sign up for VisionSpeak, you can ignore this email.`,
        html: `<p>Click <a href="${verifyLink}">this link</a> to verify your email address.</p><p>If you did not sign up for VisionSpeak, you can ignore this email.</p>`,
      });
    }
    logEvent("info", "auth.signup", { requestId, userId: result.user.id, plan: result.user.plan });
    return NextResponse.json({ user: result.user }, { status: 201 });
  } catch (err) {
    logEvent("error", "auth.signup_failed", { requestId, error: String(err) });
    return NextResponse.json({ error: "The account could not be created." }, { status: 500 });
  }
}
