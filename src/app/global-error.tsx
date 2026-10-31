"use client";

import { useEffect } from "react";
import { SiteFooter } from "@/components/site/footer";
import { ButtonLink } from "@/components/ui";
import { captureError } from "@/lib/client-logger";

/**
 * Root error boundary. It renders its own <html>, so no theme or locale
 * provider is available — the layout has already failed. The crash is shipped
 * to /api/errors so a broken deploy is visible in the log stream, not just on
 * the user's screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError({
      message: error?.message || "Global error boundary",
      stack: error?.stack,
      path:
        typeof window === "undefined" ? undefined : window.location.pathname,
    }).catch(() => {
      /* shipping the error must never break rendering the error page */
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-dvh bg-base font-sans antialiased">
        <div className="container-page flex min-h-[70vh] flex-col items-center justify-center py-24 text-center">
          <div className="eyebrow">Error</div>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-ink sm:text-[38px]">
            The app hit an unexpected problem
          </h1>
          <p className="pretty mt-3 max-w-xl text-[12.5px] leading-relaxed text-fog">
            {error?.message || "An unknown error occurred."}
            {error?.digest ? ` (ref ${error.digest})` : ""}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <ButtonLink href="/" size="lg">
              Back to home
            </ButtonLink>
            <ButtonLink
              href="/studio"
              variant="outline"
              size="lg"
              onClick={reset}
            >
              Try again
            </ButtonLink>
          </div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
