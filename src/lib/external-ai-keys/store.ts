/**
 * External AI key store — JSON-file backed (same pattern as sessions.json).
 *
 * Never persists raw keys — only keyHash (SHA-256) and public metadata.
 */

import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import { hashExternalAiKey, keyPrefix, AiProvider, DEFAULT_MODELS, StoredExternalAiKey, ExternalAiKeyCreateResult, ExternalAiKeySummary, isValidExternalAiKey } from "./types";
import { DATA_DIR, dataFile } from "../data-dir";

const FILE = dataFile("external-ai-keys.json");

let initPromise: Promise<StoredExternalAiKey[]> | null = null;
let storedKeys: StoredExternalAiKey[] = [];

function uid(): string {
  return `ai_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
}

async function initKeys(): Promise<StoredExternalAiKey[]> {
  if (storedKeys.length > 0) return storedKeys;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const raw = await fs.readFile(FILE, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          storedKeys = parsed as StoredExternalAiKey[];
          return storedKeys;
        }
        if (parsed && typeof parsed === "object" && Array.isArray((parsed as { records?: unknown }).records)) {
          storedKeys = (parsed as { records: StoredExternalAiKey[], version?: number }).records as StoredExternalAiKey[];
          return storedKeys;
        }
        storedKeys = [];
        return storedKeys;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          storedKeys = [];
          return storedKeys;
        }
        console.error("[external-ai-keys] unreadable keys file", err);
        storedKeys = [];
        return storedKeys;
      }
    })();
  }
  return initPromise;
}

export async function listExternalAiKeys(ownerId: string): Promise<ExternalAiKeySummary[]> {
  const keys = await initKeys();
  return keys.filter((k) => k.ownerId === ownerId).sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export async function createExternalAiKey(
  ownerId: string,
  provider: AiProvider,
  rawKey: string,
  label: string,
  model?: string
): Promise<ExternalAiKeyCreateResult> {
  if (!isValidExternalAiKey(rawKey)) {
    throw new Error("Invalid API key format.");
  }

  return (async () => {
    const keys = await initKeys();
    const effectiveModel = model || DEFAULT_MODELS[provider];

    const key: StoredExternalAiKey = {
      id: uid(),
      provider,
      label: label || `Untitled ${provider} key`,
      prefix: keyPrefix(rawKey, provider),
      keyHash: hashExternalAiKey(rawKey),
      apiKey: rawKey,
      model: effectiveModel,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      useCount: 0,
      ownerId,
    };

    keys.push(key);
    await writeKeys(keys);
    return { key: rawKey, record: omitHash(key) };
  })();
}

function omitHash(key: StoredExternalAiKey): Omit<StoredExternalAiKey, "keyHash"> {
  const { keyHash, ...rest } = key;
  return rest as Omit<StoredExternalAiKey, "keyHash">;
}

async function writeKeys(keys: StoredExternalAiKey[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ schemaVersion: 1, keys }, null, 2), "utf8");
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
      await new Promise((r) => setTimeout(r, 25 * 2 ** attempt));
    }
  }
}

export async function getExternalAiKeyByHash(keyHash: string): Promise<StoredExternalAiKey | null> {
  const keys = await initKeys();
  return keys.find((k) => k.keyHash === keyHash) ?? null;
}

export async function touchExternalAiKey(keyId: string): Promise<void> {
  return (async () => {
    const keys = await initKeys();
    const idx = keys.findIndex((k) => k.id === keyId);
    if (idx === -1) return;
    const now = new Date().toISOString();
    keys[idx] = { ...keys[idx], useCount: (keys[idx].useCount ?? 0) + 1, lastUsedAt: now };
    await writeKeys(keys);
  })();
}

export async function deleteExternalAiKey(keyId: string, ownerId: string): Promise<boolean> {
  return (async () => {
    const keys = await initKeys();
    const idx = keys.findIndex((k) => k.id === keyId && k.ownerId === ownerId);
    if (idx === -1) return false;
    keys.splice(idx, 1);
    await writeKeys(keys);
    return true;
  })();
}

export async function setExternalAiKeyModel(keyId: string, ownerId: string, model: string): Promise<boolean> {
  return (async () => {
    const keys = await initKeys();
    const idx = keys.findIndex((k) => k.id === keyId && k.ownerId === ownerId);
    if (idx === -1) return false;
    keys[idx] = { ...keys[idx], model };
    await writeKeys(keys);
    return true;
  })();
}