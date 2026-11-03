import { MongoClient, type Db } from "mongodb";
import { ensureSchema } from "@/lib/db/schema";

/**
 * MongoDB is the primary store; the JSON files in `data/` are the fallback.
 *
 * Selection:
 *   - `VS_STORAGE=mongo`  → MongoDB only. If it is unreachable, operations throw
 *     instead of silently writing somewhere else.
 *   - `VS_STORAGE=json`   → the JSON files only (tests, offline work).
 *   - unset (default)     → MongoDB, falling back to the JSON files when the
 *     server cannot be reached or an operation fails.
 *
 * The fallback is *sticky*. A read that fails over must not be followed by a
 * write that goes back to Mongo: the two would drift. So once a call fails, the
 * process serves everything from the JSON files, and re-probes MongoDB every
 * `MONGO_RETRY_MS`. On a successful reconnect the JSON records written during
 * the outage are merged back into Mongo (see `ensureSchema`), which is why the
 * cut-over instant is recorded in `degradedAt`.
 *
 * The client is cached on `globalThis`: Next.js re-evaluates server modules on
 * every hot reload in development, and a new pool per reload exhausts the
 * server's connection limit in minutes.
 */

/** Default target. Override with `MONGODB_URI` for Atlas or another host. */
export const DEFAULT_MONGO_URI = "mongodb://localhost:27017/visionspeak";
export const MONGO_URI = process.env.MONGODB_URI?.trim() || DEFAULT_MONGO_URI;

const fromUri = () => {
  try {
    const path = new URL(MONGO_URI).pathname.replace(/^\//, "").trim();
    return path || "";
  } catch {
    return "";
  }
};

export const MONGO_DB_NAME = process.env.MONGODB_DB?.trim() || fromUri() || "visionspeak";

const forcedRaw = process.env.VS_STORAGE?.trim().toLowerCase();
/** `true` when the operator demanded one backend and no fallback is allowed. */
export const MONGO_ONLY = forcedRaw === "mongo";
export const JSON_ONLY = forcedRaw === "json";

const CONNECT_TIMEOUT_MS = Number(process.env.MONGO_TIMEOUT_MS ?? 2000);
const RETRY_MS = Number(process.env.MONGO_RETRY_MS ?? 30_000);

interface MongoState {
  client: MongoClient | null;
  db: Db | null;
  connecting: Promise<Db | null> | null;
  lastError: string | null;
  /** ISO instant the connection came up. */
  readyAt: string | null;
  /** Epoch ms when Mongo stopped being usable, i.e. when JSON took over. */
  degradedAt: number | null;
  /** Epoch ms before which no reconnect is attempted. */
  retryAt: number;
}

const globals = globalThis as unknown as { __vsMongo?: MongoState };

function state(): MongoState {
  globals.__vsMongo ??= {
    client: null,
    db: null,
    connecting: null,
    lastError: null,
    readyAt: null,
    degradedAt: null,
    retryAt: 0,
  };
  return globals.__vsMongo;
}

/** Strips credentials so a URI can be logged or returned by /api/health. */
export function redactUri(uri: string): string {
  return uri.replace(/\/\/([^@/]+)@/, "//***@");
}

const describe = (err: unknown) => {
  if (err instanceof Error) return err.message;
  return String(err);
};

async function connect(): Promise<Db | null> {
  const s = state();
  let client: MongoClient | null = null;
  try {
    client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
      connectTimeoutMS: CONNECT_TIMEOUT_MS,
      maxPoolSize: 10,
      // Retryable writes make a single-document update safe across a dropped socket.
      retryWrites: true,
      appName: "visionspeak-ai",
    });
    await client.connect();
    const db = client.db(MONGO_DB_NAME);
    await db.command({ ping: 1 });

    // Anything written to the JSON files while Mongo was down is merged back
    // before the first Mongo read, so the two stores cannot drift.
    const recoverySince = s.degradedAt ? new Date(s.degradedAt).toISOString() : null;
    await ensureSchema(db, recoverySince);

    s.client = client;
    s.db = db;
    s.lastError = null;
    s.readyAt = new Date().toISOString();
    if (s.degradedAt !== null) {
      console.warn(
        `[mongo] reconnected to ${MONGO_DB_NAME}; records saved to JSON after ` +
          `${new Date(s.degradedAt).toISOString()} were merged back into MongoDB.`,
      );
      s.degradedAt = null;
    }
    return db;
  } catch (err) {
    // A half-open client would keep a socket and a timer alive.
    await client?.close().catch(() => undefined);
    s.lastError = describe(err);
    s.db = null;
    s.client = null;
    s.retryAt = Date.now() + RETRY_MS;
    if (s.degradedAt === null) {
      s.degradedAt = Date.now();
      console.error(
        `[mongo] cannot reach ${redactUri(MONGO_URI)} (${s.lastError}). ` +
          `${MONGO_ONLY ? "VS_STORAGE=mongo makes this fatal." : "Using the JSON files in data/ until it returns."}`,
      );
    }
    return null;
  }
}

/**
 * The active database, or null when the JSON files are serving traffic.
 *
 * Cheap on the hot path (one nullable check); a reconnect attempt only happens
 * after the retry window has elapsed.
 */
export async function getMongo(): Promise<Db | null> {
  if (JSON_ONLY) return null;
  const s = state();
  if (s.db) return s.db;
  if (s.degradedAt !== null && Date.now() < s.retryAt) return null;
  if (s.connecting) return s.connecting;
  s.connecting = connect();
  try {
    return await s.connecting;
  } finally {
    s.connecting = null;
  }
}

/**
 * Records that an operation against MongoDB failed, so every later call in this
 * process uses the JSON files instead of retrying a database that is down.
 */
export function markMongoFailure(err: unknown, operation: string): void {
  const s = state();
  const message = describe(err);
  s.lastError = message;
  s.retryAt = Date.now() + RETRY_MS;
  if (s.degradedAt === null) s.degradedAt = Date.now();
  const client = s.client;
  s.client = null;
  s.db = null;
  void client?.close().catch(() => undefined);
  console.error(`[mongo] ${operation} failed (${message}); serving the JSON files from now on.`);
}

/**
 * Runs an operation against MongoDB, falling back to its JSON implementation.
 *
 * The JSON branch stays the reference implementation: it is what tests exercise
 * and what runs when no database is reachable, so both paths must behave
 * identically — including their visibility rules.
 */
export async function withStore<T>(
  json: () => Promise<T> | T,
  mongo: (db: Db) => Promise<T>,
): Promise<T> {
  if (JSON_ONLY) return json();
  const db = await getMongo();
  if (!db) {
    if (MONGO_ONLY) {
      throw new Error(
        `VS_STORAGE=mongo is set but MongoDB is unavailable (${state().lastError ?? "no connection"}). ` +
          `Start mongod or unset VS_STORAGE to allow the JSON fallback.`,
      );
    }
    return json();
  }
  try {
    return await mongo(db);
  } catch (err) {
    markMongoFailure(err, "operation");
    if (MONGO_ONLY) throw err;
    return json();
  }
}

/** True while MongoDB is the store actually serving requests. */
export const isMongoActive = (): boolean => state().db !== null;

export interface StorageInfo {
  mode: "mongo" | "json";
  /** Persists across restarts and instances? */
  durable: boolean;
  forced: "mongo" | "json" | null;
  uri: string;
  dbName: string;
  error: string | null;
  readyAt: string | null;
  retryInMs: number;
}

/** Everything /api/health and the dashboard banner need, in one call. */
export async function storageInfo(): Promise<StorageInfo> {
  const db = await getMongo();
  const s = state();
  return {
    mode: db ? "mongo" : "json",
    durable: db !== null,
    forced: MONGO_ONLY ? "mongo" : JSON_ONLY ? "json" : null,
    uri: redactUri(MONGO_URI),
    dbName: MONGO_DB_NAME,
    error: s.lastError,
    readyAt: s.readyAt,
    retryInMs: db ? 0 : Math.max(0, s.retryAt - Date.now()),
  };
}
