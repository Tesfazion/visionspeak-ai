"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PeerConnection {
  id: string;
  name: string;
  pc: RTCPeerConnection;
  remoteStream: MediaStream | null;
  videoSender: RTCRtpSender | null;
  isPolite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
}

export interface UseWebRtcOpts {
  peerId: string | null;
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
 * One `RTCPeerConnection` per remote. The perfect negotiation pattern lets
 * either side add media later without offer collisions breaking the connection.
 * Outgoing SDP/ICE is handed to the caller, which serialises it over the meeting
 * socket; nothing here touches `window` globals.
 */
export function useWebRtc(opts: UseWebRtcOpts) {
  const pcs = useRef<Map<string, PeerConnection>>(new Map());
  const localStream = useRef<MediaStream | null>(null);
  const outgoingVideo = useRef<MediaStreamTrack | null>(null);
  const hasVideoOverride = useRef(false);
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
      const entry: PeerConnection = {
        id,
        name,
        pc,
        remoteStream: null,
        videoSender: null,
        isPolite: (optsRef.current.peerId ?? "") > id,
        makingOffer: false,
        ignoreOffer: false,
        isSettingRemoteAnswerPending: false,
      };
      pcs.current.set(id, entry);

      pc.ontrack = (ev: RTCTrackEvent) => {
        const stream = entry.remoteStream ?? new MediaStream();
        if (!stream.getTracks().some((track) => track.id === ev.track.id)) {
          stream.addTrack(ev.track);
        }
        entry.remoteStream = stream;
        optsRef.current.onRemoteTrack?.(id, stream);
        flush();
      };

      pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
        if (ev.candidate) optsRef.current.sendIce(id, ev.candidate.toJSON());
      };

      pc.onnegotiationneeded = async () => {
        try {
          entry.makingOffer = true;
          await pc.setLocalDescription();
          const sdp = pc.localDescription?.sdp;
          if (sdp) optsRef.current.sendOffer(id, sdp);
        } catch (err) {
          console.error("[webrtc] negotiation failed", id, err);
        } finally {
          entry.makingOffer = false;
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          entry.remoteStream = null;
          flush();
        }
      };

      if (localStream.current) {
        for (const track of localStream.current.getAudioTracks()) {
          pc.addTrack(track, localStream.current);
        }
      }
      const videoTrack = hasVideoOverride.current
        ? outgoingVideo.current
        : localStream.current?.getVideoTracks()[0] ?? null;
      if (videoTrack) {
        entry.videoSender = pc.addTrack(videoTrack, new MediaStream([videoTrack]));
      }

      flush();
      return entry;
    },
    [flush],
  );

  const addLocalStream = useCallback((stream: MediaStream) => {
    localStream.current = stream;
    if (!hasVideoOverride.current) {
      outgoingVideo.current = stream.getVideoTracks()[0] ?? null;
    }
    for (const entry of pcs.current.values()) {
      for (const track of stream.getAudioTracks()) {
        const already = entry.pc.getSenders().some((sender) => sender.track === track);
        if (!already) entry.pc.addTrack(track, stream);
      }
      const videoTrack = hasVideoOverride.current
        ? outgoingVideo.current
        : stream.getVideoTracks()[0] ?? null;
      if (videoTrack && !entry.pc.getSenders().some((sender) => sender.track === videoTrack)) {
        entry.videoSender = entry.pc.addTrack(videoTrack, new MediaStream([videoTrack]));
      }
    }
  }, []);

  const removeLocalStream = useCallback((stream: MediaStream) => {
    for (const entry of pcs.current.values()) {
      for (const track of stream.getTracks()) {
        const sender = entry.pc.getSenders().find((s) => s.track === track);
        if (sender) {
          entry.pc.removeTrack(sender);
          if (entry.videoSender === sender) entry.videoSender = null;
        }
      }
    }
    if (localStream.current === stream) {
      localStream.current = null;
      outgoingVideo.current = null;
      hasVideoOverride.current = false;
    }
  }, []);

  /** Swap the outgoing video track, adding a sender if video was not negotiated yet. */
  const replaceOutgoingVideo = useCallback((track: MediaStreamTrack | null) => {
    outgoingVideo.current = track;
    hasVideoOverride.current = true;
    for (const entry of pcs.current.values()) {
      if (entry.videoSender) {
        void entry.videoSender.replaceTrack(track).catch((err) => {
          console.error("[webrtc] video track replacement failed", entry.id, err);
        });
      } else if (track) {
        entry.videoSender = entry.pc.addTrack(track);
      }
    }
  }, []);

  const handleOffer = useCallback(
    async (from: string, name: string, sdp: string) => {
      const entry = getOrCreate(from, name);
      try {
        const offerCollision =
          entry.makingOffer ||
          (entry.pc.signalingState !== "stable" && !entry.isSettingRemoteAnswerPending);
        entry.ignoreOffer = !entry.isPolite && offerCollision;
        if (entry.ignoreOffer) return;
        await entry.pc.setRemoteDescription({ type: "offer", sdp });
        entry.isSettingRemoteAnswerPending = false;
        await flushPendingIce(from, entry.pc);
        await entry.pc.setLocalDescription();
        const answerSdp = entry.pc.localDescription?.sdp;
        if (answerSdp) optsRef.current.sendAnswer(from, answerSdp);
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
        entry.isSettingRemoteAnswerPending = true;
        await entry.pc.setRemoteDescription({ type: "answer", sdp });
        await flushPendingIce(from, entry.pc);
      } catch (err) {
        console.error("[webrtc] answer failed", from, err);
      } finally {
        entry.isSettingRemoteAnswerPending = false;
      }
    },
    [flushPendingIce],
  );

  const handleIce = useCallback(async (from: string, candidate: RTCIceCandidateInit | null) => {
    if (!candidate) return;
    const entry = pcs.current.get(from);
    if (entry?.ignoreOffer) return;
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
    outgoingVideo.current = null;
    hasVideoOverride.current = false;
    setPeers([]);
  }, []);

  const connectPeer = useCallback(
    (to: string, name: string) => {
      getOrCreate(to, name);
    },
    [getOrCreate],
  );

  return {
    peers,
    addLocalStream,
    removeLocalStream,
    replaceOutgoingVideo,
    handleOffer,
    handleAnswer,
    handleIce,
    connectPeer,
    removePeer,
    cleanup,
  };
}
