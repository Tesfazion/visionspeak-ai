import { promises as fs } from "node:fs";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { DATA_DIR, STORAGE_IS_EPHEMERAL, dataFile } from "./data-dir";
import { normalisePlan, type PlanId } from "./plans";

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

export const DATA_PATH = DATA_DIR;

const USERS_FILE = dataFile("users.json");
const SECRET_FILE = dataFile("auth-secret");

export const SESSION_COOKIE = "vs_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/** Password-reset links expire after 1 hour; email-verification after 7 days. */
export const RESET_TTL_MS = 1000 * 60 * 60;
export const VERIFY_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  /** Commercial plan. Absent on accounts created before plans shipped → Free. */
  plan?: PlanId;
  /** Set once the address is confirmed. Absent = unverified. */
  emailVerifiedAt?: string;
  /** When the account was deleted, for GDPR erasure. */
  deletedAt?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  plan: PlanId;
}

export const toPublicUser = (u: StoredUser): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  createdAt: u.createdAt,
  plan: normalisePlan(u.plan),
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
      plan: "free",
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

/**
 * Changes an account's plan. This is the seam a billing webhook or an admin
 * action calls — it is deliberately not reachable from the public API.
 */
export async function setUserPlan(userId: string, plan: PlanId): Promise<PublicUser | null> {
  return serialise(async () => {
    const users = await readUsers();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) return null;
    users[index] = { ...users[index], plan: normalisePlan(plan) };
    await writeUsers(users);
    return toPublicUser(users[index]);
  });
}

/* ------------------------------------------------------------------ *
 * One-time action tokens (password reset, email verification)
 *
 * A separate JSON file, not the users file, so a token lookup never touches
 * the password hashes. Tokens are single-use and time-boxed.
 * ------------------------------------------------------------------ */

export type TokenKind = "reset" | "verify";

interface TokenRecord {
  kind: TokenKind;
  userId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  usedAt?: number;
}

const TOKENS_FILE = dataFile("tokens.json");
let tokenQueue: Promise<unknown> = Promise.resolve();

async function readTokens(): Promise<TokenRecord[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(TOKENS_FILE, "utf8"));
    return Array.isArray(parsed) ? (parsed as TokenRecord[]) : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    console.error("[auth] unreadable tokens file", err);
    return [];
  }
}

async function writeTokens(tokens: TokenRecord[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${TOKENS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(tokens, null, 2), "utf8");
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, TOKENS_FILE);
      return;
    } catch (err) {
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

/** Issue a single-use token. Returns the raw token (store it in the link). */
export async function createToken(
  kind: TokenKind,
  userId: string,
  ttlMs: number,
): Promise<string> {
  const raw = randomBytes(24).toString("hex");
  const tokenHash = createHmac("sha256", raw).digest("hex");
  const run = tokenQueue.then(async () => {
    const tokens = await readTokens();
    const now = Date.now();
    // Purge expired and any existing unused token of the same kind for this user.
    const fresh = tokens.filter(
      (t) =>
        !(t.userId === userId && t.kind === kind && !t.usedAt && t.expiresAt > now),
    );
    const record: TokenRecord = {
      kind,
      userId,
      tokenHash,
      createdAt: now,
      expiresAt: now + ttlMs,
    };
    await writeTokens([...fresh, record]);
    return raw;
  });
  tokenQueue = run.catch(() => undefined);
  return run;
}

/** Consume a token. Returns the user id on success, null otherwise. */
export async function consumeToken(
  kind: TokenKind,
  raw: string,
): Promise<string | null> {
  const tokenHash = createHmac("sha256", raw).digest("hex");
  const run = tokenQueue.then(async () => {
    const tokens = await readTokens();
    const now = Date.now();
    const index = tokens.findIndex(
      (t) =>
        t.kind === kind &&
        !t.usedAt &&
        t.expiresAt > now &&
        t.tokenHash === tokenHash,
    );
    if (index === -1) return null;
    tokens[index].usedAt = now;
    await writeTokens(tokens);
    return tokens[index].userId;
  });
  tokenQueue = run.catch(() => undefined);
  return run;
}

/* ------------------------------------------------------------------ *
 * Account deletion (GDPR art. 17)
 * ------------------------------------------------------------------ */

/**
 * Soft-delete: marks the account deleted and removes identifying fields.
 * Sessions are hard-deleted by the caller (store.deleteSession) — this
 * function only owns the user row.
 */
export async function deleteAccount(userId: string): Promise<boolean> {
  return serialise(async () => {
    const users = await readUsers();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) return false;
    users[index] = {
      ...users[index],
      name: "[deleted]",
      email: `deleted-${users[index].id}@deleted.local`,
      passwordHash: "",
      salt: "",
      emailVerifiedAt: undefined,
      deletedAt: new Date().toISOString(),
    };
    await writeUsers(users);
    return true;
  });
}

/* ------------------------------------------------------------------ *
 * Public helpers used by route handlers
 * ------------------------------------------------------------------ */

/** Request a password-reset token. Returns true if the account exists. */
export async function requestPasswordReset(email: string) {
  const user = await findUserByEmail(email);
  if (!user) return false; // don't reveal whether the address is registered
  await createToken("reset", user.id, RESET_TTL_MS);
  return true;
}

/** Consume a reset token and set a new password. */
export async function resetPassword(token: string, newPassword: string) {
  const userId = await consumeToken("reset", token);
  if (!userId) return { error: "Reset link is invalid or has expired." } as const;
  const { salt, passwordHash } = await hashPassword(newPassword);
  return serialise(async () => {
    const users = await readUsers();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) return { error: "Account not found." } as const;
    users[index] = { ...users[index], salt, passwordHash };
    await writeUsers(users);
    return { ok: true } as const;
  });
}

/** Mark an account's email as verified. */
export async function verifyEmail(token: string) {
  const userId = await consumeToken("verify", token);
  if (!userId) return { error: "Verification link is invalid or has expired." } as const;
  return serialise(async () => {
    const users = await readUsers();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) return { error: "Account not found." } as const;
    users[index] = { ...users[index], emailVerifiedAt: new Date().toISOString() };
    await writeUsers(users);
    return { ok: true } as const;
  });
}

/** Issue a verification token for an account. */
export async function requestEmailVerification(userId: string) {
  return createToken("verify", userId, VERIFY_TTL_MS);
}

export async function isEmailVerified(user: StoredUser) {
  return Boolean(user.emailVerifiedAt);
}

/* ------------------------------------------------------------------ *
 * Signed session cookie
 * ------------------------------------------------------------------ */

let cachedSecret: string | null = null;
let warnedEphemeralSecret = false;

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

  if (STORAGE_IS_EPHEMERAL && !warnedEphemeralSecret) {
    warnedEphemeralSecret = true;
    console.warn(
      "[auth] AUTH_SECRET is not set on an ephemeral filesystem — a random secret " +
        "was generated. Sessions will be invalidated whenever a new instance starts. " +
        "Set AUTH_SECRET in the deployment environment.",
    );
  }

  const generated = randomBytes(32).toString("hex");
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(SECRET_FILE, generated, { encoding: "utf8", mode: 0o600 });
  } catch {
    // Read-only deployment without AUTH_SECRET: keep it in memory rather than
    // crashing every auth request. Logins still work for the life of this
    // process; set AUTH_SECRET to make them survive a restart.
  }
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
