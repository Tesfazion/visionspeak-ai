"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, Printer, Trash2 } from "@/components/icons";
import { Button } from "@/components/ui";
import type { SessionRecord } from "@/lib/types";

export function ReportActions({ session }: { session: SessionRecord }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const download = () => {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `visionspeak-${session.id}.json`;
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
    <div className="no-print flex flex-wrap items-center gap-2">
      <Button variant="subtle" size="sm" onClick={copySummary}>
        {copied ? <Check className="size-3.5 text-mint" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy summary"}
      </Button>
      <Button variant="subtle" size="sm" onClick={() => window.print()}>
        <Printer className="size-3.5" /> Print / PDF
      </Button>
      <Button variant="subtle" size="sm" onClick={download}>
        <Download className="size-3.5" /> JSON
      </Button>
      <Button variant="danger" size="sm" onClick={remove} disabled={deleting}>
        <Trash2 className="size-3.5" />
        {deleting ? "Deleting…" : "Delete"}
      </Button>
    </div>
  );
}
