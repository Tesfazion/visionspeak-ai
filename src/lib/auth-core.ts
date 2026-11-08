import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { normalisePlan, type PlanId } from "./plans";
import { dbQuery, withDbTransaction } from "./db/postgres";

/**
 * Password hashing, PostgreSQL-backed users and the signed session cookie.
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
  /** Hashes of session tokens that have been revoked, oldest first. */
  revokedSessionHashes?: string[];
  /**
   * "Sign out everywhere": a token issued at or before this instant is refused.
   * Set by `revokeOtherSessions`, which then re-issues the current device's
   * cookie — stateless tokens carry no session table to delete.
   */
  sessionsValidAfter?: string;
  /** Team/organisation this account belongs to (empty = solo). */
  teamId?: string;
  /** Role within the team: owner | member. Absent on solo accounts. */
  teamRole?: "owner" | "member";
  billing?: {
    provider: "lemon_squeezy";
    subscriptionId: string;
    customerId: string;
    status: string;
    endsAt: string | null;
    customerPortalUrl: string | null;
    updatedAt: string;
  };
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  plan: PlanId;
  emailVerifiedAt?: string;
  teamId?: string;
  teamRole?: "owner" | "member";
  billing?: StoredUser["billing"];
}

export const toPublicUser = (u: StoredUser): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  createdAt: u.createdAt,
  plan: normalisePlan(u.plan),
  emailVerifiedAt: u.emailVerifiedAt,
  teamId: u.teamId,
  teamRole: u.teamRole,
  billing: u.billing,
});

export async function applyLemonSubscriptionEvent(input: {
  eventHash: string;
  userId: string;
  subscriptionId: string;
  customerId: string;
  status: string;
  endsAt: string | null;
  customerPortalUrl: string | null;
  updatedAt: string;
  hasProAccess: boolean;
}): Promise<"applied" | "duplicate" | "user_missing"> {
  return withDbTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO billing_events (event_hash) VALUES ($1)
       ON CONFLICT (event_hash) DO NOTHING RETURNING event_hash`,
      [input.eventHash],
    );
    if (!inserted.rowCount) return "duplicate";

    const { rows } = await client.query<{ data: StoredUser }>(
      "SELECT data FROM users WHERE id = $1 FOR UPDATE",
      [input.userId],
    );
    const current = rows[0]?.data;
    if (!current) return "user_missing";
    if (current.billing && Date.parse(current.billing.updatedAt) > Date.parse(input.updatedAt)) return "applied";

    const updated: StoredUser = {
      ...current,
      plan: input.hasProAccess ? "pro" : "free",
      billing: {
        provider: "lemon_squeezy",
        subscriptionId: input.subscriptionId,
        customerId: input.customerId,
        status: input.status,
        endsAt: input.endsAt,
        customerPortalUrl: input.customerPortalUrl,
        updatedAt: input.updatedAt,
      },
    };
    await client.query("UPDATE users SET data = $2::jsonb WHERE id = $1", [input.userId, JSON.stringify(updated)]);
    return "applied";
  });
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

const MAX_PASSWORD_LENGTH = 200;
const SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 64;
const UID_RANDOM_BYTES = 4;
const TOKEN_RANDOM_BYTES = 24;
const SECRET_RANDOM_BYTES = 32;
const DUMMY_SALT = "0".repeat(32);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MIN_PASSWORD = 8;

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
  if (password.length > MAX_PASSWORD_LENGTH) return { error: "Password is too long." } as const;
  return { email, password, name: name || email.split("@")[0] } as const;
}

/* ------------------------------------------------------------------ *
 * Hashing
 * ------------------------------------------------------------------ */

export async function hashPassword(password: string, salt = randomBytes(SALT_BYTES).toString("hex")) {
  const key = await scrypt(password, salt, PASSWORD_HASH_BYTES);
  return { salt, passwordHash: key.toString("hex") };
}

export async function verifyPassword(password: string, user: Pick<StoredUser, "salt" | "passwordHash">) {
  const key = await scrypt(password, user.salt, PASSWORD_HASH_BYTES);
  const stored = Buffer.from(user.passwordHash, "hex");
  if (stored.length !== key.length) return false;
  return timingSafeEqual(key, stored);
}

/* ------------------------------------------------------------------ *
 * User persistence
 * ------------------------------------------------------------------ */

let queue: Promise<unknown> = Promise.resolve();
const serialise = <T,>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

async function readUsers(): Promise<StoredUser[]> {
  const { rows } = await dbQuery<{ data: StoredUser }>("SELECT data FROM users");
  return rows.map(({ data }) => data);
}

async function writeUser(user: StoredUser): Promise<void> {
  await dbQuery(
    `INSERT INTO users (id, email, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, data = EXCLUDED.data`,
    [user.id, user.email, JSON.stringify(user)],
  );
}

export const uid = () => `u_${Date.now().toString(36)}${randomBytes(UID_RANDOM_BYTES).toString("hex")}`;

export async function countUsers() {
  const { rows } = await dbQuery<{ count: string }>("SELECT count(*)::text AS count FROM users");
  return Number(rows[0]?.count ?? 0);
}

export async function findUserByEmail(email: string) {
  const target = normaliseEmail(email);
  const { rows } = await dbQuery<{ data: StoredUser }>("SELECT data FROM users WHERE email = $1", [target]);
  return rows[0]?.data ?? null;
}

export async function findUserById(id: string) {
  const { rows } = await dbQuery<{ data: StoredUser }>("SELECT data FROM users WHERE id = $1", [id]);
  return rows[0]?.data ?? null;
}

/** Creates a user. Returns `{ error }` when the email is already registered. */
export async function createUser(input: {
  email: string;
  password: string;
  name: string;
  /** Marks the address confirmed at creation — set when no SMTP sender is
   * configured, so an unverifiable account is never locked out of the studio. */
  emailVerifiedAt?: string;
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
      ...(input.emailVerifiedAt ? { emailVerifiedAt: input.emailVerifiedAt } : {}),
    };
    try {
      await writeUser(user);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return { error: "An account with that email already exists." } as const;
      }
      throw error;
    }
    return { user: toPublicUser(user) } as const;
  });
}

export async function authenticate(email: string, password: string): Promise<PublicUser | null> {
  const user = await findUserByEmail(email);
  if (!user) {
    // Spend comparable time on unknown accounts so response timing does not
    // reveal which emails are registered.
    await hashPassword(password, DUMMY_SALT);
    return null;
  }
  // Skip email verification check for local/dev setups without SMTP,
  // so new accounts can use the app immediately. In production with
  // SMTP configured, verifyEmail should be called before login.
  if (user.emailVerifiedAt === undefined) {
    // Allow unverified accounts in development; in production,
    // the signup route sets emailVerifiedAt when SMTP is not configured.
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
    await writeUser(users[index]);
    return toPublicUser(users[index]);
  });
}

/**
 * Profile edits a signed-in user may make themselves: display name and a
 * password change that re-verified the current one first.
 */
export async function updateProfile(
  userId: string,
  input: { name?: string },
): Promise<PublicUser | null> {
  return serialise(async () => {
    const users = await readUsers();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) return null;
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";
    if (name) users[index] = { ...users[index], name };
    await writeUser(users[index]);
    return toPublicUser(users[index]);
  });
}

export type PasswordChangeError =
  | "account_missing"
  | "wrong_current"
  | "too_short"
  | "too_long";

/**
 * Change the password while signed in. The current password is verified (with
 * the same constant-time compare as login) so a stolen session cookie alone is
 * not enough to take the account. On success, every other session is cut off —
 * a password change should behave like "sign out everywhere".
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { error: PasswordChangeError }> {
  if (newPassword.length < MIN_PASSWORD) return { error: "too_short" };
  if (newPassword.length > 200) return { error: "too_long" };
  return serialise(async () => {
    const users = await readUsers();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) return { error: "account_missing" } as const;
    const user = users[index];
    if (!user.passwordHash || !(await verifyPassword(currentPassword, user))) {
      return { error: "wrong_current" } as const;
    }
    const { salt, passwordHash } = await hashPassword(newPassword);
    users[index] = {
      ...user,
      salt,
      passwordHash,
      sessionsValidAfter: new Date().toISOString(),
    };
    await writeUser(users[index]);
    return { ok: true } as const;
  });
}

/* ------------------------------------------------------------------ *
 * One-time action tokens (password reset, email verification).
 * ------------------------------------------------------------------ */

export type TokenKind = "reset" | "verify";

export interface TokenRecord {
  kind: TokenKind;
  userId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  usedAt?: number;
}

let tokenQueue: Promise<unknown> = Promise.resolve();

/** Issue a single-use token. Returns the raw token (store it in the link). */
export async function createToken(
  kind: TokenKind,
  userId: string,
  ttlMs: number,
): Promise<string> {
  const raw = randomBytes(TOKEN_RANDOM_BYTES).toString("hex");
  const secret = await getSecret();
  const tokenHash = createHmac("sha256", secret).update(raw).digest("hex");
  const run = tokenQueue.then(async () => {
    const now = Date.now();
    await dbQuery(
      `DELETE FROM auth_tokens
       WHERE user_id = $1 AND kind = $2 AND used_at IS NULL AND expires_at > $3`,
      [userId, kind, now],
    );
    await dbQuery(
      `INSERT INTO auth_tokens (token_hash, user_id, kind, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [tokenHash, userId, kind, now, now + ttlMs],
    );
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
  const secret = await getSecret();
  const tokenHash = createHmac("sha256", secret).update(raw).digest("hex");
  const run = tokenQueue.then(async () => {
    const now = Date.now();
    const { rows } = await dbQuery<{ user_id: string }>(
      `UPDATE auth_tokens SET used_at = $3
       WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > $3
       RETURNING user_id`,
      [tokenHash, kind, now],
    );
    return rows[0]?.user_id ?? null;
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
    await writeUser(users[index]);
    return true;
  });
}

/* ------------------------------------------------------------------ *
 * Public helpers used by route handlers
 * ------------------------------------------------------------------ */

/** Request a password-reset token. Returns the raw token if the account exists. */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const user = await findUserByEmail(email);
  if (!user) return null; // don't reveal whether the address is registered
  return createToken("reset", user.id, RESET_TTL_MS);
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
    users[index] = {
      ...users[index],
      salt,
      passwordHash,
      sessionsValidAfter: new Date().toISOString(),
    };
    await writeUser(users[index]);
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
    await writeUser(users[index]);
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

/**
 * Did this request reach us over TLS?
 *
 * The session cookie has to be `Secure` on HTTPS and must NOT be on plain HTTP:
 * a browser silently discards a `Secure` cookie that arrives over an insecure
 * origin, so the login POST returns 200, the cookie never lands, and the very
 * next `/dashboard` request bounces back to `/login`. That is what a production
 * build served over `http://` looks like — the "Network" URL `next start` prints
 * (a LAN address), a box with no TLS in front of it — and it reads to the user
 * as "my password is accepted but the dashboard never opens".
 *
 * `NODE_ENV` is the wrong signal: it says how the app was built, not how this
 * request arrived. Behind a TLS-terminating proxy (Vercel, nginx) the scheme is
 * in `x-forwarded-proto`; with no proxy in front, the request URL is the truth.
 */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded) return forwarded === "https";

  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (publicUrl) {
    try {
      return new URL(publicUrl).protocol === "https:";
    } catch {
      // fall through
    }
  }

  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

let cachedSecret: string | null = null;

export function isAuthSecretConfigured(secret: string | undefined): boolean {
  return Boolean(secret?.trim() && secret.trim().length >= 16);
}

export async function getAuthSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv && isAuthSecretConfigured(fromEnv)) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must contain at least 16 characters in production.");
  }
  cachedSecret = randomBytes(SECRET_RANDOM_BYTES).toString("hex");
  return cachedSecret;
}

async function getSecret(): Promise<string> {
  return getAuthSecret();
}

const sign = async (payload: string) =>
  createHmac("sha256", await getSecret()).update(payload).digest("base64url");

/** `userId.issuedAt.expiry.signature` — stateless, so no session table to leak. */
export async function createSessionToken(userId: string, ttlMs = SESSION_TTL_MS) {
  const issuedAt = Date.now();
  const expiry = issuedAt + ttlMs;
  const payload = `${userId}.${issuedAt}.${expiry}`;
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  // Tokens minted before "sign out everywhere" shipped have no issuedAt. They
  // stay valid (they expire within 30 days) unless the account has a cut-off.
  const legacy = parts.length === 3;
  if (!legacy && parts.length !== 4) return null;
  const [userId, issuedRaw, expiryRaw, signature] = legacy
    ? [parts[0], "", parts[1], parts[2]]
    : parts;
  const expiry = Number(expiryRaw);
  if (!userId || !Number.isFinite(expiry) || expiry < Date.now()) return null;
  const payload = issuedRaw ? `${userId}.${issuedRaw}.${expiryRaw}` : `${userId}.${expiryRaw}`;
  const expected = await sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  // Revocation check: the user row carries a list of revoked token hashes.
  const user = await findUserById(userId);
  if (user?.revokedSessionHashes?.some((h) => h === createHmac("sha256", token).digest("hex"))) {
    return null;
  }
  // "Sign out everywhere" cut-off. A legacy token has no issuedAt, so `0` —
  // which is exactly the intent: the cut-off invalidates all of them. The
  // comparison is "<" so the fresh cookie this device re-issues right after the
  // cut-off, in the same millisecond, is not refused by its own cut-off.
  const cutoff = user?.sessionsValidAfter ? Date.parse(user.sessionsValidAfter) : 0;
  if (cutoff > 0 && Number(issuedRaw) < cutoff) return null;
  return userId;
}

/** Revoke a session token. Idempotent — revoking twice is fine. */
export async function revokeSessionToken(token: string): Promise<boolean> {
  const hash = createHmac("sha256", token).digest("hex");
  return serialise(async () => {
    const users = await readUsers();
    const index = users.findIndex((u) =>
      (u.revokedSessionHashes ?? []).some((h) => h === hash),
    );
    if (index !== -1) return true; // already revoked
    // Find the user this token belongs to by verifying it.
    const userId = await verifySessionToken(token);
    if (!userId) return false;
    const userIndex = users.findIndex((u) => u.id === userId);
    if (userIndex === -1) return false;
    const existing = users[userIndex].revokedSessionHashes ?? [];
    // Cap the list so a long-lived account cannot grow it without bound.
    const updated = [...existing, hash].slice(-200);
    users[userIndex] = { ...users[userIndex], revokedSessionHashes: updated };
    await writeUser(users[userIndex]);
    return true;
  });
}

/**
 * Invalidates every session token this account has issued so far — the "sign out
 * everywhere" control. The caller re-issues a cookie for the current device
 * straight afterwards, so that device stays signed in and every other copy of a
 * cookie (a leaked one, an old laptop) stops working on its next request.
 *
 * Stateless signed tokens cannot be enumerated, so the user row carries the
 * cut-off instant and `verifySessionToken` compares each token's `issuedAt` to it.
 */
export async function revokeOtherSessions(userId: string): Promise<boolean> {
  return serialise(async () => {
    const users = await readUsers();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) return false;
    users[index] = { ...users[index], sessionsValidAfter: new Date().toISOString() };
    await writeUser(users[index]);
    return true;
  });
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
