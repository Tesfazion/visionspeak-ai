import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Liveness probe for CI and uptime monitoring. */
export async function GET() {
  const started = Date.now();
  let user: { id: string } | null = null;
  try {
    user = await getCurrentUser();
  } catch {
    /* a missing cookie store must not fail the probe */
  }
  return NextResponse.json(
    {
      ok: true,
      service: "visionspeak-ai",
      version: process.env.npm_package_version ?? "1.0.0",
      signedIn: Boolean(user),
      ms: Date.now() - started,
      at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
