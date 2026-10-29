import Link from "next/link";
import { ArrowRight, Download, Lock, Share2, Sparkles, TrendingUp } from "@/components/icons";
import { Bar, ButtonLink, Pill, cn, toneFor } from "@/components/ui";
import type { Translate } from "@/lib/i18n";
import { PLANS, type QuotaState } from "@/lib/plans";
import type { SessionRecord } from "@/lib/types";
import { PILLAR_KEYS, PILLAR_META } from "./pillars";

/**
 * The plan-dependent half of the dashboard.
 *
 * These are server components on purpose: they render different *content* per
 * plan, not different styling over the same content. Pro gets a coaching
 * summary built from its own history; Free gets an honest account of what the
 * limit costs. Two dashboards that look alike would make the upgrade feel like
 * a paywall instead of a change in what the product does.
 */

type Pillars = Record<(typeof PILLAR_KEYS)[number], number>;

function averagePillars(sessions: SessionRecord[]): Pillars | null {
  if (sessions.length === 0) return null;
  const out = Object.fromEntries(PILLAR_KEYS.map((key) => [key, 0])) as Pillars;
  for (const session of sessions) {
    for (const key of PILLAR_KEYS) out[key] += session.report.pillars[key];
  }
  for (const key of PILLAR_KEYS) out[key] = Math.round(out[key] / sessions.length);
  return out;
}

export function ProWorkspace({
  sessions,
  quota,
  t,
}: {
  sessions: SessionRecord[];
  quota: QuotaState;
  t: Translate;
}) {
  // Oldest-first slices: the last three sessions against the three before them.
  const chronological = [...sessions].reverse();
  const now = averagePillars(chronological.slice(-3));
  const before = averagePillars(chronological.slice(-6, -3));

  const deltas =
    now && before
      ? PILLAR_KEYS.map((key) => ({
          key,
          label: t(PILLAR_META[key].label),
          delta: now[key] - before[key],
          value: now[key],
        })).sort((a, b) => b.delta - a.delta)
      : [];

  const rising = deltas.filter((d) => d.delta > 0).slice(0, 2);
  const slipping = deltas.filter((d) => d.delta < 0).slice(-2).reverse();
  const latest = sessions[0];

  return (
    <section className="relative mt-4 overflow-hidden rounded-xl border-2 border-brand/40 bg-gradient-to-br from-brand/[0.08] via-brand/[0.03] to-transparent p-6">
      <div
        className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(124,92,255,0.35), transparent 70%)" }}
        aria-hidden
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <Pill tone="brand" className="mb-3">
            <Sparkles className="size-3" /> {t("pro.badge")}
          </Pill>
          <h2 className="text-[17px] font-semibold text-ink">{t("pro.title")}</h2>
          <p className="mt-1 text-[12px] text-fog">{t("pro.subtitle")}</p>
        </div>
        <div className="text-right">
          <div className="metric-num text-[22px] leading-none text-ink">
            {quota.used}
            <span className="text-[12px] text-fog"> / {quota.limit}</span>
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-fog">
            {t("dash.planLabel", { plan: quota.label })}
          </div>
        </div>
      </div>

      <div className="relative mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Coaching summary — only meaningful with history, and it says so. */}
        <div className="rounded-lg border border-line/70 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-fog">
            <TrendingUp className="size-3.5 text-brand-soft" /> {t("pro.insights.title")}
          </div>
          {deltas.length === 0 ? (
            <p className="pretty mt-2 text-[11.5px] leading-relaxed text-fog">{t("pro.compare.empty")}</p>
          ) : (
            <>
              <p className="mt-2 text-[11px] text-fog/80">{t("pro.compare.body")}</p>
              <div className="mt-3 space-y-2.5">
                {[...rising, ...slipping].map((d) => (
                  <div key={d.key} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-[11.5px] text-mist">{d.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="w-24">
                        <Bar value={d.value} height={4} tone={toneFor(d.value).hex} />
                      </span>
                      <span
                        className={cn(
                          "metric-num w-12 text-right text-[11px]",
                          d.delta > 0 ? "text-mint" : d.delta < 0 ? "text-rose" : "text-fog",
                        )}
                      >
                        {d.delta > 0 ? `+${d.delta}` : d.delta}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {rising[0] && (
                  <span className="rounded-full border border-mint/25 bg-mint/10 px-2.5 py-1 text-[10px] text-mint">
                    {t("pro.insights.improving")}: {rising[0].label}
                  </span>
                )}
                {slipping[0] ? (
                  <span className="rounded-full border border-rose/25 bg-rose/10 px-2.5 py-1 text-[10px] text-rose">
                    {t("pro.insights.slipping")}: {slipping[0].label}
                  </span>
                ) : (
                  <span className="rounded-full border border-line/70 px-2.5 py-1 text-[10px] text-fog">
                    {t("pro.insights.steady")}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* The two Pro capabilities that are not just "more of the same". */}
        <div className="space-y-3">
          <div className="rounded-lg border border-line/70 bg-white/[0.02] p-3.5">
            <div className="flex items-center gap-2 text-[11.5px] font-medium text-ink">
              <Download className="size-3.5 text-brand-soft" /> {t("pro.export.title")}
            </div>
            <p className="pretty mt-1 text-[11px] leading-relaxed text-fog">{t("pro.export.body")}</p>
            {latest && (
              <Link
                href={`/report/${latest.id}`}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-brand-soft hover:text-brand"
              >
                {t("pro.export.cta")} <ArrowRight className="size-3" />
              </Link>
            )}
          </div>
          <div className="rounded-lg border border-line/70 bg-white/[0.02] p-3.5">
            <div className="flex items-center gap-2 text-[11.5px] font-medium text-ink">
              <Share2 className="size-3.5 text-brand-soft" /> {t("pro.share.title")}
            </div>
            <p className="pretty mt-1 text-[11px] leading-relaxed text-fog">{t("pro.share.body")}</p>
            {latest && (
              <Link
                href={`/report/${latest.id}`}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-brand-soft hover:text-brand"
              >
                {t("pro.share.cta")} <ArrowRight className="size-3" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function FreeUpgrade({ quota, t }: { quota: QuotaState; t: Translate }) {
  const pro = PLANS.pro;
  const remaining = Math.max(0, quota.limit - quota.used);
  const pct = quota.limit === 0 ? 100 : Math.round((quota.used / quota.limit) * 100);

  return (
    <section className="panel mt-4 overflow-hidden p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Pill tone="neutral" className="mb-2">
            <Lock className="size-3" /> {t("dash.planLabel", { plan: quota.label })}
          </Pill>
          <h2 className="text-[14px] font-medium text-ink">
            {t("dash.plan.used", { used: quota.used, limit: quota.limit })}
          </h2>
          <p className="mt-0.5 text-[11px] text-fog">
            {remaining === 0
              ? t("dash.plan.reached", { date: quota.resetsAt.slice(0, 10) })
              : t("dash.plan.remaining", { count: remaining, date: quota.resetsAt.slice(0, 10) })}
          </p>
        </div>
        <ButtonLink href="/pricing" variant="subtle" size="sm">
          {t("pro.upgradeCta")} <ArrowRight className="size-3.5" />
        </ButtonLink>
      </div>

      <div className="mt-3">
        <Bar value={pct} height={5} tone={remaining === 0 ? "#fb7185" : pct > 80 ? "#fbbf24" : "#34d399"} />
      </div>

      <div className="mt-4 rounded-lg border border-line/70 bg-white/[0.015] p-3.5">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-fog">What Pro adds</div>
        <ul className="mt-2 space-y-2">
          {[
            t("plan.pro.f1"),
            t("plan.pro.f3"),
            t("plan.pro.f4"),
          ].map((line) => (
            <li key={line} className="flex items-start gap-2 text-[11.5px] text-mist">
              <Sparkles className="mt-0.5 size-3 shrink-0 text-brand-soft" />
              {line}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-[10.5px] text-fog/80">
        {t("pro.whatYouGet.body", { sessions: pro.sessionsPerMonth, minutes: pro.maxSessionMinutes })}
      </p>
    </section>
  );
}
