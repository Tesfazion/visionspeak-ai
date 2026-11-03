import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionToken,
  findUserById,
  verifySessionToken,
  type PublicUser,
} from "./auth-core";
import { normalisePlan } from "./plans";

/**
 * Server-side glue between the signed cookie and the current user.
 * Only importable from Server Components and Route Handlers.
 */

const baseCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
} as const;

/**
 * Explicitly control the cookie Secure flag via AUTH_COOKIE_SECURE env var.
 * - "true"  → always set Secure (for HTTPS-only deployments)
 * - "false" → never set Secure (for HTTP deployments, local dev, or behind TLS-terminating proxy)
 * - unset   → auto-detect from request (x-forwarded-proto / request URL protocol / public site URL)
 *
 * This solves the common issue where a TLS-terminating proxy sets
 * x-forwarded-proto: https but the browser connection is actually HTTP,
 * causing the Secure cookie to be discarded by the browser.
 * Also handles mobile networks where carrier proxies may strip headers.
 */
function getCookieSecureFlag(request: Request): boolean {
  const env = process.env.AUTH_COOKIE_SECURE?.toLowerCase();
  if (env === "true") return true;
  if (env === "false") return false;

  // 1. Check x-forwarded-proto header (set by most TLS-terminating proxies)
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded) return forwarded === "https";

  // 2. Check public site URL (NEXT_PUBLIC_SITE_URL) — this is the URL users actually visit.
  // If the public URL is HTTPS, we should set Secure even if the internal request is HTTP.
  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (publicUrl) {
    try {
      return new URL(publicUrl).protocol === "https:";
    } catch {
      // fall through
    }
  }

  // 3. Fall back to request URL protocol (works for direct connections without proxy)
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function cookieOptionsFor(request: Request) {
  return { ...baseCookieOptions, secure: getCookieSecureFlag(request) };
}

export async function setSessionCookie(userId: string, request: Request) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(userId), cookieOptionsFor(request));
}

export async function clearSessionCookie(request: Request) {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...cookieOptionsFor(request), maxAge: 0 });
}

/** The signed-in user, or null. Safe to call from any server component. */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const store = await cookies();
  const userId = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const user = await findUserById(userId);
  return user
    ? {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        plan: normalisePlan(user.plan),
        emailVerifiedAt: user.emailVerifiedAt,
      }
    : null;
}

/** Where to send someone who followed a protected link while signed out. */
export function loginHref(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/login";
  return `/login?next=${encodeURIComponent(next)}`;
}
