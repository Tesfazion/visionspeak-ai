"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowRight, RotateCcw, TriangleAlert } from "@/components/icons";
import { Button, ButtonLink } from "@/components/ui";

/**
 * Route-level error boundary. Replaces Next's bare "Application error" screen
 * and keeps the chrome intact so the visitor is never stranded.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[visionspeak] unhandled route error", error);
  }, [error]);

  return (
    <div className="container-page grid min-h-[70vh] place-items-center pt-24 text-center">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-rose/25 bg-rose/10 text-rose">
          <TriangleAlert className="size-6" />
        </span>
        <div className="eyebrow mt-6">Something broke</div>
        <h1 className="mt-3 text-balance text-[24px] font-semibold tracking-[-0.02em] text-ink sm:text-[30px]">
          This page failed to render.
        </h1>
        <p className="pretty mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-fog">
          The error was logged. Retrying usually works; if it keeps happening, the session data may be
          unreadable.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[10.5px] text-fog/60">reference: {error.digest}</p>
        )}
        <div className="mt-7 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset} size="md">
            <RotateCcw className="size-3.5" /> Try again
          </Button>
          <ButtonLink href="/dashboard" variant="outline" size="md">
            Back to history <ArrowRight className="size-3.5" />
          </ButtonLink>
        </div>
        <Link href="/" className="mt-5 inline-block text-[12px] text-fog transition-colors hover:text-ink">
          Return home
        </Link>
      </div>
    </div>
  );
}
