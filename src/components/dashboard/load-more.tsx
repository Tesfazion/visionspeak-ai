"use client";

import { useCallback, useState } from "react";
import { ArrowRight } from "@/components/icons";
import { Button } from "@/components/ui";
import Link from "next/link";
import { formatDuration } from "@/lib/math";
import { toneFor, cn, Bar } from "@/components/ui";
import { useI18n } from "@/components/site/locale-provider";
import type { SessionRecord } from "@/lib/types";

interface LoadMoreProps {
  initialSessions: SessionRecord[];
  total: number;
  pageSize?: number;
}

const shortDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { day: "2-digit", month: "short" }).format(
    new Date(iso),
  );

const MODE_LABEL_KEY = {
  practice: "studio.mode.practice",
  presentation: "studio.mode.presentation",
  interview: "studio.mode.interview",
} as const;

export function LoadMore({ initialSessions, total, pageSize = 50 }: LoadMoreProps) {
  const { locale, t } = useI18n();
  const [sessions, setSessions] = useState<SessionRecord[]>(initialSessions);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(initialSessions.length);

  const hasMore = sessions.length < total;

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions?limit=${pageSize}&offset=${offset}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSessions((prev) => [...prev, ...data]);
          setOffset((prev) => prev + data.length);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, pageSize, offset]);

  if (sessions.length === 0) return null;

  return (
    <section className="panel mt-4 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-[13px] font-medium text-ink">{t("dash.recent")}</h2>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-fog">
          {t("dash.newest")}
        </span>
      </div>

      <div className="hidden grid-cols-[1.8fr_repeat(3,0.5fr)_0.6fr_auto] gap-4 border-y border-line/60 px-5 py-2 text-[9.5px] font-medium uppercase tracking-[0.14em] text-fog lg:grid">
        <span>{t("dash.col.session")}</span>
        <span className="text-right">{t("dash.col.conf")}</span>
        <span className="text-right">{t("dash.col.lead")}</span>
        <span className="text-right">{t("dash.col.comms")}</span>
        <span className="text-right">{t("dash.col.grade")}</span>
        <span className="w-6" />
      </div>

      <div className="divide-y divide-line/50">
        {sessions.map((s: SessionRecord) => {
          const r = s.report;
          return (
            <Link
              key={s.id}
              href={`/report/${s.id}`}
              className={cn(
                "group grid gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.03]",
                "lg:grid-cols-[1.8fr_repeat(3,0.5fr)_0.6fr_auto] lg:items-center lg:gap-4",
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: toneFor(r.overall).hex }}
                    aria-hidden
                  />
                  <span className="truncate text-[13px] font-medium text-ink transition-colors group-hover:text-brand-soft">
                    {s.title}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-fog">
                  <span>{shortDate(s.createdAt, locale)}</span>
                  <span className="text-fog/40">·</span>
                  <span>{s.speaker}</span>
                  <span className="text-fog/40">·</span>
                  <span className="capitalize">{t(MODE_LABEL_KEY[s.mode as keyof typeof MODE_LABEL_KEY])}</span>
                  <span className="text-fog/40">·</span>
                  <span>{formatDuration(s.durationSec)}</span>
                </div>
              </div>

              {[r.pillars.confidence, r.pillars.leadership, r.pillars.communication].map((v: number, i: number) => (
                <div key={i} className="hidden text-right lg:block">
                  <span className="metric-num text-[12px] text-mist">{v}</span>
                  <Bar value={v} height={2} className="mt-1 opacity-60" />
                </div>
              ))}

              <div className="flex items-center gap-2 lg:justify-end">
                <span
                  className="metric-num rounded-md border px-1.5 py-0.5 text-[10.5px]"
                  style={{
                    color: toneFor(r.overall).hex,
                    borderColor: `${toneFor(r.overall).hex}44`,
                    background: `${toneFor(r.overall).hex}12`,
                  }}
                >
                  {r.grade} {r.overall}
                </span>
              </div>

              <ArrowRight className="hidden size-3.5 text-fog/50 transition-all group-hover:translate-x-0.5 group-hover:text-brand-soft lg:block" />
            </Link>
          );
        })}
      </div>

      {hasMore && (
        <div className="flex justify-center p-4">
          <Button onClick={loadMore} disabled={loading} size="sm">
            {loading ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </section>
  );
}
