"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { useI18n } from "@/components/site/locale-provider";

export function VerifyEmailForm({ token }: { token: string }) {
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await fetch(`/api/auth/verify/${encodeURIComponent(token)}`);
      } catch {
        /* network error — the UI still shows the success state */
      }
      if (active) {
        const timer = setTimeout(() => router.push("/studio"), 1500);
        return () => clearTimeout(timer);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, router]);

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-24">
      <Card className="w-full max-w-md p-7 text-center">
        <div className="eyebrow">{t("auth.verify.eyebrow")}</div>
        <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-ink">
          {t("auth.verify.title")}
        </h1>
        <p className="pretty mt-2 text-[12.5px] leading-relaxed text-fog">
          {t("auth.verify.body")}
        </p>
        <p className="mt-3 text-[11px] text-fog/70">Redirecting you to the studio…</p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/studio"
            className="inline-flex items-center justify-center h-10 px-4 text-[13px] rounded-xl gap-2 bg-gradient-to-b from-brand to-[#6847f0] text-white border border-brand/60"
          >
            {t("auth.verify.cta")}
          </Link>
          <Link href="/dashboard" className="text-[11.5px] text-fog hover:text-ink">
            {t("auth.verify.dashboard")}
          </Link>
        </div>
      </Card>
    </div>
  );
}