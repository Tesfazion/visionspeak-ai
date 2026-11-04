import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { STORAGE_IS_EPHEMERAL, STORAGE_KIND } from "@/lib/data-dir";
import { BUILD_ID } from "@/lib/log";

export const dynamic = "force-dynamic";

/** Liveness probe for CI, uptime monitoring and deployment checks. */
export async function GET() {
  const started = Date.now();
  let user: { id: string } | null = null;
  try {
    user = await getCurrentUser();
  } catch {
    /* a missing cookie store must not fail the probe */
  }

  const hasAuthSecret = Boolean(process.env.AUTH_SECRET?.trim() && process.env.AUTH_SECRET.trim().length >= 16);

  return NextResponse.json(
    {
      ok: true,
      service: "visionspeak-ai",
      version: process.env.npm_package_version ?? "1.0.0",
      // A deploy you cannot name is a deploy you cannot debug from a dashboard.
      build: BUILD_ID,
      signedIn: Boolean(user),
      storage: STORAGE_KIND,
      // Ephemeral storage keeps the app usable on serverless previews but the
      // data does not survive a cold start.
      durable: !STORAGE_IS_EPHEMERAL,
      authConfigured: hasAuthSecret,
      ms: Date.now() - started,
      at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
