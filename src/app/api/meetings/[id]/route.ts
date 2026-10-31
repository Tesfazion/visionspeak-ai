import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { endMeeting, getMeeting, joinMeeting, updateMeeting, updateParticipant } from "@/lib/meeting/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const meeting = getMeeting(id);
  if (!meeting) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const isParticipant = meeting.participants.some((p) => p.id === user.id);
  if (!isParticipant) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ meeting });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const meeting = joinMeeting(id, { userId: user.id, name: user.name, email: user.email });
  if (!meeting) return NextResponse.json({ error: "not_found_or_ended" }, { status: 410 });
  return NextResponse.json({ meeting });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: {
    muted?: boolean;
    videoOff?: boolean;
    screenSharing?: boolean;
    notes?: string;
    transcript?: string;
  } = {};
  try {
    body = (await req.json()) as {
      muted?: boolean;
      videoOff?: boolean;
      screenSharing?: boolean;
      notes?: string;
      transcript?: string;
    };
  } catch {
    /* empty body is fine */
  }
  const patch: Partial<{ muted: boolean; videoOff: boolean; screenSharing: boolean }> = {};
  if (typeof body.muted === "boolean") patch.muted = body.muted;
  if (typeof body.videoOff === "boolean") patch.videoOff = body.videoOff;
  if (typeof body.screenSharing === "boolean") patch.screenSharing = body.screenSharing;

  // Two different records: media state belongs to the participant, notes and the
  // transcript belong to the meeting itself.
  let meeting = updateParticipant(id, user.id, patch);
  if (typeof body.notes === "string" || typeof body.transcript === "string") {
    meeting = updateMeeting(id, user.id, { notes: body.notes, transcript: body.transcript }) ?? meeting;
  }
  if (!meeting) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ meeting });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const meeting = endMeeting(id, user.id);
  if (!meeting) return NextResponse.json({ error: "not_found_or_forbidden" }, { status: 404 });
  return NextResponse.json({ meeting });
}