"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Copy, Sparkles, Users } from "@/components/icons";
import { Button, Input, Panel } from "@/components/ui";
import { useI18n } from "@/components/site/locale-provider";

interface CreatedMeeting {
  id: string;
  title: string;
}

const MODES = ["practice", "presentation", "interview"] as const;

/** Accepts a raw id or a pasted `/meeting/<id>` URL. */
function extractMeetingId(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const match = value.match(/\/meeting\/([^/?#\s]+)/);
  return decodeURIComponent(match?.[1] ?? value);
}

export default function MeetingLobbyPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<(typeof MODES)[number]>("practice");
  const [joinId, setJoinId] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedMeeting | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, mode }),
      });
      if (!res.ok) throw new Error("create_failed");
      const body = (await res.json()) as { meeting?: CreatedMeeting };
      if (!body.meeting) throw new Error("create_failed");
      setCreated(body.meeting);
    } catch {
      setError(t("meeting.error"));
    } finally {
      setCreating(false);
    }
  }, [title, mode, t]);

  const join = useCallback(
    async (id: string) => {
      const meetingId = extractMeetingId(id);
      if (!meetingId) return;
      setJoining(true);
      setError(null);
      try {
        const res = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}`, {
          method: "POST",
        });
        if (!res.ok) throw new Error("join_failed");
        router.push(`/meeting/${encodeURIComponent(meetingId)}`);
      } catch {
        setError(t("meeting.notFoundBody"));
        setJoining(false);
      }
    },
    [router, t],
  );

  const copyLink = useCallback(async () => {
    if (!created) return;
    const link = `${window.location.origin}/meeting/${created.id}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; the link is visible for manual copy */
    }
  }, [created]);

  const link = created && typeof window !== "undefined" ? `${window.location.origin}/meeting/${created.id}` : "";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-28">
      <header className="text-center">
        <div className="eyebrow">{t("meeting.eyebrow")}</div>
        <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-[34px]">
          {t("meeting.title")}
        </h1>
        <p className="pretty mx-auto mt-2 max-w-lg text-[13px] leading-relaxed text-fog">
          Run a practice session with a coach or a small group. Everyone sees the live scores, chat and
          transcript stay in the room.
        </p>
      </header>

      {error && (
        <p className="mx-auto mt-4 max-w-lg rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-center text-[11.5px] text-rose">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Panel className="p-5">
          <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
            <Sparkles className="size-4 text-brand-soft" /> {t("meeting.new")}
          </div>

          {created ? (
            <div className="mt-4 space-y-3">
              <p className="text-[11.5px] leading-relaxed text-fog">{t("meeting.linkLabel")}</p>
              <code className="block truncate rounded-lg border border-line bg-base/60 px-3 py-2 text-[11px] text-brand-soft">
                {link}
              </code>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void copyLink()} size="sm" variant="subtle">
                  <Copy className="size-3.5" /> {copied ? t("meeting.linkCopied") : t("meeting.copyLink")}
                </Button>
                <Button onClick={() => router.push(`/meeting/${created.id}`)} size="sm">
                  {t("meeting.joinCta")} <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-fog">
                  {t("meeting.titleField")}
                </span>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t("meeting.titlePlaceholder")}
                  maxLength={120}
                />
              </label>
              <div>
                <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-fog">
                  {t("meeting.mode")}
                </span>
                <div className="flex gap-1.5">
                  {MODES.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setMode(option)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] capitalize transition-colors ${
                        mode === option
                          ? "border-brand/50 bg-brand/10 text-brand-soft"
                          : "border-line text-fog hover:border-white/20"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={() => void create()} disabled={creating} className="w-full">
                {creating ? t("meeting.creating") : t("meeting.create")}
              </Button>
            </div>
          )}
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
            <Users className="size-4 text-brand-soft" /> {t("meeting.join")}
          </div>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-fog">
                {t("meeting.room")}
              </span>
              <Input
                value={joinId}
                onChange={(event) => setJoinId(event.target.value)}
                placeholder={t("meeting.roomPlaceholder")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void join(joinId);
                }}
              />
              <span className="mt-1 block text-[10.5px] text-fog/70">{t("meeting.roomHint")}</span>
            </label>
            <Button
              onClick={() => void join(joinId)}
              disabled={joining || !extractMeetingId(joinId)}
              variant="subtle"
              className="w-full"
            >
              {t("meeting.joinCta")} <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </Panel>
      </div>

      <p className="mt-6 text-center text-[11px] text-fog">
        Prefer a solo run?{" "}
        <Link href="/studio" className="text-brand-soft hover:text-brand">
          Open the studio
        </Link>
        .
      </p>
    </div>
  );
}
