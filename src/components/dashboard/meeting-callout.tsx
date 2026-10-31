import { ArrowRight, ScreenShare, Users, Video } from "@/components/icons";
import { ButtonLink, Pill } from "@/components/ui";
import type { Translate } from "@/lib/i18n";

/**
 * The dashboard's "this is a meeting platform too" panel.
 *
 * Everything else on this page reports on past sessions, which makes the product
 * read as a mirror you speak into alone. It is also a room: video, audio, screen
 * share, chat and a shared transcript, with the same live scores for everyone in
 * it — the thing people otherwise open Zoom or Google Meet for.
 *
 * The copy stays inside what the build actually does: a mesh of peer connections
 * for a coach and a small group. It is not sold as a 200-person webinar.
 *
 * The tile strip on the right is decorative (`aria-hidden`) and carries no
 * numbers, so nobody mistakes it for their own room's data.
 */
export function MeetingCallout({ t }: { t: Translate }) {
  const capabilities = [
    { icon: Video, line: t("dash.rooms.f1") },
    { icon: ScreenShare, line: t("dash.rooms.f2") },
    { icon: Users, line: t("dash.rooms.f3") },
  ];

  return (
    <section className="panel mt-4 overflow-hidden">
      <div className="grid-lines pointer-events-none opacity-25" aria-hidden />
      <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="min-w-0">
          <Pill tone="brand">
            <Video className="size-3" /> {t("dash.rooms.badge")}
          </Pill>
          <h2 className="mt-3 text-balance text-[17px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[20px]">
            {t("dash.rooms.title")}
          </h2>
          <p className="pretty mt-2 max-w-lg text-[12.5px] leading-relaxed text-fog">
            {t("dash.rooms.body")}
          </p>

          <ul className="mt-4 space-y-2">
            {capabilities.map(({ icon: Icon, line }) => (
              <li key={line} className="flex items-start gap-2 text-[11.5px] text-mist">
                <Icon className="mt-0.5 size-3.5 shrink-0 text-brand-soft" />
                <span className="pretty leading-relaxed">{line}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <ButtonLink href="/meeting">
              <Video className="size-3.5" /> {t("dash.rooms.cta")}
            </ButtonLink>
            <ButtonLink href="/meeting" variant="subtle">
              {t("dash.rooms.ctaSecondary")} <ArrowRight className="size-3.5" />
            </ButtonLink>
          </div>
        </div>

        {/* A room, drawn in CSS: two faces and a shared slide. */}
        <div className="relative hidden select-none gap-2 sm:grid sm:grid-cols-2" aria-hidden>
          <div className="col-span-2 overflow-hidden rounded-xl border border-line/80 bg-base/50 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-fog">
                <ScreenShare className="size-3" /> {t("dash.rooms.mockShare")}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-rose/15 px-1.5 py-0.5 text-[9px] font-medium text-rose">
                <span className="size-1 rounded-full bg-rose" /> {t("meeting.live")}
              </span>
            </div>
            <div className="mt-2.5 space-y-1.5">
              <div className="h-1.5 w-2/3 rounded-full bg-brand/40" />
              <div className="h-1.5 w-5/6 rounded-full bg-white/10" />
              <div className="h-1.5 w-1/2 rounded-full bg-white/10" />
            </div>
          </div>
          {[
            { label: t("dash.rooms.mockCoach"), score: "84", tone: "text-mint" },
            { label: t("dash.rooms.mockYou"), score: "71", tone: "text-amber" },
          ].map((tile) => (
            <div key={tile.label} className="relative rounded-xl border border-line/80 bg-base/50 p-3 pt-10">
              <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-fog">
                <span className="size-1 rounded-full bg-mint" /> {t("meeting.live")}
              </span>
              <span className={`absolute right-3 top-3 metric-num text-[11px] ${tile.tone}`}>{tile.score}</span>
              <div className="grid place-items-center">
                <span className="grid size-9 place-items-center rounded-full bg-brand/15 text-[11px] font-medium text-brand-soft">
                  {tile.label.slice(0, 1)}
                </span>
              </div>
              <div className="mt-2 truncate text-center text-[10px] text-fog">{tile.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
