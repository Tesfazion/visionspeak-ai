import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { setUserPlan } from "@/lib/auth-core";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

/** Constant-time compare so the shared secret cannot be guessed byte by byte. */
function sameSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Billing webhook seam.
 *
 * Set `BILLING_WEBHOOK_SECRET` to a shared secret and the provider's webhook
 * calls this route to flip a plan. The body is intentionally tiny: a plan id
 * and a user id. Anything richer (invoices, dunning, refunds) belongs to the
 * billing provider's own dashboard — this route is the *only* writer of
 * `plan` on the user row, which is what the quota API trusts.
 *
 * Without the secret set, the endpoint answers 410 so a misconfigured deploy
 * cannot be talked into upgrading anyone by accident.
 */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const secret = process.env.BILLING_WEBHOOK_SECRET?.trim() || "";

  if (!secret) {
    return NextResponse.json(
      { error: "Billing is not configured for this deployment." },
      { status: 410 },
    );
  }

  const provided = request.headers.get("x-billing-signature") ?? "";
  if (!provided || !sameSecret(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { userId?: unknown; plan?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const plan = typeof body.plan === "string" ? body.plan.trim().toLowerCase() : "";

  if (!userId || !["free", "pro"].includes(plan)) {
    return NextResponse.json(
      { error: "Provide a valid userId and plan ('free' or 'pro')."},
      { status: 422 },
    );
  }

  try {
    const updated = await setUserPlan(userId, plan as "free" | "pro");
    if (!updated) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    logEvent("info", "billing.plan_changed", { requestId, userId, plan: updated.plan });
    return NextResponse.json({ ok: true, user: updated });
  } catch (err) {
    logEvent("error", "billing.webhook_failed", { requestId, error: String(err) });
    return NextResponse.json({ error: "Could not update the plan." }, { status: 500 });
  }
}