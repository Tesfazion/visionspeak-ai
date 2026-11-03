import { NextResponse } from "next/server";
import { clearSessionCookieOn, getCurrentUser, setSessionCookieOn } from "@/lib/auth";
import { revokeOtherSessions } from "@/lib/auth-core";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Sign out everywhere.
 *
 * Sets a cut-off on the account, so every token issued before it is refused by
 * `verifySessionToken` on its next request — including a duplicate of the cookie
 * this browser holds. A fresh cookie is then issued for this device, which is what
 * keeps the person who pressed the button signed in.
 */
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
      clearSessionCookieOn(response, request);
      return response;
    }
    const response = NextResponse.json({ ok: true });
    await setSessionCookieOn(response, user.id, request);
    logEvent("info", "auth.sessions_revoked", { requestId, userId: user.id });
    return response;
  } catch (err) {
    logEvent("error", "auth.revoke_failed", { requestId, error: String(err) });
    return NextResponse.json({ error: "Could not revoke sessions." }, { status: 500 });
  }
}
