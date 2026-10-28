import Link from "next/link";
import { Logo } from "./brand";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Live studio", href: "/studio" },
      { label: "Sample report", href: "/report/demo" },
      { label: "History & trends", href: "/dashboard" },
      { label: "Scoring model", href: "/#scoring" },
    ],
  },
  {
    title: "Signals",
    links: [
      { label: "Eye contact", href: "/#signals" },
      { label: "Posture", href: "/#signals" },
      { label: "Gestures", href: "/#signals" },
      { label: "Voice & pace", href: "/#signals" },
    ],
  },
  {
    title: "Engineering",
    links: [
      { label: "MediaPipe Tasks", href: "https://ai.google.dev/edge/mediapipe/solutions/guide" },
      { label: "Web Audio API", href: "https://developer.mozilla.org/docs/Web/API/Web_Audio_API" },
      { label: "Web Speech API", href: "https://developer.mozilla.org/docs/Web/API/Web_Speech_API" },
      { label: "Next.js", href: "https://nextjs.org" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="no-print relative mt-16 border-t border-line/70 sm:mt-24">
      <div className="container-page grid gap-8 py-12 sm:gap-10 sm:py-14 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="pretty mt-4 max-w-xs text-[13px] leading-relaxed text-fog">
            An intelligent public speaking coach built on computer vision, behavioural analytics and
            real-time feedback. Your camera feed never leaves your device.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="chip">MediaPipe</span>
            <span className="chip">Web Audio</span>
            <span className="chip">On-device</span>
          </div>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fog">{col.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-[13px] text-mist/80 transition-colors hover:text-ink"
                    {...(link.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line/60">
        <div className="container-page flex flex-col gap-2 py-5 text-[11px] text-fog/70 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} VisionSpeak AI. Built for speakers who want the truth.</p>
          <p className="font-mono tracking-wide">Transforming public speaking through AI.</p>
        </div>
      </div>
    </footer>
  );
}
