import { redirect } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Award,
  Clock,
  Crown,
  Eye,
  Flame,
  Gauge,
  Hand,
  Mic,
  Plus,
  Smile,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Video,
} from "@/components/icons";
import { FreeUpgrade, ProWorkspace } from "@/components/dashboard/plan-panel";
import { MeetingCallout } from "@/components/dashboard/meeting-callout";
import { PILLAR_KEYS, PILLAR_META } from "@/components/dashboard/pillars";
import { SessionTrend, type SessionTrendPoint } from "@/components/dashboard/trends";
import { SiteFooter } from "@/components/site/footer";
import { Bar, ButtonLink, Pill, ScoreRing, scoreLabel, toneFor } from "@/components/ui";
import { formatDuration } from "@/lib/math";
import { listSessions } from "@/lib/store";
import { STORAGE_IS_EPHEMERAL } from "@/lib/data-dir";
import { getCurrentUser, loginHref } from "@/lib/auth";
import { planFor, quotaState, visibleHistory } from "@/lib/plans";
import { getI18n } from "@/lib/i18n/server";
import { LoadMore } from "@/components/dashboard/load-more";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Practice history",
  description: "Session history, trends and pillar averages across every speaking analysis.",
};

const PILLAR_ICONS = {
  eyeContact: Eye,
  posture: Activity,
  gestures: Hand,
  voice: Mic,
  expression: Smile,
} as const;

const dayKey = (iso: string) => iso.slice(0, 10);

function computeStreak(dates: string[]) {
  const unique = new Set(dates.map(dayKey));
  const day = 86_400_000;
  let streak = 0;
  let cursor = Date.now();
  // A streak survives if the most recent session was today or yesterday.
  if (!unique.has(new Date(cursor).toISOString().slice(0, 10))) {
    cursor -= day;
    if (!unique.has(new Date(cursor).toISOString().slice(0, 10))) return 0;
  }
  while (unique.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak++;
    cursor -= day;
  }
  return streak;
}

const WEEK_MS = 7 * 86_400_000;

type Summarisable = { createdAt: string; report: { overall: number } };

/**
 * Everything that depends on "now".
 *
 * Kept outside the component body because reading the clock during render is an
 * impure call (react-hooks/purity). This route is `force-dynamic`, so the value
 * is resolved exactly once per request — which is the intent.
 */
function recentActivity(sessions: Summarisable[]) {
  const now = Date.now();
  const recent = sessions.filter((s) => new Date(s.createdAt).getTime() >= now - WEEK_MS);
  return {
    weekCount: recent.length,
    weekAverage: recent.length
      ? Math.round(recent.reduce((acc, s) => acc + s.report.overall, 0) / recent.length)
      : null,
    streak: computeStreak(sessions.map((s) => s.createdAt)),
  };
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/dashboard"));

  const { t, locale } = await getI18n();
  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { day: "2-digit", month: "short" }).format(
      new Date(iso),
    );

  // Only this account's own analyses count. Seeded samples are reference
  // material and must never appear as the user's history or inflate a streak.
  const own = await listSessions(user.id, { includeSamples: false });
  const plan = planFor(user.plan);
  const quota = quotaState(own, user.id, user.plan);

  // Plan-visible history, newest first. `own` is already scoped to the account
  // and excludes samples; `visibleHistory` applies the plan's retention window.
  const visible = visibleHistory(own, user.id, user.plan);
  const total = visible.length;
  // The first page is sliced locally. A server component must not fetch its own
  // API route: that needs a live absolute origin and breaks whenever the server
  // runs on a port other than the one baked into the env. Paging past 50 rows is
  // handled client-side by `LoadMore`.
  const firstPage = visible.slice(0, 50);
  const sessions = firstPage;
  const isPro = plan.id === "pro";

  if (sessions.length === 0) {
    return (
      <div className="container-page pt-24">
        <div className="panel grid place-items-center p-8 text-center sm:p-14">
          <span className="grid size-12 place-items-center rounded-2xl border border-brand/30 bg-brand/10 text-brand-soft">
            <Gauge className="size-5" />
          </span>
          <h1 className="mt-4 text-[20px] font-medium text-ink">
            {own.length > 0 ? t("dash.expired.title") : t("dash.empty.title")}
          </h1>
          <p className="pretty mt-2 max-w-sm text-[12.5px] leading-relaxed text-fog">
            {own.length > 0 ? t("dash.expired.body") : t("dash.empty.body")}
          </p>
          <p className="mt-2 text-[10.5px] text-fog/80">
            {t("dash.plan.summary", {
              plan: plan.label,
              limit: plan.sessionsPerMonth,
              minutes: plan.maxSessionMinutes,
            })}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <ButtonLink href="/studio">
              <Plus className="size-3.5" /> {t("dash.empty.cta")}
            </ButtonLink>
            <ButtonLink href="/report/demo" variant="subtle">
              {t("dash.empty.sample")} <ArrowRight className="size-3.5" />
            </ButtonLink>
            <ButtonLink href="/meeting" variant="subtle">
              <Video className="size-3.5" /> {t("dash.rooms.cta")}
            </ButtonLink>
          </div>
        </div>

        {/* Empty state is the one place a new account cannot tell what the
            product is for, so the room lives here too. */}
        <MeetingCallout t={t} />
      </div>
    );
  }

  const totalSec = sessions.reduce((acc, s) => acc + s.durationSec, 0);
  const best = Math.max(...sessions.map((s) => s.report.overall));
  const avgOverall = Math.round(sessions.reduce((acc, s) => acc + s.report.overall, 0) / sessions.length);

  const { weekCount, weekAverage, streak } = recentActivity(sessions);
  const weekAvg = weekAverage ?? avgOverall;

  const trend: SessionTrendPoint[] = [...sessions]
    .reverse()
    .slice(-10)
    .map((s) => ({
      label: shortDate(s.createdAt),
      overall: s.report.overall,
      confidence: s.report.pillars.confidence,
      leadership: s.report.pillars.leadership,
    }));

  const pillarAvg = PILLAR_KEYS.map((key) => ({
    key,
    label: t(PILLAR_META[key].label),
    color: PILLAR_META[key].color,
    icon: PILLAR_ICONS[key],
    value: Math.round(sessions.reduce((acc, s) => acc + s.report.pillars[key], 0) / sessions.length),
  })).sort((a, b) => b.value - a.value);

  const weakest = pillarAvg[pillarAvg.length - 1];
  const strongest = pillarAvg[0];

  const stats = [
    {
      label: t("dash.stat.sessions"),
      value: sessions.length,
      unit: "",
      icon: Gauge,
      accent: "#7c5cff",
      hint: t("dash.stat.sessionsHint", { count: weekCount }),
    },
    {
      label: t("dash.stat.time"),
      value: formatDuration(totalSec),
      unit: "",
      icon: Clock,
      accent: "#22d3ee",
      hint: t("dash.stat.timeHint"),
    },
    {
      label: t("dash.stat.best"),
      value: best,
      unit: "/100",
      icon: Award,
      accent: toneFor(best).hex,
      hint: t("dash.stat.bestHint", { label: scoreLabel(best) }),
    },
    {
      label: t("dash.stat.week"),
      value: weekAvg,
      unit: "/100",
      icon: TrendingUp,
      accent: toneFor(weekAvg).hex,
      hint: t("dash.stat.weekHint", { value: avgOverall }),
    },
  ];

  const delta = weekAverage !== null ? weekAvg - avgOverall : 0;

  return (
    <div className="container-page pb-10 pt-24">
      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="eyebrow flex items-center gap-2">
            <Gauge className="size-3" /> {t("dash.eyebrow")}
          </div>
          <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-ink sm:text-[32px]">
            {t("dash.title")}
          </h1>
          <p className="mt-1.5 text-[12.5px] text-fog sm:text-[13px]">
            {t("dash.subtitle", { sessions: sessions.length, time: formatDuration(totalSec) })}
            {streak > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber">
                <Flame className="size-3" /> {t("dash.streak", { days: streak })}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {STORAGE_IS_EPHEMERAL && (
            <Pill tone="warn" title="This deployment has no durable volume — records are lost on restart">
              <TriangleAlert className="size-3" /> temporary storage
            </Pill>
          )}
          <Pill tone={isPro ? "good" : "neutral"}>
            {isPro ? <Sparkles className="size-3" /> : <Crown className="size-3" />}
            {t("dash.planLabel", { plan: plan.label })}
          </Pill>
          <span className="text-[11px] text-fog">
            {Math.round(quota.durationSec / 60)} minutes analysed this month
          </span>
          <ButtonLink href="/studio" size="md" className="flex-1 sm:flex-none">
            <Plus className="size-3.5" /> {t("dash.newSession")}
          </ButtonLink>
        </div>
      </header>

      {/* The plan decides what this area is: a coaching summary for Pro, an
          honest usage limit for Free. Never the same panel in two costumes. */}
      {isPro ? (
        <ProWorkspace sessions={sessions} quota={quota} t={t} />
      ) : (
        <FreeUpgrade quota={quota} t={t} />
      )}

      {/* The rest of this page reports on the past; this is the part that runs
          now — a meeting room, not another chart. */}
      <MeetingCallout t={t} />

      {/* Hero: lifetime average ring + headline stat strip */}
      <section className="panel mt-4 overflow-hidden">
        <div className="grid-lines pointer-events-none opacity-30" aria-hidden />
        <div className="relative flex flex-col items-center gap-6 p-5 sm:flex-row sm:gap-8 sm:p-6">
          <div className="relative shrink-0">
            <ScoreRing value={avgOverall} size={148} stroke={10} label={t("dash.lifetimeAvg")} />
            <span className="absolute inset-0 -z-10 rounded-full bg-brand/10 blur-2xl" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="rounded-full border border-line/70 bg-white/[0.03] px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-fog">
                {t("dash.edge", { label: strongest.label, value: strongest.value })}
              </span>
              {streak > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber/30 bg-amber/10 px-2.5 py-1 text-[10px] font-medium text-amber">
                  <Flame className="size-3" /> {t("dash.streak", { days: streak })}
                </span>
              )}
            </div>
            <p className="pretty mt-2.5 text-[12.5px] leading-relaxed text-fog sm:max-w-md">
              {t("dash.heroBody", {
                avg: avgOverall,
                count: sessions.length,
                pillar: weakest.label,
                value: weakest.value,
              })}
              {delta !== 0 && (
                <>
                  {" "}
                  {t("dash.heroDelta", { delta: `${delta > 0 ? "+" : ""}${delta}` })}
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="panel relative overflow-hidden p-4 transition-colors hover:border-line-bright"
          >
            <span
              className="absolute inset-x-0 top-0 h-[2px]"
              style={{ background: `linear-gradient(90deg, ${s.accent}, ${s.accent}00)` }}
              aria-hidden
            />
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] font-medium uppercase tracking-[0.16em] text-fog">{s.label}</span>
              <s.icon className="size-3.5" style={{ color: s.accent }} />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="metric-num text-[24px] font-medium leading-none text-ink">{s.value}</span>
              {s.unit && <span className="text-[11px] text-fog">{s.unit}</span>}
            </div>
            <div className="mt-1.5 text-[10.5px] text-fog/80">{s.hint}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <section className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[13px] font-medium text-ink">{t("dash.trend")}</h2>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-fog">
              {t("dash.trendLast", { count: trend.length })}
            </span>
          </div>
          <div className="mt-4">
            <SessionTrend data={trend} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-fog">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-brand-soft" /> {t("dash.legend.overall")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-aqua" /> {t("dash.legend.confidence")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-mint" /> {t("dash.legend.leadership")}
            </span>
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-ink">{t("dash.pillars")}</h2>
            <Crown className="size-3.5 text-fog/60" />
          </div>
          <div className="mt-4 space-y-3">
            {pillarAvg.map((p) => (
              <div key={p.key}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] text-mist">
                    <p.icon className="size-3 text-fog" /> {p.label}
                  </span>
                  <span className="metric-num text-[11px]" style={{ color: toneFor(p.value).hex }}>
                    {p.value}
                  </span>
                </div>
                <Bar value={p.value} tone={p.color} height={4} />
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-line/70 bg-white/[0.015] p-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-fog">{t("dash.focus")}</div>
            <p className="pretty mt-1 text-[11.5px] leading-relaxed text-mist">
              {t("dash.focusBody", { pillar: weakest.label, value: weakest.value })}
            </p>
          </div>
        </section>
      </div>

      <LoadMore initialSessions={firstPage} total={total} pageSize={50} />

      <SiteFooter />
    </div>
  );
}
