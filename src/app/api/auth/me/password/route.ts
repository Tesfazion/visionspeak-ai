import { NextResponse } from "next/server";
import { getCurrentUser, clearSessionCookie, setSessionCookie } from "@/lib/auth";
import { changePassword } from "@/lib/auth-core";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

const messageFor = (error: string) => {
  switch (error) {
    case "wrong_current":
      return "Your current password is incorrect.";
    case "too_short":
      return "Password must be at least 8 characters.";
    case "too_long":
      return "Password is too long.";
    case "account_missing":
      return "Account not found.";
    default:
      return "Could not update the password.";
  }
};

/**
 * Change the password while signed in. Requires the current password, so a
 * stolen session cookie alone cannot take over the account. Like the reset
 * flow, a successful change cuts off every earlier session token; this device
 * is re-issued a fresh cookie so the person typing stays signed in.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword) {
    return NextResponse.json({ error: "Enter your current password." }, { status: 422 });
  }

  try {
    const result = await changePassword(user.id, currentPassword, newPassword);
    if ("error" in result) {
      return NextResponse.json({ error: messageFor(result.error) }, { status: 422 });
    }
    await clearSessionCookie(request);
    await setSessionCookie(user.id, request);
    logEvent("info", "auth.password_changed", { requestId, userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logEvent("error", "auth.password_change_failed", { requestId, userId: user.id, error: String(err) });
    return NextResponse.json({ error: "Could not update the password." }, { status: 500 });
  }
}
