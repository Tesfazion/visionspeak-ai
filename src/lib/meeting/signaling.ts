import { randomUUID } from "node:crypto";
import type {
  MeetingRole,
  OutgoingSignal,
  PeerSnapshot,
  SignalEvent,
  SignalPoll,
} from "./types";

/**
 * In-process signaling for the meeting mesh.
 *
 * A real WebRTC mesh needs a channel to exchange SDP and ICE. We deliberately
 * keep that channel as **HTTP long-poll** rather than a WebSocket: Next.js route
 * handlers cannot upgrade a request, and a custom server would break the
 * Vercel/`next start` deployment this project ships. Polling every room every
 * 20 s is a rounding error for the handful of people a coaching session holds,
 * and it keeps the whole feature inside one deployable process.
 *
 * Rooms are process-local. That matches the rest of the platform's documented
 * single-instance store; a second instance would not share this state either.
 */

const ROOM_TTL_MS = 30 * 60 * 1000;
const PEER_TTL_MS = 45 * 1000;
const LONG_POLL_MS = 20_000;
const EVENT_CAP = 300;
const MAX_STRING = 8_000;

interface Peer extends PeerSnapshot {
  lastSeen: number;
}

interface Room {
  meetingId: string;
  seq: number;
  peers: Map<string, Peer>;
  events: SignalEvent[];
  waiters: Set<() => void>;
  lastActivity: number;
}

const rooms = new Map<string, Room>();

function getRoom(meetingId: string): Room {
  let room = rooms.get(meetingId);
  if (!room) {
    room = {
      meetingId,
      seq: 0,
      peers: new Map(),
      events: [],
      waiters: new Set(),
      lastActivity: Date.now(),
    };
    rooms.set(meetingId, room);
  }
  return room;
}

function snapshot(peer: Peer): PeerSnapshot {
  return {
    id: peer.id,
    name: peer.name,
    role: peer.role,
    muted: peer.muted,
    videoOff: peer.videoOff,
    screenSharing: peer.screenSharing,
  };
}

function nextSeq(room: Room): number {
  room.seq += 1;
  return room.seq;
}

function publish(room: Room, event: SignalEvent) {
  room.events.push(event);
  if (room.events.length > EVENT_CAP) room.events.splice(0, room.events.length - EVENT_CAP);
  room.lastActivity = Date.now();
  for (const wake of room.waiters) wake();
  room.waiters.clear();
}

/**
 * Drops peers that stopped polling (tab closed, network gone) and the rooms that
 * subsequently empty out. Emits `peer_left` so the surviving clients remove the
 * tile instead of leaving a ghost.
 */
function prune(room: Room) {
  const now = Date.now();
  for (const [id, peer] of room.peers) {
    if (now - peer.lastSeen > PEER_TTL_MS) {
      room.peers.delete(id);
      publish(room, { seq: nextSeq(room), type: "peer_left", peerId: id });
    }
  }
  if (room.peers.size === 0 && now - room.lastActivity > ROOM_TTL_MS) {
    rooms.delete(room.meetingId);
  }
}

/** Events this peer has not seen, addressed to it (or broadcast). */
function eventsFor(room: Room, peer: Peer, since: number): SignalEvent[] {
  return room.events.filter((event) => {
    if (event.seq <= since) return false;
    switch (event.type) {
      case "peer_joined":
      case "peer_hello":
        return event.peer.id !== peer.id;
      case "peer_left":
        return event.peerId !== peer.id;
      case "offer":
      case "answer":
      case "ice":
        return event.from !== peer.id && event.to === peer.id;
      case "chat":
      case "media_state":
      case "screen_share":
        return event.from !== peer.id;
      default:
        return false;
    }
  });
}

function waitForChange(room: Room, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    // `wake` is hoisted so it can reference the timer declared below; it only
    // runs on a publish or when the timer fires, both after this function returns.
    function wake() {
      clearTimeout(timer);
      room.waiters.delete(wake);
      resolve();
    }
    const timer = setTimeout(wake, timeoutMs);
    room.waiters.add(wake);
  });
}

function clamp(value: unknown, max = MAX_STRING): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export interface PollInput {
  peerId?: string | null;
  since?: number;
  name: string;
  role: MeetingRole;
}

/**
 * Registers (or refreshes) a peer and returns the roster plus new events.
 *
 * The first call has `since === 0`: it returns the roster and no backlog, which
 * is what a joining peer wants (`peers` already describes the room). Later calls
 * long-poll for up to {@link LONG_POLL_MS} so chat and SDP arrive immediately.
 */
export async function pollRoom(meetingId: string, input: PollInput): Promise<SignalPoll> {
  const room = getRoom(meetingId);
  prune(room);

  let peer = input.peerId ? room.peers.get(input.peerId) : undefined;
  if (!peer) {
    const id = input.peerId && input.peerId.length <= 80 ? input.peerId : `p_${randomUUID()}`;
    peer = {
      id,
      name: clamp(input.name, 60).trim() || "Participant",
      role: input.role,
      muted: false,
      videoOff: false,
      screenSharing: false,
      lastSeen: Date.now(),
    };
    room.peers.set(id, peer);
    publish(room, { seq: nextSeq(room), type: "peer_joined", peer: snapshot(peer) });
  } else {
    peer.lastSeen = Date.now();
    peer.name = clamp(input.name, 60).trim() || peer.name;
    peer.role = input.role;
  }

  const since = Number.isFinite(input.since) ? Math.max(0, Math.trunc(input.since as number)) : 0;
  let events = since === 0 ? [] : eventsFor(room, peer, since);
  if (events.length === 0 && since > 0) {
    await waitForChange(room, LONG_POLL_MS);
    prune(room);
    peer.lastSeen = Date.now();
    events = eventsFor(room, peer, since);
  }

  return {
    peerId: peer.id,
    seq: room.seq,
    peers: [...room.peers.values()].map(snapshot),
    events,
  };
}

/** Records an outgoing message and fans it out to the other peers. */
export function postSignal(
  meetingId: string,
  peerId: string,
  message: OutgoingSignal,
): boolean {
  const room = rooms.get(meetingId);
  if (!room) return false;
  const peer = room.peers.get(peerId);
  if (!peer) return false;
  peer.lastSeen = Date.now();
  room.lastActivity = Date.now();

  switch (message.type) {
    case "hello": {
      if (typeof message.name === "string" && message.name.trim()) {
        peer.name = clamp(message.name, 60).trim();
      }
      if (
        message.role === "host" ||
        message.role === "co-host" ||
        message.role === "participant"
      ) {
        peer.role = message.role;
      }
      publish(room, { seq: nextSeq(room), type: "peer_hello", peer: snapshot(peer) });
      break;
    }
    case "offer":
    case "answer": {
      const to = clamp(message.to, 80);
      const sdp = clamp(message.sdp);
      if (!to || !sdp) return false;
      publish(room, { seq: nextSeq(room), type: message.type, from: peerId, to, sdp });
      break;
    }
    case "ice": {
      const to = clamp(message.to, 80);
      if (!to) return false;
      publish(room, {
        seq: nextSeq(room),
        type: "ice",
        from: peerId,
        to,
        candidate: message.candidate ?? null,
      });
      break;
    }
    case "media_state": {
      if (typeof message.muted === "boolean") peer.muted = message.muted;
      if (typeof message.videoOff === "boolean") peer.videoOff = message.videoOff;
      if (typeof message.screenSharing === "boolean") peer.screenSharing = message.screenSharing;
      const event: SignalEvent = {
        seq: nextSeq(room),
        type: "media_state",
        from: peerId,
        muted: peer.muted,
        videoOff: peer.videoOff,
        screenSharing: peer.screenSharing,
      };
      publish(room, event);
      break;
    }
    case "chat": {
      const text = clamp(message.text, 2_000).trim();
      if (!text) return false;
      publish(room, {
        seq: nextSeq(room),
        type: "chat",
        from: peerId,
        name: peer.name,
        text,
        at: typeof message.at === "number" ? message.at : Date.now(),
      });
      break;
    }
    case "screen_share": {
      peer.screenSharing = Boolean(message.on);
      publish(room, {
        seq: nextSeq(room),
        type: "screen_share",
        from: peerId,
        on: peer.screenSharing,
      });
      break;
    }
    default:
      return false;
  }

  return true;
}

/** Explicit leave; the close of the tab is covered by the peer TTL prune. */
export function leaveRoom(meetingId: string, peerId: string): boolean {
  const room = rooms.get(meetingId);
  if (!room) return false;
  if (!room.peers.delete(peerId)) return false;
  publish(room, { seq: nextSeq(room), type: "peer_left", peerId });
  if (room.peers.size === 0) rooms.delete(meetingId);
  return true;
}
