import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Check, Shield } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { Logo } from "@/components/site/brand";
import { getCurrentUser } from "@/lib/auth";
import { MIN_PASSWORD } from "@/lib/auth-core";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a VisionSpeak AI account to keep a private record of every practice session.",
  robots: { index: false, follow: false },
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  const { next } = await searchParams;
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/studio";
  if (user) redirect(target);

  return (
    <div className="container-page grid min-h-dvh items-center gap-10 pb-16 pt-24 lg:grid-cols-[1fr_420px] lg:gap-16">
      <div className="hidden lg:block">
        <Logo />
        <h1 className="mt-8 text-balance text-[38px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
          Start measuring what{" "}
          <span className="font-display italic text-aqua">the room feels</span>.
        </h1>
        <p className="pretty mt-4 max-w-md text-[14px] leading-relaxed text-fog">
          Two minutes in front of your own camera is enough to get a baseline. Everything runs locally —
          only the final numbers are saved to your account.
        </p>
        <ul className="mt-8 space-y-3">
          {[
            "No card, no trial clock",
            "Video and audio never leave your browser",
            `Passwords hashed locally (min ${MIN_PASSWORD} characters)`,
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
          See what a report looks like <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="panel mx-auto w-full max-w-md p-6 sm:p-7">
        <div className="lg:hidden">
          <Logo />
        </div>
        <h2 className="mt-5 text-[20px] font-medium text-ink lg:mt-0">Create your account</h2>
        <p className="mt-1 text-[12.5px] text-fog">One account, one trend line.</p>

        <div className="mt-6">
          <AuthForm mode="signup" next={target} />
        </div>

        <p className="mt-5 flex items-center gap-1.5 border-t border-line/70 pt-4 text-[10.5px] text-fog/80">
          <Shield className="size-3 text-mint/80" /> Passwords are hashed with scrypt; sessions are signed
          HTTP-only cookies.
        </p>
      </div>
    </div>
  );
}
