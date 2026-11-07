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
import { decryptExternalAiKey, encryptExternalAiKey } from "./crypto";

function uid(): string {
  return `ai_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
}

function omitApiKey(key: StoredExternalAiKey): ExternalAiKeySummary {
  return {
    id: key.id,
    provider: key.provider,
    label: key.label,
    prefix: key.prefix,
    model: key.model,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    useCount: key.useCount,
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
    apiKey: encryptExternalAiKey(rawKey),
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
  return { record: omitApiKey(key) };
}

export async function getExternalAiKey(keyId: string, ownerId: string): Promise<StoredExternalAiKey | null> {
  const { rows } = await dbQuery<{ data: StoredExternalAiKey }>(
    "SELECT data FROM external_ai_keys WHERE id = $1 AND owner_id = $2 LIMIT 1",
    [keyId, ownerId],
  );
  const stored = rows[0]?.data;
  if (!stored) return null;
  const decrypted = decryptExternalAiKey(stored.apiKey);
  if (!decrypted.encrypted) {
    const encrypted = { ...stored, apiKey: encryptExternalAiKey(decrypted.plaintext) };
    await dbQuery("UPDATE external_ai_keys SET data = $2::jsonb WHERE id = $1 AND owner_id = $3", [
      stored.id,
      JSON.stringify(encrypted),
      ownerId,
    ]);
  }
  return { ...stored, apiKey: decrypted.plaintext };
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
