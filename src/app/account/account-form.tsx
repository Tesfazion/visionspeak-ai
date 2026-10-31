"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Field, Input, Label, cn } from "@/components/ui";
import { useI18n } from "@/components/site/locale-provider";

export function AccountSettingsForm({
  email,
  name,
  children,
}: {
  email: string;
  name: string;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const revoke = async () => {
    setError(null);
    if (confirm.toLowerCase() !== email.toLowerCase()) {
      setError("Type your email address to confirm.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/sessions/revoke", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Request failed");
      }
      setDone(true);
      // The server revoked every earlier token and issued a fresh cookie for this
      // browser, so the person who pressed the button stays signed in here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-page py-24">
      <div className="mx-auto max-w-2xl">
        <div className="eyebrow">{t("account.eyebrow")}</div>
        <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-ink">
          {t("account.title")}
        </h1>

        <Card className="mt-6 p-6">
          <h2 className="text-[13px] font-medium text-ink">{t("account.profile")}</h2>
          <div className="mt-3 space-y-2 text-[12px] text-fog">
            <p>
              <span className="text-mist">{t("account.name")}:</span> {name}
            </p>
            <p>
              <span className="text-mist">{t("account.email")}:</span> {email}
            </p>
          </div>
          <p className="mt-3 text-[11px] text-fog/70">
            {t("account.editNote")}
          </p>
        </Card>

        <Card className="mt-4 p-6">
          <h2 className="text-[13px] font-medium text-ink">{t("account.revoke.title")}</h2>
          <p className="pretty mt-2 text-[12.5px] leading-relaxed text-fog">
            {t("account.revoke.body")}
          </p>
          {done ? (
            <p className="mt-3 text-[12px] text-mint">{t("account.revoke.done")}</p>
          ) : (
            <>
              <Field className="mt-4">
                <Label htmlFor="confirm">{t("account.revoke.confirm")}</Label>
                <Input
                  id="confirm"
                  type="email"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={email}
                />
              </Field>
              {error && <p className="mt-2 text-[12px] text-rose">{error}</p>}
              <button
                type="button"
                onClick={revoke}
                disabled={loading}
                className={cn(
                  "mt-4 inline-flex items-center justify-center font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
                  "h-10 px-4 text-[13px] rounded-xl gap-2 border border-rose/30 bg-rose/10 text-rose hover:bg-rose/15",
                )}
              >
                {loading ? "Revoking…" : t("account.revoke.submit")}
              </button>
            </>
          )}
        </Card>

        {children}

        <p className="mt-4 text-center text-[11.5px] text-fog">
          <Link href="/dashboard" className="text-brand-soft hover:text-brand">
            {t("account.back")}
          </Link>
        </p>
      </div>
    </div>
  );
}