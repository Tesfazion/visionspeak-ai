// Script-side mirror of `src/lib/data-dir.ts`.
//
// The operational scripts (backup/restore) must resolve the same directory the
// app writes to, but they run under plain Node with no TypeScript loader — and
// `engines` allows Node 22.6, where importing a `.ts` file needs a flag. This
// module is therefore the single copy for scripts; keep the rules in step with
// src/lib/data-dir.ts (local → <repo>/data, serverless → OS temp dir,
// VS_DATA_DIR overrides both).
import os from "node:os";
import path from "node:path";

export function resolveDataDir() {
  const explicit = process.env.VS_DATA_DIR?.trim();
  if (explicit) return path.resolve(explicit);

  const serverless =
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.NETLIFY);

  return serverless
    ? path.join(os.tmpdir(), "visionspeak-data")
    : path.join(process.cwd(), "data");
}

/** Every file the app keeps in the data directory. */
export const DATA_FILES = ["sessions.json", "users.json", "tokens.json", "meetings.json", "auth-secret"];
