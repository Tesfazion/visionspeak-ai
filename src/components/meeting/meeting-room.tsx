"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui";
import { FileText, MessageSquare, Settings } from "@/components/icons";
import { SignalGrid } from "@/components/studio/panels";
import { useVisionSession } from "@/hooks/useVisionSession";
import { useMeetingSocket } from "@/hooks/useMeetingSocket";
import { useWebRtc } from "@/hooks/useWebRtc";
import type { SessionMode } from "@/lib/types";
import type { SignalEvent } from "@/lib/meeting/types";
import { ParticipantGrid } from "./participant-grid";
import { ControlBar } from "./control-bar";
import { ChatPanel } from "./chat-panel";
import { TranscriptPanel } from "./transcript-panel";

export interface MeetingRoomProps {
  meetingId: string;
  title: string;
  mode: SessionMode;
  selfName: string;
  selfRole: "host" | "participant";
}

export function MeetingRoom({
  meetingId,
  title,
  mode,
  selfName,
  selfRole,
}: MeetingRoomProps) {
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [view, setView] = useState<"grid" | "speaker">("grid");
  const [notes, setNotes] = useState("");
  const [joined, setJoined] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const screenStreamRef = useRef<MediaStream | null>(null);
  const offered = useRef<Set<string>>(new Set());
  const signalHandler = useRef<(event: SignalEvent) => void>(() => undefined);
  const peerNames = useRef<Map<string, string>>(new Map());

  const socket = useMeetingSocket(meetingId, {
    name: selfName,
    role: selfRole,
    onEvent: (event) => signalHandler.current(event),
  });
  const socketRef = useRef(socket);
  useEffect(() => {
    socketRef.current = socket;
  });

  const {
    peers: rtcPeers,
    addLocalStream,
    replaceOutgoingVideo,
    handleOffer,
    handleAnswer,
    handleIce,
    createOffer,
    removePeer,
    cleanup,
  } = useWebRtc({
    sendOffer: (to, sdp) => socketRef.current.sendOffer(to, sdp),
    sendAnswer: (to, sdp) => socketRef.current.sendAnswer(to, sdp),
    sendIce: (to, candidate) => socketRef.current.sendIce(to, candidate),
  });

  const vision = useVisionSession(mode, { onFlush: async () => undefined });
  const {
    start,
    stop,
    toggle,
    phase,
    metrics,
    speech,
    stream,
    audioOnly,
    error,
    videoRef,
    canvasRef,
  } = vision;

  // SDP/ICE → WebRTC. Kept in a ref so a new closure each render cannot restart
  // the socket's poll loop.
  useEffect(() => {
    signalHandler.current = (event) => {
      switch (event.type) {
        case "offer":
          void handleOffer(
            event.from,
            peerNames.current.get(event.from) ?? "Participant",
            event.sdp,
          );
          break;
        case "answer":
          void handleAnswer(event.from, event.sdp);
          break;
        case "ice":
          void handleIce(event.from, event.candidate);
          break;
        case "peer_left":
          offered.current.delete(event.peerId);
          removePeer(event.peerId);
          break;
        default:
          break;
      }
    };
  }, [handleOffer, handleAnswer, handleIce, removePeer]);

  useEffect(() => {
    peerNames.current = new Map(socket.peers.map((peer) => [peer.id, peer.name]));
  }, [socket.peers]);

  // Share the camera with every peer connection as soon as it is available.
  useEffect(() => {
    if (stream) addLocalStream(stream);
  }, [stream, addLocalStream]);

  // Deterministic offerer: the lower peer id offers, so the two sides never
  // collide. Wait for the local stream so the first offer already carries media.
  useEffect(() => {
    const myId = socket.peerId;
    if (!myId || !stream) return;
    for (const peer of socket.peers) {
      if (peer.id === myId) continue;
      if (myId < peer.id && !offered.current.has(peer.id)) {
        offered.current.add(peer.id);
        void createOffer(peer.id, peer.name);
      }
    }
  }, [socket.peers, socket.peerId, stream, createOffer]);

  const join = useCallback(async () => {
    setJoined(true);
    await start();
  }, [start]);

  const toggleMic = useCallback(() => {
    const next = !muted;
    setMuted(next);
    stream?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    socket.sendMediaState(next, videoOff, screenSharing);
  }, [muted, stream, socket, videoOff, screenSharing]);

  const toggleCamera = useCallback(() => {
    const next = !videoOff;
    setVideoOff(next);
    stream?.getVideoTracks().forEach((track) => {
      track.enabled = !next;
    });
    socket.sendMediaState(muted, next, screenSharing);
  }, [videoOff, stream, socket, muted, screenSharing]);

  const stopScreenShare = useCallback(() => {
    const current = screenStreamRef.current;
    if (!current) return;
    screenStreamRef.current = null;
    current.getTracks().forEach((track) => track.stop());
    setScreenStream(null);
    setScreenSharing(false);
    replaceOutgoingVideo(stream?.getVideoTracks()[0] ?? null);
    socket.sendScreenShare(false);
    socket.sendMediaState(muted, videoOff, false);
  }, [replaceOutgoingVideo, stream, socket, muted, videoOff]);

  const toggleScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      stopScreenShare();
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = display;
      setScreenStream(display);
      setScreenSharing(true);
      replaceOutgoingVideo(display.getVideoTracks()[0] ?? null);
      socket.sendScreenShare(true);
      socket.sendMediaState(muted, videoOff, true);
      display.getVideoTracks()[0]?.addEventListener("ended", stopScreenShare, { once: true });
    } catch {
      /* the user dismissed the picker */
    }
  }, [replaceOutgoingVideo, socket, stopScreenShare, muted, videoOff]);

  const endCall = useCallback(async () => {
    const host = selfRole === "host";
    const prompt = host ? "End this meeting for everyone?" : "Leave the meeting?";
    if (!window.confirm(prompt)) return;

    setLeaving(true);
    socket.leave();
    const transcript = speech?.transcript ?? "";
    stop();
    cleanup();
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());

    try {
      await fetch(`/api/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, transcript }),
      });
      if (host) {
        await fetch(`/api/meetings/${meetingId}`, { method: "DELETE" });
      }
    } catch {
      /* leaving must not be blocked by a failed save */
    }
    router.push("/dashboard");
  }, [selfRole, socket, speech, stop, cleanup, notes, meetingId, router]);

  const others = socket.peers.filter((peer) => peer.id !== socket.peerId);
  const remotes = others.map((peer) => ({
    id: peer.id,
    stream: rtcPeers.find((entry) => entry.id === peer.id)?.remoteStream ?? null,
    speaking: false,
  }));
  const connection = !socket.connected
    ? ("poor" as const)
    : audioOnly
      ? ("fair" as const)
      : ("good" as const);

  return (
    <div className="relative min-h-[calc(100dvh-4rem)] w-full bg-base/95">
      {/* The engine needs these in the DOM; the tile renders the same stream. */}
      <video ref={videoRef} playsInline muted className="pointer-events-none absolute size-px opacity-0" aria-hidden />
      <canvas ref={canvasRef} className="hidden" aria-hidden />

      <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-[1600px] gap-3 p-3 sm:p-4">
        <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
          <header className="flex items-center justify-between gap-3 border-b border-line/60 bg-surface/50 px-4 py-2.5 backdrop-blur-md">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`size-2 shrink-0 rounded-full ${socket.connected ? "bg-mint animate-pulse" : "bg-amber"}`}
                aria-hidden
              />
              <span className="text-[11px] font-medium text-mint">
                {socket.connected ? "Live" : "Reconnecting"}
              </span>
              <span className="truncate text-[11px] text-fog/70">{title}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-[0.12em] text-fog/50">
                {socket.peers.length} in the room
              </span>
              <button
                type="button"
                onClick={() => setChatOpen((v) => !v)}
                className="rounded-lg p-1.5 text-mist transition-colors hover:bg-white/5 hover:text-ink"
                aria-label="Toggle chat"
              >
                <MessageSquare className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setTranscriptOpen((v) => !v)}
                className="rounded-lg p-1.5 text-mist transition-colors hover:bg-white/5 hover:text-ink"
                aria-label="Toggle transcript"
              >
                <FileText className="size-4" />
              </button>
              <button
                type="button"
                className="rounded-lg p-1.5 text-mist transition-colors hover:bg-white/5 hover:text-ink"
                aria-label="Settings"
              >
                <Settings className="size-4" />
              </button>
            </div>
          </header>

          <div className="relative min-h-0 flex-1 overflow-auto p-3 sm:p-4">
            <ParticipantGrid
              self={{
                name: selfName,
                role: selfRole,
                video: screenStream ?? stream,
                muted,
                videoOff: videoOff || audioOnly,
                screenSharing,
                speaking: metrics?.speaking ?? false,
              }}
              peers={others}
              remotes={remotes}
              view={view}
              screenPeerId={socket.screenPeer}
            />

            {!joined && (
              <div className="absolute inset-0 grid place-items-center bg-base/70 backdrop-blur-sm">
                <div className="panel flex max-w-sm flex-col items-center gap-3 px-6 py-8 text-center">
                  <span className="grid size-12 place-items-center rounded-2xl border border-brand/30 bg-brand/10 text-brand-soft">
                    <FileText className="size-5" />
                  </span>
                  <h2 className="text-[16px] font-medium text-ink">Ready to join?</h2>
                  <p className="text-[12px] leading-relaxed text-fog">
                    Your camera stays on this device — VisionSpeak only sends the derived scores and the
                    transcript you choose to save.
                  </p>
                  <button
                    type="button"
                    onClick={join}
                    disabled={phase === "requesting" || phase === "loading"}
                    className="rounded-lg border border-brand/50 bg-brand/15 px-4 py-2 text-[12px] font-medium text-brand-soft transition-colors hover:bg-brand/25 disabled:opacity-60"
                  >
                    {phase === "requesting" || phase === "loading" ? "Warming up…" : "Join room"}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-x-3 bottom-3 rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">
                {error}{" "}
                <button type="button" onClick={join} className="underline decoration-rose/40 hover:text-ink">
                  Retry
                </button>
              </div>
            )}
          </div>

          <div className="px-3 pb-3 sm:px-4 sm:pb-4">
            <ControlBar
              muted={muted}
              videoOff={videoOff || audioOnly}
              screenSharing={screenSharing}
              recording={false}
              paused={phase === "paused"}
              participantCount={Math.max(1, socket.peers.length)}
              unreadMessages={0}
              chatOpen={chatOpen}
              view={view}
              connection={connection}
              onToggleMic={toggleMic}
              onToggleCamera={toggleCamera}
              onToggleScreenShare={() => void toggleScreenShare()}
              onToggleChat={() => setChatOpen((v) => !v)}
              onToggleView={() => setView((v) => (v === "grid" ? "speaker" : "grid"))}
              onView={setView}
              onTogglePause={toggle}
              onEndCall={() => void endCall()}
              onOpenSettings={() => setTranscriptOpen(true)}
            />
          </div>
        </Panel>

        <aside className="hidden w-72 shrink-0 overflow-y-auto xl:block">
          <SignalGrid metrics={metrics} />
        </aside>
      </div>

      <ChatPanel
        open={chatOpen}
        messages={socket.messages}
        myPeerId={socket.peerId}
        onSend={socket.sendChat}
      />

      <TranscriptPanel
        open={transcriptOpen}
        onToggle={() => setTranscriptOpen((v) => !v)}
        transcript={speech?.transcript ?? ""}
        interim={speech?.interim}
        wordCount={speech?.words ?? 0}
        notes={notes}
        onNotesChange={setNotes}
        onSaveNotes={() => {
          void fetch(`/api/meetings/${meetingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes }),
          });
        }}
      />

      {leaving && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-base/80 text-[12px] text-fog backdrop-blur">
          Leaving the room…
        </div>
      )}
    </div>
  );
}
