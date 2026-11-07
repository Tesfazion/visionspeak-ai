import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Creates a user-bound Lemon Squeezy subscription checkout.
 */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (user.plan === "pro") {
    return NextResponse.json({ error: "Your Pro subscription is already active." }, { status: 409 });
  }

  let body: { plan?: unknown; interval?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const plan = typeof body.plan === "string" ? body.plan.trim().toLowerCase() : "";
  const interval = body.interval === "yearly" ? "yearly" : body.interval === "monthly" ? "monthly" : "";
  if (plan !== "pro" || !interval) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 422 });
  }

  const apiKey = process.env.LEMON_SQUEEZY_API_KEY?.trim();
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID?.trim();
  const variantId = process.env[`LEMON_SQUEEZY_PRO_${interval.toUpperCase()}_VARIANT_ID`]?.trim();
  const webhookSecret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET?.trim();
  if (!apiKey || !storeId || !variantId || !webhookSecret) {
    logEvent("warn", "billing.checkout_requested_without_url", { requestId, userId: user.id });
    return NextResponse.json(
      { error: "Checkout is not configured for this deployment." },
      { status: 503 },
    );
  }

  if (!/^\d+$/.test(storeId) || !/^\d+$/.test(variantId)) {
    return NextResponse.json({ error: "Billing configuration is invalid." }, { status: 503 });
  }

  try {
    const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              email: user.email,
              name: user.name,
              custom: { user_id: user.id },
            },
          },
          relationships: {
            store: { data: { type: "stores", id: storeId } },
            variant: { data: { type: "variants", id: variantId } },
          },
        },
      }),
      cache: "no-store",
    });
    const data: unknown = await response.json();
    const checkout = data as { data?: { attributes?: { url?: unknown } }; errors?: unknown };
    const url = checkout.data?.attributes?.url;
    let safeUrl: string | null = null;
    if (typeof url === "string") {
      try {
        const parsed = new URL(url);
        if (
          parsed.protocol === "https:" &&
          (parsed.hostname === "lemonsqueezy.com" || parsed.hostname.endsWith(".lemonsqueezy.com"))
        ) {
          safeUrl = parsed.toString();
        }
      } catch {
        safeUrl = null;
      }
    }
    if (!response.ok || !safeUrl) {
      logEvent("error", "billing.checkout_failed", { requestId, userId: user.id, status: response.status });
      return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
    }

    logEvent("info", "billing.checkout_issued", { requestId, userId: user.id, interval });
    return NextResponse.json({ ok: true, url: safeUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logEvent("error", "billing.checkout_failed", { requestId, userId: user.id, error: String(error) });
    return NextResponse.json({ error: "Checkout service is temporarily unavailable." }, { status: 502 });
  }
}