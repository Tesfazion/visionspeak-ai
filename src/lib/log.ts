/**
 * Structured, single-line logging.
 *
 * `console.error("something failed", err)` produces a stack with no event name
 * and nothing to filter on. Every operational line here is one JSON object with
 * an event, a request id and the fields that matter, so a log drain can answer
 * "how many saves failed today" without a regex. No request body, transcript or
 * credential is ever logged.
 */

export type Level = "info" | "warn" | "error";

export interface LogFields {
  [key: string]: string | number | boolean | null | undefined;
}

export function newRequestId() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

export function logEvent(level: Level, event: string, fields: LogFields = {}) {
  const line = JSON.stringify({ at: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  // Info is a log line, not a warning: keep it on stdout so a log drain can
  // split streams. The lint rule allows warn/error only.
  // eslint-disable-next-line no-console
  else console.log(line);
}

/** Build identity for /api/health — a deploy you cannot name is a deploy you cannot debug. */
export const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
  process.env.GIT_COMMIT_SHA?.slice(0, 12) ??
  process.env.NEXT_PUBLIC_BUILD_ID ??
  "dev";
