import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteSession, getSession, updateSession } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to read a session." }, { status: 401 });

  const { id } = await context.params;
  const session = await getSession(id, user.id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json(session);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to edit a session." }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const patch: { title?: string; speaker?: string; notes?: string } = {};
  if (typeof body?.title === "string") {
    const t = body.title.trim().slice(0, 120);
    if (!t) return NextResponse.json({ error: "Title required" }, { status: 400 });
    patch.title = t;
  }
  if (typeof body?.speaker === "string") {
    const s = body.speaker.trim().slice(0, 60);
    if (!s) return NextResponse.json({ error: "Speaker required" }, { status: 400 });
    patch.speaker = s;
  }
  if (typeof body?.notes === "string") {
    patch.notes = body.notes.slice(0, 1000);
  }
  const updated = await updateSession(id, user.id, patch);
  if (!updated) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json(updated);
}
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to delete a session." }, { status: 401 });

  const { id } = await context.params;
  const removed = await deleteSession(id, user.id);
  if (!removed) {
    // Same status for "missing" and "not yours" so ids cannot be probed.
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
