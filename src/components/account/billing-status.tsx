"use client";

import { useState } from "react";
import { useI18n } from "@/components/site/locale-provider";
import { Card, cn } from "@/components/ui";

export function BillingStatus({
  plan,
  billing,
  checkoutConfigured = false,
}: {
  plan: "free" | "pro";
  billing?: { status: string; endsAt: string | null; customerPortalUrl: string | null };
  checkoutConfigured?: boolean;
}) {
  const { t } = useI18n();
  const isPro = plan === "pro";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upgrade = async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro", interval: "monthly" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Request failed");
      if (body.url) {
        window.location.href = body.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  if (isPro) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-mint">
          <span className="size-1.5 rounded-full bg-mint" /> {t("common.pro")}
        </div>
        <p className="pretty mt-2 text-[12.5px] leading-relaxed text-fog">
          {billing?.status === "cancelled" && billing.endsAt
            ? `Your subscription is set to end on ${new Date(billing.endsAt).toLocaleDateString()}.`
            : t("billing.pro.active")}
        </p>
        {billing?.customerPortalUrl && (
          <a
            href={billing.customerPortalUrl}
            rel="noreferrer"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-line px-4 text-[13px] text-ink hover:bg-raised"
          >
            Manage subscription
          </a>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-fog">
        <span className="size-1.5 rounded-full bg-fog/60" /> {t("common.free")}
      </div>
      <p className="pretty mt-2 text-[12.5px] leading-relaxed text-fog">
        {t("billing.free.body")}
      </p>
      {error && <p className="mt-2 text-[12px] text-rose">{error}</p>}
      <div className="mt-4">
        {checkoutConfigured ? (
          <button
            type="button"
            onClick={upgrade}
            disabled={loading}
            className={cn(
              "inline-flex items-center justify-center h-10 px-4 text-[13px] rounded-xl gap-2 w-full transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
              "bg-gradient-to-b from-brand to-[#6847f0] text-white border border-brand/60",
            )}
          >
            {loading ? "Loading…" : t("billing.free.cta")}
          </button>
        ) : (
          <p className="text-[12px] text-fog">Secure checkout is not configured yet. Nothing will be charged.</p>
        )}
      </div>
    </Card>
  );
}