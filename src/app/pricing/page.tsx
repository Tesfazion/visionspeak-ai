import type { Metadata } from "next";
import Link from "next/link";
import { Check, Minus, Shield, Sparkles, Zap } from "@/components/icons";
import { SiteFooter } from "@/components/site/footer";
import { ButtonLink, Pill, cn } from "@/components/ui";
import { PLANS, PLAN_IDS, formatUsd } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free to start: five analysed sessions a month, every score and drill. Pro unlocks longer sessions, unlimited history, share links and CSV export.",
  alternates: { canonical: "/pricing" },
};

/**
 * Checkout is a configuration seam, not a fake button. Set
 * NEXT_PUBLIC_PRO_CHECKOUT_URL to a Stripe Payment Link / Lemon Squeezy
 * checkout and this page starts selling; leave it unset and it markets the
 * plan honestly instead of pretending to charge.
 */
const checkoutUrl = process.env.NEXT_PUBLIC_PRO_CHECKOUT_URL?.trim() || "";

const comparison = [
  { label: "Analysed sessions per month", free: "5", pro: "200" },
  { label: "Maximum session length", free: "10 min", pro: "60 min" },
  { label: "History retained", free: "30 days", pro: "Unlimited" },
  { label: "Live scores + coach feed", free: true, pro: true },
  { label: "Full report with drills", free: true, pro: true },
  { label: "Report share links", free: "7 days", pro: "30 days + revoke" },
  { label: "CSV export", free: false, pro: true },
  { label: "Priority support", free: false, pro: true },
] as const;

const Cell = ({ value }: { value: string | boolean }) => {
  if (typeof value === "string") return <span className="text-[12px] text-mist">{value}</span>;
  return value ? (
    <Check className="mx-auto size-3.5 text-mint" aria-label="Included" />
  ) : (
    <Minus className="mx-auto size-3.5 text-fog/40" aria-label="Not included" />
  );
};

export default function PricingPage() {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const pricingJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "VisionSpeak",
    description:
      "On-device speaking coach that measures eye contact, posture, gestures, voice and expression with real-time feedback and actionable drills.",
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: `${base}/pricing`,
      },
      {
        "@type": "Offer",
        name: "Pro",
        price: String(PLANS.pro.priceMonthlyUsd),
        priceCurrency: "USD",
        availability: checkoutUrl ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
        url: checkoutUrl || `${base}/pricing`,
        priceSpecification: {
          "@type": "PriceSpecification",
          price: String(PLANS.pro.priceMonthlyUsd),
          priceCurrency: "USD",
          billingDuration: "P1M",
        },
      },
    ],
  };
  return (
    <div className="container-page pb-10 pt-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <header className="mx-auto max-w-2xl text-center">
        <div className="eyebrow">Pricing</div>
        <h1 className="mt-2 text-balance text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-[38px]">
          Start free. Pay when it becomes a habit.
        </h1>
        <p className="pretty mx-auto mt-3 max-w-xl text-[13px] leading-relaxed text-fog sm:text-[14px]">
          Every plan runs the same on-device analysis — same scoring model, same
          drills. Paid plans buy volume, longer sessions and the things a coach or a team needs: an
          unlimited archive, share links and export.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Pill tone="good">
            <Shield className="size-3" /> On-device by default
          </Pill>
          <Pill>
            <Zap className="size-3" /> Cancel any time
          </Pill>
        </div>
      </header>

      <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-2">
        {PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          const featured = id === "pro";
          return (
            <section
              key={id}
              className={cn(
                "panel relative flex flex-col overflow-hidden p-6",
                featured && "border-brand/35 bg-brand/[0.04]",
              )}
            >
              {featured && (
                <span className="absolute right-4 top-4">
                  <Pill tone="brand">Most useful</Pill>
                </span>
              )}
              <h2 className="text-[15px] font-medium text-ink">{plan.label}</h2>
              <p className="mt-1 min-h-10 text-[11.5px] leading-relaxed text-fog">{plan.tagline}</p>

              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="metric-num text-[34px] font-medium leading-none text-ink">
                  {formatUsd(plan.priceMonthlyUsd)}
                </span>
                {plan.priceMonthlyUsd > 0 && <span className="text-[12px] text-fog">/ month</span>}
              </div>
              {plan.priceYearlyUsd > 0 && (
                <p className="mt-1 text-[10.5px] text-fog">
                  or {formatUsd(plan.priceYearlyUsd)}/year — two months free
                </p>
              )}

              <ul className="mt-5 flex-1 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-[12px] leading-relaxed text-mist">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-mint" />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {featured ? (
                  checkoutUrl ? (
                    <ButtonLink href={checkoutUrl} className="w-full">
                      <Sparkles className="size-3.5" /> Get Pro
                    </ButtonLink>
                  ) : (
                    <>
                      <ButtonLink href="/signup" variant="subtle" className="w-full">
                        Start free — upgrade when billing opens
                      </ButtonLink>
                      <p className="mt-2 text-center text-[10px] leading-relaxed text-fog/70">
                        Pro checkout is not switched on for this deployment. Nothing is charged here.
                      </p>
                    </>
                  )
                ) : (
                  <ButtonLink href="/signup" variant="outline" className="w-full">
                    Create a free account
                  </ButtonLink>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mx-auto mt-10 max-w-4xl">
        <h2 className="text-center text-[13px] font-medium text-ink">What changes between plans</h2>
        <div className="panel mt-4 overflow-hidden">
          <div className="grid grid-cols-[1.6fr_0.7fr_0.7fr] gap-3 border-b border-line/60 px-4 py-2.5 text-[9.5px] font-medium uppercase tracking-[0.14em] text-fog sm:px-5">
            <span>Capability</span>
            <span className="text-center">Free</span>
            <span className="text-center">Pro</span>
          </div>
          <div className="divide-y divide-line/50">
            {comparison.map((row) => (
              <div key={row.label} className="grid grid-cols-[1.6fr_0.7fr_0.7fr] items-center gap-3 px-4 py-2.5 sm:px-5">
                <span className="text-[11.5px] text-mist">{row.label}</span>
                <span className="text-center">
                  <Cell value={row.free} />
                </span>
                <span className="text-center">
                  <Cell value={row.pro} />
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-center text-[10.5px] text-fog/80">
          Quotas reset on the first of each month (UTC). A session that fails to save never counts.
        </p>
      </section>

      <section className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
        {[
          {
            title: "Is my video uploaded?",
            body: "No. Frames, audio and landmarks are processed in the browser and discarded. Only the derived numbers and transcript text are saved when you press End.",
          },
          {
            title: "What happens at the quota?",
            body: "Saving stops and the studio says so before you start. Nothing is deleted: your existing reports stay readable and the counter resets next month.",
          },
          {
            title: "Can I use this with a team?",
            body: "Seats and cohort dashboards are on the roadmap. Until then a Pro account is per person, and share links are the way to hand a report to a coach.",
          },
        ].map((item) => (
          <div key={item.title} className="panel p-5">
            <h3 className="text-[12.5px] font-medium text-ink">{item.title}</h3>
            <p className="pretty mt-1.5 text-[11.5px] leading-relaxed text-fog">{item.body}</p>
          </div>
        ))}
      </section>

      <p className="mt-8 text-center text-[11px] text-fog">
        Questions about a plan?{" "}
        <Link href="/report/demo" className="text-brand-soft hover:text-brand">
          Look at a full sample report
        </Link>{" "}
        before you decide.
      </p>

      <SiteFooter />
    </div>
  );
}
