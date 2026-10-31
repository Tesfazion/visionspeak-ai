"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/components/ui";
import { MicOff, VideoOff, Users } from "@/components/icons";

export interface TileProps {
  name: string;
  role?: "host" | "co-host" | "participant";
  video?: MediaStream | HTMLVideoElement | null;
  audio?: MediaStream | null;
  muted?: boolean;
  videoOff?: boolean;
  screenSharing?: boolean;
  speaking?: boolean;
  isSelf?: boolean;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * One participant tile. The video element is created here so the parent only
 * has to hand over a stream — the `<video playsInline muted>` contract is the
 * same one the studio uses, so the same camera track works in both places.
 */
export function Tile({
  name,
  role,
  video,
  audio,
  muted = false,
  videoOff = false,
  screenSharing = false,
  speaking = false,
  isSelf = false,
  label,
  size = "md",
  className,
}: TileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Derived, not state: whether a stream exists is a pure function of the prop,
  // so storing it would only add an effect-driven render for no benefit.
  const hasStream = video != null;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const stream = video instanceof HTMLVideoElement ? null : (video as MediaStream | null);
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => undefined);
    }
  }, [video]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audio) return;
    if (el.srcObject !== audio) {
      el.srcObject = audio;
      el.play().catch(() => undefined);
    }
  }, [audio]);

  const dims = size === "sm" ? "aspect-square" : size === "lg" ? "aspect-video" : "aspect-[4/3]";
  const roleLabel = role && role !== "participant" ? role : "";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-surface",
        speaking ? "border-brand/60 shadow-glow-brand" : "border-line",
        dims,
        className,
      )}
    >
      {videoOff || !hasStream ? (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-raised to-surface">
          <div className="grid size-12 place-items-center rounded-full border border-line bg-raised text-fog">
            <Users className="size-6" />
          </div>
        </div>
      ) : null}

      <video
        ref={videoRef}
        className={cn(
          "absolute inset-0 h-full w-full object-cover",
          // Mirror self-view so gestures read naturally.
          isSelf && "scale-x-[-1]",
          videoOff && "hidden",
        )}
        playsInline
        muted={isSelf || muted}
      />
      <audio ref={audioRef} className="hidden" />

      {/* speaker ring */}
      {speaking && (
        <span className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-brand/60" aria-hidden />
      )}

      {/* top-left: name + role */}
      <div className="absolute left-2 top-2 flex items-center gap-1.5">
        <span
          className={cn(
            "rounded-md border px-1.5 py-0.5 text-[10px] font-medium backdrop-blur",
            isSelf
              ? "border-brand/40 bg-brand/20 text-brand-soft"
              : "border-white/15 bg-black/40 text-white/85",
          )}
        >
          {name || (isSelf ? "You" : "Someone")}
        </span>
        {roleLabel && (
          <span className="hidden rounded-md border border-white/15 bg-black/40 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-white/60 sm:inline">
            {roleLabel}
          </span>
        )}
      </div>

      {/* bottom: status */}
      <div className="absolute left-2 bottom-2 flex items-center gap-1.5">
        {videoOff && (
          <span className="flex items-center gap-1 rounded-md border border-rose/30 bg-rose/10 px-1.5 py-0.5 text-[9px] text-rose">
            <VideoOff className="size-3" /> camera
          </span>
        )}
        {muted && !isSelf && (
          <span className="flex items-center gap-1 rounded-md border border-amber/30 bg-amber/10 px-1.5 py-0.5 text-[9px] text-amber">
            <MicOff className="size-3" /> muted
          </span>
        )}
        {screenSharing && (
          <span className="flex items-center gap-1 rounded-md border border-aqua/30 bg-aqua/10 px-1.5 py-0.5 text-[9px] text-aqua">
            screen
          </span>
        )}
      </div>

      {label && (
        <span className="absolute right-2 top-2 rounded-md border border-white/15 bg-black/40 px-1.5 py-0.5 text-[9px] text-white/60">
          {label}
        </span>
      )}
    </div>
  );
}