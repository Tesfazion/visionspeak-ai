import { promises as fs } from "node:fs";
import { buildDemoHistory } from "@/lib/analysis/demo";
import { DATA_DIR, dataFile } from "@/lib/data-dir";
import type { SessionRecord } from "@/lib/types";

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
  await fs.writeFile(tmp, JSON.stringify(records, null, 2), "utf8");
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

/** Can `userId` modify/delete this record? Samples stay deletable for tidiness. */
export const writableBy = (record: SessionRecord, userId: string | null) =>
  isSample(record) || (Boolean(userId) && record.ownerId === userId);

export async function listSessions(userId: string | null): Promise<SessionRecord[]> {
  const records = await serialise(async () => ensureSeed(await readAll()));
  return records
    .filter((r) => visibleTo(r, userId))
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
