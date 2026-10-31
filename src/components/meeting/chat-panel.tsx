"use client";

import React from "react";
import { cn } from "@/components/ui";
import { Input } from "@/components/ui";
import { MessageCircle, Send, Activity } from "@/components/icons";

export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
}

export interface ChatPanelProps {
  open: boolean;
  messages: ChatMessage[];
  myPeerId: string | null;
  onSend: (text: string) => void;
  className?: string;
}

export function ChatPanel({
  open,
  messages,
  myPeerId,
  onSend,
  className,
}: ChatPanelProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [value, setValue] = React.useState("");

  return (
    <aside
      className={cn(
        "no-print fixed inset-y-0 right-0 z-40 flex flex-col w-full sm:w-[400px]",
        "border-l border-line bg-raised backdrop-blur-xl",
        open ? "translate-x-0" : "translate-x-full",
        "transition-transform duration-300 ease-out",
        className,
      )}
      aria-label="Meeting chat"
    >
      <div className="flex items-center justify-between border-b border-line bg-surface/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="size-4 text-brand-soft" />
          <span className="font-semibold text-ink">Meeting chat</span>
        </div>
        <button
          type="button"
          className="rounded-lg p-1.5 text-mist hover:bg-white/5 hover:text-ink"
          aria-label="Close chat"
        >
          <span className="sr-only">Close chat</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line/50 bg-white/[0.02] px-4 text-center text-fog/70">
            <Activity className="size-6 opacity-50" />
            <span className="text-[11px]">No messages yet — say hello.</span>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.from === myPeerId;
            return (
              <div key={m.id} className={cn("flex gap-2 text-sm", mine ? "flex-row-reverse" : "")}>
                <div className={cn("max-w-[80%] rounded-lg border px-3 py-2", mine
                  ? "bg-brand/10 border-brand/40 text-white"
                  : "bg-white/[0.03] border-line text-ink/90")}>
                  {mine ? (
                    <span className="block text-[10px] text-fog/60 uppercase">You</span>
                  ) : (
                    <span className="block text-[10px] font-semibold text-brand-soft">{m.name}</span>
                  )}
                  <div className="leading-relaxed text-[12px]">{m.text}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-line bg-surface p-3 flex items-center gap-2">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type a message…"
          className="h-9 text-[12px]"
        />
        <button
          type="button"
          disabled={!value.trim()}
          onClick={() => {
            if (!value.trim()) return;
            onSend(value.trim());
            setValue("");
          }}
          className={cn(
            "relative flex items-center justify-center rounded-xl border border-line bg-raised px-3 py-1.5 text-[12px] font-medium",
            !value.trim() ? "text-fog cursor-not-allowed opacity-60" : "border-brand/50 bg-brand/10 text-brand-soft shadow-[0_0_0_1px_rgba(124,92,255,0.3)]",
          )}
          title="Send"
        >
          <Send className="size-3.5" />
        </button>
      </div>
    </aside>
  );
}