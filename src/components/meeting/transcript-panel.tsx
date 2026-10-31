"use client";

import React from "react";
import { cn } from "@/components/ui";
import { ChevronDown, ChevronRight, ChevronUp, FileText, Save } from "@/components/icons";

/**
 * Notes are owned by the parent (they are persisted with the meeting), but the
 * textarea needs to stay responsive while typing. We keep the draft in state and
 * mirror the parent value when it changes *from the outside*; comparing before
 * setting avoids the cascading render that a plain `useEffect(() => setX(p), [p])`
 * causes on every keystroke round-trip.
 */

export interface TranscriptEntry {
  words: number;
  text: string;
  interim?: string;
}

export interface TranscriptPanelProps {
  open: boolean;
  onToggle: () => void;
  transcript: string;
  interim?: string;
  wordCount?: number;
  notes: string;
  onNotesChange: (v: string) => void;
  onSaveNotes: () => void;
  className?: string;
}

export function TranscriptPanel({
  open,
  onToggle,
  transcript,
  interim,
  wordCount,
  notes,
  onNotesChange,
  onSaveNotes,
  className,
}: TranscriptPanelProps) {
  const [expanded, setExpanded] = React.useState(true);

  const handleNotes = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onNotesChange(e.target.value);
  };

  return (
    <aside
      className={cn(
        "no-print fixed bottom-20 right-0 z-40 hidden sm:flex sm:w-[380px]",
        open ? "translate-x-0 opacity-100" : "translate-x-full opacity-0",
        "transition-transform duration-300 ease-out",
        className,
      )}
      aria-label="Live transcript"
    >
      <div className="flex h-full w-full flex-col rounded-l-none rounded-2xl border border-line bg-raised/70 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-line bg-surface/50 px-3 py-2 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-1.5">
            <FileText className="size-4 text-brand-soft" />
            <span className="font-semibold text-ink text-[12px]">Live transcript</span>
          </div>
          <button type="button" onClick={onToggle} className="rounded-lg p-1 text-mist hover:text-ink">
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        </div>

        {expanded ? (
          <>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-2 text-[11.5px] leading-relaxed text-ink/85">
                {transcript || interim ? (
                  <>
                    {transcript && <p className="text-fog/80">{transcript}</p>}
                    {interim && <p className="animate-pulse text-fog/60">{interim}</p>}
                  </>
                ) : (
                  <p className="text-center text-fog/60 py-6">Words appear here as you speak.</p>
                )}
              </div>
            </div>

            <div className="border-t border-line p-3">
              <div className="mb-1 flex justify-between">
                <span className="text-[9.5px] uppercase tracking-[0.12em] text-fog">{wordCount ?? 0} words</span>
              </div>
              <textarea
                value={notes}
                onChange={handleNotes}
                placeholder="Notes for this session…"
                className="h-20 w-full resize-none rounded-lg border border-line bg-base/40 px-2.5 py-2 text-[11.5px] text-ink placeholder:text-fog/50 focus:border-brand/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => { onSaveNotes(); setExpanded(false); }}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand/40 bg-brand/10 px-3 py-1.5 text-[11px] font-medium text-brand-soft transition-colors hover:bg-brand/20"
                title="Save notes"
              >
                <Save className="size-3" /> Save notes
              </button>
            </div>
          </>
        ) : (
          <div className="p-3">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-raised px-2.5 py-1.5 text-[11px] text-fog hover:text-ink"
            >
              <ChevronUp className="size-3" /> Show transcript
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
