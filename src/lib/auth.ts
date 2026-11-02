import { cookies } from "next/headers";
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
} as const;

export function cookieOptionsFor(request: Request) {
  return { ...baseCookieOptions, secure: isSecureRequest(request) };
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
