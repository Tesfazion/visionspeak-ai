import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMeeting } from "@/lib/meeting/store";
import { leaveRoom, pollRoom, postSignal } from "@/lib/meeting/signaling";
import type { OutgoingSignal } from "@/lib/meeting/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Long-polling holds the request open; give it room on hosts that enforce a cap.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;

async function gate(id: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  }
  const meeting = getMeeting(id);
  if (!meeting) {
    return { response: NextResponse.json({ error: "not_found" }, { status: 404 }) } as const;
  }
  if (meeting.status !== "live") {
    return { response: NextResponse.json({ error: "meeting_ended" }, { status: 410 }) } as const;
  }
  return { user, meeting } as const;
}

/**
 * Fetch presence + new signals.
 *
 * `since` is the last `seq` the client has seen; the hub long-polls (up to 20 s)
 * when nothing new exists, so chat and SDP/ICE arrive without a busy loop.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await gate(id);
  if ("response" in access) return access.response;

  const url = new URL(req.url);
  const peerId = url.searchParams.get("peer");
  const since = Number(url.searchParams.get("since") ?? "0");

  const state = await pollRoom(id, {
    peerId,
    since,
    name: access.user.name,
    role: access.meeting.hostId === access.user.id ? "host" : "participant",
  });
  return NextResponse.json(state, { headers: NO_STORE });
}

/** Publish one signal (chat, media state, SDP or ICE) for the other peers. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await gate(id);
  if ("response" in access) return access.response;

  let body: ({ peerId?: unknown } & Partial<OutgoingSignal>) | null = null;
  try {
    body = (await req.json()) as { peerId?: unknown } & Partial<OutgoingSignal>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const peerId = typeof body?.peerId === "string" ? body.peerId : "";
  if (!peerId) return NextResponse.json({ error: "peer_required" }, { status: 400 });

  const message = body as OutgoingSignal;
  if (!postSignal(id, peerId, message)) {
    // The room is process-local; after a restart the client re-polls and gets a
    // fresh peer id, which is cheaper than persisting ephemeral signaling state.
    return NextResponse.json({ error: "room_state_lost" }, { status: 409, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

/** Leave the room immediately instead of waiting for the peer TTL. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await gate(id);
  if ("response" in access) return access.response;

  const peerId = new URL(req.url).searchParams.get("peer");
  if (!peerId) return NextResponse.json({ error: "peer_required" }, { status: 400 });
  leaveRoom(id, peerId);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
