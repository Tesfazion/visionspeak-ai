import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Check, Shield } from "@/components/icons";
import { AuthForm } from "@/components/auth/auth-form";
import { LanguageSwitcher } from "@/components/site/language-switcher";
import { Logo } from "@/components/site/brand";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { POST_AUTH_PATH } from "@/lib/routes";
import { MIN_PASSWORD } from "@/lib/auth-core";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create an account to keep a private record of every speaking practice session.",
  robots: { index: false, follow: false },
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  const { next } = await searchParams;
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : POST_AUTH_PATH;
  if (user) redirect(target);

  const { t } = await getI18n();

  return (
    <div className="container-page grid min-h-dvh items-center gap-10 pb-16 pt-24 lg:grid-cols-[1fr_420px] lg:gap-16">
      <div className="hidden lg:block">
        <Logo />
        <h1 className="mt-8 text-balance text-[38px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
          {t("auth.signupHeadline")}{" "}
          <span className="font-display italic text-aqua">{t("auth.signupHeadlineAccent")}</span>.
        </h1>
        <p className="pretty mt-4 max-w-md text-[14px] leading-relaxed text-fog">{t("auth.signupBody")}</p>
        <ul className="mt-8 space-y-3">
          {[
            t("auth.signupPoint1"),
            t("auth.signupPoint2"),
            t("auth.signupPoint3", { min: MIN_PASSWORD }),
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[13px] text-mist">
              <Check className="mt-0.5 size-3.5 shrink-0 text-mint" />
              {item}
            </li>
          ))}
        </ul>
        <Link
          href="/report/demo"
          className="mt-8 inline-flex items-center gap-1.5 text-[12.5px] text-brand-soft transition-colors hover:text-brand"
        >
          {t("auth.signupSample")} <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="panel mx-auto w-full max-w-md p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <Logo />
          <LanguageSwitcher />
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 lg:mt-0">
          <h2 className="text-[20px] font-medium text-ink">{t("auth.signUpTitle")}</h2>
          <div className="hidden lg:block">
            <LanguageSwitcher />
          </div>
        </div>
        <p className="mt-1 text-[12.5px] text-fog">{t("auth.signupCardBody")}</p>

        <div className="mt-6">
          <AuthForm key="signup" mode="signup" next={target} />
        </div>

        <p className="mt-5 flex items-center gap-1.5 border-t border-line/70 pt-4 text-[10.5px] text-fog/80">
          <Shield className="size-3 shrink-0 text-mint/80" /> {t("auth.security")}
        </p>
      </div>
    </div>
  );
}
