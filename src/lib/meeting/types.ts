/**
 * Shared meeting signaling types.
 *
 * These live in their own module (no Node imports) so both the server hub and
 * the browser hook can import them without dragging `node:fs` into a bundle.
 */

export type MeetingRole = "host" | "co-host" | "participant";

export interface PeerSnapshot {
  id: string;
  name: string;
  role: MeetingRole;
  muted: boolean;
  videoOff: boolean;
  screenSharing: boolean;
}

interface BaseEvent {
  /** Monotonic cursor assigned by the hub; clients poll with `since=<seq>`. */
  seq: number;
}

export type SignalEvent =
  | (BaseEvent & { type: "peer_joined"; peer: PeerSnapshot })
  | (BaseEvent & { type: "peer_hello"; peer: PeerSnapshot })
  | (BaseEvent & { type: "peer_left"; peerId: string })
  | (BaseEvent & { type: "offer"; from: string; to: string; sdp: string })
  | (BaseEvent & { type: "answer"; from: string; to: string; sdp: string })
  | (BaseEvent & { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit | null })
  | (BaseEvent & {
      type: "media_state";
      from: string;
      muted?: boolean;
      videoOff?: boolean;
      screenSharing?: boolean;
    })
  | (BaseEvent & { type: "chat"; from: string; name: string; text: string; at: number })
  | (BaseEvent & { type: "screen_share"; from: string; on: boolean });

/** What one poll returns: who you are, the room roster and anything new. */
export interface SignalPoll {
  peerId: string;
  seq: number;
  peers: PeerSnapshot[];
  events: SignalEvent[];
}

/** Body accepted by `POST /api/meetings/signal/[id]`. */
export type OutgoingSignal =
  | { type: "hello"; name?: string; role?: MeetingRole }
  | { type: "offer"; to: string; sdp: string }
  | { type: "answer"; to: string; sdp: string }
  | { type: "ice"; to: string; candidate: RTCIceCandidateInit | null }
  | { type: "media_state"; muted?: boolean; videoOff?: boolean; screenSharing?: boolean }
  | { type: "chat"; text: string; at?: number }
  | { type: "screen_share"; on: boolean };
