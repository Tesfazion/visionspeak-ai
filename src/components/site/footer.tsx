"use client";

import Link from "next/link";
import { Logo } from "./brand";
import { useI18n } from "./locale-provider";
import type { MessageKey } from "@/lib/i18n";

/**
 * Footer.
 *
 * Deliberately free of implementation names: a visitor cares that their video
 * stays private and that the scores mean something — not which library produced
 * a landmark. The engineering references that used to live here now belong in
 * README.md, where the reader is a developer by definition.
 */
interface Column {
  title: MessageKey;
  links: { label: MessageKey; href: string }[];
}

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";

const columns: Column[] = [
  {
    title: "footer.product",
    links: [
      { label: "footer.liveStudio", href: "/studio" },
      { label: "footer.sampleReport", href: "/report/demo" },
      { label: "footer.history", href: "/dashboard" },
      { label: "footer.pricing", href: "/pricing" },
      { label: "footer.scoringModel", href: "/#scoring" },
    ],
  },
  {
    title: "footer.signals",
    links: [
      { label: "footer.eyeContact", href: "/#signals" },
      { label: "footer.posture", href: "/#signals" },
      { label: "footer.gestures", href: "/#signals" },
      { label: "footer.voice", href: "/#signals" },
    ],
  },
  {
    title: "footer.company",
    links: [
      { label: "footer.privacy", href: "/privacy" },
      { label: "footer.terms", href: "/terms" },
      ...(supportEmail ? [{ label: "footer.contact" as MessageKey, href: `mailto:${supportEmail}` }] : []),
    ],
  },
];

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="no-print relative mt-16 border-t border-line/70 sm:mt-24">
      <div className="container-page grid gap-8 py-12 sm:gap-10 sm:py-14 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="pretty mt-4 max-w-xs text-[13px] leading-relaxed text-fog">{t("footer.tagline")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="chip">{t("footer.chip.private")}</span>
            <span className="chip">{t("footer.chip.coaching")}</span>
            <span className="chip">{t("footer.chip.practice")}</span>
          </div>
        </div>

        {columns.map((col) => (
          <nav key={col.title} aria-label={t(col.title)}>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fog">{t(col.title)}</h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-[13px] text-mist/80 transition-colors hover:text-ink"
                    {...(link.href.startsWith("http") || link.href.startsWith("mailto")
                      ? { target: "_blank", rel: "noreferrer" }
                      : {})}
                  >
                    {t(link.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-line/60">
        <div className="container-page flex flex-col gap-2 py-5 text-[11px] text-fog/70 sm:flex-row sm:items-center sm:justify-between">
          <p>{t("footer.rights", { year: new Date().getFullYear() })}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href="/pricing" className="transition-colors hover:text-ink">
              {t("footer.pricing")}
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-ink">
              {t("footer.privacy")}
            </Link>
            <Link href="/terms" className="transition-colors hover:text-ink">
              {t("footer.terms")}
            </Link>
            <span className="font-mono tracking-wide">{t("footer.note")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
