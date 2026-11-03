import { NextResponse } from "next/server";
import { authenticate, countUsers, createRateLimiter, normaliseEmail, validateCredentials } from "@/lib/auth-core";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth-core";
import { cookieOptionsFor } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * 8 attempts per 15 minutes per email+IP. In-memory: reset on restart and not
 * shared between instances, which is appropriate for a single-process deploy.
 */
const limiter = createRateLimiter({ limit: 8, windowMs: 15 * 60 * 1000 });

const clientKey = (request: Request, email: string) => {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
  return `${ip}:${email}`;
};

export async function POST(request: Request) {
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

  const email = normaliseEmail(parsed.email);
  const key = clientKey(request, email);
  const gate = limiter.check(key);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${gate.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }

  try {
    const user = await authenticate(email, parsed.password);
    if (!user) {
      if ((await countUsers()) === 0) {
        return NextResponse.json(
          { error: "No account exists on this deployment yet. Create one to get in." },
          { status: 401 },
        );
      }
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }
    limiter.reset(key);

    const response = NextResponse.json({ user });
    const token = await createSessionToken(user.id);
    response.cookies.set(SESSION_COOKIE, token, cookieOptionsFor(request));
    return response;
  } catch (err) {
    console.error("[auth] login failed", err);
    return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 500 });
  }
}
