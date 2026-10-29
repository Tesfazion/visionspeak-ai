"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, Link2, Loader2, Printer, Share2, Trash2 } from "@/components/icons";
import { Button } from "@/components/ui";
import type { SessionRecord } from "@/lib/types";

interface Props {
  session: SessionRecord;
  /** Only the owner may delete, share or revoke. */
  canManage?: boolean;
  /** Pro plans unlock CSV export (see src/lib/plans.ts). */
  canExportCsv?: boolean;
}

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(iso));

export function ReportActions({ session, canManage = false, canExportCsv = false }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(
    session.share ? `/report/${session.id}?share=${session.share.token}` : null,
  );
  const [shareExpiry, setShareExpiry] = useState<string | null>(session.share?.expiresAt ?? null);
  const [shareError, setShareError] = useState<string | null>(null);

  const r = session.report;

  const copySummary = async () => {
    const text = [
      `${session.title} — ${r.grade} ${r.gradeLabel}`,
      `Overall ${r.overall}/100 · Confidence ${r.pillars.confidence} · Leadership ${r.pillars.leadership} · Communication ${r.pillars.communication}`,
      "",
      "Strengths:",
      ...r.strengths.map((s) => `• ${s.title} — ${s.detail}`),
      "",
      "Focus next:",
      ...r.improvements.map((s) => `• ${s.title} — ${s.detail}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  const copyShare = async (url: string) => {
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is still visible below */
    }
  };

  const share = async () => {
    setShareError(null);
    if (shareUrl) {
      await copyShare(shareUrl);
      return;
    }
    setSharing(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/share`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { url?: string; expiresAt?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "Share link could not be created.");
      setShareUrl(body.url);
      setShareExpiry(body.expiresAt ?? null);
      await copyShare(body.url);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Share link could not be created.");
    } finally {
      setSharing(false);
    }
  };

  const revoke = async () => {
    setSharing(true);
    setShareError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/share`, { method: "DELETE" });
      if (!res.ok) throw new Error("Sharing could not be stopped.");
      setShareUrl(null);
      setShareExpiry(null);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Sharing could not be stopped.");
    } finally {
      setSharing(false);
    }
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `visionspeak-${session.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    const rows: [string, string | number][] = [
      ["session", session.title],
      ["speaker", session.speaker],
      ["mode", session.mode],
      ["created_at", session.createdAt],
      ["duration_sec", session.durationSec],
      ["overall", r.overall],
      ["grade", `${r.grade} ${r.gradeLabel}`],
      ["confidence", r.pillars.confidence],
      ["leadership", r.pillars.leadership],
      ["communication", r.pillars.communication],
      ["engagement", r.pillars.engagement],
      ["eye_contact", r.pillars.eyeContact],
      ["posture", r.pillars.posture],
      ["gestures", r.pillars.gestures],
      ["voice", r.pillars.voice],
      ["expression", r.pillars.expression],
      ["eye_contact_pct", r.face.eyeContactPct],
      ["wpm", r.voice.avgWpm],
      ["filler_rate_per_100w", r.speech.fillerRate],
      ["word_count", r.speech.wordCount],
    ];
    // Quote every cell: a transcript-derived title may contain a comma.
    const csv = ["metric,value", ...rows.map(([k, v]) => `${k},"${String(v).replace(/"/g, '""')}"`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `visionspeak-${session.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const remove = async () => {
    if (!window.confirm("Delete this session permanently?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setDeleting(false);
      window.alert("The session could not be deleted.");
    }
  };

  return (
    <div className="no-print flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="subtle" size="sm" onClick={copySummary}>
          {copied ? <Check className="size-3.5 text-mint" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy summary"}
        </Button>
        <Button variant="subtle" size="sm" onClick={() => window.print()}>
          <Printer className="size-3.5" /> Print / PDF
        </Button>
        {canExportCsv && (
          <Button variant="subtle" size="sm" onClick={downloadCsv}>
            <Download className="size-3.5" /> CSV
          </Button>
        )}
        <Button variant="subtle" size="sm" onClick={download}>
          <Download className="size-3.5" /> JSON
        </Button>
        {canManage && (
          <>
            <Button variant="subtle" size="sm" onClick={share} disabled={sharing}>
              {sharing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : shareUrl ? (
                <Link2 className="size-3.5" />
              ) : (
                <Share2 className="size-3.5" />
              )}
              {shareUrl ? "Copy link" : "Share"}
            </Button>
            <Button variant="danger" size="sm" onClick={remove} disabled={deleting}>
              <Trash2 className="size-3.5" />
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </>
        )}
      </div>

      {canManage && shareUrl && (
        <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-fog">
          <span className="text-mint">
            Share link live{shareExpiry ? ` · expires ${shortDate(shareExpiry)}` : ""}
          </span>
          <button type="button" onClick={revoke} disabled={sharing} className="underline hover:text-ink">
            Stop sharing
          </button>
        </div>
      )}
      {shareError && <p className="text-[10.5px] text-rose">{shareError}</p>}
    </div>
  );
}
