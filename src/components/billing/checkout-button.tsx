"use client";

import { useState } from "react";
import Link from "next/link";

export function CheckoutButton({
  interval = "monthly",
  configured = false,
}: {
  interval?: "monthly" | "yearly";
  configured?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const startCheckout = async () => {
    setLoading(true);
    setError(null);
    setNeedsSignIn(false);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro", interval }),
      });
      const body = (await response.json()) as { url?: unknown; error?: unknown };
      if (response.status === 401) {
        setNeedsSignIn(true);
        return;
      }
      if (!response.ok || typeof body.url !== "string") {
        throw new Error(typeof body.error === "string" ? body.error : "Checkout could not start.");
      }
      window.location.assign(body.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkout could not start.");
    } finally {
      setLoading(false);
    }
  };

  if (!configured) {
    return (
      <div>
        <button
          type="button"
          disabled
          className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-xl border border-line px-4 text-[14px] text-fog"
        >
          Checkout is not configured
        </button>
        <p className="mt-2 text-center text-[11px] text-fog/80">Nothing will be charged until billing is enabled.</p>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={startCheckout}
        disabled={loading}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-brand/60 bg-gradient-to-b from-brand to-[#6847f0] px-4 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {loading ? "Opening secure checkout…" : `Get Pro · ${interval}`}
      </button>
      {needsSignIn && (
        <p className="mt-2 text-center text-[12px] text-fog">
          <Link className="text-brand-soft underline" href="/login?next=%2Faccount">
            Sign in
          </Link>{" "}
          first, then upgrade from your account.
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-center text-[12px] text-rose">{error}</p>}
    </div>
  );
}
