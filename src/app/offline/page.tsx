import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, WifiOff } from "@/components/icons";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="container-page grid min-h-[70vh] place-items-center pt-24 text-center">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-line bg-white/[0.03] text-amber">
          <WifiOff className="size-6" />
        </span>
        <div className="eyebrow mt-6">No connection</div>
        <h1 className="mt-3 text-balance text-[24px] font-semibold tracking-[-0.02em] text-ink sm:text-[30px]">
          You&apos;re offline.
        </h1>
        <p className="pretty mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-fog">
          The studio needs the network once to load its models, then it runs entirely in the tab. Reconnect
          and reload to pick up where you left off.
        </p>
        <div className="mt-7 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
          <ButtonLink href="/">
            Back to the site <ArrowRight className="size-3.5" />
          </ButtonLink>
          <Link
            href="/studio"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-line px-4 text-[13px] text-mist transition-colors hover:border-line-bright hover:text-ink"
          >
            Try the studio
          </Link>
        </div>
      </div>
    </div>
  );
}
