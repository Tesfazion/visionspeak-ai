import { promises as fs } from "node:fs";
import type { Db } from "mongodb";
import { dataFile } from "@/lib/data-dir";

/**
 * Indexes, the one-time import of the pre-Mongo data, and the merge-back that
 * runs when MongoDB returns after an outage.
 *
 * Everything here is idempotent: it runs on every successful (re)connection
 * without changing existing documents.
 */

export const COLLECTIONS = {
  users: "users",
  sessions: "sessions",
  tokens: "tokens",
  meetings: "meetings",
  meta: "meta",
} as const;

/** `meta` document that records the one-time JSON import. */
const IMPORT_MARKER = "json-import";

type Doc = Record<string, unknown>;

/** Reads `data/<name>` written either as a bare array or as `{ records: [] }`. */
async function readRecordFile(name: string): Promise<Doc[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(dataFile(name), "utf8"));
    if (Array.isArray(parsed)) return parsed as Doc[];
    if (parsed && typeof parsed === "object") {
      const records = (parsed as { records?: unknown }).records;
      if (Array.isArray(records)) return records as Doc[];
    }
    return [];
  } catch {
    // No previous file (a fresh deployment), or an unreadable one: nothing to import.
    return [];
  }
}

/** Reads `data/meetings.json`, a map of id → meeting. */
async function readMeetingFile(): Promise<Doc[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(dataFile("meetings.json"), "utf8"));
    const meetings = (parsed as { meetings?: Record<string, unknown> } | null)?.meetings;
    if (!meetings || typeof meetings !== "object") return [];
    return Object.entries(meetings)
      .filter(([, value]) => Boolean(value) && typeof value === "object")
      .map(([id, value]) => ({ ...(value as Doc), id }));
  } catch {
    return [];
  }
}

/** Mongo `_id` for a record: the app's own id, so a re-import replaces in place. */
/** Mongo `_id` for a record: the app's own id, so a re-import replaces in place. */
const docFor = (record: Doc, id: string): Doc => {
  const { _id: _ignored, ...rest } = record; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...rest, _id: id };
};

const createdAtOf = (record: Doc): string => {
  const raw = record.createdAt;
  if (typeof raw === "string") return raw;
  if (typeof raw === "number") return new Date(raw).toISOString();
  return "";
};

async function upsertAll(db: Db, collection: string, docs: Doc[]): Promise<number> {
  if (docs.length === 0) return 0;
  const col = db.collection(collection);
  const result = await col.bulkWrite(
    docs.map((doc) =>
      ({ replaceOne: { filter: { _id: doc._id as unknown as import("mongodb").ObjectId }, replacement: doc, upsert: true } } as unknown as import("mongodb").AnyBulkWriteOperation<Doc>),
    ),
    { ordered: false },
  );
  return result.upsertedCount + result.modifiedCount;
}

/**
 * Merges the JSON files into MongoDB.
 *
 * With `since` unset this is the full import that runs once, the first time the
 * app points at an empty database, so existing accounts, sessions and meetings
 * survive the switch. With `since` set it only copies what the fallback wrote
 * after MongoDB went away.
 */
export async function syncFromJson(db: Db, since?: string | null): Promise<void> {
  if (process.env.VS_MONGO_IMPORT === "off") return;

  const marker = db.collection(COLLECTIONS.meta);
  if (!since) {
    const done = await marker.findOne({ _id: IMPORT_MARKER as never });
    if (done) return;
  }

  const keep = (record: Doc) => !since || createdAtOf(record) >= since;

  const users = (await readRecordFile("users.json")).filter(keep);
  const sessions = (await readRecordFile("sessions.json")).filter(keep);
  const tokens = (await readRecordFile("tokens.json")).filter(keep);
  const meetings = (await readMeetingFile()).filter(keep);

  const userDocs = users
    .filter((u) => typeof u.id === "string")
    .map((u) => docFor(u, u.id as string));
  const sessionDocs = sessions
    .filter((s) => typeof s.id === "string")
    .map((s) => docFor(s, s.id as string));
  const meetingDocs = meetings
    .filter((m) => typeof m.id === "string")
    .map((m) => docFor(m, m.id as string));
  // A token has no id of its own; its hash is unique per issued token.
  const tokenDocs = tokens
    .filter((t) => typeof t.tokenHash === "string")
    .map((t) => docFor(t, t.tokenHash as string));

  await upsertAll(db, COLLECTIONS.users, userDocs);
  await upsertAll(db, COLLECTIONS.sessions, sessionDocs);
  await upsertAll(db, COLLECTIONS.meetings, meetingDocs);
  await upsertAll(db, COLLECTIONS.tokens, tokenDocs);

  if (!since) {
    await marker.updateOne(
      { _id: IMPORT_MARKER as never },
      {
        $set: {
          importedAt: new Date().toISOString(),
          users: userDocs.length,
          sessions: sessionDocs.length,
          meetings: meetingDocs.length,
          tokens: tokenDocs.length,
        },
      },
      { upsert: true },
    );
  } else if (userDocs.length + sessionDocs.length + meetingDocs.length + tokenDocs.length > 0) {
    console.warn(
      `[mongo] merged ${userDocs.length} user / ${sessionDocs.length} session / ` +
        `${meetingDocs.length} meeting record(s) written to JSON during the outage.`,
    );
  }
}

async function ensureIndexes(db: Db): Promise<void> {
  await db.collection(COLLECTIONS.users).createIndex({ email: 1 }, { unique: true });
  await db.collection(COLLECTIONS.sessions).createIndex({ ownerId: 1, createdAt: -1 });
  await db.collection(COLLECTIONS.sessions).createIndex({ clientSessionId: 1 }, { sparse: true });
  await db.collection(COLLECTIONS.sessions).createIndex({ "share.token": 1 }, { sparse: true });
  await db.collection(COLLECTIONS.sessions).createIndex({ source: 1 });
  await db.collection(COLLECTIONS.sessions).createIndex({ createdAt: -1 });
  await db.collection(COLLECTIONS.tokens).createIndex({ tokenHash: 1 }, { unique: true });
  await db.collection(COLLECTIONS.tokens).createIndex({ userId: 1, kind: 1 });
  await db.collection(COLLECTIONS.meetings).createIndex({ "participants.id": 1 });
  await db.collection(COLLECTIONS.meetings).createIndex({ createdAt: -1 });
}

/** Runs on every (re)connection: indexes, the first import, then the delta. */
export async function ensureSchema(db: Db, recoverySince?: string | null): Promise<void> {
  await ensureIndexes(db);
  await syncFromJson(db, recoverySince ?? null);
}
