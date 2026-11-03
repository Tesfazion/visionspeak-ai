import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import { buildDemoHistory } from "@/lib/analysis/demo";
import { DATA_DIR, dataFile } from "@/lib/data-dir";
import type { SessionRecord, ShareLink } from "@/lib/types";

const SCHEMA_VERSION = 2;

function migrateSessionRecords(records: Record<string, unknown>[], fromVersion: number, toVersion: number): SessionRecord[] {
  if (fromVersion >= toVersion) return records.map((r) => r as unknown as SessionRecord);
  let migrated = records;
  // version 1 → 2 adds clientSessionId and notes fields with defaults
  if (fromVersion < 2 && toVersion >= 2) {
    migrated = migrated.map((r) => ({
      ...r,
      notes: r.notes !== undefined ? r.notes : "",
      clientSessionId: r.clientSessionId !== undefined ? r.clientSessionId : undefined,
    }));
  }
  return migrated.map((r) => r as unknown as SessionRecord);
}

/**
 * Tiny JSON-file store. Chosen over SQLite/Postgres because the platform
 * self-hosts as a single Node process: zero native dependencies, zero services
 * to start, and the whole dataset is trivially portable.
 *
 * All writes are serialised through a promise chain so concurrent requests
 * can never interleave read-modify-write cycles.
 *
 * Visibility rules (see `visibleTo`):
 *   - sample records (`source: "demo"`) are shared so the product is
 *     explorable the moment you sign in;
 *   - live records belong to the account that created them;
 *   - records written before accounts existed have no `ownerId` and are
 *     therefore private — hidden rather than exposed to every new user.
 */
const FILE = dataFile("sessions.json");

let queue: Promise<unknown> = Promise.resolve();
const serialise = <T,>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

async function readAll(): Promise<SessionRecord[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    // Handle both old format (array) and new format (object with version)
    if (Array.isArray(parsed)) {
      // version 1 format
      const migrated = migrateSessionRecords(parsed, 1, SCHEMA_VERSION);
      return migrated;
    } else if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { records?: unknown }).records)
    ) {
      const envelope = parsed as { records: Record<string, unknown>[]; version?: number };
      const version = envelope.version || 1;
      const migrated = migrateSessionRecords(envelope.records, version, SCHEMA_VERSION);
      return migrated;
    }
    return Array.isArray(parsed) ? (parsed as SessionRecord[]) : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    console.error("[store] unreadable sessions file", err);
    return [];
  }
}

async function writeAll(records: SessionRecord[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  const data = { schemaVersion: SCHEMA_VERSION, version: SCHEMA_VERSION, records };
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  // On Windows a rename over a file that another handle has open (an editor,
  // antivirus, a concurrent reader) fails with EPERM/EACCES/EBUSY rather than
  // queuing. The handles are short-lived, so retry briefly before giving up.
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, FILE);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const transient = code === "EPERM" || code === "EACCES" || code === "EBUSY";
      if (!transient || attempt >= 5) {
        await fs.rm(tmp, { force: true });
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }
}

/** Seeds a rich sample history so the product is explorable on first launch. */
async function ensureSeed(records: SessionRecord[]) {
  if (records.length > 0) return records;
  const seeded = buildDemoHistory();
  await writeAll(seeded);
  return seeded;
}

export const isSample = (record: SessionRecord) => record.source === "demo";

/** Can `userId` see this record? Samples are shared; live records are private. */
export const visibleTo = (record: SessionRecord, userId: string | null) =>
  isSample(record) || (Boolean(userId) && record.ownerId === userId);

/**
 * Can `userId` modify/delete this record?
 *
 * Samples are read-only: they are shared seed data, so letting one account
 * delete a sample silently removes it from every other account's history —
 * and mixing them into someone's own stats would be a lie about their work.
 */
export const writableBy = (record: SessionRecord, userId: string | null) =>
  Boolean(userId) && record.ownerId === userId;

export interface ListOptions {
  /** Samples are shared reference material; the dashboard opts out of them. */
  includeSamples?: boolean;
}

export async function listSessions(
  userId: string | null,
  options: ListOptions = {},
): Promise<SessionRecord[]> {
  const { includeSamples = true } = options;
  const records = await serialise(async () => ensureSeed(await readAll()));
  return records
    .filter((r) => visibleTo(r, userId) && (includeSamples || !isSample(r)))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getSession(id: string, userId: string | null): Promise<SessionRecord | null> {
  const records = await serialise(async () => ensureSeed(await readAll()));
  const record = records.find((r) => r.id === id) ?? null;
  if (!record) return null;
  return visibleTo(record, userId) ? record : null;
}

export async function saveSession(record: SessionRecord): Promise<SessionRecord> {
  return serialise(async () => {
    const records = await readAll();
    const next = [record, ...records.filter((r) => r.id !== record.id)];
    await writeAll(next);
    return record;
  });
}

export async function deleteSession(id: string, userId: string | null): Promise<boolean> {
  return serialise(async () => {
    const records = await readAll();
    const target = records.find((r) => r.id === id);
    if (!target || !writableBy(target, userId)) return false;
    await writeAll(records.filter((r) => r.id !== id));
    return true;
  });
}

/** Idempotency lookup: the same browser session must never save twice. */
export async function findByClientSessionId(
  userId: string,
  clientSessionId: string,
): Promise<SessionRecord | null> {
  const records = await serialise(async () => readAll());
  return (
    records.find(
      (r) => r.ownerId === userId && r.clientSessionId === clientSessionId && !isSample(r),
    ) ?? null
  );
}

const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const isValidShareToken = (token: unknown): token is string =>
  typeof token === "string" && SHARE_TOKEN_RE.test(token);

/**
 * Creates or refreshes the owner's share link for one report.
 * Returns null when the record is missing or belongs to someone else.
 */
export async function createShare(
  id: string,
  userId: string,
  days: number,
): Promise<ShareLink | null> {
  if (days <= 0) return null;
  return serialise(async () => {
    const records = await readAll();
    const index = records.findIndex((r) => r.id === id);
    if (index === -1 || !writableBy(records[index], userId)) return null;

    const now = Date.now();
    const share: ShareLink = {
      token: randomBytes(18).toString("base64url"),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + days * 86_400_000).toISOString(),
    };
    records[index] = { ...records[index], share };
    await writeAll(records);
    return share;
  });
}

/** Removes a share link. True when one was actually revoked. */
export async function revokeShare(id: string, userId: string): Promise<boolean> {
  return serialise(async () => {
    const records = await readAll();
    const index = records.findIndex((r) => r.id === id);
    if (index === -1 || !writableBy(records[index], userId) || !records[index].share) return false;
    const rest = { ...records[index] };
    delete rest.share;
    records[index] = rest;
    await writeAll(records);
    return true;
  });
}

/** Resolves a shared report. Both the id and the token must match and be live. */
export async function getSharedSession(id: string, token: unknown): Promise<SessionRecord | null> {
  if (!isValidShareToken(token)) return null;
  const records = await serialise(async () => readAll());
  const record = records.find((r) => r.id === id);
  if (!record?.share || record.share.token !== token) return null;
  if (record.share.expiresAt <= new Date().toISOString()) return null;
  return record;
}

export async function updateSession(
  id: string,
  userId: string | null,
  patch: Partial<Pick<SessionRecord, "title" | "speaker" | "notes">>,
): Promise<SessionRecord | null> {
  return serialise(async () => {
    const records = await readAll();
    const idx = records.findIndex((r) => r.id === id);
    if (idx === -1 || !writableBy(records[idx], userId)) return null;
    records[idx] = { ...records[idx], ...patch };
    await writeAll(records);
    return records[idx];
  });
}
