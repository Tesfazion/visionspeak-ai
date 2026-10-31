"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PeerConnection {
  id: string;
  name: string;
  pc: RTCPeerConnection;
  remoteStream: MediaStream | null;
}

export interface UseWebRtcOpts {
  sendOffer: (to: string, sdp: string) => void;
  sendAnswer: (to: string, sdp: string) => void;
  sendIce: (to: string, candidate: RTCIceCandidateInit | null) => void;
  onRemoteTrack?: (peerId: string, stream: MediaStream) => void;
}

const ICE_SERVERS: RTCConfiguration["iceServers"] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/**
 * Peer-to-peer WebRTC mesh.
 *
 * One `RTCPeerConnection` per remote. The room decides who offers (the peer with
 * the lower id) so two participants never glare. Outgoing SDP/ICE is handed to
 * the caller, which serialises it over the meeting socket; nothing here touches
 * `window` globals.
 */
export function useWebRtc(opts: UseWebRtcOpts) {
  const pcs = useRef<Map<string, PeerConnection>>(new Map());
  const localStream = useRef<MediaStream | null>(null);
  // Trickle ICE can land before the answering side has a peer connection (or a
  // remote description). Dropping those candidates is what makes a connection
  // succeed or fail at random, so hold them until the connection can take them.
  const pendingIce = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const [peers, setPeers] = useState<PeerConnection[]>([]);

  // Callbacks change every render (they close over socket helpers); a ref keeps
  // the peer connections pointing at the latest ones without re-creating them.
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const flush = useCallback(() => {
    setPeers([...pcs.current.values()]);
  }, []);

  /** Adds buffered candidates now that a remote description exists. */
  const flushPendingIce = useCallback(async (id: string, pc: RTCPeerConnection) => {
    const queued = pendingIce.current.get(id);
    if (!queued?.length) return;
    pendingIce.current.delete(id);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        /* a stale candidate after renegotiation is harmless */
      }
    }
  }, []);

  const getOrCreate = useCallback(
    (id: string, name: string): PeerConnection => {
      const existing = pcs.current.get(id);
      if (existing) {
        if (name) existing.name = name;
        return existing;
      }
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const entry: PeerConnection = { id, name, pc, remoteStream: null };
      pcs.current.set(id, entry);

      pc.ontrack = (ev: RTCTrackEvent) => {
        const stream = ev.streams[0];
        if (stream) {
          entry.remoteStream = stream;
          optsRef.current.onRemoteTrack?.(id, stream);
          flush();
        }
      };

      pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
        if (ev.candidate) optsRef.current.sendIce(id, ev.candidate.toJSON());
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          entry.remoteStream = null;
          flush();
        }
      };

      if (localStream.current) {
        for (const track of localStream.current.getTracks()) {
          pc.addTrack(track, localStream.current);
        }
      }

      flush();
      return entry;
    },
    [flush],
  );

  const addLocalStream = useCallback((stream: MediaStream) => {
    localStream.current = stream;
    for (const entry of pcs.current.values()) {
      for (const track of stream.getTracks()) {
        const already = entry.pc.getSenders().some((sender) => sender.track === track);
        if (!already) entry.pc.addTrack(track, stream);
      }
    }
  }, []);

  const removeLocalStream = useCallback((stream: MediaStream) => {
    for (const entry of pcs.current.values()) {
      for (const track of stream.getTracks()) {
        const sender = entry.pc.getSenders().find((s) => s.track === track);
        if (sender) entry.pc.removeTrack(sender);
      }
    }
    if (localStream.current === stream) localStream.current = null;
  }, []);

  /** Swap the outgoing video track (camera → screen and back) without renegotiating. */
  const replaceOutgoingVideo = useCallback((track: MediaStreamTrack | null) => {
    for (const entry of pcs.current.values()) {
      const sender = entry.pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) void sender.replaceTrack(track).catch(() => undefined);
    }
  }, []);

  const handleOffer = useCallback(
    async (from: string, name: string, sdp: string) => {
      const entry = getOrCreate(from, name);
      try {
        await entry.pc.setRemoteDescription({ type: "offer", sdp });
        await flushPendingIce(from, entry.pc);
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        if (answer.sdp) optsRef.current.sendAnswer(from, answer.sdp);
      } catch (err) {
        console.error("[webrtc] offer failed", from, err);
      }
    },
    [getOrCreate, flushPendingIce],
  );

  const handleAnswer = useCallback(
    async (from: string, sdp: string) => {
      const entry = pcs.current.get(from);
      if (!entry) return;
      try {
        await entry.pc.setRemoteDescription({ type: "answer", sdp });
        await flushPendingIce(from, entry.pc);
      } catch (err) {
        console.error("[webrtc] answer failed", from, err);
      }
    },
    [flushPendingIce],
  );

  const handleIce = useCallback(async (from: string, candidate: RTCIceCandidateInit | null) => {
    if (!candidate) return;
    const entry = pcs.current.get(from);
    // No connection yet, or no remote description: buffer instead of discarding.
    if (!entry || !entry.pc.remoteDescription) {
      const queued = pendingIce.current.get(from) ?? [];
      if (queued.length < 100) queued.push(candidate);
      pendingIce.current.set(from, queued);
      return;
    }
    try {
      await entry.pc.addIceCandidate(candidate);
    } catch {
      /* a candidate for an already-closed connection is not actionable */
    }
  }, []);

  const createOffer = useCallback(
    async (to: string, name: string) => {
      const entry = getOrCreate(to, name);
      try {
        const offer = await entry.pc.createOffer();
        await entry.pc.setLocalDescription(offer);
        if (offer.sdp) optsRef.current.sendOffer(to, offer.sdp);
      } catch (err) {
        console.error("[webrtc] offer creation failed", to, err);
      }
    },
    [getOrCreate],
  );

  const removePeer = useCallback(
    (id: string) => {
      const entry = pcs.current.get(id);
      if (!entry) return;
      entry.pc.close();
      pcs.current.delete(id);
      pendingIce.current.delete(id);
      flush();
    },
    [flush],
  );

  const cleanup = useCallback(() => {
    for (const entry of pcs.current.values()) entry.pc.close();
    pcs.current.clear();
    pendingIce.current.clear();
    localStream.current = null;
    setPeers([]);
  }, []);

  return {
    peers,
    addLocalStream,
    removeLocalStream,
    replaceOutgoingVideo,
    handleOffer,
    handleAnswer,
    handleIce,
    createOffer,
    removePeer,
    cleanup,
  };
}
