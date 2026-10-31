import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { SESSION_COOKIE, revokeSessionToken } from "@/lib/auth-core";

export const dynamic = "force-dynamic";

export async function POST() {
  // Clearing the cookie only removes it from this browser: the token itself is
  // stateless and would keep working for anyone who copied it. Revoke it first.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await revokeSessionToken(token).catch(() => false);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
