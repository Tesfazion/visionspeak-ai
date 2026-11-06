import { randomBytes } from "node:crypto";
import { dbQuery, withDbTransaction } from "@/lib/db/postgres";
import { buildDemoHistory } from "@/lib/analysis/demo";
import type { SessionRecord, ShareLink } from "@/lib/types";

export const isSample = (record: SessionRecord) => record.source === "demo";
export const writableBy = (record: SessionRecord, userId: string | null) =>
  Boolean(userId) && record.ownerId === userId;
export const visibleTo = (record: SessionRecord, userId: string | null) =>
  isSample(record) || (Boolean(userId) && record.ownerId === userId);

export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const isValidShareToken = (token: unknown): token is string =>
  typeof token === "string" && SHARE_TOKEN_RE.test(token);

type SessionRow = { data: SessionRecord };

async function seedSamples(): Promise<void> {
  const { rowCount } = await dbQuery("SELECT 1 FROM sessions WHERE source = 'demo' LIMIT 1");
  if (rowCount) return;
  for (const record of buildDemoHistory()) {
    await saveSession(record);
  }
}

export interface ListOptions {
  includeSamples?: boolean;
}

export async function listSessions(
  userId: string | null,
  options: ListOptions = {},
): Promise<SessionRecord[]> {
  await seedSamples();
  const includeSamples = options.includeSamples ?? true;
  const { rows } = await dbQuery<SessionRow>(
    `SELECT data FROM sessions
     WHERE (source = 'demo' AND $1::boolean) OR (owner_id = $2 AND owner_id IS NOT NULL)
     ORDER BY created_at DESC`,
    [includeSamples, userId],
  );
  return rows.map(({ data }) => data);
}

export async function getSession(id: string, userId: string | null): Promise<SessionRecord | null> {
  await seedSamples();
  const { rows } = await dbQuery<SessionRow>(
    `SELECT data FROM sessions
     WHERE id = $1 AND (source = 'demo' OR ($2::text IS NOT NULL AND owner_id = $2))
     LIMIT 1`,
    [id, userId],
  );
  return rows[0]?.data ?? null;
}

export async function saveSession(record: SessionRecord): Promise<SessionRecord> {
  const createdAt = record.createdAt || new Date().toISOString();
  const saved = { ...record, createdAt };
  await dbQuery(
    `INSERT INTO sessions (id, owner_id, client_session_id, created_at, source, share_token, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       owner_id = EXCLUDED.owner_id,
       client_session_id = EXCLUDED.client_session_id,
       created_at = EXCLUDED.created_at,
       source = EXCLUDED.source,
       share_token = EXCLUDED.share_token,
       data = EXCLUDED.data`,
    [
      saved.id,
      saved.ownerId ?? null,
      saved.clientSessionId ?? null,
      saved.createdAt,
      saved.source,
      saved.share?.token ?? null,
      JSON.stringify(saved),
    ],
  );
  return saved;
}

export async function deleteSession(id: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { rowCount } = await dbQuery(
    "DELETE FROM sessions WHERE id = $1 AND owner_id = $2",
    [id, userId],
  );
  return rowCount === 1;
}

export async function findByClientSessionId(
  userId: string,
  clientSessionId: string,
): Promise<SessionRecord | null> {
  const { rows } = await dbQuery<SessionRow>(
    `SELECT data FROM sessions
     WHERE owner_id = $1 AND client_session_id = $2 AND source <> 'demo'
     LIMIT 1`,
    [userId, clientSessionId],
  );
  return rows[0]?.data ?? null;
}

export async function updateSession(
  id: string,
  userId: string | null,
  patch: Partial<Pick<SessionRecord, "title" | "speaker" | "notes">>,
): Promise<SessionRecord | null> {
  if (!userId) return null;
  return withDbTransaction(async (client) => {
    const { rows } = await client.query<SessionRow>(
      "SELECT data FROM sessions WHERE id = $1 AND owner_id = $2 FOR UPDATE",
      [id, userId],
    );
    if (!rows[0]) return null;
    const updated = { ...rows[0].data, ...patch };
    await client.query(
      "UPDATE sessions SET data = $3::jsonb WHERE id = $1 AND owner_id = $2",
      [id, userId, JSON.stringify(updated)],
    );
    return updated;
  });
}

export async function createShare(
  id: string,
  userId: string,
  days: number,
): Promise<ShareLink | null> {
  if (days <= 0) return null;
  return withDbTransaction(async (client) => {
    const { rows } = await client.query<SessionRow>(
      "SELECT data FROM sessions WHERE id = $1 AND owner_id = $2 FOR UPDATE",
      [id, userId],
    );
    if (!rows[0]) return null;
    const now = Date.now();
    const share: ShareLink = {
      token: randomBytes(18).toString("base64url"),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + days * 86_400_000).toISOString(),
    };
    const updated = { ...rows[0].data, share };
    await client.query(
      "UPDATE sessions SET share_token = $2, data = $3::jsonb WHERE id = $1",
      [id, share.token, JSON.stringify(updated)],
    );
    return share;
  });
}

export async function revokeShare(id: string, userId: string): Promise<boolean> {
  return withDbTransaction(async (client) => {
    const { rows } = await client.query<SessionRow>(
      "SELECT data FROM sessions WHERE id = $1 AND owner_id = $2 FOR UPDATE",
      [id, userId],
    );
    if (!rows[0]?.data.share) return false;
    const updated = { ...rows[0].data };
    delete updated.share;
    await client.query(
      "UPDATE sessions SET share_token = NULL, data = $2::jsonb WHERE id = $1",
      [id, JSON.stringify(updated)],
    );
    return true;
  });
}

export async function getSharedSession(id: string, token: unknown): Promise<SessionRecord | null> {
  if (!isValidShareToken(token)) return null;
  const { rows } = await dbQuery<SessionRow>(
    "SELECT data FROM sessions WHERE id = $1 AND share_token = $2 LIMIT 1",
    [id, token],
  );
  const record = rows[0]?.data;
  if (!record?.share || record.share.expiresAt <= new Date().toISOString()) return null;
  return record;
}
