import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteSession, getSession } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to read a session." }, { status: 401 });

  const { id } = await context.params;
  const session = await getSession(id, user.id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json(session);
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
