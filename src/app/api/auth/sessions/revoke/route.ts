import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { revokeOtherSessions, SESSION_COOKIE } from "@/lib/auth-core";
import { logEvent, newRequestId } from "@/lib/log";
import { cookieOptionsFor } from "@/lib/auth";
import { createSessionToken } from "@/lib/auth-core";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = newRequestId();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const revoked = await revokeOtherSessions(user.id);
    if (!revoked) {
      const response = NextResponse.json({ error: "Account not found." }, { status: 404 });
      response.cookies.set(SESSION_COOKIE, "", { ...cookieOptionsFor(request), maxAge: 0 });
      return response;
    }

    const response = NextResponse.json({ ok: true });
    const token = await createSessionToken(user.id);
    response.cookies.set(SESSION_COOKIE, token, cookieOptionsFor(request));
    logEvent("info", "auth.sessions_revoked", { requestId, userId: user.id });
    return response;
  } catch (err) {
    logEvent("error", "auth.revoke_failed", { requestId, error: String(err) });
    return NextResponse.json({ error: "Could not revoke sessions." }, { status: 500 });
  }
}
