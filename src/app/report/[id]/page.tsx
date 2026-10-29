import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  Activity,
  ChevronLeft,
  Clock,
  Crown,
  Eye,
  Gauge,
  Hand,
  Mic,
  Quote,
  Smile,
  Sparkles,
  TriangleAlert,
} from "@/components/icons";
import { ReportActions } from "@/components/report/actions";
import { ProfileRadar, TimelineChart } from "@/components/report/charts";
import { SiteFooter } from "@/components/site/footer";
import { Bar, Pill, ScoreRing, cn, scoreLabel, toneFor } from "@/components/ui";
import { EMOTION_META } from "@/lib/analysis/emotion";
import { formatClock, formatDuration } from "@/lib/math";
import { getSession, getSharedSession } from "@/lib/store";
import { planFor } from "@/lib/plans";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/auth";
import type { SessionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ share?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { share } = await searchParams;
  const user = await getCurrentUser();
  const session = (await getSession(id, user?.id ?? null)) ?? (await getSharedSession(id, share));
  // `generateMetadata` resolves before the response starts streaming, so
  // notFound() here produces a genuine 404 status. Calling it only from the
  // page body would emit 200 + the not-found UI once streaming had begun.
  if (!session) notFound();
  return {
    title: `${session.title} — ${session.report.grade}`,
    description: `${session.speaker} scored ${session.report.overall}/100 (${session.report.gradeLabel}).`,
    // A shared report is a person's data: never index it, even by accident.
    robots: { index: session.source === "demo", follow: false },
  };
}

const MODE_LABEL_KEY = {
  practice: "studio.mode.practice",
  presentation: "studio.mode.presentation",
  interview: "studio.mode.interview",
} as const;

function PanelHead({ title, hint, icon: Icon }: { title: string; hint?: string; icon?: typeof Eye }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-3.5 text-brand-soft" />}
        <h2 className="text-[13px] font-medium text-ink">{title}</h2>
      </div>
      {hint && <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-fog">{hint}</span>}
    </div>
  );
}

function MetricRow({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/50 py-2 last:border-0">
      <span className="text-[11.5px] text-fog">{label}</span>
      <span className="text-right">
        <span className="metric-num text-[12.5px] text-ink">{value}</span>
        {hint && <span className="ml-1.5 text-[10px] text-fog/70">{hint}</span>}
      </span>
    </div>
  );
}

function HighlightedTranscript({ session }: { session: SessionRecord }) {
  const { transcript, fillers } = session.report.speech;
  if (!transcript) {
    return (
      <p className="text-[12px] leading-relaxed text-fog">
        No transcript was captured for this session. Speech recognition is only available in Chromium
        browsers, and the acoustic engine still scored pace and pauses from the raw audio.
      </p>
    );
  }
  const words = fillers.map((f) => f.word).filter(Boolean);
  if (!words.length) return <p className="text-[12.5px] leading-relaxed text-mist">{transcript}</p>;

  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  const parts = transcript.split(pattern);
  const fillerSet = new Set(words.map((w) => w.toLowerCase()));

  return (
    <p className="text-[12.5px] leading-[1.75] text-mist">
      {parts.map((part, i) =>
        i % 2 === 1 && fillerSet.has(part.toLowerCase()) ? (
          <mark key={i} className="rounded bg-rose/15 px-1 py-0.5 text-rose">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ share?: string }>;
}) {
  const { id } = await params;
  const { share } = await searchParams;
  const { t, locale } = await getI18n();
  // Sample reports are public marketing material; a live report belongs to the
  // account that recorded it. A share link — owner-issued, time-boxed and
  // revocable — is the only other way in. An anonymous visitor sees "not found"
  // rather than a redirect, so a shared link never leaks whether a report exists.
  const user = await getCurrentUser();
  const record =
    (await getSession(id, user?.id ?? null)) ?? (await getSharedSession(id, share));
  if (!record) {
    notFound();
    throw new Error("unreachable");
  }

  const session: SessionRecord = record;
  const canManage = Boolean(user) && session.ownerId === user?.id;
  const canExportCsv = Boolean(user) && planFor(user?.plan).csvExport;

  const r = session.report;
  const tone = toneFor(r.overall);
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  const lowest = r.timeline.length
    ? r.timeline.reduce((min, p) => (p.confidence < min.confidence ? p : min), r.timeline[0])
    : null;
  const highest = r.timeline.length
    ? r.timeline.reduce((max, p) => (p.confidence > max.confidence ? p : max), r.timeline[0])
    : null;

  const pillarRows = [
    { label: "Eye contact", value: r.pillars.eyeContact, icon: Eye, hint: `${r.face.eyeContactPct}% lens time` },
    { label: "Posture", value: r.pillars.posture, icon: Activity, hint: `${r.pose.avgLeanDeg}° avg lean` },
    { label: "Gestures", value: r.pillars.gestures, icon: Hand, hint: `${r.gesture.gestureRatePerMin}/min` },
    { label: "Voice", value: r.pillars.voice, icon: Mic, hint: `${r.voice.avgWpm || "—"} wpm` },
    { label: "Expression", value: r.pillars.expression, icon: Smile, hint: `${r.face.smilePct}% smiling` },
  ];

  return (
    <div className="container-page pb-10 pt-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[12px] text-fog transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" /> {t("report.back")}
        </Link>
        <ReportActions session={session} canManage={canManage} canExportCsv={canExportCsv} />
      </div>

      {/* ---------------------------------- hero ---------------------------------- */}
      <section className="panel mt-4 overflow-hidden">
        <div className="flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-center lg:gap-8">
          <div className="flex items-center gap-4 sm:gap-5">
            <ScoreRing value={r.overall} size={128} stroke={9} label={t("metric.overall")} className="sm:hidden" />
            <ScoreRing value={r.overall} size={148} stroke={10} label={t("metric.overall")} className="max-sm:hidden" />
            <div className="lg:hidden">
              <div className="metric-num text-2xl font-medium" style={{ color: tone.hex }}>
                {r.grade}
              </div>
              <div className="text-[12px] text-mist">{r.gradeLabel}</div>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">{t("report.eyebrow")}</span>
              <span className="text-fog/30">/</span>
              <Pill tone={session.source === "demo" ? "brand" : "neutral"} className="!py-0.5">
                {session.source === "demo" ? t("report.sampleBadge") : t(MODE_LABEL_KEY[session.mode])}
              </Pill>
            </div>
            <h1 className="mt-2 text-balance text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[30px]">
              {session.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-fog">
              <span className="text-mist">{session.speaker}</span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" /> {fmtDate(session.createdAt)}
              </span>
              <span className="flex items-center gap-1">
                <Gauge className="size-3" /> {t("report.analysed", { time: formatDuration(session.durationSec) })}
              </span>
            </div>
            <p className="pretty mt-3 max-w-2xl text-[12.5px] leading-relaxed text-fog">{r.summary}</p>
            <p className="mt-2 text-[10.5px] leading-relaxed text-fog/70">
              <span className="text-mist">{t("report.rubric", { name: r.rubric?.label ?? session.mode })}</span>
              {r.rubric ? ` — ${r.rubric.summary}` : " — scored on the practice rubric."}
            </p>
          </div>

          <div className="hidden shrink-0 flex-col items-end gap-1 lg:flex">
            <div className="metric-num text-[44px] font-medium leading-none" style={{ color: tone.hex }}>
              {r.grade}
            </div>
            <div className="text-[12.5px] font-medium text-ink">{r.gradeLabel}</div>
            <div className="text-[10.5px] uppercase tracking-[0.16em] text-fog">
              {scoreLabel(r.overall)} delivery
            </div>
          </div>
        </div>

        <div
          className={cn(
            // Hairline stat grid: 2 columns on phones, 4 from lg. The nth-child
            // rules draw interior rules only, so no stray edge border appears.
            "grid grid-cols-2 border-t border-line/60 lg:grid-cols-4",
            "[&>*]:border-line/60",
            "[&>*:nth-child(even)]:border-l",
            "[&>*:nth-child(n+3)]:border-t",
            "lg:[&>*]:border-l lg:[&>*:first-child]:border-l-0 lg:[&>*:nth-child(n+3)]:border-t-0",
          )}
        >
          {[
            { label: t("metric.confidence"), value: r.pillars.confidence },
            { label: t("metric.leadership"), value: r.pillars.leadership },
            { label: t("metric.communication"), value: r.pillars.communication },
            { label: t("metric.engagement"), value: r.pillars.engagement },
          ].map((s) => (
            <div key={s.label} className="px-4 py-3.5 sm:px-5">
              <div className="text-[9.5px] font-medium uppercase tracking-[0.16em] text-fog">{s.label}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="metric-num text-[19px] leading-none text-ink">{s.value}</span>
                <span className="text-[10px] text-fog">/100</span>
              </div>
              <Bar value={s.value} height={3} className="mt-2" />
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------ profile + pillars ------------------------------ */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">        <section className="panel p-5">
          <PanelHead title={t("report.profile")} hint={t("report.profileHint")} icon={Activity} />
          <ProfileRadar pillars={r.pillars} />
          <p className="mt-1 text-center text-[10.5px] text-fog/70">{t("report.profileNote")}</p>
        </section>

        <section className="panel p-5">
          <PanelHead title={t("report.pillars")} hint={t("report.pillarsHint")} icon={Gauge} />
          <div className="mt-4 space-y-3.5">
            {pillarRows.map((p) => (
              <div key={p.label}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11.5px] text-mist">
                    <p.icon className="size-3.5 text-fog" /> {p.label}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="text-[10px] text-fog/70">{p.hint}</span>
                    <span className="metric-num text-[12.5px]" style={{ color: toneFor(p.value).hex }}>
                      {p.value}
                    </span>
                  </span>
                </div>
                <Bar value={p.value} height={5} />
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-line/70 bg-white/[0.015] p-3">
            <p className="font-mono text-[10px] leading-relaxed text-fog">
              confidence = 0.30·eye + 0.25·posture + 0.20·gestures + 0.15·voice + 0.10·expression
            </p>
          </div>
        </section>
      </div>

      {/* --------------------------------- timeline --------------------------------- */}
      <section className="panel mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PanelHead
            title={t("report.timeline")}
            hint={t("report.perSecond", { time: formatClock(session.durationSec) })}
            icon={Gauge}
          />
          <div className="flex items-center gap-3 text-[10px] text-fog">
            {lowest && (
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-rose" />{" "}
                {t("report.low", { value: lowest.confidence, time: formatClock(lowest.t) })}
              </span>
            )}
            {highest && (
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-mint" />{" "}
                {t("report.peak", { value: highest.confidence, time: formatClock(highest.t) })}
              </span>
            )}
          </div>
        </div>
        <div className="mt-4">
          <TimelineChart timeline={r.timeline} />
        </div>
      </section>

      {/* --------------------------- strengths / improvements --------------------------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-md border border-mint/30 bg-mint/10 text-mint">
              <Sparkles className="size-3" />
            </span>
            <h2 className="text-[13px] font-medium text-ink">{t("report.working")}</h2>
            <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.16em] text-fog">{t("report.keep")}</span>
          </div>
          <div className="mt-4 space-y-2.5">
            {r.strengths.length === 0 && (
              <p className="text-[12px] leading-relaxed text-fog">{t("report.workingEmpty")}</p>
            )}
            {r.strengths.map((s, i) => (
              <div key={`${s.title}-${i}`} className="rounded-xl border border-mint/15 bg-mint/[0.045] px-3.5 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-medium text-ink">{s.title}</span>
                </div>
                <p className="pretty mt-1 text-[11.5px] leading-relaxed text-fog">{s.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-md border border-amber/30 bg-amber/10 text-amber">
              <TriangleAlert className="size-3" />
            </span>
            <h2 className="text-[13px] font-medium text-ink">{t("report.costing")}</h2>
            <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.16em] text-fog">
              {t("report.fixNext")}
            </span>
          </div>
          <div className="mt-4 space-y-2.5">
            {r.improvements.map((s, i) => (
              <div key={`${s.title}-${i}`} className="rounded-xl border border-amber/15 bg-amber/[0.045] px-3.5 py-3">
                <div className="text-[12.5px] font-medium text-ink">{s.title}</div>
                <p className="pretty mt-1 text-[11.5px] leading-relaxed text-fog">{s.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ------------------------------- detail metrics ------------------------------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="panel p-5">
          <PanelHead title="Gaze & face" hint="vision" icon={Eye} />
          <div className="mt-2">
            <MetricRow label="Eye contact" value={`${r.face.eyeContactPct}%`} />
            <MetricRow label="Gaze breaks" value={r.face.gazeAwayCount} hint={`avg ${r.face.avgGazeAwaySec}s`} />
            <MetricRow label="Blink rate" value={`${r.face.blinkRatePerMin}/min`} />
            <MetricRow label="Smiling" value={`${r.face.smilePct}%`} />
            <MetricRow label="Expression range" value={r.face.expressionVariety} hint="/100" />
            <MetricRow label="Head stability" value={`${r.face.headStabilityPct}%`} />
            <MetricRow label="Face visible" value={`${r.face.faceVisiblePct}%`} />
          </div>
        </section>

        <section className="panel p-5">
          <PanelHead title="Posture & movement" hint="pose" icon={Activity} />
          <div className="mt-2">
            <MetricRow label="Alignment" value={r.pose.alignmentScore} hint="/100" />
            <MetricRow label="Upright" value={`${r.pose.uprightPct}%`} />
            <MetricRow label="Average lean" value={`${r.pose.avgLeanDeg}°`} />
            <MetricRow label="Shoulder slope" value={`${r.pose.avgShoulderSlopeDeg}°`} />
            <MetricRow label="Head over shoulders" value={`${r.pose.headOverShouldersPct}%`} />
            <MetricRow label="Sway index" value={r.pose.swayIndex} hint="/100" />
            <MetricRow label="Hands visible" value={`${r.gesture.handsVisiblePct}%`} />
            <MetricRow label="Gesture openness" value={r.gesture.avgOpenness} hint="ratio" />
          </div>
        </section>

        <section className="panel p-5">
          <PanelHead title="Voice & rhythm" hint="audio" icon={Mic} />
          <div className="mt-2">
            <MetricRow label="Speaking rate" value={r.voice.avgWpm || "—"} hint="wpm" />
            <MetricRow
              label="Pace source"
              value={r.voice.paceSource === "transcript" ? "transcript" : "acoustic"}
            />
            <MetricRow label="Speaking time" value={`${r.voice.speakingTimePct}%`} />
            <MetricRow label="Volume consistency" value={r.voice.volumeConsistency} hint="/100" />
            <MetricRow label="Pitch variation" value={`${r.voice.pitchVariation} st`} />
            <MetricRow label="Pauses" value={r.voice.pauseCount} hint={`${r.voice.longPauseCount} long`} />
            <MetricRow label="Avg pause" value={`${r.voice.avgPauseSec}s`} />
            <MetricRow label="Filler rate" value={`${r.speech.fillerRate}/100w`} />
          </div>
        </section>
      </div>

      {/* --------------------------- emotion + benchmark --------------------------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="panel p-5">
          <PanelHead title="Emotional read" hint="52 blendshapes" icon={Smile} />
          <div className="mt-4 space-y-2.5">
            {Object.entries(r.emotions)
              .sort((a, b) => b[1] - a[1])
              .map(([key, value]) => {
                const meta = EMOTION_META[key as keyof typeof EMOTION_META];
                return (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] text-mist">{meta.label}</span>
                      <span className="metric-num text-[11px] text-fog">{value}%</span>
                    </div>
                    <Bar value={value * 2.2} tone={meta.color} height={4} />
                  </div>
                );
              })}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-fog">
            Dominant state: <span className="text-ink">{EMOTION_META[r.dominantEmotion].label}</span>. A
            neutral or slightly warm baseline reads as credible; long stretches of tension or fear read as
            discomfort on camera.
          </p>
        </section>

        <section className="panel p-5">
          <PanelHead title="You vs. the room" hint="benchmark" icon={Crown} />
          <div className="mt-4 space-y-3">
            {r.benchmark.map((b) => (
              <div key={b.metric}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] text-mist">{b.metric}</span>
                  <span className="metric-num text-[10.5px] text-fog">
                    <span className="text-ink">{b.you}</span> vs {b.average}
                  </span>
                </div>
                <div className="space-y-1">
                  <Bar value={b.you} height={4} tone={toneFor(b.you).hex} />
                  <Bar value={b.average} height={2} tone="#3f3f52" />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[10.5px] leading-relaxed text-fog/80">
            Benchmarks are reference bands drawn from typical untrained speakers — directional context, not
            a competitive ranking.
          </p>
        </section>
      </div>

      {/* ------------------------------- transcript ------------------------------- */}
      <section className="panel mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PanelHead title="Transcript & filler words" hint={`${r.speech.wordCount} words`} icon={Quote} />
          <div className="flex flex-wrap gap-1.5">
            {r.speech.fillers.length === 0 ? (
              <Pill tone="good">no fillers detected</Pill>
            ) : (
              r.speech.fillers.map((f) => (
                <span
                  key={f.word}
                  className="inline-flex items-center gap-1 rounded-full border border-rose/25 bg-rose/10 px-2 py-0.5 text-[10.5px] text-rose"
                >
                  {f.word}
                  <span className="metric-num text-[9.5px] opacity-70">×{f.count}</span>
                </span>
              ))
            )}
          </div>
        </div>
        <div className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-line/70 bg-base/40 p-4">
          <HighlightedTranscript session={session} />
        </div>
      </section>

      {/* --------------------------------- plan --------------------------------- */}
      <section className="mt-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-brand-soft" />
          <h2 className="text-[13px] font-medium text-ink">Your next three drills</h2>
          <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.16em] text-fog">
            ordered by impact
          </span>
        </div>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {r.plan.map((action, i) => (
            <div key={action.title} className="panel flex flex-col p-5">
              <div className="flex items-center justify-between">
                <span className="metric-num text-[11px] text-brand-soft">0{i + 1}</span>
                <Pill className="!py-0.5 !text-[9.5px]">{action.target}</Pill>
              </div>
              <h3 className="mt-3 text-[13.5px] font-medium text-ink">{action.title}</h3>
              <p className="pretty mt-1.5 text-[11.5px] leading-relaxed text-fog">{action.why}</p>
              <div className="mt-3 rounded-lg border border-line/70 bg-white/[0.015] p-3">
                <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-fog">drill</div>
                <p className="pretty mt-1 text-[11.5px] leading-relaxed text-mist">{action.drill}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className={cn("mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/70 px-4 py-3")}>
        <p className="text-[11px] text-fog">
          Generated by the VisionSpeak behavioural engine · {r.timeline.length} one-second samples ·{" "}
          {session.source === "demo" ? "sample dataset" : "live capture"}
        </p>
        <Link href="/studio" className="text-[11.5px] font-medium text-brand-soft hover:text-brand">
          Run this again →
        </Link>
      </div>

      <SiteFooter />
    </div>
  );
}
