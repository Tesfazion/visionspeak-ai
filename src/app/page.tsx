import React from "react";
import { ArrowRight, Check, Eye, Gauge, Hand, Mic, Shield, Smile, Sparkles, Target, Video, Waves, Zap } from "@/components/icons";
import { buildDemoAggregate } from "@/lib/analysis/demo";
import { Reveal } from "@/components/site/motion";
import { SiteFooter } from "@/components/site/footer";
import { Bar, ButtonLink, Pill, ScoreRing, SectionHeading, cn } from "@/components/ui";
import { TrendPreview } from "@/components/landing/trend-preview";
import { getI18n } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n";

/**
 * Public landing page.
 *
 * Rules this page follows, and the reason it reads the way it does:
 *   1. Outcomes only. No library, framework or model name appears here — those
 *      live in README.md, where a developer is the reader.
 *   2. Every sentence is translated. Copy comes from `src/lib/i18n`, never from
 *      a literal in this file.
 *   3. Nothing claims a capability the product does not have.
 */
const demo = buildDemoAggregate();
const trendData = demo.timeline
  .filter((_, i) => i % 8 === 0)
  .map((p) => ({ t: p.t, confidence: p.confidence, engagement: p.engagement, leadership: p.leadership }));

const SIGNALS: { icon: typeof Eye; title: MessageKey; copy: MessageKey; metric: MessageKey; accent: string }[] = [
  { icon: Eye, title: "landing.signal.eye.title", copy: "landing.signal.eye.copy", metric: "landing.signal.eye.metric", accent: "#34d399" },
  { icon: Target, title: "landing.signal.posture.title", copy: "landing.signal.posture.copy", metric: "landing.signal.posture.metric", accent: "#a78bfa" },
  { icon: Hand, title: "landing.signal.gestures.title", copy: "landing.signal.gestures.copy", metric: "landing.signal.gestures.metric", accent: "#22d3ee" },
  { icon: Mic, title: "landing.signal.voice.title", copy: "landing.signal.voice.copy", metric: "landing.signal.voice.metric", accent: "#fbbf24" },
  { icon: Smile, title: "landing.signal.expression.title", copy: "landing.signal.expression.copy", metric: "landing.signal.expression.metric", accent: "#fb7185" },
  { icon: Waves, title: "landing.signal.presence.title", copy: "landing.signal.presence.copy", metric: "landing.signal.presence.metric", accent: "#7c5cff" },
];

const STEPS: { n: string; title: MessageKey; copy: MessageKey; icon: typeof Video }[] = [
  { n: "01", title: "landing.step.one.title", copy: "landing.step.one.copy", icon: Video },
  { n: "02", title: "landing.step.two.title", copy: "landing.step.two.copy", icon: Gauge },
  { n: "03", title: "landing.step.three.title", copy: "landing.step.three.copy", icon: Sparkles },
];

const WEIGHTS: { label: MessageKey; weight: number; color: string }[] = [
  { label: "metric.eyeContact", weight: 30, color: "#34d399" },
  { label: "metric.posture", weight: 25, color: "#a78bfa" },
  { label: "metric.gestures", weight: 20, color: "#22d3ee" },
  { label: "metric.voice", weight: 15, color: "#fbbf24" },
  { label: "metric.expression", weight: 10, color: "#fb7185" },
];

const USE_CASES: { title: MessageKey; copy: MessageKey }[] = [
  { title: "landing.usecase.one.title", copy: "landing.usecase.one.copy" },
  { title: "landing.usecase.two.title", copy: "landing.usecase.two.copy" },
  { title: "landing.usecase.three.title", copy: "landing.usecase.three.copy" },
  { title: "landing.usecase.four.title", copy: "landing.usecase.four.copy" },
];

const EVIDENCE: { title: MessageKey; copy: MessageKey }[] = [
  { title: "landing.evidence.one", copy: "landing.evidence.oneCopy" },
  { title: "landing.evidence.two", copy: "landing.evidence.twoCopy" },
  { title: "landing.evidence.three", copy: "landing.evidence.threeCopy" },
  { title: "landing.evidence.four", copy: "landing.evidence.fourCopy" },
];

function FaceMeshGlyph() {
  const outer = Array.from({ length: 30 }, (_, i) => {
    const a = (i / 30) * Math.PI * 2 - Math.PI / 2;
    return { x: 100 + Math.cos(a) * 54, y: 116 + Math.sin(a) * 70 };
  });
  const inner = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    return { x: 100 + Math.cos(a) * 26, y: 92 + Math.sin(a) * 30 };
  });

  return (
    <svg viewBox="0 0 200 240" className="h-full w-full" aria-hidden>
      <g stroke="rgba(167,139,250,0.22)" strokeWidth="0.7">
        {outer.map((p, i) => {
          const next = outer[(i + 1) % outer.length];
          return <line key={`o${i}`} x1={p.x} y1={p.y} x2={next.x} y2={next.y} />;
        })}
        {inner.map((p, i) => {
          const next = inner[(i + 1) % inner.length];
          return <line key={`i${i}`} x1={p.x} y1={p.y} x2={next.x} y2={next.y} />;
        })}
        {outer.map((p, i) => (
          <line
            key={`s${i}`}
            x1={p.x}
            y1={p.y}
            x2={inner[i % inner.length].x}
            y2={inner[i % inner.length].y}
          />
        ))}
      </g>
      {outer.map((p, i) => (
        <circle key={`od${i}`} cx={p.x} cy={p.y} r={1.6} fill="rgba(167,139,250,0.75)" />
      ))}
      {inner.map((p, i) => (
        <circle key={`id${i}`} cx={p.x} cy={p.y} r={1.2} fill="rgba(34,211,238,0.6)" />
      ))}
      <ellipse cx="76" cy="104" rx="16" ry="7" fill="none" stroke="rgba(52,211,153,0.85)" strokeWidth="1.4" />
      <ellipse cx="124" cy="104" rx="16" ry="7" fill="none" stroke="rgba(52,211,153,0.85)" strokeWidth="1.4" />
      <circle cx="76" cy="104" r="3.4" fill="#34d399" />
      <circle cx="124" cy="104" r="3.4" fill="#34d399" />
      <path d="M82 152c6 5 14 7 18 7s12-2 18-7" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
      <path d="M100 112v22l-6 6" fill="none" stroke="rgba(167,139,250,0.35)" strokeWidth="0.9" />
    </svg>
  );
}

export default async function LandingPage() {
  const { t } = await getI18n();

  return (
    <>
      {/* ============================== HERO ============================== */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 grid-lines opacity-70" />
        <div
          className="pointer-events-none absolute -left-40 top-10 h-[32rem] w-[32rem] rounded-full blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(124,92,255,0.28), transparent 65%)" }}
        />
        <div
          className="pointer-events-none absolute -right-32 top-40 h-[26rem] w-[26rem] rounded-full blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(34,211,238,0.18), transparent 65%)" }}
        />

        <div className="container-page relative grid items-center gap-10 pb-16 pt-24 sm:gap-14 sm:pb-20 sm:pt-28 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10 lg:pt-32 2xl:gap-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] py-1 pl-1 pr-3.5 backdrop-blur">
              <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-soft">
                {t("common.new")}
              </span>
              <span className="text-[12px] text-mist">{t("landing.badge")}</span>
            </div>

            <h1 className="mt-6 text-balance text-[32px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[52px] sm:leading-[0.99] lg:text-[62px] 2xl:text-[68px]">
              {t("landing.heroTitleA")}{" "}
              <span className="font-display italic text-transparent [background:linear-gradient(92deg,#a78bfa,#ffffff_45%,#67e8f9)] [-webkit-background-clip:text] [background-clip:text]">
                {t("landing.heroTitleAccent")}
              </span>
              {t("landing.heroTitleB")}
            </h1>

            <p className="pretty mt-5 max-w-[36rem] text-[14.5px] leading-relaxed text-fog sm:mt-6 sm:text-[16px]">
              {t("landing.heroCopy")}
            </p>

            <div className="mt-7 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <ButtonLink href="/studio" size="lg" className="group w-full sm:w-auto">
                {t("landing.cta.start")}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </ButtonLink>
              <ButtonLink href="/report/demo" size="lg" variant="outline" className="w-full sm:w-auto">
                {t("landing.cta.sample")}
              </ButtonLink>
            </div>

            <ul className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-fog sm:mt-8 sm:gap-x-6">
              {[
                { icon: Shield, label: t("landing.trust.private") },
                { icon: Zap, label: t("landing.trust.live") },
                { icon: Check, label: t("landing.trust.browsers") },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-1.5">
                  <item.icon className="size-3.5 text-mint/80" />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          {/* ---------------------------- live preview ---------------------------- */}
          <div className="relative">
            <div
              className="absolute inset-x-6 -top-6 h-40 rounded-[2rem] blur-2xl"
              style={{ background: "radial-gradient(ellipse at center, rgba(124,92,255,0.35), transparent 70%)" }}
            />
            <div className="panel relative overflow-hidden p-3">
              <div className="flex items-center justify-between px-2 pb-3 pt-1">
                <div className="flex items-center gap-2">
                  <span className="relative flex size-2">
                    <span className="absolute inset-0 animate-pulse-ring rounded-full bg-rose" />
                    <span className="relative size-2 rounded-full bg-rose" />
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fog">
                    {t("landing.preview.live")}
                  </span>
                </div>
                <span className="metric-num text-[11px] text-mist">04:12</span>
              </div>

              <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line/80 bg-[radial-gradient(120%_100%_at_50%_0%,#161227_0%,#0a0912_55%,#08070d_100%)]">
                <div className="absolute inset-0 opacity-90">
                  <div className="absolute inset-x-0 top-0 h-full w-full p-6">
                    <FaceMeshGlyph />
                  </div>
                </div>
                <div className="absolute inset-0 noise-overlay opacity-[0.05]" />
                <div className="absolute inset-x-0 top-0 h-24 animate-scan bg-gradient-to-b from-transparent via-aqua/[0.07] to-transparent" />

                {[
                  "left-4 top-4 border-l border-t",
                  "right-4 top-4 border-r border-t",
                  "left-4 bottom-4 border-b border-l",
                  "right-4 bottom-4 border-b border-r",
                ].map((cls) => (
                  <span key={cls} className={cn("absolute size-6 border-white/25", cls)} />
                ))}

                <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-mint/30 bg-mint/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-mint">
                  <span className="size-1 rounded-full bg-mint" />
                  {t("landing.preview.onLens")}
                </div>

                <div className="absolute right-3 top-3 rounded-2xl border border-line bg-base/70 p-2 backdrop-blur">
                  <ScoreRing value={87} size={92} stroke={7} label={t("landing.preview.confidence")} />
                </div>

                <div className="absolute inset-x-3 bottom-3 grid grid-cols-2 gap-2">
                  {[
                    { label: t("metric.eyeContact"), value: 83, color: "#34d399" },
                    { label: t("metric.posture"), value: 91, color: "#a78bfa" },
                    { label: t("metric.gestures"), value: 78, color: "#22d3ee" },
                    { label: t("metric.voice"), value: 84, color: "#fbbf24" },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="rounded-lg border border-line/80 bg-base/70 px-2.5 py-2 backdrop-blur"
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="text-[9px] uppercase tracking-[0.12em] text-fog">{m.label}</span>
                        <span className="metric-num text-[12px] text-ink">{m.value}</span>
                      </div>
                      <Bar value={m.value} tone={m.color} height={3} className="mt-1.5" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between px-2 pb-1 pt-3">
                <div className="flex items-center gap-2 text-[10px] text-fog">
                  <span className="chip !py-1 !text-[9px]">{t("metric.leadership").toUpperCase()} 85</span>
                  <span className="chip !py-1 !text-[9px]">{t("metric.engagement").toUpperCase()} 89</span>
                </div>
                <span className="font-mono text-[10px] text-fog">152 wpm</span>
              </div>
            </div>

            <div className="absolute -left-4 top-28 hidden animate-float rounded-xl border border-line bg-base/85 px-3 py-2 backdrop-blur md:block">
              <div className="text-[9px] uppercase tracking-[0.16em] text-fog">{t("landing.preview.posture")}</div>
              <div className="text-[12px] font-medium text-mint">{t("landing.preview.grounded")}</div>
            </div>
            <div className="absolute -right-3 bottom-24 hidden animate-float-slow rounded-xl border border-line bg-base/85 px-3 py-2 backdrop-blur md:block">
              <div className="text-[9px] uppercase tracking-[0.16em] text-fog">{t("landing.preview.coachNote")}</div>
              <div className="text-[12px] font-medium text-amber">{t("landing.preview.pause")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================== SIGNALS ============================== */}
      <section id="signals" className="container-page relative scroll-mt-24 py-14 sm:py-20">
        <Reveal>
          <SectionHeading
            eyebrow={t("landing.signals.eyebrow")}
            title={
              <>
                {t("landing.signals.title")}{" "}
                <span className="font-display italic text-brand-soft">{t("landing.signals.titleAccent")}</span>.
              </>
            }
            copy={t("landing.signals.copy")}
          />
        </Reveal>

        <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
          {SIGNALS.map((s, i) => (
            <Reveal key={s.title} delay={i * 60}>
              <article className="panel panel-hover group h-full p-5">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-xl border"
                    style={{
                      borderColor: `${s.accent}33`,
                      background: `linear-gradient(180deg, ${s.accent}1f, transparent)`,
                      color: s.accent,
                    }}
                  >
                    <s.icon className="size-[18px]" />
                  </span>
                  <span className="text-right font-mono text-[9px] uppercase leading-tight tracking-[0.14em] text-fog/60">
                    {t(s.metric)}
                  </span>
                </div>
                <h3 className="mt-4 text-[15px] font-medium text-ink">{t(s.title)}</h3>
                <p className="pretty mt-2 text-[13px] leading-relaxed text-fog">{t(s.copy)}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ============================== HOW ============================== */}
      <section id="platform" className="relative scroll-mt-24 border-y border-line/60 bg-white/[0.012]">
        <div className="container-page py-14 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12 2xl:gap-16">
            <Reveal>
              <div>
                <SectionHeading
                  align="left"
                  eyebrow={t("landing.how.eyebrow")}
                  title={
                    <>
                      {t("landing.how.titleA")}{" "}
                      <span className="font-display italic text-aqua">{t("landing.how.titleAccent")}</span>.
                    </>
                  }
                  copy={t("landing.how.copy")}
                />
                <div className="mt-8 flex flex-wrap gap-2">
                  <Pill tone="good">
                    <Shield className="size-3" /> {t("landing.how.pillPrivate")}
                  </Pill>
                  <Pill tone="brand">
                    <Sparkles className="size-3" /> {t("landing.how.pillRealtime")}
                  </Pill>
                  <Pill>
                    <Eye className="size-3" /> {t("landing.how.pillPrecise")}
                  </Pill>
                </div>
              </div>
            </Reveal>

            <div className="space-y-3">
              {STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 80}>
                  <div className="panel panel-hover flex gap-4 p-5 sm:gap-5">
                    <div className="flex flex-col items-center">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-brand/30 bg-brand/10 text-brand-soft">
                        <s.icon className="size-[18px]" />
                      </span>
                      {i < STEPS.length - 1 && <span className="mt-2 h-full w-px flex-1 bg-line" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] tracking-[0.2em] text-fog/60">{s.n}</span>
                        <h3 className="text-[15px] font-medium text-ink">{t(s.title)}</h3>
                      </div>
                      <p className="pretty mt-1.5 text-[13px] leading-relaxed text-fog">{t(s.copy)}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================== SCORING ============================== */}
      <section id="scoring" className="container-page relative scroll-mt-24 py-14 sm:py-20">
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-12 2xl:gap-16">
          <Reveal>
            <div>
              <SectionHeading
                align="left"
                eyebrow={t("landing.scoring.eyebrow")}
                title={
                  <>
                    {t("landing.scoring.title")}{" "}
                    <span className="font-display italic text-brand-soft">{t("landing.scoring.titleAccent")}</span>.
                  </>
                }
                copy={t("landing.scoring.copy")}
              />
              <div className="mt-7 overflow-x-auto rounded-xl border border-line/80 bg-base/50 p-4 font-mono text-[11px] leading-relaxed text-fog">
                <span className="text-brand-soft">confidence</span> ={" "}
                <span className="text-mint">0.30·eye</span> + <span className="text-mint">0.25·posture</span> +{" "}
                <span className="text-aqua">0.20·gestures</span> + <span className="text-amber">0.15·voice</span> +{" "}
                <span className="text-rose">0.10·expression</span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="panel p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-medium text-ink">{t("landing.scoring.composition")}</h3>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-fog">
                  {t("landing.scoring.weights")}
                </span>
              </div>
              <div className="mt-5 space-y-4">
                {WEIGHTS.map((w) => (
                  <div key={w.label}>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span className="text-[12px] text-mist">{t(w.label)}</span>
                      <span className="metric-num text-[12px] text-fog">{w.weight}%</span>
                    </div>
                    <Bar value={w.weight * 3.33} tone={w.color} height={7} />
                  </div>
                ))}
              </div>
              <div className="mt-6 hairline" />
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { label: "0–40", copy: t("landing.scoring.band.low"), color: "#fb7185" },
                  { label: "41–70", copy: t("landing.scoring.band.mid"), color: "#fbbf24" },
                  { label: "71–100", copy: t("landing.scoring.band.high"), color: "#34d399" },
                ].map((b) => (
                  <div key={b.label} className="rounded-lg border border-line/70 px-2.5 py-2">
                    <div className="metric-num text-[11px]" style={{ color: b.color }}>
                      {b.label}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-fog">{b.copy}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================== PROGRESS ============================== */}
      <section className="relative border-y border-line/60 bg-white/[0.012]">
        <div className="container-page grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          <Reveal>
            <div>
              <SectionHeading
                align="left"
                eyebrow={t("landing.analytics.eyebrow")}
                title={
                  <>
                    {t("landing.analytics.title")}{" "}
                    <span className="font-display italic text-aqua">{t("landing.analytics.titleAccent")}</span>.
                  </>
                }
                copy={t("landing.analytics.copy")}
              />
              <ul className="mt-6 space-y-3">
                {[
                  t("landing.analytics.point1"),
                  t("landing.analytics.point2"),
                  t("landing.analytics.point3"),
                  t("landing.analytics.point4"),
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-[13px] text-mist">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-mint" />
                    {line}
                  </li>
                ))}
              </ul>
              <ButtonLink href="/dashboard" variant="outline" size="md" className="mt-7">
                {t("landing.cta.dashboard")}
                <ArrowRight className="size-3.5" />
              </ButtonLink>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="panel overflow-hidden p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
                <div>
                  <h3 className="text-[13px] font-medium text-ink">{t("landing.analytics.panelTitle")}</h3>
                  <p className="text-[11px] text-fog">{t("landing.analytics.panelSub")}</p>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1.5 text-fog">
                    <span className="size-1.5 rounded-full bg-brand-soft" /> {t("metric.confidence")}
                  </span>
                  <span className="flex items-center gap-1.5 text-fog">
                    <span className="size-1.5 rounded-full bg-aqua" /> {t("metric.engagement")}
                  </span>
                </div>
              </div>
              <TrendPreview data={trendData} />
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber/25 bg-amber/[0.07] px-3 py-2">
                <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-amber" />
                <p className="text-[11px] leading-snug text-amber/90">{t("landing.analytics.insight")}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================== REPORT PREVIEW ============================== */}
      <section className="container-page relative py-14 sm:py-20">
        <Reveal>
          <SectionHeading
            eyebrow={t("landing.report.eyebrow")}
            title={
              <>
                {t("landing.report.title")}{" "}
                <span className="font-display italic text-mint">{t("landing.report.titleAccent")}</span>.
              </>
            }
            copy={t("landing.report.copy")}
          />
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-10 grid gap-4 sm:mt-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="panel flex flex-col items-center justify-center p-6 text-center sm:p-8">
              <ScoreRing value={85} size={172} stroke={11} label={t("metric.overall")} />
              <div className="mt-5 flex items-center gap-2">
                <Pill tone="good">A</Pill>
                <span className="text-[14px] font-medium text-ink">{t("landing.report.grade")}</span>
              </div>
              <p className="pretty mt-3 max-w-sm text-[12px] leading-relaxed text-fog">{t("landing.report.blurb")}</p>
              <div className="mt-6 grid w-full grid-cols-3 gap-2">
                {[
                  { k: t("metric.confidence"), v: 84 },
                  { k: t("metric.leadership"), v: 85 },
                  { k: t("metric.communication"), v: 86 },
                ].map((s) => (
                  <div key={s.k} className="rounded-lg border border-line/70 py-2">
                    <div className="metric-num text-[15px] text-ink">{s.v}</div>
                    <div className="mt-0.5 text-[9px] uppercase leading-tight tracking-[0.12em] text-fog">
                      {s.k}
                    </div>
                  </div>
                ))}
              </div>
              <ButtonLink href="/report/demo" size="md" variant="subtle" className="mt-6 w-full">
                {t("landing.cta.fullReport")}
                <ArrowRight className="size-3.5" />
              </ButtonLink>
            </div>

            <div className="space-y-3">
              <div className="panel p-5">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-mint">
                  <Check className="size-3.5" /> {t("landing.report.strengths")}
                </div>
                <div className="mt-3 space-y-3">
                  {[
                    [t("landing.report.strength1"), t("landing.report.strength1Copy")],
                    [t("landing.report.strength2"), t("landing.report.strength2Copy")],
                  ].map(([title, copy]) => (
                    <div key={title} className="rounded-lg border border-line/70 bg-white/[0.015] px-3 py-2.5">
                      <div className="text-[12.5px] font-medium text-ink">{title}</div>
                      <div className="mt-0.5 text-[11.5px] leading-relaxed text-fog">{copy}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel p-5">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-amber">
                  <Sparkles className="size-3.5" /> {t("landing.report.invest")}
                </div>
                <div className="mt-3 space-y-3">
                  {[
                    [t("landing.report.invest1"), t("landing.report.invest1Copy")],
                    [t("landing.report.invest2"), t("landing.report.invest2Copy")],
                  ].map(([title, copy]) => (
                    <div key={title} className="rounded-lg border border-line/70 bg-white/[0.015] px-3 py-2.5">
                      <div className="text-[12.5px] font-medium text-ink">{title}</div>
                      <div className="mt-0.5 text-[11.5px] leading-relaxed text-fog">{copy}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel flex items-start gap-3 p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-brand/30 bg-brand/10 text-brand-soft">
                  <Gauge className="size-4" />
                </span>
                <p className="text-[11.5px] leading-snug text-fog">
                  <span className="text-ink">{t("landing.report.nextDrill")}</span>{" "}
                  {t("landing.report.nextDrillCopy")}
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ============================== USE CASES ============================== */}
      <section className="border-y border-line/60 bg-white/[0.012]">
        <div className="container-page py-14 sm:py-20">
          <Reveal>
            <SectionHeading
              eyebrow={t("landing.usecases.eyebrow")}
              title={
                <>
                  {t("landing.usecases.titleA")}{" "}
                  <span className="font-display italic text-brand-soft">{t("landing.usecases.titleAccent")}</span>{" "}
                  the outcome.
                </>
              }
            />
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:gap-5">
            {USE_CASES.map((u, i) => (
              <Reveal key={u.title} delay={i * 60}>
                <div className="panel panel-hover h-full p-5">
                  <div className="font-mono text-[10px] tracking-[0.2em] text-brand-soft/70">0{i + 1}</div>
                  <h3 className="mt-3 text-[14px] font-medium text-ink">{t(u.title)}</h3>
                  <p className="pretty mt-1.5 text-[12.5px] leading-relaxed text-fog">{t(u.copy)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================== TRUST ============================== */}
      <section className="container-page py-14 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
          <Reveal>
            <SectionHeading
              align="left"
              eyebrow={t("landing.evidence.eyebrow")}
              title={t("landing.evidence.title")}
              copy={t("landing.evidence.copy")}
            />
          </Reveal>
          <Reveal delay={80}>
            <div className="grid gap-3 sm:grid-cols-2">
              {EVIDENCE.map((item) => (
                <div key={item.title} className="panel p-4">
                  <div className="flex items-center gap-2">
                    <Check className="size-3.5 shrink-0 text-mint" />
                    <h3 className="text-[12.5px] font-medium text-ink">{t(item.title)}</h3>
                  </div>
                  <p className="pretty mt-1.5 text-[11.5px] leading-relaxed text-fog">{t(item.copy)}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================== CTA ============================== */}
      <section className="container-page pb-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-[1.5rem] border border-line bg-[linear-gradient(120deg,rgba(124,92,255,0.16),rgba(34,211,238,0.08)_45%,transparent_75%)] p-6 sm:p-12">
            <div
              className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full blur-[90px]"
              style={{ background: "radial-gradient(circle, rgba(124,92,255,0.35), transparent 70%)" }}
            />
            <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
              <div className="max-w-xl">
                <h2 className="text-balance text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[34px]">
                  {t("landing.final.titleA")}{" "}
                  <span className="font-display italic text-brand-soft">{t("landing.final.titleAccent")}</span>
                </h2>
                <p className="pretty mt-3 text-[14px] leading-relaxed text-fog">{t("landing.final.copy")}</p>
              </div>
              <div className="flex w-full flex-wrap gap-2.5 sm:w-auto sm:gap-3">
                <ButtonLink href="/studio" size="lg" className="group w-full sm:w-auto">
                  {t("landing.cta.openStudio")}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </ButtonLink>
                <ButtonLink href="/report/demo" size="lg" variant="outline" className="w-full sm:w-auto">
                  {t("landing.cta.browseReport")}
                </ButtonLink>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </>
  );
}
