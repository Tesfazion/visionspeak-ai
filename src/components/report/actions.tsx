"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Download,
  Edit,
  FileText,
  Link2,
  Loader2,
  Mail,
  Printer,
  Share2,
  Trash2,
} from "@/components/icons";
import { Button, Field, Input, Label, Textarea } from "@/components/ui";
import type { SessionRecord } from "@/lib/types";

interface Props {
  session: SessionRecord;
  /** Only the owner may delete, share or revoke. */
  canManage?: boolean;
  /** Pro plans unlock CSV export (see src/lib/plans.ts). */
  canExportCsv?: boolean;
  /** Pro plans unlock a server-rendered PDF (see src/lib/plans.ts). */
  canExportPdf?: boolean;
}

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(iso));

export function ReportActions({
  session,
  canManage = false,
  canExportCsv = false,
  canExportPdf = false,
}: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailRedact, setEmailRedact] = useState(true);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailDone, setEmailDone] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(
    session.share ? `/report/${session.id}?share=${session.share.token}` : null,
  );
  const [shareExpiry, setShareExpiry] = useState<string | null>(session.share?.expiresAt ?? null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [editSpeaker, setEditSpeaker] = useState(session.speaker);
  const [editNotes, setEditNotes] = useState(session.notes ?? "");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        expiresAt?: string;
        error?: string;
      };
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

  const downloadPdf = async () => {
    setPdfError(null);
    setPdfBusy(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/pdf`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "The PDF could not be generated.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `visionspeak-${session.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "The PDF could not be generated.");
    } finally {
      setPdfBusy(false);
    }
  };

  const saveEdit = async () => {
    setEditError(null);
    setEditBusy(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim().slice(0, 120) || "Untitled session",
          speaker: editSpeaker.trim().slice(0, 60) || "Speaker",
          notes: editNotes.slice(0, 1000),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "The session could not be updated.");
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "The session could not be updated.");
    } finally {
      setEditBusy(false);
    }
  };

  const emailReport = async () => {
    setEmailError(null);
    setEmailBusy(true);
    try {
      const res = await fetch(`/api/report/${session.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailTo, redact: emailRedact }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not send the email.");
      setEmailDone(true);
      setTimeout(() => {
        setEmailOpen(false);
        setEmailDone(false);
        setEmailTo("");
      }, 2000);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Could not send the email.");
    } finally {
      setEmailBusy(false);
    }
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
        {canExportPdf && (
          <Button variant="subtle" size="sm" onClick={downloadPdf} disabled={pdfBusy}>
            {pdfBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileText className="size-3.5" />
            )}
            {pdfBusy ? "Building…" : "Report PDF"}
          </Button>
        )}
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
<Button variant="subtle" size="sm" onClick={() => setEmailOpen((v) => !v)} disabled={emailBusy}>
          <Mail className="size-3.5" /> {emailOpen ? "Close" : "Email"}
        </Button>
        <Button variant="subtle" size="sm" onClick={() => setEditing(true)}>
          <Edit className="size-3.5" /> Edit
        </Button>
        <Button variant="danger" size="sm" onClick={remove} disabled={deleting}>
              <Trash2 className="size-3.5" />
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </>
        )}
      </div>

      {canManage && emailOpen && (
        <div className="mt-3 w-full max-w-sm rounded-xl border border-line bg-white/[0.02] p-4">
          {emailDone ? (
            <p className="text-[12px] text-mint">Report emailed. Closing…</p>
          ) : (
            <>
              <Field>
                <Label htmlFor="email-to">Send to</Label>
                <Input
                  id="email-to"
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="coach@example.com"
                />
              </Field>
              <label className="mt-3 flex items-center gap-2 text-[12px] text-mist">
                <input
                  type="checkbox"
                  checked={emailRedact}
                  onChange={(e) => setEmailRedact(e.target.checked)}
                  className="size-3.5 rounded border-line bg-base accent-brand"
                />
                Redact the transcript before sending
              </label>
              {emailError && <p className="mt-2 text-[11px] text-rose">{emailError}</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={emailReport} disabled={emailBusy || !emailTo}>
                  {emailBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
                  {emailBusy ? "Sending…" : "Send report"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEmailOpen(false)}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-3 w-full max-w-sm rounded-xl border border-line bg-white/[0.02] p-4">
          <h3 className="text-[12px] uppercase tracking-[0.14em] text-fog mb-3">Edit session details</h3>
          <Field>
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="e.g. Team presentation"
            />
          </Field>
          <Field>
            <Label htmlFor="edit-speaker">Speaker</Label>
            <Input
              id="edit-speaker"
              value={editSpeaker}
              onChange={(e) => setEditSpeaker(e.target.value)}
              placeholder="e.g. Jane Doe"
            />
          </Field>
          <Field>
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Notes about this session..."
              className="h-24"
            />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              disabled={editBusy}
              className="bg-brand text-white"
            >
              {editBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : <Check className="size-3.5" />}
              {editBusy ? "Saving…" : "Save"}
            </Button>
          </div>
          {editError && <p className="mt-2 text-[11px] text-rose">{editError}</p>}
        </div>
      )}

      {pdfError && <p className="text-[10.5px] text-rose">{pdfError}</p>}

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
