import Link from "next/link";
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
} from "@/components/icons";
import { SessionTrend, type SessionTrendPoint } from "@/components/dashboard/trends";
import { SiteFooter } from "@/components/site/footer";
import { Bar, ButtonLink, Pill, cn, scoreLabel, toneFor } from "@/components/ui";
import { formatDuration } from "@/lib/math";
import { listSessions } from "@/lib/store";
import { getCurrentUser, loginHref } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Practice history",
  description: "Session history, trends and pillar averages across every VisionSpeak analysis.",
};

const PILLARS = [
  { key: "eyeContact", label: "Eye contact", icon: Eye, color: "#34d399" },
  { key: "posture", label: "Posture", icon: Activity, color: "#a78bfa" },
  { key: "gestures", label: "Gestures", icon: Hand, color: "#22d3ee" },
  { key: "voice", label: "Voice", icon: Mic, color: "#fbbf24" },
  { key: "expression", label: "Expression", icon: Smile, color: "#fb7185" },
] as const;

const dayKey = (iso: string) => iso.slice(0, 10);
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(iso));

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

  const sessions = await listSessions(user.id);

  if (sessions.length === 0) {
    return (
      <div className="container-page pt-24">
        <div className="panel grid place-items-center p-10 text-center sm:p-14">
          <span className="grid size-12 place-items-center rounded-2xl border border-brand/30 bg-brand/10 text-brand-soft">
            <Gauge className="size-5" />
          </span>
          <h1 className="mt-4 text-[20px] font-medium text-ink">No sessions yet</h1>
          <p className="pretty mt-2 max-w-sm text-[12.5px] leading-relaxed text-fog">
            Run your first analysis and this page becomes a record of every habit you fixed.
          </p>
          <ButtonLink href="/studio" className="mt-5">
            <Plus className="size-3.5" /> Start a session
          </ButtonLink>
        </div>
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

  const pillarAvg = PILLARS.map((p) => ({
    ...p,
    value: Math.round(sessions.reduce((acc, s) => acc + s.report.pillars[p.key], 0) / sessions.length),
  })).sort((a, b) => b.value - a.value);

  const weakest = pillarAvg[pillarAvg.length - 1];
  const strongest = pillarAvg[0];

  const stats = [
    { label: "Sessions analysed", value: sessions.length, unit: "", icon: Gauge, hint: `${weekCount} in the last 7 days` },
    { label: "Time on the record", value: formatDuration(totalSec), unit: "", icon: Clock, hint: "total speaking analysed" },
    { label: "Best overall", value: best, unit: "/100", icon: Award, hint: scoreLabel(best) + " delivery" },
    { label: "7-day average", value: weekAvg, unit: "/100", icon: TrendingUp, hint: `${avgOverall} lifetime` },
  ];

  return (
    <div className="container-page pb-10 pt-24">
      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="eyebrow">Dashboard</div>
          <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-ink sm:text-[32px]">
            Practice history
          </h1>
          <p className="mt-1.5 text-[12.5px] text-fog sm:text-[13px]">
            {sessions.length} sessions · {formatDuration(totalSec)} of analysed speaking
            {streak > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber">
                <Flame className="size-3" /> {streak}-day streak
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="brand">
            <Sparkles className="size-3" /> {scoreLabel(avgOverall)} baseline
          </Pill>
          <ButtonLink href="/studio" size="md" className="flex-1 sm:flex-none">
            <Plus className="size-3.5" /> New session
          </ButtonLink>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="panel p-4">
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] font-medium uppercase tracking-[0.16em] text-fog">{s.label}</span>
              <s.icon className="size-3.5 text-fog/60" />
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
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-ink">Score trend</h2>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-fog">
              last {trend.length} sessions
            </span>
          </div>
          <div className="mt-4">
            <SessionTrend data={trend} />
          </div>          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-fog">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-brand-soft" /> Overall
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-aqua" /> Confidence
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-mint" /> Leadership
            </span>
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-ink">Pillar averages</h2>
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
            <div className="text-[10px] uppercase tracking-[0.14em] text-fog">Focus next</div>
            <p className="pretty mt-1 text-[11.5px] leading-relaxed text-mist">
              <span className="text-ink">{weakest.label}</span> is your softest pillar at {weakest.value}.
              Your <span className="text-ink">{strongest.label}</span> ({strongest.value}) can carry a lot —
              fix the weakest and the composite moves fastest.
            </p>
          </div>
        </section>
      </div>

      <section className="panel mt-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-[13px] font-medium text-ink">Recent sessions</h2>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-fog">
            newest first
          </span>
        </div>

        <div className="hidden grid-cols-[1.8fr_repeat(3,0.5fr)_0.6fr_auto] gap-4 border-y border-line/60 px-5 py-2 text-[9.5px] font-medium uppercase tracking-[0.14em] text-fog lg:grid">
          <span>Session</span>
          <span className="text-right">Conf.</span>
          <span className="text-right">Lead.</span>
          <span className="text-right">Comms</span>
          <span className="text-right">Grade</span>
          <span className="w-6" />
        </div>

        <div className="divide-y divide-line/50">
          {sessions.map((s) => {
            const r = s.report;
            return (
              <Link
                key={s.id}
                href={`/report/${s.id}`}
                className={cn(
                  "grid gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.02]",
                  "lg:grid-cols-[1.8fr_repeat(3,0.5fr)_0.6fr_auto] lg:items-center lg:gap-4",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-ink">{s.title}</span>
                    {s.source === "demo" && (
                      <span className="rounded border border-brand/25 bg-brand/10 px-1.5 py-0.5 text-[8.5px] uppercase tracking-[0.1em] text-brand-soft">
                        sample
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-fog">
                    <span>{shortDate(s.createdAt)}</span>
                    <span className="text-fog/40">·</span>
                    <span>{s.speaker}</span>
                    <span className="text-fog/40">·</span>
                    <span className="capitalize">{s.mode}</span>
                    <span className="text-fog/40">·</span>
                    <span>{formatDuration(s.durationSec)}</span>
                  </div>
                </div>

                {[r.pillars.confidence, r.pillars.leadership, r.pillars.communication].map((v, i) => (
                  <div key={i} className="hidden text-right lg:block">
                    <span className="metric-num text-[12px] text-mist">{v}</span>
                  </div>
                ))}

                <div className="flex items-center gap-2 lg:justify-end">
                  <span
                    className="metric-num rounded-md border px-1.5 py-0.5 text-[10.5px]"
                    style={{
                      color: toneFor(r.overall).hex,
                      borderColor: `${toneFor(r.overall).hex}44`,
                      background: `${toneFor(r.overall).hex}12`,
                    }}
                  >
                    {r.grade} {r.overall}
                  </span>
                </div>

                <ArrowRight className="hidden size-3.5 text-fog/50 lg:block" />
              </Link>
            );
          })}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
