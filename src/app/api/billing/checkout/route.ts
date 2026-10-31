import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Checkout seam.
 *
 * Set `NEXT_PUBLIC_PRO_CHECKOUT_URL` to a Stripe Payment Link / Lemon Squeezy
 * checkout and this route returns it. The client can also call this so a
 * signed-in user gets the link from a server endpoint instead of exposing the
 * public URL in the pricing page markup. Without the URL set, the route
 * answers 410 — honest, not a fake button.
 */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { plan?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const plan = typeof body.plan === "string" ? body.plan.trim().toLowerCase() : "";
  if (plan !== "pro") {
    return NextResponse.json({ error: "Unknown plan." }, { status: 422 });
  }

  const url = process.env.NEXT_PUBLIC_PRO_CHECKOUT_URL?.trim() || "";
  if (!url) {
    logEvent("warn", "billing.checkout_requested_without_url", { requestId, userId: user.id });
    return NextResponse.json(
      { error: "Checkout is not configured for this deployment." },
      { status: 410 },
    );
  }

  logEvent("info", "billing.checkout_issued", { requestId, userId: user.id });
  return NextResponse.json({ ok: true, url });
}