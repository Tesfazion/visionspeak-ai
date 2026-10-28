import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";

export const cn = (...parts: (string | false | null | undefined)[]) => clsx(parts);

export type Tone = { text: string; hex: string; bg: string; ring: string };

/** One colour language for every score in the product. */
export function toneFor(score: number): Tone {
  if (score >= 80) return { text: "text-mint", hex: "#34d399", bg: "bg-mint/10", ring: "ring-mint/25" };
  if (score >= 65) return { text: "text-aqua", hex: "#22d3ee", bg: "bg-aqua/10", ring: "ring-aqua/25" };
  if (score >= 50) return { text: "text-amber", hex: "#fbbf24", bg: "bg-amber/10", ring: "ring-amber/25" };
  return { text: "text-rose", hex: "#fb7185", bg: "bg-rose/10", ring: "ring-rose/25" };
}

export function scoreLabel(score: number) {
  if (score >= 85) return "Elite";
  if (score >= 72) return "Strong";
  if (score >= 58) return "Developing";
  return "At risk";
}

/* ------------------------------------------------------------------ *
 * Score ring
 * ------------------------------------------------------------------ */

export function ScoreRing({
  value,
  size = 132,
  stroke = 9,
  label,
  caption,
  tone,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  caption?: string;
  tone?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const color = tone ?? toneFor(clamped).hex;

  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
      role="meter"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label ?? "score"}: ${Math.round(clamped)} out of 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{
            transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1), stroke 400ms ease",
            filter: `drop-shadow(0 0 10px ${color}55)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span
          className="metric-num font-medium leading-none text-ink"
          style={{ fontSize: Math.max(16, size * 0.27) }}
        >
          {Math.round(clamped)}
        </span>
        {label && (
          <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.22em] text-fog">{label}</span>
        )}
        {caption && <span className="mt-0.5 text-[10px] text-fog/70">{caption}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Bars, chips, stats
 * ------------------------------------------------------------------ */

export function Bar({
  value,
  tone,
  height = 6,
  className,
  animate = true,
}: {
  value: number;
  tone?: string;
  height?: number;
  className?: string;
  animate?: boolean;
}) {
  const v = Math.max(0, Math.min(100, value));
  const color = tone ?? toneFor(v).hex;
  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-full bg-white/[0.06]", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${v}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          boxShadow: `0 0 12px ${color}44`,
          transition: animate ? "width 800ms cubic-bezier(0.16,1,0.3,1)" : undefined,
        }}
      />
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "brand";
  className?: string;
}) {
  const tones = {
    neutral: "border-line bg-white/[0.03] text-mist",
    good: "border-mint/30 bg-mint/10 text-mint",
    warn: "border-amber/30 bg-amber/10 text-amber",
    bad: "border-rose/30 bg-rose/10 text-rose",
    brand: "border-brand/35 bg-brand/12 text-brand-soft",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  unit,
  hint,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-line/80 bg-white/[0.015] px-3.5 py-3", className)}>
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-fog">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="metric-num text-xl font-medium text-ink" style={tone ? { color: tone } : undefined}>
          {value}
        </span>
        {unit && <span className="text-[11px] text-fog">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-[11px] leading-snug text-fog/80">{hint}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-white/[0.05]", className)} aria-hidden />;
}

/** Placeholder for a route that is still streaming in. */
export function PanelSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("panel p-5", className)}>
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-3 h-8 w-20" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-3" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Sparkline (pure SVG — no chart library in the live loop)
 * ------------------------------------------------------------------ */

export function Sparkline({
  data,
  width = 120,
  height = 36,
  color = "#22d3ee",
  fill = true,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  className?: string;
}) {
  const pts = data.length ? data : [0, 0];
  const max = Math.max(...pts, 100);
  const min = Math.min(...pts, 0);
  const span = Math.max(1, max - min);
  const step = width / Math.max(1, pts.length - 1);
  const y = (v: number) => height - ((v - min) / span) * (height - 4) - 2;
  const path = pts.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden
    >
      {fill && <path d={area} fill={color} opacity={0.1} />}
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Buttons
 * ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "outline" | "ghost" | "subtle" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-brand to-[#6847f0] text-white border border-brand/60 shadow-[0_12px_30px_-12px_rgba(124,92,255,0.8)] hover:from-[#8a6dff] hover:to-[#7355ff]",
  outline: "border border-line-bright bg-white/[0.02] text-ink hover:bg-white/[0.05] hover:border-white/20",
  ghost: "border border-transparent text-mist hover:text-ink hover:bg-white/[0.05]",
  subtle: "border border-line bg-elevated/70 text-mist hover:text-ink hover:border-line-bright",
  danger: "border border-rose/30 bg-rose/10 text-rose hover:bg-rose/15",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-[12px] rounded-lg gap-1.5",
  md: "h-10 px-4 text-[13px] rounded-xl gap-2",
  lg: "h-11 px-5 text-[14px] rounded-xl gap-2.5 sm:h-12 sm:px-6",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cn(
    "inline-flex select-none items-center justify-center font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 btn-shine active:translate-y-px",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  href,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: { children: ReactNode; href: string; variant?: ButtonVariant; size?: ButtonSize; className?: string } & Omit<
  React.ComponentProps<typeof Link>,
  "href" | "className"
>) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Section headings
 * ------------------------------------------------------------------ */

export function SectionHeading({
  eyebrow,
  title,
  copy,
  align = "center",
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  copy?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div className={cn(align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl", className)}>
      <div className="flex items-center gap-3" style={align === "center" ? { justifyContent: "center" } : undefined}>
        <span className="h-px w-6 bg-gradient-to-r from-transparent to-brand/70" />
        <span className="eyebrow">{eyebrow}</span>
        <span className="h-px w-6 bg-gradient-to-l from-transparent to-brand/70" />
      </div>
      <h2 className="mt-4 text-balance text-[23px] font-semibold leading-[1.18] tracking-[-0.02em] text-ink sm:text-[30px] lg:text-[34px] 2xl:text-[38px]">
        {title}
      </h2>
      {copy && (
        <p className="pretty mt-3 text-[13.5px] leading-relaxed text-fog sm:text-[15px]">{copy}</p>
      )}
    </div>
  );
}
