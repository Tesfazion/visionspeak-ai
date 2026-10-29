import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteAccount } from "@/lib/auth-core";
import { clearSessionCookie } from "@/lib/auth";
import { listSessions, deleteSession } from "@/lib/store";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  const requestId = newRequestId();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const confirm = typeof body.confirm === "string" ? body.confirm.trim().toLowerCase() : "";

  if (confirm !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "Type your email address to confirm deletion." },
      { status: 422 },
    );
  }

  try {
    // Delete all of the account's sessions first, then the user row.
    const sessions = await listSessions(user.id, { includeSamples: false });
    for (const session of sessions) {
      await deleteSession(session.id, user.id);
    }
    const deleted = await deleteAccount(user.id);
    if (!deleted) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    await clearSessionCookie();
    logEvent("info", "auth.account_deleted", { requestId, userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logEvent("error", "auth.delete_failed", { requestId, error: String(err) });
    return NextResponse.json({ error: "Could not delete the account." }, { status: 500 });
  }
}