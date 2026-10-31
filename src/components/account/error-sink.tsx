"use client";

import { useEffect } from "react";
import { captureError } from "@/lib/client-logger";

/**
 * Client-side error sink.
 *
 * Attaches to the window so any unhandled rejection or error bubbles up to a
 * place we can ship to /api/errors. This is not a replacement for the
 * global-error boundary — that still renders the UI — it's the pipe that
 * makes the boundary's crash visible in the log stream.
 */
export function ErrorSink() {
  useEffect(() => {
    const report = (message: string, stack?: string, path?: string) => {
      captureError({ message, stack, path }).catch(() => {
        // The sink failing silently is fine — the page is already broken.
      });
    };

    const onError = (event: ErrorEvent) => {
      report(event.message, event.error?.stack, window.location.pathname);
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as Error | undefined;
      report(
        reason?.message || "Unhandled promise rejection",
        reason?.stack,
        window.location.pathname,
      );
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}