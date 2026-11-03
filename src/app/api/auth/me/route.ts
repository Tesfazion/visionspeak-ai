import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateProfile } from "@/lib/auth-core";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

/** Used by the nav to render the account area without making every page dynamic. */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(
    { user },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Edit the signed-in profile. Only the display name is editable here — the
 * email address is the identity of the account and every other table links to
 * it indirectly, so changing it is a support-level action, not a form field.
 */
export async function PATCH(request: Request) {
  const requestId = newRequestId();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return NextResponse.json({ error: "Name must be a string." }, { status: 422 });
    }
    const name = body.name.trim().slice(0, 60);
    if (!name) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 422 });
    }
  }

  try {
    const updated = await updateProfile(user.id, { name: body.name as string | undefined });
    if (!updated) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    logEvent("info", "auth.profile_updated", { requestId, userId: user.id });
    return NextResponse.json({ user: updated });
  } catch (err) {
    logEvent("error", "auth.profile_update_failed", { requestId, userId: user.id, error: String(err) });
    return NextResponse.json({ error: "Could not update the profile." }, { status: 500 });
  }
}
