import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { logEvent, newRequestId } from "@/lib/log";
import { planFor } from "@/lib/plans";
import { createShare, revokeShare } from "@/lib/store";

export const dynamic = "force-dynamic";

const siteOrigin = (request: Request) =>
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;

/** Creates (or refreshes) a time-boxed public link to one report. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to share a report." }, { status: 401 });

  const { id } = await context.params;
  const plan = planFor(user.plan);
  if (plan.shareLinkDays <= 0) {
    return NextResponse.json(
      { error: "Sharing is not available on this plan.", code: "share_unavailable" },
      { status: 403 },
    );
  }

  try {
    const share = await createShare(id, user.id, plan.shareLinkDays);
    if (!share) {
      // Same response for "missing" and "not yours" so ids cannot be probed.
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const url = `${siteOrigin(request)}/report/${id}?share=${share.token}`;
    logEvent("info", "share.created", {
      requestId: newRequestId(),
      userId: user.id,
      sessionId: id,
      expiresAt: share.expiresAt,
    });
    return NextResponse.json({ url, expiresAt: share.expiresAt, days: plan.shareLinkDays }, { status: 201 });
  } catch (err) {
    logEvent("error", "share.create_failed", { requestId: newRequestId(), userId: user.id, error: String(err) });
    return NextResponse.json({ error: "The share link could not be created." }, { status: 500 });
  }
}

/** Revokes the current link immediately. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to change sharing." }, { status: 401 });

  const { id } = await context.params;
  try {
    const revoked = await revokeShare(id, user.id);
    if (!revoked) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    logEvent("info", "share.revoked", { requestId: newRequestId(), userId: user.id, sessionId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logEvent("error", "share.revoke_failed", { requestId: newRequestId(), userId: user.id, error: String(err) });
    return NextResponse.json({ error: "Sharing could not be changed." }, { status: 500 });
  }
}
