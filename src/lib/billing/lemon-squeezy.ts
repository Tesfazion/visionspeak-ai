import { createHmac, timingSafeEqual } from "node:crypto";

export type BillingInterval = "monthly" | "yearly";
export type SubscriptionStatus =
  | "active"
  | "on_trial"
  | "past_due"
  | "paused"
  | "cancelled"
  | "expired"
  | "unpaid";

export interface LemonSubscriptionEvent {
  eventName: string;
  eventId: string;
  userId: string;
  storeId: string;
  variantId: string;
  customerId: string;
  status: SubscriptionStatus;
  endsAt: string | null;
  customerPortalUrl: string | null;
  occurredAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = String(value);
  return /^[A-Za-z0-9_-]{1,80}$/.test(result) ? result : null;
}

export function verifyLemonSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const provided = Buffer.from(signature, "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function parseLemonSubscriptionEvent(payload: unknown): LemonSubscriptionEvent | null {
  if (!isRecord(payload) || !isRecord(payload.meta) || !isRecord(payload.data)) return null;
  const meta = payload.meta;
  const data = payload.data;
  const attrs = isRecord(data.attributes) ? data.attributes : null;
  const custom = isRecord(meta.custom_data) ? meta.custom_data : null;
  if (!attrs || data.type !== "subscriptions") return null;

  const status = attrs.status;
  const allowedStatuses: SubscriptionStatus[] = ["active", "on_trial", "past_due", "paused", "cancelled", "expired", "unpaid"];
  const eventName = typeof meta.event_name === "string" ? meta.event_name : "";
  const userId = safeId(custom?.user_id);
  const eventId = safeId(data.id);
  const storeId = safeId(attrs.store_id);
  const variantId = safeId(attrs.variant_id);
  const customerId = safeId(attrs.customer_id);
  const occurredAt = typeof attrs.updated_at === "string" ? attrs.updated_at : "";
  if (
    ![
      "subscription_created",
      "subscription_updated",
      "subscription_cancelled",
      "subscription_resumed",
      "subscription_expired",
      "subscription_paused",
      "subscription_unpaused",
    ].includes(eventName) ||
    !userId ||
    !eventId ||
    !storeId ||
    !variantId ||
    !customerId ||
    typeof status !== "string" ||
    !allowedStatuses.includes(status as SubscriptionStatus) ||
    !Number.isFinite(Date.parse(occurredAt))
  ) {
    return null;
  }

  const urls = isRecord(attrs.urls) ? attrs.urls : null;
  const portal = typeof urls?.customer_portal === "string" ? urls.customer_portal : null;
  let customerPortalUrl: string | null = null;
  if (portal) {
    try {
      const parsed = new URL(portal);
      if (
        parsed.protocol === "https:" &&
        (parsed.hostname === "lemonsqueezy.com" || parsed.hostname.endsWith(".lemonsqueezy.com"))
      ) {
        customerPortalUrl = parsed.toString();
      }
    } catch {
      customerPortalUrl = null;
    }
  }

  return {
    eventName,
    eventId,
    userId,
    storeId,
    variantId,
    customerId,
    status: status as SubscriptionStatus,
    endsAt: typeof attrs.ends_at === "string" && Number.isFinite(Date.parse(attrs.ends_at)) ? attrs.ends_at : null,
    customerPortalUrl,
    occurredAt,
  };
}

export function hasProAccess(status: SubscriptionStatus, endsAt: string | null, now = Date.now()): boolean {
  if (status === "active" || status === "on_trial" || status === "past_due") return true;
  return status === "cancelled" && endsAt !== null && Date.parse(endsAt) > now;
}
