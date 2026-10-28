import Link from "next/link";
import { cn } from "@/components/ui";

export function LogoMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="vs-mark" x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A78BFA" />
          <stop offset="0.55" stopColor="#7C5CFF" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="12" stroke="url(#vs-mark)" strokeOpacity="0.55" />
      <rect x="1" y="1" width="38" height="38" rx="12" fill="url(#vs-mark)" fillOpacity="0.08" />
      <path
        d="M9.5 20c3.2-5.1 6.7-7.6 10.5-7.6S27.3 14.9 30.5 20c-3.2 5.1-6.7 7.6-10.5 7.6S12.7 25.1 9.5 20Z"
        stroke="url(#vs-mark)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="20" r="3.4" fill="url(#vs-mark)" />
      <circle cx="20" cy="20" r="1.4" fill="#06060b" />
      <path d="M20 5.5v3M20 31.5v3" stroke="url(#vs-mark)" strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.7" />
    </svg>
  );
}

export function Logo({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5", className)} aria-label="VisionSpeak AI home">
      <LogoMark size={30} className="transition-transform duration-500 group-hover:rotate-6" />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          VisionSpeak<span className="text-brand-soft"> AI</span>
        </span>
        {subtitle && (
          <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.22em] text-fog/70">
            Speaking intelligence
          </span>
        )}
      </span>
    </Link>
  );
}
