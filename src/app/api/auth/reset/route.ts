import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/auth-core";
import { clientIp } from "@/lib/api-guard";
import { createRateLimiter } from "@/lib/auth-core";
import { sendEmail, emailConfigured } from "@/lib/email";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

/** 3 requests per hour per IP — generous, and stops address-harvesting. */
const limiter = createRateLimiter({ limit: 3, windowMs: 60 * 60 * 1000 });

export async function POST(request: Request) {
  const requestId = newRequestId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof (body as { email?: unknown }).email === "string"
    ? (body as { email: string }).email.trim().toLowerCase()
    : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 422 });
  }

  const gate = limiter.check(clientIp(request));
  if (!gate.allowed) {
    return NextResponse.json(
      { error: `Too many reset requests. Try again in ${gate.retryAfterSec}s.`, code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }

  try {
    const token = await requestPasswordReset(email);
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const resetLink = token ? `${base}/reset-password/${token}` : null;
    if (emailConfigured() && resetLink) {
      await sendEmail({
        to: email,
        subject: "VisionSpeak — Reset your password",
        text: `Click this link to reset your password: ${resetLink}\n\nIf you did not request this, you can ignore this email.`,
        html: `<p>Click <a href="${resetLink}">this link</a> to reset your password.</p><p>If you did not request this, you can ignore this email.</p>`,
      });
    }
    // Always answer "we sent it" so the endpoint cannot be used to enumerate accounts.
    logEvent("info", "auth.reset_requested", { requestId, email, exists: !!token, emailConfigured: emailConfigured() });
    return NextResponse.json({
      ok: true,
      message: "If that account exists, a reset link is on its way.",
    });
  } catch (err) {
    logEvent("error", "auth.reset_failed", { requestId, error: String(err) });
    return NextResponse.json({ error: "Could not process the request." }, { status: 500 });
  }
}