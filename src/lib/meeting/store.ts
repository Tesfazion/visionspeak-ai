import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "@/lib/data-dir";

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

interface StoreShape {
  schemaVersion: number;
  meetings: Record<string, Meeting>;
}

const STORE_PATH = join(DATA_DIR, "meetings.json");

function readStore(): StoreShape {
  try {
    if (!existsSync(STORE_PATH)) return { schemaVersion: SCHEMA_VERSION, meetings: {} };
    const raw = JSON.parse(readFileSync(STORE_PATH, "utf8")) as StoreShape;
    if (!raw || typeof raw !== "object") return { schemaVersion: SCHEMA_VERSION, meetings: {} };
    return {
      schemaVersion: SCHEMA_VERSION,
      meetings: raw.meetings && typeof raw.meetings === "object" ? raw.meetings : {},
    };
  } catch {
    return { schemaVersion: SCHEMA_VERSION, meetings: {} };
  }
}

function writeStore(store: StoreShape) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch {
    /* ephemeral storage — the call still returns the in-memory shape */
  }
}

export function createMeeting(input: {
  title: string;
  mode: SessionMode;
  hostId: string;
  hostName: string;
  hostEmail: string;
}): Meeting {
  const store = readStore();
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
  store.meetings[id] = meeting;
  writeStore(store);
  return meeting;
}

export function getMeeting(id: string): Meeting | null {
  const store = readStore();
  return store.meetings[id] ?? null;
}

export function listMeetingsForUser(userId: string): Meeting[] {
  const store = readStore();
  return Object.values(store.meetings)
    .filter((m) => m.participants.some((p) => p.id === userId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function joinMeeting(
  id: string,
  input: { userId: string; name: string; email: string; role?: MeetingParticipant["role"] },
): Meeting | null {
  const store = readStore();
  const meeting = store.meetings[id];
  if (!meeting || meeting.status !== "live") return null;
  const existing = meeting.participants.find((p) => p.id === input.userId);
  if (!existing) {
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
  writeStore(store);
  return meeting;
}

export function updateParticipant(
  meetingId: string,
  participantId: string,
  patch: Partial<Omit<MeetingParticipant, "id" | "joinedAt">>,
): Meeting | null {
  const store = readStore();
  const meeting = store.meetings[meetingId];
  if (!meeting) return null;
  const p = meeting.participants.find((x) => x.id === participantId);
  if (!p) return null;
  Object.assign(p, patch);
  writeStore(store);
  return meeting;
}

/** Meeting-level text: the shared notes and the saved transcript. */
export function updateMeeting(
  meetingId: string,
  userId: string,
  patch: { notes?: string; transcript?: string },
): Meeting | null {
  const store = readStore();
  const meeting = store.meetings[meetingId];
  if (!meeting) return null;
  if (!meeting.participants.some((p) => p.id === userId)) return null;
  if (typeof patch.notes === "string") meeting.notes = patch.notes.slice(0, 4_000);
  if (typeof patch.transcript === "string") meeting.transcript = patch.transcript.slice(0, 40_000);
  writeStore(store);
  return meeting;
}

export function appendTranscript(meetingId: string, text: string): Meeting | null {
  const store = readStore();
  const meeting = store.meetings[meetingId];
  if (!meeting) return null;
  meeting.transcript = (meeting.transcript ? meeting.transcript + "\n" : "") + text;
  writeStore(store);
  return meeting;
}

export function endMeeting(id: string, userId: string): Meeting | null {
  const store = readStore();
  const meeting = store.meetings[id];
  if (!meeting) return null;
  if (meeting.hostId !== userId) return null;
  meeting.status = "ended";
  writeStore(store);
  return meeting;
}