import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSession } from "@/lib/store";
import { reportIntegrityHash } from "@/lib/api-guard";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Report integrity check.
 *
 * Scores are computed in the browser and trusted by the server — a crafted
 * POST can store any number. This route does not stop that (re-deriving the
 * scores server-side would need the raw aggregate, which is not persisted), but
 * it makes one kind of tampering visible: it re-hashes the stored duration, mode
 * and timeline with the same function the save path used. A record whose stored
 * inputs were edited after the fact fails the check.
 *
 * The report page renders the badge from this same hash server-side, so a
 * shared report is verified for anonymous readers too; this endpoint is the
 * authenticated API form of the same answer.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to verify a report." }, { status: 401 });

  const session = await getSession(id, user.id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const stored = session.aggregateHash;
  if (!stored) {
    logEvent("info", "report.verified", { requestId, sessionId: id, result: "no_hash" });
    return NextResponse.json({ ok: false, reason: "no_hash", message: "This report was saved before verification shipped." });
  }

  // Re-derive from the stored report's own timeline — the only copy of the
  // aggregate the server holds is the hash. `reportIntegrityHash` is the same
  // function the save path used, so a match means the stored inputs are the ones
  // the report was built from.
  const recomputed = reportIntegrityHash({
    durationSec: session.durationSec,
    mode: session.mode,
    timeline: session.report.timeline,
  });

  const ok = recomputed === stored;
  logEvent("info", "report.verified", { requestId, sessionId: id, result: ok ? "match" : "mismatch" });
  return NextResponse.json({ ok, hash: stored, recomputed });
}