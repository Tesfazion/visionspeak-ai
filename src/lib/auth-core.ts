import { promises as fs } from "node:fs";
import path from "node:path";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing, the user file and the signed session cookie.
 *
 * Deliberately free of Next.js imports so it can be unit-tested with plain
 * Node (see tests/auth.test.ts) and reused by scripts. The framework glue —
 * reading the cookie in a server component or route handler — lives in
 * `src/lib/auth.ts`.
 */

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export const DATA_DIR = process.env.VS_DATA_DIR
  ? path.resolve(process.env.VS_DATA_DIR)
  : path.join(process.cwd(), "data");

const USERS_FILE = path.join(DATA_DIR, "users.json");
const SECRET_FILE = path.join(DATA_DIR, "auth-secret");

export const SESSION_COOKIE = "vs_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export const toPublicUser = (u: StoredUser): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  createdAt: u.createdAt,
});

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateCredentials(input: { email?: unknown; password?: unknown; name?: unknown }) {
  const email = typeof input.email === "string" ? normaliseEmail(input.email) : "";
  const password = typeof input.password === "string" ? input.password : "";
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." } as const;
  if (password.length < MIN_PASSWORD) {
    return { error: `Password must be at least ${MIN_PASSWORD} characters.` } as const;
  }
  if (password.length > 200) return { error: "Password is too long." } as const;
  return { email, password, name: name || email.split("@")[0] } as const;
}

/* ------------------------------------------------------------------ *
 * Hashing
 * ------------------------------------------------------------------ */

export async function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const key = await scrypt(password, salt, 64);
  return { salt, passwordHash: key.toString("hex") };
}

export async function verifyPassword(password: string, user: Pick<StoredUser, "salt" | "passwordHash">) {
  const key = await scrypt(password, user.salt, 64);
  const stored = Buffer.from(user.passwordHash, "hex");
  if (stored.length !== key.length) return false;
  return timingSafeEqual(key, stored);
}

/* ------------------------------------------------------------------ *
 * User store
 * ------------------------------------------------------------------ */

let queue: Promise<unknown> = Promise.resolve();
const serialise = <T,>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

async function readUsers(): Promise<StoredUser[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(USERS_FILE, "utf8"));
    return Array.isArray(parsed) ? (parsed as StoredUser[]) : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    console.error("[auth] unreadable users file", err);
    return [];
  }
}

async function writeUsers(users: StoredUser[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${USERS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(users, null, 2), "utf8");
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, USERS_FILE);
      return;
    } catch (err) {
      // Same Windows rename contention as the session store.
      const code = (err as NodeJS.ErrnoException).code;
      const transient = code === "EPERM" || code === "EACCES" || code === "EBUSY";
      if (!transient || attempt >= 5) {
        await fs.rm(tmp, { force: true });
        throw err;
      }
      await new Promise((r) => setTimeout(r, 25 * 2 ** attempt));
    }
  }
}

export const uid = () => `u_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;

export async function countUsers() {
  return (await readUsers()).length;
}

export async function findUserByEmail(email: string) {
  const target = normaliseEmail(email);
  return (await readUsers()).find((u) => u.email === target) ?? null;
}

export async function findUserById(id: string) {
  return (await readUsers()).find((u) => u.id === id) ?? null;
}

/** Creates a user. Returns `{ error }` when the email is already registered. */
export async function createUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ user: PublicUser } | { error: string }> {
  return serialise(async () => {
    const users = await readUsers();
    const email = normaliseEmail(input.email);
    if (users.some((u) => u.email === email)) {
      return { error: "An account with that email already exists." } as const;
    }
    const { salt, passwordHash } = await hashPassword(input.password);
    const user: StoredUser = {
      id: uid(),
      email,
      name: input.name,
      passwordHash,
      salt,
      createdAt: new Date().toISOString(),
    };
    await writeUsers([...users, user]);
    return { user: toPublicUser(user) } as const;
  });
}

export async function authenticate(email: string, password: string): Promise<PublicUser | null> {
  const user = await findUserByEmail(email);
  if (!user) {
    // Spend comparable time on unknown accounts so response timing does not
    // reveal which emails are registered.
    await hashPassword(password, "00000000000000000000000000000000");
    return null;
  }
  return (await verifyPassword(password, user)) ? toPublicUser(user) : null;
}

/* ------------------------------------------------------------------ *
 * Signed session cookie
 * ------------------------------------------------------------------ */

let cachedSecret: string | null = null;

async function getSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }
  try {
    const existing = (await fs.readFile(SECRET_FILE, "utf8")).trim();
    if (existing.length >= 16) {
      cachedSecret = existing;
      return cachedSecret;
    }
  } catch {
    /* generate below */
  }
  const generated = randomBytes(32).toString("hex");
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SECRET_FILE, generated, { encoding: "utf8", mode: 0o600 });
  cachedSecret = generated;
  return cachedSecret;
}

const sign = async (payload: string) =>
  createHmac("sha256", await getSecret()).update(payload).digest("base64url");

/** `userId.expiry.signature` — stateless, so no session table to leak. */
export async function createSessionToken(userId: string, ttlMs = SESSION_TTL_MS) {
  const expiry = Date.now() + ttlMs;
  const payload = `${userId}.${expiry}`;
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiryRaw, signature] = parts;
  const expiry = Number(expiryRaw);
  if (!userId || !Number.isFinite(expiry) || expiry < Date.now()) return null;
  const expected = await sign(`${userId}.${expiryRaw}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}

/* ------------------------------------------------------------------ *
 * Login throttling
 * ------------------------------------------------------------------ */

/**
 * Fixed-window limiter held in memory. Good enough for a single Node process;
 * a multi-instance deployment should move this to Redis.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    check(key: string) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
      }
      entry.count++;
      if (entry.count > limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
        };
      }
      return { allowed: true, remaining: limit - entry.count, retryAfterSec: 0 };
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
