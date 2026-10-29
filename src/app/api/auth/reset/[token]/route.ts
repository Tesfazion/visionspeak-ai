import { NextResponse } from "next/server";
import { resetPassword } from "@/lib/auth-core";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const requestId = newRequestId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const password = typeof (body as { password?: unknown }).password === "string"
    ? (body as { password: string }).password
    : "";

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 422 });
  }
  if (password.length > 200) {
    return NextResponse.json({ error: "Password is too long." }, { status: 422 });
  }

  try {
    const result = await resetPassword(token, password);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 410 });
    }
    logEvent("info", "auth.reset_completed", { requestId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logEvent("error", "auth.reset_apply_failed", { requestId, error: String(err) });
    return NextResponse.json({ error: "Could not update the password." }, { status: 500 });
  }
}