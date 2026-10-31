"use client";

import { cn } from "@/components/ui";
import { Mic, MicOff, Video, VideoOff, ScreenShare, MessageSquare, Users, Phone, Settings, Pause, LayoutGrid, LayoutPanelTop } from "@/components/icons";

export interface ControlBarButton {
  id: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export interface ControlBarProps {
  muted: boolean;
  videoOff: boolean;
  screenSharing: boolean;
  recording: boolean;
  paused: boolean;
  participantCount: number;
  unreadMessages: number;
  chatOpen: boolean;
  view: "grid" | "speaker";
  connection: "good" | "fair" | "poor" | "unknown";
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleView: () => void;
  onView: (v: "grid" | "speaker") => void;
  onTogglePause: () => void;
  onEndCall: () => void;
  onOpenSettings: () => void;
  className?: string;
}

export function ControlBar({
  muted,
  videoOff,
  screenSharing,
  recording,
  paused,
  participantCount,
  unreadMessages,
  chatOpen,
  view,
  connection,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleChat,
  onToggleView,
  onView,
  onTogglePause,
  onEndCall,
  onOpenSettings,
  className,
}: ControlBarProps) {
  const connColor = connection === "good" ? "bg-mint" : connection === "fair" ? "bg-amber" : connection === "poor" ? "bg-rose" : "bg-fog/40";
  return (
    <div
      className={cn(
        "no-print pointer-events-auto mx-auto mb-6 flex items-center justify-between rounded-2xl",
        "border border-line bg-raised/70 backdrop-blur-xl",
        "px-3 py-2.5 sm:px-4 sm:py-3",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleView}
          className={cn(
            "rounded-lg border border-line px-2 py-1.5 text-[11px] text-fog transition-colors",
            view === "grid" ? "border-brand/50 bg-brand/10 text-brand-soft" : "hover:border-white/20",
          )}
          title="Toggle layout"
        >
          {view === "grid" ? <LayoutGrid className="size-3.5" /> : <LayoutPanelTop className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={onView.bind(null, "grid")}
          className={cn("rounded-lg border border-line px-2 py-1.5 text-[9px] uppercase tracking-[0.12em] text-fog transition-colors",
            view === "grid" ? "border-brand/50 bg-brand/10 text-brand-soft" : "hover:border-white/20")}
        >
          Grid
        </button>
        <button
          type="button"
          onClick={onView.bind(null, "speaker")}
          className={cn("rounded-lg border border-line px-2 py-1.5 text-[9px] uppercase tracking-[0.12em] text-fog transition-colors",
            view === "speaker" ? "border-brand/50 bg-brand/10 text-brand-soft" : "hover:border-white/20")}
        >
          Speaker
        </button>
      </div>

      <div className="flex items-center gap-1">
        <ControlButton
          icon={<Pause className="size-4" />}
          label="Pause analysis"
          active={!paused}
          onClick={onTogglePause}
        />
        <ControlButton
          icon={muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          label={muted ? "Unmute" : "Mute"}
          active={!muted}
          onClick={onToggleMic}
        />
        <ControlButton
          icon={videoOff ? <VideoOff className="size-4" /> : <Video className="size-4" />}
          label={videoOff ? "Start video" : "Stop video"}
          active={!videoOff}
          onClick={onToggleCamera}
        />
        <ControlButton
          icon={<ScreenShare className="size-4" />}
          label="Share screen"
          active={screenSharing}
          onClick={onToggleScreenShare}
        />
      </div>

      <div className="flex items-center gap-1">
        {recording && (
          <span
            className="flex items-center gap-1 rounded-lg border border-rose/30 bg-rose/10 px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-rose"
            title="Recording"
          >
            <span className="size-1.5 rounded-full bg-rose" /> Rec
          </span>
        )}
        <span
          className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[10px] text-fog"
          title={`Connection: ${connection}`}
        >
          <span className={cn("size-1.5 rounded-full", connColor)} aria-hidden />
          <span className="hidden sm:inline capitalize">{connection === "unknown" ? "connecting" : connection}</span>
        </span>
        <ControlButton
          icon={<Users className="size-4" />}
          label={`${participantCount} ${participantCount === 1 ? "participant" : "participants"}`}
          active={false}
          onClick={() => {}}
        />
        <ControlButton
          icon={<MessageSquare className="size-4" />}
          label="Chat"
          active={chatOpen}
          onClick={onToggleChat}
          badge={unreadMessages > 0 ? unreadMessages : undefined}
        />
        <ControlButton
          icon={<Settings className="size-4" />}
          label="Settings"
          active={false}
          onClick={onOpenSettings}
        />
        <button
          type="button"
          onClick={onEndCall}
          className="ml-2 flex items-center justify-center rounded-full border-2 border-rose bg-rose px-4 py-2 text-[12px] font-medium text-white shadow-lg shadow-rose/25 transition-colors hover:bg-rose/90"
          title="Leave"
        >
          <Phone className="size-4 rotate-45" /> Leave
        </button>
      </div>
    </div>
  );
}

function ControlButton({
  icon,
  label,
  active,
  disabled,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "relative flex items-center justify-center rounded-xl border border-line/50 bg-raised/60 p-2.5 text-fog transition-all",
          "hover:border-line hover:bg-white/[0.06] hover:text-ink",
          active && "border-brand/50 bg-brand/12 text-brand-soft shadow-[0_0_0_1px_rgba(124,92,255,0.3)]",
          disabled && "cursor-not-allowed opacity-40",
        )}
        title={label}
      >
        {icon}
      </button>
      {badge && (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose px-[3px] text-[8px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </div>
  );
}