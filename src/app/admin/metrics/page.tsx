import { notFound, redirect } from "next/navigation";
import { getCurrentUser, loginHref } from "@/lib/auth";
import { dbQuery } from "@/lib/db/postgres";
import { calculateProductMetrics, type MetricSession } from "@/lib/product-metrics";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Product metrics",
  robots: { index: false, follow: false },
};

async function loadProductMetrics() {
  const now = Date.now();
  const [accountsResult, sessionsResult] = await Promise.all([
    dbQuery<{ id: string; createdAt: string }>(
      `SELECT id, data->>'createdAt' AS "createdAt"
       FROM users
       WHERE data->>'createdAt' >= $1 AND data->>'createdAt' <= $2`,
      [new Date(now - 90 * 86_400_000).toISOString(), new Date(now).toISOString()],
    ),
    dbQuery<{ ownerId: string; createdAt: string; mode: string; analysisMode: string | null; overall: string | null }>(
      `SELECT owner_id AS "ownerId", created_at::text AS "createdAt",
              data->>'mode' AS mode, data->'report'->>'analysisMode' AS "analysisMode",
              data->'report'->>'overall' AS overall
       FROM sessions
       WHERE owner_id IS NOT NULL AND source <> 'demo'
         AND created_at >= now() - interval '90 days'
       ORDER BY created_at ASC`,
    ),
  ]);
  const sessions: MetricSession[] = sessionsResult.rows.map((session) => ({
    ...session,
    overall: session.overall === null ? null : Number(session.overall),
  }));
  return calculateProductMetrics(accountsResult.rows, sessions, now);
}

export default async function ProductMetricsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/admin/metrics"));
  const adminEmail = process.env.ANALYTICS_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || user.email.toLowerCase() !== adminEmail) notFound();

  const metrics = await loadProductMetrics();

  const cards = [
    { label: "Signups with 7-day activation window (90 days)", value: metrics.accounts },
    { label: "First session within 7 days", value: `${metrics.activationRate}% (${metrics.activatedWithinSevenDays})` },
    { label: "Returned within 7 days of first session", value: metrics.returnRate === null ? "Not enough follow-up data" : `${metrics.returnRate}% (${metrics.returnedWithinSevenDays}/${metrics.returnEligible})` },
    { label: "Same-mode score change", value: metrics.meanScoreDelta === null ? "Not enough data" : `${metrics.meanScoreDelta > 0 ? "+" : ""}${metrics.meanScoreDelta} points` },
  ];

  return (
    <main className="container-page pb-12 pt-24">
      <header>
        <p className="eyebrow">Private product metrics · rolling 90-day window</p>
        <h1 className="mt-2 text-[26px] font-semibold text-ink">Practice activation and return</h1>
        <p className="pretty mt-2 max-w-2xl text-[16px] leading-relaxed text-fog">
          Aggregate counts derived from account and saved-session records. Activation includes signups with a full seven-day observation window; return includes first sessions with seven days of follow-up. Score change compares each eligible account&apos;s first three and latest three scores within one practice and capture mode; it is descriptive, not evidence that the product caused improvement.
        </p>
      </header>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <section key={card.label} className="panel p-5">
            <h2 className="text-[12px] text-fog">{card.label}</h2>
            <p className="metric-num mt-2 text-[24px] text-ink">{card.value}</p>
          </section>
        ))}
      </div>
      <p className="mt-4 text-[12px] text-fog">
        No external analytics script or additional identity/event tracking is used. Video and audio are not queried here.
      </p>
    </main>
  );
}
