export interface MetricAccount {
  id: string;
  createdAt: string;
}

export interface MetricSession {
  ownerId: string;
  createdAt: string;
  mode: string;
  analysisMode?: string | null;
  overall: number | null;
}

export interface ProductMetrics {
  accounts: number;
  activatedWithinSevenDays: number;
  activationRate: number;
  returnedWithinSevenDays: number;
  returnEligible: number;
  returnRate: number | null;
  comparableScoreUsers: number;
  meanScoreDelta: number | null;
}

const DAY_MS = 86_400_000;
const COHORT_DAYS = 90;

export function calculateProductMetrics(
  accounts: MetricAccount[],
  sessions: MetricSession[],
  now = Date.now(),
): ProductMetrics {
  const cohortStart = now - COHORT_DAYS * DAY_MS;
  const matureThrough = now - 7 * DAY_MS;
  const cohort = accounts.filter((account) => {
    const createdAt = Date.parse(account.createdAt);
    return Number.isFinite(createdAt) && createdAt >= cohortStart && createdAt <= matureThrough;
  });
  const byUser = groupSessions(sessions, cohortStart, now);
  let activatedWithinSevenDays = 0;
  let returnedWithinSevenDays = 0;
  let returnEligible = 0;

  for (const account of cohort) {
    const history = byUser.get(account.id) ?? [];
    const createdAt = Date.parse(account.createdAt);
    const first = history[0];
    const firstAt = first ? Date.parse(first.createdAt) : Number.NaN;
    if (!first || firstAt < createdAt || firstAt - createdAt > 7 * DAY_MS) continue;
    activatedWithinSevenDays++;
    if (firstAt + 7 * DAY_MS > now) continue;
    returnEligible++;
    if (history.slice(1).some((session) => {
      const daysAfterFirst = Date.parse(session.createdAt) - Date.parse(first.createdAt);
      return daysAfterFirst > 0 && daysAfterFirst <= 7 * DAY_MS;
    })) {
      returnedWithinSevenDays++;
    }
  }

  const deltas = scoreDeltas(byUser);
  return {
    accounts: cohort.length,
    activatedWithinSevenDays,
    activationRate: percent(activatedWithinSevenDays, cohort.length),
    returnedWithinSevenDays,
    returnEligible,
    returnRate: returnEligible ? percent(returnedWithinSevenDays, returnEligible) : null,
    comparableScoreUsers: deltas.length,
    meanScoreDelta: deltas.length
      ? Math.round((deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length) * 10) / 10
      : null,
  };
}

function groupSessions(sessions: MetricSession[], from: number, to: number) {
  const byUser = new Map<string, MetricSession[]>();
  for (const session of sessions) {
    const timestamp = Date.parse(session.createdAt);
    if (!session.ownerId || !Number.isFinite(timestamp) || timestamp < from || timestamp > to) continue;
    byUser.set(session.ownerId, [...(byUser.get(session.ownerId) ?? []), session]);
  }
  for (const history of byUser.values()) history.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return byUser;
}

function scoreDeltas(byUser: Map<string, MetricSession[]>) {
  const deltas: number[] = [];
  for (const history of byUser.values()) {
    const groups = new Map<string, number[]>();
    for (const session of history) {
      if (session.overall === null || !Number.isFinite(session.overall)) continue;
      const key = `${session.mode}:${session.analysisMode ?? "video"}`;
      groups.set(key, [...(groups.get(key) ?? []), session.overall]);
    }
    const comparable = [...groups.values()]
      .filter((scores) => scores.length >= 6)
      .sort((a, b) => b.length - a.length)[0];
    if (!comparable) continue;
    const earlier = comparable.slice(0, 3).reduce((sum, score) => sum + score, 0) / 3;
    const recent = comparable.slice(-3).reduce((sum, score) => sum + score, 0) / 3;
    deltas.push(recent - earlier);
  }
  return deltas;
}

function percent(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}
