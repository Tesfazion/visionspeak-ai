import os from "node:os";
import path from "node:path";

/**
 * Where the JSON stores live.
 *
 * Local development and self-hosting use `<repo>/data`. Serverless platforms
 * (Vercel, AWS Lambda) ship the deployment bundle read-only, so writing to
 * `process.cwd()/data` throws EROFS on the first signup. On those platforms the
 * directory falls back to the OS temp dir, which is writable — but ephemeral:
 * it survives while the instance is warm and is discarded on a cold start.
 *
 * Set `VS_DATA_DIR` to point at a mounted volume or any writable path when the
 * data must survive restarts. For durable multi-instance storage on Vercel,
 * back the store with a database instead (see README → Deployment).
 */
const isServerless =
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.NETLIFY);

const explicit = process.env.VS_DATA_DIR?.trim();

export const DATA_DIR = explicit
  ? path.resolve(explicit)
  : isServerless
    ? path.join(os.tmpdir(), "visionspeak-data")
    : path.join(process.cwd(), "data");

/** True when writes land on ephemeral storage and will not outlive the instance. */
export const STORAGE_IS_EPHEMERAL = isServerless && !explicit;

/** Coarse description surfaced by /api/health and the dashboard banner. */
export const STORAGE_KIND = STORAGE_IS_EPHEMERAL
  ? "ephemeral"
  : explicit
    ? "configured"
    : "local";

/** File path inside the data dir, creating nothing (callers mkdir as needed). */
export const dataFile = (name: string) => path.join(DATA_DIR, name);
