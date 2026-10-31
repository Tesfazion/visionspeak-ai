"use client";

import React from "react";
import { ErrorSink } from "@/components/account/error-sink";

/**
 * Renders the client-side error sink. Wrapped in its own client component
 * because the root layout stays a server component — it reads the locale
 * cookie and needs to render the first paint in the right language.
 */
export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ErrorSink />
    </>
  );
}