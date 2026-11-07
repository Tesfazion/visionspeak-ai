import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  hasProAccess,
  parseLemonSubscriptionEvent,
  verifyLemonSignature,
} from "@/lib/billing/lemon-squeezy";

const payload = {
  meta: {
    event_name: "subscription_created",
    custom_data: { user_id: "u_1234abcd" },
  },
  data: {
    id: "987654",
    type: "subscriptions",
    attributes: {
      store_id: 123,
      variant_id: 456,
      customer_id: 789,
      status: "active",
      ends_at: null,
      updated_at: "2026-11-07T10:00:00.000Z",
      urls: { customer_portal: "https://app.lemonsqueezy.com/my-orders/portal" },
    },
  },
};

test("Lemon Squeezy signatures use the raw request body and constant-time-safe digest", () => {
  const rawBody = JSON.stringify(payload);
  const signature = createHmac("sha256", "webhook-secret").update(rawBody).digest("hex");
  assert.equal(verifyLemonSignature(rawBody, signature, "webhook-secret"), true);
  assert.equal(verifyLemonSignature(`${rawBody} `, signature, "webhook-secret"), false);
  assert.equal(verifyLemonSignature(rawBody, "not-a-signature", "webhook-secret"), false);
});

test("subscription events are validated and keep only a Lemon Squeezy portal URL", () => {
  const event = parseLemonSubscriptionEvent(payload);
  assert.equal(event?.userId, "u_1234abcd");
  assert.equal(event?.storeId, "123");
  assert.equal(event?.customerPortalUrl, "https://app.lemonsqueezy.com/my-orders/portal");
  assert.equal(parseLemonSubscriptionEvent({ ...payload, data: { ...payload.data, type: "orders" } }), null);

  const unsafe = structuredClone(payload);
  unsafe.data.attributes.urls.customer_portal = "https://attacker.example/";
  assert.equal(parseLemonSubscriptionEvent(unsafe)?.customerPortalUrl, null);
});

test("the parser accepts unpaused lifecycle events and rejects subscription payment events", () => {
  const unpaused = structuredClone(payload);
  unpaused.meta.event_name = "subscription_unpaused";
  assert.equal(parseLemonSubscriptionEvent(unpaused)?.eventName, "subscription_unpaused");

  const paymentEvent = structuredClone(payload);
  paymentEvent.meta.event_name = "subscription_payment_success";
  assert.equal(parseLemonSubscriptionEvent(paymentEvent), null);
});

test("subscription access follows active status and cancellation end date", () => {
  const future = "2026-12-01T00:00:00.000Z";
  assert.equal(hasProAccess("active", null), true);
  assert.equal(hasProAccess("past_due", null), true);
  assert.equal(hasProAccess("cancelled", future, Date.parse("2026-11-07T00:00:00.000Z")), true);
  assert.equal(hasProAccess("cancelled", future, Date.parse("2027-01-01T00:00:00.000Z")), false);
  assert.equal(hasProAccess("expired", null), false);
});
