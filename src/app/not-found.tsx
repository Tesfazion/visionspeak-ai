import Link from "next/link";
import { ArrowRight, ScanFace } from "@/components/icons";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="container-page grid min-h-[70vh] place-items-center pt-24 text-center">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-line bg-white/[0.03] text-brand-soft">
          <ScanFace className="size-6" />
        </span>
        <div className="eyebrow mt-6">404 · no signal</div>
        <h1 className="text-balance mt-3 text-[24px] font-semibold tracking-[-0.02em] text-ink sm:text-[30px]">
          This page never made it to the stage.
        </h1>
        <p className="pretty mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-fog sm:text-[13.5px]">
          The report or page you were looking for doesn&apos;t exist — it may have been deleted, or the
          link was mistyped.
        </p>
        <div className="mt-7 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <ButtonLink href="/dashboard">
            Go to history <ArrowRight className="size-3.5" />
          </ButtonLink>
          <Link
            href="/studio"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-line px-4 text-[13px] text-mist transition-colors hover:border-line-bright hover:text-ink"
          >
            Open the studio
          </Link>
        </div>
      </div>
    </div>
  );
}
