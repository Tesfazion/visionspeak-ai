import Link from "next/link";
import {
  ArrowRight,
  Check,
  Eye,
  Gauge,
  Hand,
  Mic,
  Shield,
  Smile,
  Sparkles,
  Target,
  Video,
  Waves,
  Zap,
} from "lucide-react";
import { buildDemoAggregate } from "@/lib/analysis/demo";
import { TrendPreview } from "@/components/landing/trend-preview";
import { Reveal } from "@/components/site/motion";
import { SiteFooter } from "@/components/site/footer";
import { Bar, ButtonLink, Pill, ScoreRing, SectionHeading, cn } from "@/components/ui";

const demo = buildDemoAggregate();
const trendData = demo.timeline
  .filter((_, i) => i % 8 === 0)
  .map((p) => ({ t: p.t, confidence: p.confidence, engagement: p.engagement, leadership: p.leadership }));

/* ------------------------------------------------------------------ */

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
      {/* eyes */}
      <ellipse cx="76" cy="104" rx="16" ry="7" fill="none" stroke="rgba(52,211,153,0.85)" strokeWidth="1.4" />
      <ellipse cx="124" cy="104" rx="16" ry="7" fill="none" stroke="rgba(52,211,153,0.85)" strokeWidth="1.4" />
      <circle cx="76" cy="104" r="3.4" fill="#34d399" />
      <circle cx="124" cy="104" r="3.4" fill="#34d399" />
      {/* mouth */}
      <path d="M82 152c6 5 14 7 18 7s12-2 18-7" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
      {/* nose */}
      <path d="M100 112v22l-6 6" fill="none" stroke="rgba(167,139,250,0.35)" strokeWidth="0.9" />
    </svg>
  );
}

const SIGNALS = [
  {
    icon: Eye,
    title: "Eye contact & gaze",
    copy: "Iris-level tracking knows when you leave the lens — and exactly how long you were gone.",
    metric: "478 face landmarks",
    accent: "#34d399",
  },
  {
    icon: Target,
    title: "Posture & alignment",
    copy: "Shoulder slope, torso lean and head stack: the geometry audiences read as authority.",
    metric: "33 pose landmarks",
    accent: "#a78bfa",
  },
  {
    icon: Hand,
    title: "Gesture quality",
    copy: "Count, openness and hand jitter separate expressive beats from nervous fidgeting.",
    metric: "21 points / hand",
    accent: "#22d3ee",
  },
  {
    icon: Mic,
    title: "Vocal delivery",
    copy: "Loudness, energy, pitch spread and pause structure pulled straight from the audio signal.",
    metric: "44.1 kHz analysis",
    accent: "#fbbf24",
  },
  {
    icon: Smile,
    title: "Facial expression",
    copy: "52 facial blendshapes mapped to emotional tone, warmth and held tension.",
    metric: "52 blendshapes",
    accent: "#fb7185",
  },
  {
    icon: Waves,
    title: "Presence composite",
    copy: "Confidence, engagement and leadership presence — derived, weighted and explained.",
    metric: "9 live scores",
    accent: "#7c5cff",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Enable camera & mic",
    copy: "Models load once into your browser via WebAssembly. Frames are analysed on-device — nothing is uploaded, ever.",
    icon: Video,
  },
  {
    n: "02",
    title: "Speak for a few minutes",
    copy: "Gaze, posture, hands, voice and expression are sampled 30 times a second while a live coach nudges you in the moment.",
    icon: Gauge,
  },
  {
    n: "03",
    title: "Read the honest report",
    copy: "A scored session with strengths, blind spots, filler-word analysis and a three-drill plan for the next attempt.",
    icon: Sparkles,
  },
];

const WEIGHTS = [
  { label: "Eye contact", weight: 30, color: "#34d399" },
  { label: "Posture", weight: 25, color: "#a78bfa" },
  { label: "Hand gestures", weight: 20, color: "#22d3ee" },
  { label: "Voice stability", weight: 15, color: "#fbbf24" },
  { label: "Facial expression", weight: 10, color: "#fb7185" },
];

const USE_CASES = [
  { title: "Keynotes & conferences", copy: "Rehearse the talk until the delivery matches the idea." },
  { title: "Interviews & promotion", copy: "Practice the answers that decide your next role." },
  { title: "Teaching & training", copy: "Hold attention across a 50-minute session, not five." },
  { title: "Leadership & boardroom", copy: "Build the presence that makes a room lean in." },
];

const STACK = [
  ["MediaPipe Tasks Vision", "WASM face · pose · hand models"],
  ["Web Audio API", "loudness, pitch, pause structure"],
  ["Web Speech API", "transcript + filler detection"],
  ["Next.js 16 / React 19", "app shell & streaming UI"],
  ["TypeScript", "behavioural scoring engine"],
  ["Recharts", "session analytics"],
];

/* ------------------------------------------------------------------ */

export default function LandingPage() {
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

        <div className="container-page relative grid items-center gap-10 pb-20 pt-24 sm:gap-14 sm:pb-24 sm:pt-28 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10 lg:pt-36 2xl:gap-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] py-1 pl-1 pr-3.5 backdrop-blur">
              <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-soft">
                New
              </span>
              <span className="text-[12px] text-mist">Real-time behavioural coaching</span>
            </div>

            <h1 className="mt-6 text-balance text-[32px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[52px] sm:leading-[0.99] lg:text-[62px] 2xl:text-[68px]">
              Deliver like the room is{" "}
              <span className="font-display italic text-transparent [background:linear-gradient(92deg,#a78bfa,#ffffff_45%,#67e8f9)] [-webkit-background-clip:text] [background-clip:text]">
                yours
              </span>
              .
            </h1>

            <p className="pretty mt-5 max-w-[36rem] text-[14.5px] leading-relaxed text-fog sm:mt-6 sm:text-[16px]">
              VisionSpeak AI reads your face, eyes, posture, hands and voice in real time — then scores
              what audiences actually feel. Confidence, warmth and leadership presence, measured
              honestly and coached immediately.
            </p>

            <div className="mt-7 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <ButtonLink href="/studio" size="lg" className="group w-full sm:w-auto">
                Start a live session
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </ButtonLink>
              <ButtonLink href="/report/demo" size="lg" variant="outline" className="w-full sm:w-auto">
                See a sample report
              </ButtonLink>
            </div>

            <ul className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-fog sm:mt-8 sm:gap-x-6">
              {[
                { icon: Shield, label: "Nothing leaves your device" },
                { icon: Zap, label: "Live scores at 5 Hz" },
                { icon: Check, label: "Chrome & Edge" },
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
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fog">rec · live</span>
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

                {/* corner brackets */}
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
                  on lens
                </div>

                <div className="absolute right-3 top-3 rounded-2xl border border-line bg-base/70 p-2 backdrop-blur">
                  <ScoreRing value={87} size={92} stroke={7} label="confidence" />
                </div>

                <div className="absolute inset-x-3 bottom-3 grid grid-cols-2 gap-2">
                  {[
                    { label: "Eye contact", value: 83, color: "#34d399" },
                    { label: "Posture", value: 91, color: "#a78bfa" },
                    { label: "Gestures", value: 78, color: "#22d3ee" },
                    { label: "Voice", value: 84, color: "#fbbf24" },
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
                  <span className="chip !py-1 !text-[9px]">LEADERSHIP 85</span>
                  <span className="chip !py-1 !text-[9px]">ENGAGEMENT 89</span>
                </div>
                <span className="font-mono text-[10px] text-fog">152 wpm</span>
              </div>
            </div>

            <div className="absolute -left-4 top-28 hidden animate-float rounded-xl border border-line bg-base/85 px-3 py-2 backdrop-blur md:block">
              <div className="text-[9px] uppercase tracking-[0.16em] text-fog">Posture</div>
              <div className="text-[12px] font-medium text-mint">Grounded · 3.2° slope</div>
            </div>
            <div className="absolute -right-3 bottom-24 hidden animate-float-slow rounded-xl border border-line bg-base/85 px-3 py-2 backdrop-blur md:block">
              <div className="text-[9px] uppercase tracking-[0.16em] text-fog">Coach note</div>
              <div className="text-[12px] font-medium text-amber">Land the key line with a pause</div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================== SIGNALS ============================== */}
      <section id="signals" className="container-page relative scroll-mt-24 py-16 sm:py-20">
        <Reveal>
          <SectionHeading
            eyebrow="Six signals"
            title={
              <>
                Everything an audience notices,{" "}
                <span className="font-display italic text-brand-soft">measured</span>.
              </>
            }
            copy="Human judges read six channels at once and remember none of the numbers. VisionSpeak captures all six, continuously, and turns them into something you can act on."
          />
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SIGNALS.map((s, i) => (
            <Reveal key={s.title} delay={i * 60}>
              <article className="panel panel-hover group h-full p-5">
                <div className="flex items-start justify-between">
                  <span
                    className="grid size-10 place-items-center rounded-xl border"
                    style={{
                      borderColor: `${s.accent}33`,
                      background: `linear-gradient(180deg, ${s.accent}1f, transparent)`,
                      color: s.accent,
                    }}
                  >
                    <s.icon className="size-[18px]" />
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-fog/60">{s.metric}</span>
                </div>
                <h3 className="mt-4 text-[15px] font-medium text-ink">{s.title}</h3>
                <p className="pretty mt-2 text-[13px] leading-relaxed text-fog">{s.copy}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ============================== HOW ============================== */}
      <section id="platform" className="relative scroll-mt-24 border-y border-line/60 bg-white/[0.012]">
        <div className="container-page py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12 2xl:gap-16">
            <Reveal>
              <div>
                <SectionHeading
                  align="left"
                  eyebrow="How it works"
                  title={
                    <>
                      Camera to coaching in{" "}
                      <span className="font-display italic text-aqua">seconds</span>.
                    </>
                  }
                  copy="No uploads, no waiting, no reviewer. The same models used for on-device vision inference run inside your browser tab while you speak."
                />
                <div className="mt-8 flex flex-wrap gap-2">
                  <Pill tone="good">
                    <Shield className="size-3" /> on-device
                  </Pill>
                  <Pill tone="brand">
                    <Sparkles className="size-3" /> real-time nudges
                  </Pill>
                  <Pill>
                    <Eye className="size-3" /> 478-point face mesh
                  </Pill>
                </div>
              </div>
            </Reveal>

            <div className="space-y-3">
              {STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 80}>
                  <div className="panel panel-hover flex gap-5 p-5">
                    <div className="flex flex-col items-center">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-brand/30 bg-brand/10 text-brand-soft">
                        <s.icon className="size-[18px]" />
                      </span>
                      {i < STEPS.length - 1 && <span className="mt-2 h-full w-px flex-1 bg-line" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] tracking-[0.2em] text-fog/60">{s.n}</span>
                        <h3 className="text-[15px] font-medium text-ink">{s.title}</h3>
                      </div>
                      <p className="pretty mt-1.5 text-[13px] leading-relaxed text-fog">{s.copy}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================== SCORING ============================== */}
      <section id="scoring" className="container-page relative scroll-mt-24 py-16 sm:py-20">
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-12 2xl:gap-16">
          <Reveal>
            <div>
              <SectionHeading
                align="left"
                eyebrow="The scoring model"
                title={
                  <>
                    A weighted model you can{" "}
                    <span className="font-display italic text-brand-soft">audit</span>.
                  </>
                }
                copy="Confidence is the headline, but it is never a black box. Five measured primitives combine with fixed weights, and every downstream score — engagement, leadership, communication — reconciles to the same numbers."
              />
              <div className="mt-7 rounded-xl border border-line/80 bg-base/50 p-4 font-mono text-[11px] leading-relaxed text-fog">
                <span className="text-brand-soft">confidence</span> ={" "}
                <span className="text-mint">0.30·eye</span> + <span className="text-mint">0.25·posture</span> +{" "}
                <span className="text-aqua">0.20·gestures</span> + <span className="text-amber">0.15·voice</span> +{" "}
                <span className="text-rose">0.10·expression</span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="panel p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-medium text-ink">Confidence composition</h3>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-fog">weights</span>
              </div>
              <div className="mt-5 space-y-4">
                {WEIGHTS.map((w) => (
                  <div key={w.label}>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span className="text-[12px] text-mist">{w.label}</span>
                      <span className="metric-num text-[12px] text-fog">{w.weight}%</span>
                    </div>
                    <Bar value={w.weight * 3.33} tone={w.color} height={7} />
                  </div>
                ))}
              </div>
              <div className="mt-6 hairline" />
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { label: "0–40", copy: "Low", color: "#fb7185" },
                  { label: "41–70", copy: "Moderate", color: "#fbbf24" },
                  { label: "71–100", copy: "High", color: "#34d399" },
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

      {/* ============================== ANALYTICS ============================== */}
      <section className="relative border-y border-line/60 bg-white/[0.012]">
        <div className="container-page grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          <Reveal>
            <div className="panel overflow-hidden p-5">
              <div className="flex items-center justify-between pb-4">
                <div>
                  <h3 className="text-[13px] font-medium text-ink">Session trend</h3>
                  <p className="text-[11px] text-fog">10-minute keynote · sampled per second</p>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1.5 text-fog">
                    <span className="size-1.5 rounded-full bg-brand-soft" /> Confidence
                  </span>
                  <span className="flex items-center gap-1.5 text-fog">
                    <span className="size-1.5 rounded-full bg-aqua" /> Engagement
                  </span>
                </div>
              </div>
              <TrendPreview data={trendData} />
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber/25 bg-amber/[0.07] px-3 py-2">
                <span className="size-1.5 shrink-0 rounded-full bg-amber" />
                <p className="text-[11px] leading-snug text-amber/90">
                  Confidence dipped 7 points at 03:20 — the transition between sections. Rehearse the
                  bridge, not the slide.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div>
              <SectionHeading
                align="left"
                eyebrow="Analytics"
                title={
                  <>
                    Watch the session{" "}
                    <span className="font-display italic text-aqua">breathe</span>.
                  </>
                }
                copy="Every second is retained, so a dip at minute three becomes a specific, repeatable insight rather than a vague feeling that it went badly."
              />
              <ul className="mt-6 space-y-3">
                {[
                  "Per-second timeline for confidence, engagement and leadership",
                  "Trend lines across every session in your history",
                  "Emotion distribution and expression variety",
                  "Filler-word frequency with the exact transcript",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-[13px] text-mist">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-mint" />
                    {t}
                  </li>
                ))}
              </ul>
              <ButtonLink href="/dashboard" variant="outline" size="md" className="mt-7">
                Explore the dashboard
                <ArrowRight className="size-3.5" />
              </ButtonLink>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================== REPORT PREVIEW ============================== */}
      <section className="container-page relative py-16 sm:py-20">
        <Reveal>
          <SectionHeading
            eyebrow="The report"
            title={
              <>
                Then it tells you the <span className="font-display italic text-mint">truth</span>.
              </>
            }
            copy="A scored session, a ranked list of what is working, what is costing you authority, and three drills to fix it before the real thing."
          />
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-12 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="panel flex flex-col items-center justify-center p-8 text-center">
              <ScoreRing value={85} size={172} stroke={11} label="overall" />
              <div className="mt-5 flex items-center gap-2">
                <Pill tone="good">A</Pill>
                <span className="text-[14px] font-medium text-ink">Excellent Speaker</span>
              </div>
              <p className="pretty mt-3 max-w-sm text-[12px] leading-relaxed text-fog">
                Polished and credible. A few refinements would make it unforgettable — posture and gaze
                are already doing heavy lifting.
              </p>
              <div className="mt-6 grid w-full grid-cols-3 gap-2">
                {[
                  { k: "Confidence", v: 84 },
                  { k: "Leadership", v: 85 },
                  { k: "Comms", v: 86 },
                ].map((s) => (
                  <div key={s.k} className="rounded-lg border border-line/70 py-2">
                    <div className="metric-num text-[15px] text-ink">{s.v}</div>
                    <div className="text-[9px] uppercase tracking-[0.12em] text-fog">{s.k}</div>
                  </div>
                ))}
              </div>
              <ButtonLink href="/report/demo" size="md" variant="subtle" className="mt-6 w-full">
                Open the full sample report
                <ArrowRight className="size-3.5" />
              </ButtonLink>
            </div>

            <div className="space-y-3">
              <div className="panel p-5">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-mint">
                  <Check className="size-3.5" /> Strengths
                </div>
                <div className="mt-3 space-y-3">
                  {[
                    ["Grounded, authoritative stance", "Shoulders level at 3.2°, upright 80% of the session."],
                    ["Magnetic eye contact", "Held the lens 79% of the time across just 9 breaks."],
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
                  <Sparkles className="size-3.5" /> Where to invest next
                </div>
                <div className="mt-3 space-y-3">
                  {[
                    ["Gestures stay close to the body", "8 beats per minute against an expressive range of 12–26."],
                    ["Vocal colour is narrow", "Pitch moved across 4.8 semitones; aim for 9 to sound animated."],
                  ].map(([title, copy]) => (
                    <div key={title} className="rounded-lg border border-line/70 bg-white/[0.015] px-3 py-2.5">
                      <div className="text-[12.5px] font-medium text-ink">{title}</div>
                      <div className="mt-0.5 text-[11.5px] leading-relaxed text-fog">{copy}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel flex items-center gap-3 p-4">
                <span className="grid size-9 place-items-center rounded-lg border border-brand/30 bg-brand/10 text-brand-soft">
                  <Gauge className="size-4" />
                </span>
                <p className="text-[11.5px] leading-snug text-fog">
                  <span className="text-ink">Next drill:</span> one idea, one gesture — decide the hand
                  shape before you speak, hold it to the end of the sentence.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ============================== USE CASES ============================== */}
      <section className="border-y border-line/60 bg-white/[0.012]">
        <div className="container-page py-16 sm:py-20">
          <Reveal>
            <SectionHeading
              eyebrow="Who it's for"
              title={
                <>
                  For the moments where delivery{" "}
                  <span className="font-display italic text-brand-soft">decides</span> the outcome.
                </>
              }
            />
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:gap-5">
            {USE_CASES.map((u, i) => (
              <Reveal key={u.title} delay={i * 60}>
                <div className="panel panel-hover h-full p-5">
                  <div className="font-mono text-[10px] tracking-[0.2em] text-brand-soft/70">0{i + 1}</div>
                  <h3 className="mt-3 text-[14px] font-medium text-ink">{u.title}</h3>
                  <p className="pretty mt-1.5 text-[12.5px] leading-relaxed text-fog">{u.copy}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================== STACK ============================== */}
      <section className="container-page py-16 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-10">
          <Reveal>
            <SectionHeading
              align="left"
              eyebrow="Under the hood"
              title="No mock data. No theatre."
              copy="Every number in this product comes from a real model or a real signal. Nothing is randomised to look impressive."
            />
            <p className="mt-4 text-[12px] leading-relaxed text-fog/80">
              Roadmap: a server-side batch pipeline (Whisper + librosa + DeepFace) for uploaded
              recordings, reusing the identical scoring model.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <div className="panel divide-y divide-line/70">
              {STACK.map(([name, role]) => (
                <div key={name} className="flex items-center justify-between gap-4 px-5 py-3">
                  <span className="text-[12.5px] font-medium text-ink">{name}</span>
                  <span className="text-right font-mono text-[10.5px] text-fog">{role}</span>
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
                <h2 className="text-balance text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[34px]">
                  The camera is already on.{" "}
                  <span className="font-display italic text-brand-soft">Start measuring.</span>
                </h2>
                <p className="pretty mt-3 text-[14px] leading-relaxed text-fog">
                  Two minutes is enough to get a baseline. Your first session is free, local and
                  private — and it will tell you something a mirror never could.
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5 sm:gap-3">
                <ButtonLink href="/studio" size="lg" className="group w-full sm:w-auto">
                  Open the studio
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </ButtonLink>
                <Link
                  href="/report/demo"
                  className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-line px-5 text-[14px] text-mist transition-colors hover:border-line-bright hover:text-ink sm:w-auto"
                >
                  Browse a report
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </>
  );
}
