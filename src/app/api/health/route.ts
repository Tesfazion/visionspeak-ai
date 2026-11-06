import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAuthSecretConfigured } from "@/lib/auth-core";
import { checkDatabase } from "@/lib/db/postgres";
import { BUILD_ID } from "@/lib/log";

export const dynamic = "force-dynamic";

/** Readiness probe for CI, uptime monitoring and deployment checks. */
export async function GET() {
  const started = Date.now();
  let databaseAvailable = false;
  try {
    await checkDatabase();
    databaseAvailable = true;
  } catch (error) {
    console.error("[health] PostgreSQL unavailable", error instanceof Error ? error.message : String(error));
  }
  let user: { id: string } | null = null;
  try {
    user = await getCurrentUser();
  } catch {
    /* a missing cookie store must not fail the probe */
  }

  const hasAuthSecret = isAuthSecretConfigured(process.env.AUTH_SECRET);
  const ready = databaseAvailable && hasAuthSecret;

  return NextResponse.json(
    {
      ok: ready,
      service: "visionspeak-ai",
      version: process.env.npm_package_version ?? "1.0.0",
      // A deploy you cannot name is a deploy you cannot debug from a dashboard.
      build: BUILD_ID,
      signedIn: Boolean(user),
      storage: "postgresql",
      databaseAvailable,
      durable: true,
      authConfigured: hasAuthSecret,
      ms: Date.now() - started,
      at: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
