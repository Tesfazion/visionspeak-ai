import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS, revokeSessionToken } from "@/lib/auth-core";
import { cookieOptionsFor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Get the current token to revoke it before clearing
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await revokeSessionToken(token).catch(() => false);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptionsFor(request), maxAge: 0 });
  return response;
}
