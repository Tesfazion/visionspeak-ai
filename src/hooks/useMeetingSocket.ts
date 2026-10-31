"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MeetingRole,
  OutgoingSignal,
  PeerSnapshot,
  SignalEvent,
  SignalPoll,
} from "@/lib/meeting/types";

export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
}

export interface UseMeetingSocketOpts {
  name: string;
  role: MeetingRole;
  /**
   * Fires for every non-chat/roster event — SDP, ICE and peer departure — so the
   * caller can drive WebRTC. Kept behind a ref so a fresh closure each render
   * cannot restart the poll loop.
   */
  onEvent?: (event: SignalEvent) => void;
}

const RETRY_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function upsertPeer(prev: PeerSnapshot[], peer: PeerSnapshot): PeerSnapshot[] {
  const index = prev.findIndex((p) => p.id === peer.id);
  if (index === -1) return [...prev, peer];
  const next = prev.slice();
  next[index] = peer;
  return next;
}

/**
 * Meeting presence + signaling over HTTP long-poll.
 *
 * The server holds a GET open for ~20 s (or until something happens), so this is
 * one request at a time instead of a timer. Chat and media state land in the
 * same stream as SDP/ICE, which keeps the room working on any host that can run
 * a Node route handler — no WebSocket upgrade, no second process.
 */
export function useMeetingSocket(
  meetingId: string | null,
  opts: UseMeetingSocketOpts,
) {
  const [peerId, setPeerId] = useState<string | null>(null);
  const [peers, setPeers] = useState<PeerSnapshot[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [screenPeer, setScreenPeer] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const peerIdRef = useRef<string | null>(null);
  const sinceRef = useRef(0);
  const onEventRef = useRef(opts.onEvent);
  const identityRef = useRef({ name: opts.name, role: opts.role });

  useEffect(() => {
    onEventRef.current = opts.onEvent;
  }, [opts.onEvent]);

  useEffect(() => {
    identityRef.current = { name: opts.name, role: opts.role };
  }, [opts.name, opts.role]);

  const applyEvent = useCallback((event: SignalEvent) => {
    switch (event.type) {
      case "peer_joined":
      case "peer_hello":
        setPeers((prev) => upsertPeer(prev, event.peer));
        break;
      case "peer_left":
        setPeers((prev) => prev.filter((p) => p.id !== event.peerId));
        setScreenPeer((prev) => (prev === event.peerId ? null : prev));
        break;
      case "chat":
        setMessages((prev) => [
          ...prev,
          {
            id: `${event.from}-${event.at}-${prev.length}`,
            from: event.from,
            name: event.name,
            text: event.text,
            at: event.at,
          },
        ]);
        break;
      case "screen_share":
        setScreenPeer((prev) =>
          event.on ? event.from : prev === event.from ? null : prev,
        );
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    const controller = new AbortController();
    peerIdRef.current = null;
    sinceRef.current = 0;

    const loop = async () => {
      while (!cancelled) {
        try {
          const query = new URLSearchParams({ since: String(sinceRef.current) });
          if (peerIdRef.current) query.set("peer", peerIdRef.current);
          const res = await fetch(
            `/api/meetings/signal/${encodeURIComponent(meetingId)}?${query.toString()}`,
            { cache: "no-store", signal: controller.signal },
          );
          if (res.status === 404 || res.status === 410) break;
          if (!res.ok) {
            setConnected(false);
            await sleep(RETRY_MS);
            continue;
          }
          const data = (await res.json()) as SignalPoll;
          if (cancelled) break;
          peerIdRef.current = data.peerId;
          sinceRef.current = data.seq;
          setPeerId(data.peerId);
          setPeers(data.peers);
          setConnected(true);
          for (const event of data.events) {
            applyEvent(event);
            onEventRef.current?.(event);
          }
        } catch (err) {
          if (cancelled || (err as Error)?.name === "AbortError") break;
          setConnected(false);
          await sleep(RETRY_MS);
        }
      }
      if (!cancelled) setConnected(false);
    };

    void loop();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [meetingId, applyEvent]);

  const post = useCallback(
    async (message: OutgoingSignal) => {
      if (!meetingId) return;
      const id = peerIdRef.current;
      if (!id) return;
      try {
        const res = await fetch(`/api/meetings/signal/${encodeURIComponent(meetingId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peerId: id, ...message }),
        });
        if (res.status === 409) {
          // The hub restarted: forget the cursor so the next poll re-registers.
          peerIdRef.current = null;
          sinceRef.current = 0;
        }
      } catch {
        /* the next poll reconnects; a dropped signal is not worth a toast */
      }
    },
    [meetingId],
  );

  const sendOffer = useCallback(
    (to: string, sdp: string) => void post({ type: "offer", to, sdp }),
    [post],
  );
  const sendAnswer = useCallback(
    (to: string, sdp: string) => void post({ type: "answer", to, sdp }),
    [post],
  );
  const sendIce = useCallback(
    (to: string, candidate: RTCIceCandidateInit | null) =>
      void post({ type: "ice", to, candidate }),
    [post],
  );
  const sendMediaState = useCallback(
    (muted?: boolean, videoOff?: boolean, screenSharing?: boolean) =>
      void post({ type: "media_state", muted, videoOff, screenSharing }),
    [post],
  );
  const sendScreenShare = useCallback(
    (on: boolean) => {
      setScreenPeer(on ? peerIdRef.current : (prev) => (prev === peerIdRef.current ? null : prev));
      void post({ type: "screen_share", on });
    },
    [post],
  );
  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const id = peerIdRef.current;
      const at = Date.now();
      setMessages((prev) => [
        ...prev,
        { id: `${id ?? "self"}-${at}-${prev.length}`, from: id ?? "self", name: identityRef.current.name, text: trimmed, at },
      ]);
      void post({ type: "chat", text: trimmed, at });
    },
    [post],
  );

  const leave = useCallback(() => {
    const id = peerIdRef.current;
    if (!meetingId || !id) return;
    peerIdRef.current = null;
    void fetch(
      `/api/meetings/signal/${encodeURIComponent(meetingId)}?peer=${encodeURIComponent(id)}`,
      { method: "DELETE", keepalive: true },
    ).catch(() => undefined);
  }, [meetingId]);

  return {
    peerId,
    peers,
    messages,
    screenPeer,
    connected,
    sendOffer,
    sendAnswer,
    sendIce,
    sendMediaState,
    sendScreenShare,
    sendChat,
    leave,
  };
}
