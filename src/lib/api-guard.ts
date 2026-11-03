import type { SessionAggregate } from "@/lib/analysis/engine";
import { EMOTIONS } from "@/lib/types";
import { createHash } from "node:crypto";

/**
 * Request hardening shared by the API routes.
 *
 * Everything here is pure — no `next/server`, and only `node:crypto` for hashing
 * — so it can be unit-tested against a plain `Request`, and so a validation rule
 * cannot drift from the test that pins it.
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

  // Cross-field sanity checks to make score tampering harder
  const verifyProblem = verifyAggregate(a);
  if (verifyProblem) return fail(422, verifyProblem, "invalid_aggregate");

  return { ok: true, value: input as SessionAggregate };
}

/**
 * Cross-field sanity checks on the aggregate to catch fabricated data.
 * A malicious client could send valid-looking but manipulated values that
 * pass individual bounds but are internally inconsistent. This makes that
 * harder by checking statistical relationships between fields.
 */
function verifyAggregate(a: Record<string, unknown>): string | null {
  const voice = a.voice as Record<string, unknown> | undefined;
  const speech = a.speech as Record<string, unknown> | undefined;
  const timeline = a.timeline as unknown[] | undefined;
  const durationSec = a.durationSec as number | undefined;

  if (!voice || !speech || !timeline || !durationSec) return null;

  // 1. Speaking time percentage should be reasonable for the duration
  const speakingTimePct = voice.speakingTimePct as number;
  if (speakingTimePct < 0 || speakingTimePct > 100) {
    return "speakingTimePct must be between 0 and 100";
  }
  if (durationSec > 30 && speakingTimePct > 95) {
    return "speakingTimePct is implausibly high for a session of this length";
  }

  // 2. Word count should correlate with duration and speaking time
  const words = speech.words as number;
  if (words < 0) return "word count cannot be negative";
  const expectedMinWords = durationSec * (speakingTimePct / 100) * 0.5; // ~0.5 wps minimum
  const expectedMaxWords = durationSec * (speakingTimePct / 100) * 5;   // ~5 wps maximum
  if (durationSec > 10 && (words < expectedMinWords * 0.1 || words > expectedMaxWords * 2)) {
    return "word count is inconsistent with duration and speaking time";
  }

  // 3. WPM should be in human range
  const wpm = a.wpm as number;
  if (wpm !== undefined && (wpm < 50 || wpm > 300)) {
    return "words per minute is outside human range";
  }

  // 4. Voice energy and volume consistency should be reasonable
  const energy = voice.energy as number;
  if (energy < 0 || energy > 100) return "voice energy must be 0-100";
  const volumeConsistency = voice.volumeConsistency as number;
  if (volumeConsistency < 0 || volumeConsistency > 100) return "volumeConsistency must be 0-100";

  // 5. Timeline should have duration-consistent timestamps
  const lastTimelinePoint = timeline[timeline.length - 1] as Record<string, unknown> | undefined;
  if (lastTimelinePoint && typeof lastTimelinePoint.t === "number") {
    const lastT = lastTimelinePoint.t;
    if (lastT < durationSec * 0.7 || lastT > durationSec * 1.3) {
      return "timeline duration does not match declared session duration";
    }
  }

  // 6. Eye contact percentage in timeline should be internally consistent
  const eyeContactValues = timeline
    .map((p) => (p as Record<string, unknown>).eyeContact as number)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (eyeContactValues.length >= 3) {
    const avgEyeContact = eyeContactValues.reduce((a, b) => a + b, 0) / eyeContactValues.length;
    const faceEyeContact = a.eyeContactPct as number;
    if (typeof faceEyeContact === "number" && Math.abs(avgEyeContact - faceEyeContact) > 30) {
      return "timeline eye contact average is inconsistent with face statistics";
    }
  }

  // 7. Pause count should be consistent with timeline
  const pauseCount = voice.pauseCount as number;
  if (pauseCount < 0 || pauseCount > timeline.length) {
    return "pause count is inconsistent with timeline length";
  }

  return null;
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

/**
 * Fingerprint of the raw aggregate a report was built from.
 *
 * Scores are computed in the browser and trusted by the server — a crafted
 * POST can store any number. This does not stop that (server-side
 * re-derivation is a much bigger change), but it makes tampering visible: the
 * report page shows a checkmark when the stored hash matches the report the
 * server can recompute from the stored numbers, and a warning when it does
 * not. The hash covers the timeline, duration and mode — the inputs that
 * actually determine the scores — not the derived report fields, which a
 * tamperer would also rewrite.
 */
export function aggregateHash(input: unknown): string {
  const canonical = JSON.stringify(input, sortedReplacer);
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * The one object the save path and the verifier both hash.
 *
 * Only this subset survives into the stored record: the raw aggregate (with its
 * 20 fields per sample) is not persisted, so hashing the aggregate itself would
 * produce a digest nothing could ever recompute — which is exactly the bug this
 * helper exists to prevent. Keeping both call sites on the same function is the
 * point; do not inline the object shape in a route.
 */
export function reportIntegrityHash(record: {
  durationSec: number;
  mode: string;
  timeline: unknown;
}): string {
  return aggregateHash({
    durationSec: record.durationSec,
    mode: record.mode,
    timeline: record.timeline,
  });
}

const sortedReplacer = (_key: string, value: unknown) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (value as Record<string, unknown>)[k];
        return acc;
      }, {});
  }
  return value;
};

export function tooManyRequests(retryAfterSec: number, message: string) {
  return {
    status: 429,
    body: { error: message, code: "rate_limited", retryAfterSec },
    headers: { "Retry-After": String(retryAfterSec) },
  };
}
