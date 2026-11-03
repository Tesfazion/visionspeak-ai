// MongoDB auth adapter
import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import type { Db } from "mongodb";
import { promisify } from "node:util";
import { normalisePlan, type PlanId } from "@/lib/plans";
import { dataFile } from "@/lib/data-dir";
import { COLLECTIONS } from "@/lib/db/schema";
import { withStore } from "@/lib/db/mongo";

/** Documents keep the app's string id in Mongo's `_id` field. */
type UserDoc = StoredUser & { _id: string };

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const SCHEMA_VERSION = 2;

function migrateUserRecords(
  records: Record<string, unknown>[],
  fromVersion: number,
  toVersion: number,
): StoredUser[] {
  if (fromVersion >= toVersion) return records.map((r) => r as unknown as StoredUser);
  let migrated = records;
  if (fromVersion < 2 && toVersion >= 2) {
    migrated = migrated.map((r) => ({ ...r }));
  }
  return migrated.map((r) => r as unknown as StoredUser);
}

const USERS_FILE = dataFile("users.json");
const TOKENS_FILE = dataFile("tokens.json");
const SECRET_FILE = dataFile("auth-secret");

let tokenQueue: Promise<unknown> = Promise.resolve();

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

export async function hashPassword(
  password: string,
  salt = randomBytes(16).toString("hex"),
) {
  const key = await scrypt(password, salt, 64);
  return { salt, passwordHash: key.toString("hex") };
}

export async function verifyPassword(
  password: string,
  user: Pick<StoredUser, "salt" | "passwordHash">,
) {
  const key = await scrypt(password, user.salt, 64);
  const stored = Buffer.from(user.passwordHash, "hex");
  if (stored.length !== key.length) return false;
  return timingSafeEqual(key, stored);
}

export const uid = () => `u_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;

export async function countUsers() {
  return withStore(
    async () => {
      const users = await readUsers();
      return users.length;
    },
    async (db: Db) => db.collection<UserDoc>(COLLECTIONS.users).countDocuments(),
  );
}

export async function findUserByEmail(email: string) {
  const target = normaliseEmail(email);
  return withStore(
    async () => {
      const users = await readUsers();
      return users.find((u) => u.email === target) ?? null;
    },
    async (db: Db) => {
      const user = await db.collection<UserDoc>(COLLECTIONS.users).findOne({ email: target });
      return user as unknown as StoredUser | null;
    },
  );
}

export async function findUserById(id: string) {
  return withStore(
    async () => {
      const users = await readUsers();
      return users.find((u) => u.id === id) ?? null;
    },
    async (db: Db) => {
      const user = await db.collection<UserDoc>(COLLECTIONS.users).findOne({ _id: id });
      return user as unknown as StoredUser | null;
    },
  );
}

export async function createUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ user: PublicUser } | { error: string }> {
  return withStore(
    async () => {
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
    },
    async (db: Db) => {
      const col = db.collection<UserDoc>(COLLECTIONS.users);
      const email = normaliseEmail(input.email);
      const existing = await col.findOne({ email });
      if (existing) {
        return { error: "An account with that email already exists." } as const;
      }
      const { salt, passwordHash } = await hashPassword(input.password);
      const user = {
        _id: uid(),
        email,
        name: input.name,
        passwordHash,
        salt,
        createdAt: new Date().toISOString(),
        plan: "free",
      } as unknown as StoredUser & { _id: string };
      await col.insertOne(user);
      return { user: toPublicUser(user) } as const;
    },
  );
}

export async function authenticate(email: string, password: string): Promise<PublicUser | null> {
  const user = await findUserByEmail(email);
  if (!user) {
    await hashPassword(password, "00000000000000000000000000000000");
    return null;
  }
  if (!isEmailVerified(user)) {
    await hashPassword(password, "00000000000000000000000000000000");
    return null;
  }
  return (await verifyPassword(password, user)) ? toPublicUser(user) : null;
}

export async function setUserPlan(userId: string, plan: PlanId): Promise<PublicUser | null> {
  return withStore(
    async () => {
      const users = await readUsers();
      const index = users.findIndex((u) => u.id === userId);
      if (index === -1) return null;
      users[index] = { ...users[index], plan: normalisePlan(plan) };
      await writeUsers(users);
      return toPublicUser(users[index]);
    },
    async (db: Db) => {
      const col = db.collection<UserDoc>(COLLECTIONS.users);
      const result = await col.updateOne(
        { _id: userId },
        { $set: { plan: normalisePlan(plan) } },
      );
      if (result.matchedCount === 0) return null;
      const updated = await col.findOne({ _id: userId });
      return updated ? toPublicUser(updated) : null;
    },
  );
}

export const toPublicUser = (u: StoredUser): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  createdAt: u.createdAt,
  plan: normalisePlan(u.plan),
  teamId: u.teamId,
  teamRole: u.teamRole,
});

export async function deleteAccount(userId: string): Promise<boolean> {
  return withStore(
    async () => {
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
    },
    async (db: Db) => {
      const col = db.collection<UserDoc>(COLLECTIONS.users);
      const target = await col.findOne({ _id: userId });
      if (!target) return false;
      await col.updateOne({ _id: userId }, {
        $set: {
          name: "[deleted]",
          email: `deleted-${userId}@deleted.local`,
          passwordHash: "",
          salt: "",
          emailVerifiedAt: undefined,
          deletedAt: new Date().toISOString(),
        },
      });
      return true;
    },
  );
}

export interface TokenRecord {
  kind: "reset" | "verify";
  userId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  usedAt?: number;
}

export type TokenKind = "reset" | "verify";

export async function createToken(kind: TokenKind, userId: string, ttlMs: number): Promise<string> {
  const raw = randomBytes(24).toString("hex");
  const tokenHash = createHmac("sha256", raw).digest("hex");
  const run = tokenQueue.then(async () => {
    const tokens = await readTokens();
    const now = Date.now();
    const fresh = tokens.filter(
      (t) => !(t.userId === userId && t.kind === kind && !t.usedAt && t.expiresAt > now),
    );
    const record: TokenRecord = { kind, userId, tokenHash, createdAt: now, expiresAt: now + ttlMs };
    await writeTokens([...fresh, record]);
    return raw;
  });
  tokenQueue = run.catch(() => undefined);
  return run;
}

export async function consumeToken(kind: TokenKind, raw: string): Promise<string | null> {
  const tokenHash = createHmac("sha256", raw).digest("hex");
  const run = tokenQueue.then(async () => {
    const tokens = await readTokens();
    const now = Date.now();
    const index = tokens.findIndex(
      (t) => t.kind === kind && !t.usedAt && t.expiresAt > now && t.tokenHash === tokenHash,
    );
    if (index === -1) return null;
    tokens[index].usedAt = now;
    await writeTokens(tokens);
    return tokens[index].userId;
  });
  tokenQueue = run.catch(() => undefined);
  return run;
}

export async function requestPasswordReset(email: string): Promise<string | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  return createToken("reset", user.id, RESET_TTL_MS);
}

export async function resetPassword(token: string, newPassword: string) {
  const userId = await consumeToken("reset", token);
  if (!userId) return { error: "Reset link is invalid or has expired." } as const;
  return withStore(
    async () => {
      const users = await readUsers();
      const index = users.findIndex((u) => u.id === userId);
      if (index === -1) return { error: "Account not found." } as const;
      const { salt, passwordHash } = await hashPassword(newPassword);
      users[index] = { ...users[index], salt, passwordHash };
      await writeUsers(users);
      return { ok: true } as const;
    },
    async (db: Db) => {
      const col = db.collection<UserDoc>(COLLECTIONS.users);
      const { salt, passwordHash } = await hashPassword(newPassword);
      const result = await col.updateOne({ _id: userId }, { $set: { salt, passwordHash } });
      if (result.matchedCount === 0) return { error: "Account not found." } as const;
      return { ok: true } as const;
    },
  );
}

export async function verifyEmail(token: string) {
  const userId = await consumeToken("verify", token);
  if (!userId) return { error: "Verification link is invalid or has expired." } as const;
  return withStore(
    async () => {
      const users = await readUsers();
      const index = users.findIndex((u) => u.id === userId);
      if (index === -1) return { error: "Account not found." } as const;
      users[index] = { ...users[index], emailVerifiedAt: new Date().toISOString() };
      await writeUsers(users);
      return { ok: true } as const;
    },
    async (db: Db) => {
      const col = db.collection<UserDoc>(COLLECTIONS.users);
      const result = await col.updateOne(
        { _id: userId },
        { $set: { emailVerifiedAt: new Date().toISOString() } },
      );
      if (result.matchedCount === 0) return { error: "Account not found." } as const;
      return { ok: true } as const;
    },
  );
}

export async function requestEmailVerification(userId: string) {
  return createToken("verify", userId, VERIFY_TTL_MS);
}

export async function isEmailVerified(user: StoredUser) {
  return Boolean(user.emailVerifiedAt);
}

export const SESSION_COOKIE = "vs_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
export const RESET_TTL_MS = 1000 * 60 * 60;
export const VERIFY_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export async function createSessionToken(userId: string, ttlMs = SESSION_TTL_MS) {
  const issuedAt = Date.now();
  const expiry = issuedAt + ttlMs;
  const payload = `${userId}.${issuedAt}.${expiry}`;
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
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
  const user = await findUserById(userId);
  if (user?.revokedSessionHashes?.some((h) => h === createHmac("sha256", token).digest("hex"))) {
    return null;
  }
  const cutoff = user?.sessionsValidAfter ? Date.parse(user.sessionsValidAfter) : 0;
  if (cutoff > 0 && Number(issuedRaw) < cutoff) return null;
  return userId;
}

export async function revokeSessionToken(token: string): Promise<boolean> {
  return withStore(
    async () => {
      const users = await readUsers();
      const index = users.findIndex((u) =>
        (u.revokedSessionHashes ?? []).some((h) => h === createHmac("sha256", token).digest("hex")),
      );
      if (index !== -1) return true;
      const resolvedUserId = await verifySessionToken(token);
      if (!resolvedUserId) return false;
      const userIndex = users.findIndex((u) => u.id === resolvedUserId);
      if (userIndex === -1) return false;
      const existing = users[userIndex].revokedSessionHashes ?? [];
      const updated = [...existing, createHmac("sha256", token).digest("hex")].slice(-200);
      users[userIndex] = { ...users[userIndex], revokedSessionHashes: updated };
      await writeUsers(users);
      return true;
    },
    async (db: Db) => {
      const col = db.collection<UserDoc>(COLLECTIONS.users);
      const hash = createHmac("sha256", token).digest("hex");
      const resolvedUserId = await verifySessionToken(token);
      if (!resolvedUserId) return false;
      const target = await col.findOne({ _id: resolvedUserId });
      if (!target) return false;
      const existing = target.revokedSessionHashes ?? [];
      if (existing.some((h: string) => h === hash)) return true;
      const updated = [...existing, hash].slice(-200);
      const result = await col.updateOne({ _id: resolvedUserId }, { $set: { revokedSessionHashes: updated } });
      return result.modifiedCount === 1;
    },
  );
}

export async function revokeOtherSessions(userId: string): Promise<boolean> {
  return withStore(
    async () => {
      const users = await readUsers();
      const index = users.findIndex((u) => u.id === userId);
      if (index === -1) return false;
      users[index] = { ...users[index], sessionsValidAfter: new Date().toISOString() };
      await writeUsers(users);
      return true;
    },
    async (db: Db) => {
      const col = db.collection<UserDoc>(COLLECTIONS.users);
      const result = await col.updateOne({ _id: userId }, { $set: { sessionsValidAfter: new Date().toISOString() } });
      return result.modifiedCount === 1;
    },
  );
}

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
        return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
      }
      return { allowed: true, remaining: limit - entry.count, retryAfterSec: 0 };
    },
    reset(key: string) { hits.delete(key); },
  };
}

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
  } catch {}
  const generated = randomBytes(32).toString("hex");
  try {
    await fs.mkdir(dirname(SECRET_FILE), { recursive: true });
    await fs.writeFile(SECRET_FILE, generated, { encoding: "utf8", mode: 0o600 });
  } catch {}
  cachedSecret = generated;
  return cachedSecret;
}

const sign = async (payload: string) =>
  createHmac("sha256", await getSecret()).update(payload).digest("base64url");

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  plan?: PlanId;
  emailVerifiedAt?: string;
  deletedAt?: string;
  revokedSessionHashes?: string[];
  sessionsValidAfter?: string;
  teamId?: string;
  teamRole?: "owner" | "member";
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  plan: PlanId;
  teamId?: string;
  teamRole?: "owner" | "member";
}

export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded) return forwarded === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

async function readUsers(): Promise<StoredUser[]> {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const migrated = migrateUserRecords(parsed, 1, SCHEMA_VERSION);
      return migrated;
    } else if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { records?: unknown }).records)
    ) {
      const envelope = parsed as { records: Record<string, unknown>[]; version?: number };
      const version = envelope.version || 1;
      const migrated = migrateUserRecords(envelope.records, version, SCHEMA_VERSION);
      return migrated;
    }
    return Array.isArray(parsed) ? (parsed as StoredUser[]) : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    console.error("[auth] unreadable users file", err);
    return [];
  }
}

async function writeUsers(users: StoredUser[]): Promise<void> {
  await fs.mkdir(dirname(USERS_FILE), { recursive: true });
  const tmp = `${USERS_FILE}.tmp`;
  const data = { schemaVersion: SCHEMA_VERSION, version: SCHEMA_VERSION, records: users };
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, USERS_FILE);
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

async function writeTokens(tokens: TokenRecord[]): Promise<void> {
  await fs.mkdir(dirname(TOKENS_FILE), { recursive: true });
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
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }
}
