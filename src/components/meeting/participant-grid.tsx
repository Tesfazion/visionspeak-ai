"use client";

import { useMemo } from "react";
import { cn } from "@/components/ui";
import { Tile } from "./tile";
import type { PeerSnapshot } from "@/lib/meeting/types";

export interface RemoteStream {
  id: string;
  stream: MediaStream | null;
  speaking?: boolean;
}

export interface ParticipantGridProps {
  self: {
    name: string;
    role?: "host" | "co-host" | "participant";
    video?: MediaStream | null;
    muted: boolean;
    videoOff: boolean;
    screenSharing: boolean;
    speaking?: boolean;
  };
  peers: PeerSnapshot[];
  remotes: RemoteStream[];
  view?: "grid" | "speaker";
  screenPeerId?: string | null;
  className?: string;
}

function speakingFor(remotes: RemoteStream[], id: string) {
  return remotes.find((r) => r.id === id)?.speaking ?? false;
}

export function ParticipantGrid({
  self,
  peers,
  remotes,
  view = "grid",
  screenPeerId,
  className,
}: ParticipantGridProps) {
  const remoteStreams = useMemo(
    () => peers.map((p) => ({ ...p, stream: remotes.find((r) => r.id === p.id)?.stream ?? null })),
    [peers, remotes],
  );

  const count = 1 + remoteStreams.length;
  const cols = count <= 1 ? 1 : count <= 2 ? 2 : count <= 4 ? 2 : 3;

  if (view === "speaker" && screenPeerId) {
    const screenPeer = remoteStreams.find((p) => p.id === screenPeerId);
    return (
      <div className={cn("grid gap-3", className)}>
        <div className="grid place-items-center">
          <Tile
            name={screenPeer?.name ?? "Screen"}
            role={screenPeer?.role}
            video={screenPeer?.stream}
            muted
            videoOff={false}
            screenSharing
            size="lg"
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 overflow-hidden">
          <Tile
            name={self.name}
            role={self.role}
            video={self.video}
            muted
            videoOff={self.videoOff}
            screenSharing={self.screenSharing}
            speaking={self.speaking}
            isSelf
            size="sm"
          />
          {remoteStreams
            .filter((p) => p.id !== screenPeerId)
            .map((p) => (
              <Tile
                key={p.id}
                name={p.name}
                role={p.role}
                video={p.stream}
                muted={p.muted}
                videoOff={p.videoOff}
                screenSharing={p.screenSharing}
                speaking={speakingFor(remotes, p.id)}
                size="sm"
              />
            ))}
        </div>
      </div>
    );
  }

  if (view === "speaker") {
    const speaker =
      remoteStreams.find((p) => speakingFor(remotes, p.id)) ?? remoteStreams[0] ?? null;
    return (
      <div className={cn("grid gap-3", className)}>
        {speaker ? (
          <Tile
            name={speaker.name}
            role={speaker.role}
            video={speaker.stream}
            muted={speaker.muted}
            videoOff={speaker.videoOff}
            screenSharing={speaker.screenSharing}
            speaking
            size="lg"
            className="w-full"
          />
        ) : (
          <div className="grid place-items-center rounded-xl border border-line bg-surface p-8 text-center text-fog">
            Waiting for someone to speak.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 overflow-hidden">
          <Tile
            name={self.name}
            role={self.role}
            video={self.video}
            muted
            videoOff={self.videoOff}
            screenSharing={self.screenSharing}
            speaking={self.speaking}
            isSelf
            size="sm"
          />
          {remoteStreams
            .filter((p) => p.id !== speaker?.id)
            .map((p) => (
              <Tile
                key={p.id}
                name={p.name}
                role={p.role}
                video={p.stream}
                muted={p.muted}
                videoOff={p.videoOff}
                screenSharing={p.screenSharing}
                speaking={speakingFor(remotes, p.id)}
                size="sm"
              />
            ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("grid gap-3", className)}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      }}
    >
      <Tile
        name={self.name}
        role={self.role}
        video={self.video}
        muted
        videoOff={self.videoOff}
        screenSharing={self.screenSharing}
        speaking={self.speaking}
        isSelf
        size={count <= 2 ? "lg" : "md"}
      />
      {remoteStreams.map((p) => (
        <Tile
          key={p.id}
          name={p.name}
          role={p.role}
          video={p.stream}
          muted={p.muted}
          videoOff={p.videoOff}
          screenSharing={p.screenSharing}
          speaking={speakingFor(remotes, p.id)}
          size={count <= 2 ? "lg" : "md"}
        />
      ))}
    </div>
  );
}