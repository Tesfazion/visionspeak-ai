import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionToken,
  findUserById,
  isSecureRequest,
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
};

export function cookieOptionsFor(request: Request) {
  const options: Record<string, unknown> = { ...baseCookieOptions };
  if (isSecureRequest(request)) {
    options.secure = true;
  }
  return options;
}

/**
 * Set the session cookie on a NextResponse so the browser actually receives it.
 *
 * Route handlers (login, signup) build their own NextResponse, so the cookie
 * must be attached to *that* response — calling `cookies().set()` from a route
 * handler silently writes to a store that is never sent, and the next request
 * has no session, which reads to the user as "the dashboard never opens".
 */
export async function setSessionCookieOn(
  response: NextResponse,
  userId: string,
  request: Request,
) {
  response.cookies.set(
    SESSION_COOKIE,
    await createSessionToken(userId),
    cookieOptionsFor(request) as Parameters<typeof response.cookies.set>[2],
  );
  return response;
}

export function clearSessionCookieOn(response: NextResponse, request: Request) {
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptionsFor(request), maxAge: 0 });
  return response;
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
      }
    : null;
}

/** Where to send someone who followed a protected link while signed out. */
export function loginHref(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/login";
  return `/login?next=${encodeURIComponent(next)}`;
}
