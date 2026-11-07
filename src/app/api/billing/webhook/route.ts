import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { applyLemonSubscriptionEvent } from "@/lib/auth-core";
import { hasProAccess, parseLemonSubscriptionEvent, verifyLemonSignature } from "@/lib/billing/lemon-squeezy";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 1_000_000;
const LIFECYCLE_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
]);

async function readLimitedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_WEBHOOK_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET?.trim();
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID?.trim();
  if (!secret || !storeId) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 410 });
  }

  let rawBody: string | null;
  try {
    rawBody = await readLimitedBody(request);
  } catch (error) {
    logEvent("error", "billing.webhook_body_read_failed", { requestId, error: String(error) });
    return NextResponse.json({ error: "Could not read webhook payload." }, { status: 400 });
  }
  if (rawBody === null) {
    return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  }
  if (!verifyLemonSignature(rawBody, request.headers.get("x-signature") ?? "", secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const meta = payload && typeof payload === "object" ? (payload as { meta?: { event_name?: unknown } }).meta : undefined;
  const eventName = typeof meta?.event_name === "string" ? meta.event_name : "";
  if (!LIFECYCLE_EVENTS.has(eventName)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const event = parseLemonSubscriptionEvent(payload);
  if (!event || event.storeId !== storeId) {
    return NextResponse.json({ error: "Invalid subscription event." }, { status: 422 });
  }
  const configuredVariants = [
    process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_ID?.trim(),
    process.env.LEMON_SQUEEZY_PRO_YEARLY_VARIANT_ID?.trim(),
  ].filter(Boolean);
  if (!configuredVariants.includes(event.variantId)) {
    logEvent("warn", "billing.webhook_unrecognized_variant", { requestId, eventName });
    return NextResponse.json({ error: "Subscription variant is not configured." }, { status: 422 });
  }

  try {
    const result = await applyLemonSubscriptionEvent({
      eventHash: createHash("sha256").update(rawBody).digest("hex"),
      userId: event.userId,
      subscriptionId: event.eventId,
      customerId: event.customerId,
      status: event.status,
      endsAt: event.endsAt,
      customerPortalUrl: event.customerPortalUrl,
      updatedAt: event.occurredAt,
      hasProAccess: hasProAccess(event.status, event.endsAt),
    });
    if (result === "user_missing") {
      logEvent("warn", "billing.webhook_user_missing", { requestId, eventName });
      return NextResponse.json({ ok: true, ignored: true });
    }
    logEvent("info", "billing.subscription_synchronized", {
      requestId,
      eventName,
      result,
      status: event.status,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    logEvent("error", "billing.webhook_failed", { requestId, eventName, error: String(error) });
    return NextResponse.json({ error: "Could not synchronize subscription." }, { status: 500 });
  }
}
