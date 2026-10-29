import type { SessionAggregate } from "@/lib/analysis/engine";
import { EMOTIONS } from "@/lib/types";

/**
 * Request hardening shared by the API routes.
 *
 * Everything here is pure (no `next/server`, no `node:` imports) so it can be
 * unit-tested against a plain `Request`, and so a validation rule cannot drift
 * from the test that pins it.
 */

export type Guard<T> = { ok: true; value: T } | { ok: false; status: number; error: string; code?: string };

/**
 * 2 MB. A 60-minute Pro session is ~3 600 one-second samples at ~220 bytes of
 * JSON (~0.8 MB), so this leaves headroom while still refusing a body that
 * could exhaust the process.
 */
export const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

/** 1 Hz samples for two hours; anything beyond this is not a real session. */
export const MAX_TIMELINE_POINTS = 7200;

/** Absurd-but-finite numbers are how a payload poisons a score silently. */
const MAX_ABS_NUMBER = 1_000_000;
const MAX_DEPTH = 6;
const MAX_VALUES = 60_000;
const MAX_STRING = 40_000;

const fail = (status: number, error: string, code?: string): Guard<never> => ({
  ok: false,
  status,
  error,
  ...(code ? { code } : {}),
});

/**
 * Reads a JSON body while enforcing a byte ceiling.
 *
 * `request.json()` buffers whatever the client sends, so a 200 MB body is
 * parsed before any validation can reject it. This reads the stream itself and
 * stops the moment the ceiling is crossed.
 */
export async function readJsonLimited(
  request: Request,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<Guard<unknown>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return fail(413, `Request body is too large (limit ${maxBytes} bytes).`, "body_too_large");
  }
  if (!request.body) return fail(400, "Missing request body.", "missing_body");

  const reader = request.body.getReader();
  const buffer = new Uint8Array(maxBytes);
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.byteLength > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return fail(413, `Request body is too large (limit ${maxBytes} bytes).`, "body_too_large");
    }
    buffer.set(value, total);
    total += value.byteLength;
  }

  try {
    const text = new TextDecoder().decode(buffer.subarray(0, total));
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return fail(400, "Invalid JSON body.", "invalid_json");
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Walks the payload once, bounding every number, string, array and nesting
 * level. Cheaper and far safer than trusting a structural cast: a `NaN`, an
 * array of a million entries or a 10 MB transcript all die here.
 */
function scan(value: unknown, depth = 0, budget = { seen: 0 }): string | null {
  if (budget.seen++ > MAX_VALUES) return "payload has too many values";
  if (typeof value === "number") {
    return Number.isFinite(value) && Math.abs(value) <= MAX_ABS_NUMBER ? null : "payload contains an invalid number";
  }
  if (typeof value === "string") return value.length <= MAX_STRING ? null : "payload contains an over-long string";
  if (Array.isArray(value)) {
    if (value.length > MAX_TIMELINE_POINTS) return `array exceeds ${MAX_TIMELINE_POINTS} entries`;
    if (depth >= MAX_DEPTH) return "payload is nested too deeply";
    for (const item of value) {
      const problem = scan(item, depth + 1, budget);
      if (problem) return problem;
    }
    return null;
  }
  if (value && typeof value === "object") {
    if (depth >= MAX_DEPTH) return "payload is nested too deeply";
    for (const item of Object.values(value)) {
      const problem = scan(item, depth + 1, budget);
      if (problem) return problem;
    }
  }
  return null;
}

const VOICE_FIELDS = [
  "speakingTimePct",
  "avgDb",
  "volumeConsistency",
  "pitchVariation",
  "pauseCount",
  "longPauseCount",
  "avgPauseSec",
  "energy",
] as const;

export interface AggregateOptions {
  /** Enforced by the caller's plan: a Free session cannot be an hour long. */
  maxDurationSec: number;
}

/**
 * Validates and bounds a client aggregate. Returns the aggregate unchanged —
 * scores are still produced server-side by `buildReport`, and the browser is
 * the only place the raw signals exist.
 */
export function parseAggregate(input: unknown, options: AggregateOptions): Guard<SessionAggregate> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return fail(422, "Session payload must be an object.", "invalid_aggregate");
  }

  const a = input as Record<string, unknown>;
  const { durationSec, timeline, voice, speech, emotions } = a;

  if (!isFiniteNumber(durationSec) || durationSec <= 0) {
    return fail(422, "Session payload needs a positive durationSec.", "invalid_aggregate");
  }
  if (durationSec > options.maxDurationSec) {
    return fail(
      422,
      `This plan allows sessions up to ${Math.round(options.maxDurationSec / 60)} minutes. ` +
        "End the session earlier, or upgrade to analyse longer talks.",
      "session_too_long",
    );
  }
  if (!Array.isArray(timeline) || timeline.length < 3) {
    return fail(422, "Session payload needs at least three timeline samples.", "invalid_aggregate");
  }
  if (timeline.length > MAX_TIMELINE_POINTS) {
    return fail(422, `Session payload exceeds ${MAX_TIMELINE_POINTS} timeline samples.`, "invalid_aggregate");
  }
  if (!voice || typeof voice !== "object" || Array.isArray(voice)) {
    return fail(422, "Session payload is missing voice statistics.", "invalid_aggregate");
  }
  for (const field of VOICE_FIELDS) {
    if (!isFiniteNumber((voice as Record<string, unknown>)[field])) {
      return fail(422, `Voice statistic "${field}" is missing or invalid.`, "invalid_aggregate");
    }
  }
  if (!speech || typeof speech !== "object" || Array.isArray(speech)) {
    return fail(422, "Session payload is missing speech statistics.", "invalid_aggregate");
  }
  const speechRecord = speech as Record<string, unknown>;
  if (typeof speechRecord.transcript !== "string") {
    return fail(422, "Speech transcript must be a string.", "invalid_aggregate");
  }
  if (!isFiniteNumber(speechRecord.words) || speechRecord.words < 0) {
    return fail(422, "Speech word count is missing or invalid.", "invalid_aggregate");
  }
  for (const field of ["fillers", "fillerEvents"] as const) {
    const value = speechRecord[field];
    if (value !== undefined && !Array.isArray(value)) {
      return fail(422, `Speech "${field}" must be an array.`, "invalid_aggregate");
    }
    if (Array.isArray(value) && value.length > 500) {
      return fail(422, `Speech "${field}" has too many entries.`, "invalid_aggregate");
    }
  }
  if (!emotions || typeof emotions !== "object" || Array.isArray(emotions)) {
    return fail(422, "Session payload is missing the emotion distribution.", "invalid_aggregate");
  }
  const emotionRecord = emotions as Record<string, unknown>;
  for (const label of EMOTIONS) {
    const value = emotionRecord[label];
    if (!isFiniteNumber(value) || value < 0 || value > 100) {
      return fail(422, `Emotion "${label}" must be a percentage between 0 and 100.`, "invalid_aggregate");
    }
  }

  const problem = scan(a);
  if (problem) return fail(422, problem, "invalid_aggregate");

  return { ok: true, value: input as SessionAggregate };
}

/** Idempotency key: lets a retried save return the original report. */
export function readClientSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(trimmed) ? trimmed : null;
}

/** Best-effort client address for throttling (trusts the platform proxy). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

export function tooManyRequests(retryAfterSec: number, message: string) {
  return {
    status: 429,
    body: { error: message, code: "rate_limited", retryAfterSec },
    headers: { "Retry-After": String(retryAfterSec) },
  };
}
