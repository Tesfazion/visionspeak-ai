import { NextResponse } from "next/server";
import { verifyEmail } from "@/lib/auth-core";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const requestId = newRequestId();

  try {
    const result = await verifyEmail(token);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 410 });
    }
    logEvent("info", "auth.verified", { requestId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logEvent("error", "auth.verify_failed", { requestId, error: String(err) });
    return NextResponse.json({ error: "Could not verify the address." }, { status: 500 });
  }
}