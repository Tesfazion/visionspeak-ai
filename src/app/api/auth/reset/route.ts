import { NextResponse } from "next/server";
import { requestPasswordReset, createRateLimiter } from "@/lib/auth-core";
import { clientIp } from "@/lib/api-guard";
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

  const emailValue = body && typeof body === "object" && "email" in body
    ? body.email
    : undefined;
  const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";

  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 422 });
  }

  const gate = limiter.check(clientIp(request));
  if (!gate.allowed) {
    return NextResponse.json(
      { error: `Too many reset requests. Try again in ${gate.retryAfterSec}s.`, code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }

  if (!emailConfigured()) {
    logEvent("error", "auth.reset_unavailable", { requestId, reason: "email_not_configured" });
    return NextResponse.json(
      { error: "Password reset email is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }

  let siteOrigin: string;
  try {
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (!configuredSiteUrl && process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_SITE_URL is required in production");
    }
    const siteUrl = new URL(configuredSiteUrl || request.url);
    if (
      (siteUrl.protocol !== "https:" && process.env.NODE_ENV === "production") ||
      (siteUrl.protocol !== "https:" && siteUrl.protocol !== "http:")
    ) {
      throw new Error("NEXT_PUBLIC_SITE_URL must use HTTP or HTTPS");
    }
    siteOrigin = siteUrl.origin;
  } catch (err) {
    logEvent("error", "auth.reset_unavailable", {
      requestId,
      reason: err instanceof Error ? err.message : "invalid_site_url",
    });
    return NextResponse.json(
      { error: "Password reset email is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }

  try {
    const token = await requestPasswordReset(email);
    if (token) {
      const resetLink = new URL(`/reset-password/${token}`, siteOrigin).toString();
      const result = await sendEmail({
        to: email,
        subject: "VisionSpeak — Reset your password",
        text: `Click this link to reset your password: ${resetLink}\n\nIf you did not request this, you can ignore this email.`,
        html: `<p>Click <a href="${resetLink}">this link</a> to reset your password.</p><p>If you did not request this, you can ignore this email.</p>`,
      });
      if (!result.ok) {
        logEvent("error", "auth.reset_email_failed", { requestId, reason: result.reason });
        return NextResponse.json(
          { error: "We couldn't send a reset email right now. Please try again later." },
          { status: 503 },
        );
      }
    }
    // Unknown addresses receive the same generic response as successful requests.
    logEvent("info", "auth.reset_requested", { requestId });
    return NextResponse.json({
      ok: true,
      message: "If that account exists, a reset link is on its way.",
    });
  } catch (err) {
    logEvent("error", "auth.reset_failed", { requestId, error: String(err) });
    return NextResponse.json({ error: "Could not process the request." }, { status: 500 });
  }
}