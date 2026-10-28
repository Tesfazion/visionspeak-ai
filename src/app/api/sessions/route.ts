import { NextResponse } from "next/server";
import { buildReport } from "@/lib/analysis/report";
import type { SessionAggregate } from "@/lib/analysis/engine";
import { getCurrentUser } from "@/lib/auth";
import { uid } from "@/lib/math";
import { listSessions, saveSession } from "@/lib/store";
import type { SessionMode, SessionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

const MODES: SessionMode[] = ["practice", "presentation", "interview"];

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Structural check so a malformed client payload can never poison the store. */
function parseAggregate(input: unknown): SessionAggregate | null {
  if (!input || typeof input !== "object") return null;
  const a = input as Record<string, unknown>;
  if (!isNumber(a.durationSec) || !Array.isArray(a.timeline)) return null;
  if (a.timeline.length < 3) return null;
  if (!a.voice || typeof a.voice !== "object") return null;
  if (!a.speech || typeof a.speech !== "object") return null;
  if (!a.emotions || typeof a.emotions !== "object") return null;
  return input as SessionAggregate;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to list sessions." }, { status: 401 });
  try {
    const sessions = await listSessions(user.id);
    return NextResponse.json(sessions);
  } catch (err) {
    console.error("[api] list sessions failed", err);
    return NextResponse.json({ error: "Could not read sessions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to save a session." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = body as { aggregate?: unknown; meta?: Record<string, unknown> };
  const aggregate = parseAggregate(payload?.aggregate);
  if (!aggregate) {
    return NextResponse.json(
      { error: "Session payload is missing or malformed (needs durationSec, timeline, voice, speech, emotions)." },
      { status: 422 },
    );
  }

  const meta = payload.meta ?? {};
  const mode = MODES.includes(meta.mode as SessionMode) ? (meta.mode as SessionMode) : "practice";
  const speaker = String(meta.speaker ?? "Speaker").slice(0, 60).trim() || "Speaker";
  const title = String(meta.title ?? "Untitled session").slice(0, 120).trim() || "Untitled session";
  const notes = String(meta.notes ?? "").slice(0, 1000);

  try {
    const report = buildReport(aggregate, mode);
    const record: SessionRecord = {
      id: uid(),
      createdAt: new Date().toISOString(),
      speaker,
      title,
      mode,
      durationSec: Math.round(aggregate.durationSec),
      source: "live",
      notes,
      report,
      ownerId: user.id,
    };
    await saveSession(record);
    return NextResponse.json({ id: record.id, overall: report.overall }, { status: 201 });
  } catch (err) {
    console.error("[api] failed to build/save session", err);
    return NextResponse.json({ error: "The report could not be generated." }, { status: 500 });
  }
}
