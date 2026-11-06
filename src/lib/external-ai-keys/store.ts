import { randomBytes } from "node:crypto";
import {
  hashExternalAiKey,
  keyPrefix,
  DEFAULT_MODELS,
  type AiProvider,
  type StoredExternalAiKey,
  type ExternalAiKeyCreateResult,
  type ExternalAiKeySummary,
  isValidExternalAiKey,
} from "./types";
import { dbQuery } from "@/lib/db/postgres";

function uid(): string {
  return `ai_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
}

function omitHash(key: StoredExternalAiKey): Omit<StoredExternalAiKey, "keyHash"> {
  const rest: Partial<StoredExternalAiKey> = { ...key };
  delete rest.keyHash;
  return rest as Omit<StoredExternalAiKey, "keyHash">;
}

function omitApiKey(key: StoredExternalAiKey): ExternalAiKeySummary {
  return {
    id: key.id,
    provider: key.provider,
    label: key.label,
    prefix: key.prefix,
    keyHash: key.keyHash,
    model: key.model,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    useCount: key.useCount,
    ownerId: key.ownerId,
  };
}

export async function listExternalAiKeys(ownerId: string): Promise<ExternalAiKeySummary[]> {
  const { rows } = await dbQuery<{ data: StoredExternalAiKey }>(
    "SELECT data FROM external_ai_keys WHERE owner_id = $1 ORDER BY created_at DESC",
    [ownerId],
  );
  return rows.map(({ data }) => omitApiKey(data));
}

export async function createExternalAiKey(
  ownerId: string,
  provider: AiProvider,
  rawKey: string,
  label: string,
  model?: string,
): Promise<ExternalAiKeyCreateResult> {
  if (!isValidExternalAiKey(rawKey)) throw new Error("Invalid API key format.");

  const key: StoredExternalAiKey = {
    id: uid(),
    provider,
    label: label || `Untitled ${provider} key`,
    prefix: keyPrefix(rawKey, provider),
    keyHash: hashExternalAiKey(rawKey),
    apiKey: rawKey,
    model: model || DEFAULT_MODELS[provider],
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    useCount: 0,
    ownerId,
  };
  await dbQuery(
    `INSERT INTO external_ai_keys (id, owner_id, key_hash, created_at, data)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [key.id, ownerId, key.keyHash, key.createdAt, JSON.stringify(key)],
  );
  return { key: rawKey, record: omitHash(key) };
}

export async function getExternalAiKeyByHash(keyHash: string): Promise<StoredExternalAiKey | null> {
  const { rows } = await dbQuery<{ data: StoredExternalAiKey }>(
    "SELECT data FROM external_ai_keys WHERE key_hash = $1 LIMIT 1",
    [keyHash],
  );
  return rows[0]?.data ?? null;
}

export async function touchExternalAiKey(keyId: string): Promise<void> {
  await dbQuery(
    `UPDATE external_ai_keys
     SET data = jsonb_set(
       jsonb_set(data, '{useCount}', to_jsonb(COALESCE((data->>'useCount')::integer, 0) + 1)),
       '{lastUsedAt}', to_jsonb($2::text)
     )
     WHERE id = $1`,
    [keyId, new Date().toISOString()],
  );
}

export async function deleteExternalAiKey(keyId: string, ownerId: string): Promise<boolean> {
  const { rowCount } = await dbQuery(
    "DELETE FROM external_ai_keys WHERE id = $1 AND owner_id = $2",
    [keyId, ownerId],
  );
  return rowCount === 1;
}

export async function setExternalAiKeyModel(
  keyId: string,
  ownerId: string,
  model: string,
): Promise<boolean> {
  const { rowCount } = await dbQuery(
    `UPDATE external_ai_keys
     SET data = jsonb_set(data, '{model}', to_jsonb($3::text))
     WHERE id = $1 AND owner_id = $2`,
    [keyId, ownerId, model],
  );
  return rowCount === 1;
}
