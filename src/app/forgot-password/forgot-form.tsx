"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Field, Input, Label, cn } from "@/components/ui";
import { useI18n } from "@/components/site/locale-provider";

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Request failed");
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-24">
      <Card className="w-full max-w-md p-7">
        <div className="eyebrow">{t("auth.forgot.eyebrow")}</div>
        <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-ink">
          {t("auth.forgot.title")}
        </h1>
        <p className="pretty mt-2 text-[12.5px] leading-relaxed text-fog">
          {sent
            ? "If that account exists, a reset link is on its way."
            : t("auth.forgot.body")}
        </p>

        {!sent && (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field>
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            {error && <p className="text-[12px] text-rose">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full inline-flex items-center justify-center font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
                "h-10 px-4 text-[13px] rounded-xl gap-2 bg-gradient-to-b from-brand to-[#6847f0] text-white border border-brand/60",
              )}
            >
              {loading ? "Sending…" : t("auth.forgot.submit")}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-[11.5px] text-fog">
          <Link href="/login" className="text-brand-soft hover:text-brand">
            {t("auth.forgot.back")}
          </Link>
        </p>
      </Card>
    </div>
  );
}