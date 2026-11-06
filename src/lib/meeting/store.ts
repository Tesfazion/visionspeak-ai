import { randomUUID } from "node:crypto";
import { dbQuery, withDbTransaction } from "@/lib/db/postgres";

export const SCHEMA_VERSION = 1;

export interface MeetingParticipant {
  id: string;
  name: string;
  email: string;
  role: "host" | "co-host" | "participant";
  joinedAt: string;
  muted: boolean;
  videoOff: boolean;
  screenSharing: boolean;
}

export interface Meeting {
  id: string;
  title: string;
  mode: SessionMode;
  createdAt: string;
  hostId: string;
  participants: MeetingParticipant[];
  status: "scheduled" | "live" | "ended";
  transcript: string;
  notes: string;
  schemaVersion: number;
}

export type SessionMode = "practice" | "presentation" | "interview";
type MeetingRow = { data: Meeting };

export async function createMeeting(input: {
  title: string;
  mode: SessionMode;
  hostId: string;
  hostName: string;
  hostEmail: string;
}): Promise<Meeting> {
  const id = `m_${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const meeting: Meeting = {
    id,
    title: input.title.trim() || "VisionSpeak meeting",
    mode: input.mode,
    createdAt: now,
    hostId: input.hostId,
    status: "live",
    participants: [
      {
        id: input.hostId,
        name: input.hostName,
        email: input.hostEmail,
        role: "host",
        joinedAt: now,
        muted: false,
        videoOff: false,
        screenSharing: false,
      },
    ],
    transcript: "",
    notes: "",
    schemaVersion: SCHEMA_VERSION,
  };
  await dbQuery(
    "INSERT INTO meetings (id, host_id, created_at, status, data) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [id, input.hostId, now, meeting.status, JSON.stringify(meeting)],
  );
  return meeting;
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  const { rows } = await dbQuery<MeetingRow>("SELECT data FROM meetings WHERE id = $1", [id]);
  return rows[0]?.data ?? null;
}

export async function listMeetingsForUser(userId: string): Promise<Meeting[]> {
  const { rows } = await dbQuery<MeetingRow>(
    `SELECT data FROM meetings
     WHERE EXISTS (
       SELECT 1 FROM jsonb_array_elements(data->'participants') AS participant
       WHERE participant->>'id' = $1
     )
     ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map(({ data }) => data);
}

async function updateMeetingRecord(
  id: string,
  change: (meeting: Meeting) => Meeting | null,
): Promise<Meeting | null> {
  return withDbTransaction(async (client) => {
    const { rows } = await client.query<MeetingRow>(
      "SELECT data FROM meetings WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!rows[0]) return null;
    const updated = change(rows[0].data);
    if (!updated) return null;
    await client.query(
      "UPDATE meetings SET status = $2, data = $3::jsonb WHERE id = $1",
      [id, updated.status, JSON.stringify(updated)],
    );
    return updated;
  });
}

export async function joinMeeting(
  id: string,
  input: { userId: string; name: string; email: string; role?: MeetingParticipant["role"] },
): Promise<Meeting | null> {
  return updateMeetingRecord(id, (meeting) => {
    if (meeting.status !== "live") return null;
    if (!meeting.participants.some((participant) => participant.id === input.userId)) {
      meeting.participants.push({
        id: input.userId,
        name: input.name,
        email: input.email,
        role: input.role ?? "participant",
        joinedAt: new Date().toISOString(),
        muted: false,
        videoOff: false,
        screenSharing: false,
      });
    }
    return meeting;
  });
}

export async function updateParticipant(
  meetingId: string,
  participantId: string,
  patch: Partial<Omit<MeetingParticipant, "id" | "joinedAt">>,
): Promise<Meeting | null> {
  return updateMeetingRecord(meetingId, (meeting) => {
    const participant = meeting.participants.find((entry) => entry.id === participantId);
    if (!participant) return null;
    Object.assign(participant, patch);
    return meeting;
  });
}

export async function updateMeeting(
  meetingId: string,
  userId: string,
  patch: { notes?: string; transcript?: string },
): Promise<Meeting | null> {
  return updateMeetingRecord(meetingId, (meeting) => {
    if (!meeting.participants.some((participant) => participant.id === userId)) return null;
    if (typeof patch.notes === "string") meeting.notes = patch.notes.slice(0, 4_000);
    if (typeof patch.transcript === "string") meeting.transcript = patch.transcript.slice(0, 40_000);
    return meeting;
  });
}

export async function appendTranscript(meetingId: string, text: string): Promise<Meeting | null> {
  return updateMeetingRecord(meetingId, (meeting) => {
    meeting.transcript = (meeting.transcript ? `${meeting.transcript}\n` : "") + text;
    return meeting;
  });
}

export async function endMeeting(id: string, userId: string): Promise<Meeting | null> {
  return updateMeetingRecord(id, (meeting) => {
    if (meeting.hostId !== userId) return null;
    meeting.status = "ended";
    return meeting;
  });
}
