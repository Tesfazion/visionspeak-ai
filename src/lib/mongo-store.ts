// MongoDB session store adapter
import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import type { SessionRecord, ShareLink } from "@/lib/types";
import { buildDemoHistory } from "@/lib/analysis/demo";
import { dataFile } from "@/lib/data-dir";
import { COLLECTIONS } from "@/lib/db/schema";
import { withStore } from "@/lib/db/mongo";

/** Documents keep the app's string id in Mongo's `_id` field. */
type SessionDoc = SessionRecord & { _id: string };

const SCHEMA_VERSION = 2;
const FILE = dataFile("sessions.json");

function migrateSessionRecords(
  records: Record<string, unknown>[],
  fromVersion: number,
  toVersion: number,
): SessionRecord[] {
  if (fromVersion >= toVersion) return records.map((r) => r as unknown as SessionRecord);
  let migrated = records;
  if (fromVersion < 2 && toVersion >= 2) {
    migrated = migrated.map((r) => ({
      ...r,
      notes: r.notes !== undefined ? r.notes : "",
      clientSessionId: r.clientSessionId !== undefined ? r.clientSessionId : undefined,
    }));
  }
  return migrated.map((r) => r as unknown as SessionRecord);
}

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
    if (Array.isArray(parsed)) {
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

async function writeAll(records: SessionRecord[]): Promise<void> {
  await fs.mkdir(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  const data = { schemaVersion: SCHEMA_VERSION, version: SCHEMA_VERSION, records };
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
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

async function ensureSeed(records: SessionRecord[]): Promise<SessionRecord[]> {
  if (records.length > 0) return records;
  const seeded = buildDemoHistory();
  await writeAll(seeded);
  return seeded;
}

export const isSample = (record: SessionRecord) => record.source === "demo";
export const writableBy = (record: SessionRecord, userId: string | null) =>
  Boolean(userId) && record.ownerId === userId;
export const visibleTo = (record: SessionRecord, userId: string | null) =>
  isSample(record) || (Boolean(userId) && record.ownerId === userId);
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const isValidShareToken = (token: unknown): token is string =>
  typeof token === "string" && SHARE_TOKEN_RE.test(token);

export async function createShare(
  id: string,
  userId: string,
  days: number,
): Promise<ShareLink | null> {
  return withStore(
    async () => {
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
    },
    async (db: Db) => {
      const col = db.collection<SessionDoc>(COLLECTIONS.sessions);
      const target = await col.findOne({ _id: id });
      if (!target || !writableBy(target as unknown as SessionRecord, userId)) return null;
      const now = Date.now();
      const share: ShareLink = {
        token: randomBytes(18).toString("base64url"),
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + days * 86_400_000).toISOString(),
      };
      await col.updateOne({ _id: id }, { $set: { share } });
      return share;
    },
  );
}

export async function revokeShare(id: string, userId: string): Promise<boolean> {
  return withStore(
    async () => {
      const records = await readAll();
      const index = records.findIndex((r) => r.id === id);
      if (index === -1 || !writableBy(records[index], userId) || !records[index].share) return false;
      const rest = { ...records[index] };
      delete rest.share;
      records[index] = rest;
      await writeAll(records);
      return true;
    },
    async (db: Db) => {
      const col = db.collection<SessionDoc>(COLLECTIONS.sessions);
      const target = await col.findOne({ _id: id });
      if (!target || !writableBy(target as unknown as SessionRecord, userId) || !target.share) return false;
      await col.updateOne({ _id: id }, { $unset: { share: 1 } });
      return true;
    },
  );
}

export async function getSharedSession(id: string, token: unknown): Promise<SessionRecord | null> {
  return withStore(
    async () => {
      const records = await serialise(async () => readAll());
      const record = records.find((r) => r.id === id);
      if (!record?.share || record.share.token !== token) return null;
      if (record.share.expiresAt <= new Date().toISOString()) return null;
      return record;
    },
    async (db: Db) => {
      const col = db.collection<SessionDoc>(COLLECTIONS.sessions);
      const record = await col.findOne({ _id: id });
      if (!record?.share || record.share.token !== token) return null;
      if (record.share.expiresAt <= new Date().toISOString()) return null;
      return record as unknown as SessionRecord;
    },
  );
}

export interface ListOptions {
  includeSamples?: boolean;
}

export async function listSessions(
  userId: string | null,
  options: ListOptions = {},
): Promise<SessionRecord[]> {
  return withStore(
    async () => {
      const records = await serialise(async () => ensureSeed(await readAll()));
      return records
        .filter((r: SessionRecord) => visibleTo(r, userId) && ((options.includeSamples ?? true) || !isSample(r)))
        .sort((a: SessionRecord, b: SessionRecord) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async (db: Db) => {
      const col = db.collection<SessionDoc>(COLLECTIONS.sessions);
      const filter: Record<string, unknown> = {};
      if (options.includeSamples !== true) filter.source = { $ne: "demo" };
      const records = await col.find(filter).sort({ createdAt: -1 }).toArray();
      return records
        .filter((r: SessionRecord) => visibleTo(r as unknown as SessionRecord, userId))
        .map((r: SessionRecord) => r as unknown as SessionRecord);
    },
  );
}

export async function getSession(id: string, userId: string | null): Promise<SessionRecord | null> {
  return withStore(
    async () => {
      const records = await serialise(async () => ensureSeed(await readAll()));
      const record = records.find((r) => r.id === id) ?? null;
      if (!record) return null;
      return visibleTo(record, userId) ? record : null;
    },
    async (db: Db) => {
      const col = db.collection<SessionDoc>(COLLECTIONS.sessions);
      const record = await col.findOne({ _id: id });
      if (!record) return null;
      return visibleTo(record as unknown as SessionRecord, userId) ? record as unknown as SessionRecord : null;
    },
  );
}

export async function findByClientSessionId(
  userId: string,
  clientSessionId: string,
): Promise<SessionRecord | null> {
  return withStore(
    async () => {
      const records = await readAll();
      return (
        records.find(
          (r) => r.ownerId === userId && r.clientSessionId === clientSessionId && !isSample(r),
        ) ?? null
      );
    },
    async (db: Db) => {
      const col = db.collection<SessionDoc>(COLLECTIONS.sessions);
      const record = await col.findOne({
        ownerId: userId,
        clientSessionId,
        source: { $ne: "demo" },
      });
      return record as unknown as SessionRecord | null;
    },
  );
}

export async function saveSession(record: SessionRecord): Promise<SessionRecord> {
  return withStore(
    async () => {
      const records = await readAll();
      const next = [record, ...records.filter((r) => r.id !== record.id)];
      await writeAll(next);
      return record;
    },
    async (db: Db) => {
      const col = db.collection<SessionDoc>(COLLECTIONS.sessions);
      await col.replaceOne(
        { _id: record.id },
        {
          ...record,
          createdAt: record.createdAt || new Date().toISOString(),
        },
        { upsert: true },
      );
      return record;
    },
  );
}

export async function deleteSession(id: string, userId: string | null): Promise<boolean> {
  return withStore(
    async () => {
      const records = await readAll();
      const target = records.find((r) => r.id === id);
      if (!target || !writableBy(target, userId)) return false;
      await writeAll(records.filter((r) => r.id !== id));
      return true;
    },
    async (db: Db) => {
      const col = db.collection<SessionDoc>(COLLECTIONS.sessions);
      const target = await col.findOne({ _id: id });
      if (!target || !writableBy(target as unknown as SessionRecord, userId)) return false;
      const result = await col.deleteOne({ _id: id });
      return result.deletedCount === 1;
    },
  );
}

export async function updateSession(
  id: string,
  userId: string | null,
  patch: Partial<Pick<SessionRecord, "title" | "speaker" | "notes">>,
): Promise<SessionRecord | null> {
  return withStore(
    async () => {
      const records = await readAll();
      const idx = records.findIndex((r) => r.id === id);
      if (idx === -1 || !writableBy(records[idx], userId)) return null;
      records[idx] = { ...records[idx], ...patch };
      await writeAll(records);
      return records[idx];
    },
    async (db: Db) => {
      const col = db.collection<SessionDoc>(COLLECTIONS.sessions);
      const target = await col.findOne({ _id: id });
      if (!target || !writableBy(target as unknown as SessionRecord, userId)) return null;
      await col.updateOne({ _id: id }, { $set: patch });
      const updated = await col.findOne({ _id: id });
      return updated as unknown as SessionRecord | null;
    },
  );
}
