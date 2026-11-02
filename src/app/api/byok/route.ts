"use server";

import type { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import { createHmac, randomBytes } from "node:crypto";

/** Path where BYOK global config lives (relative to DATA_DIR). */
const BYOK_CONFIG_FILE = "./data/byok-config.json";

/**
 * Stores the BYOK global key (only set once per deployment).
 * Body: { provider: "openai" | "anthropic", apiKey: string }
 *
 * On first write, generates an HMAC seal key and stores it alongside the API key.
 * Subsequent writes are rejected to prevent key rotation confusion.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { provider, apiKey } = body as { provider: string; apiKey: string };

  if (!provider || !apiKey) {
    return new Response(JSON.stringify({ error: "provider and apiKey required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (provider !== "openai" && provider !== "anthropic") {
    return new Response(JSON.stringify({ error: "invalid provider" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Ensure config dir exists
  const dataDir = process.env.DATA_DIR ?? "./data";
  await fs.mkdir(dataDir, { recursive: true });

  const configFile = BYOK_CONFIG_FILE;

  // Read existing config
  let config: { provider: string; apiKey: string; seal?: string } | null = null;
  try {
    const raw = await fs.readFile(configFile, "utf8");
    config = JSON.parse(raw);
  } catch {
    // File doesn't exist yet — that's fine
  }

  // Reject if already set (prevent accidental overwrite)
  if (config?.provider) {
    return new Response(JSON.stringify({ error: "BYOK already configured" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Generate a seal key for integrity checks
  const sealKey = randomBytes(32).toString("hex");
  const sealedKey = createHmac("sha256", sealKey).update(apiKey).digest("hex");

  config = { provider, apiKey: sealedKey, seal: sealKey };

  // Write config
  await fs.writeFile(configFile, JSON.stringify(config, null, 2), "utf8");

  return new Response(JSON.stringify({ ok: true, provider, sealed: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET — returns whether BYOK is configured and which provider.
 * Never returns the actual key (sealed).
 */
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
export async function GET(req: NextRequest) {
  try {
    const dataDir = process.env.DATA_DIR ?? "./data";
    await fs.mkdir(dataDir, { recursive: true });

    const configFile = BYOK_CONFIG_FILE;
    let config: { provider: string | null; sealed: boolean } | null = null;

    try {
      const raw = await fs.readFile(configFile, "utf8");
      const parsed = JSON.parse(raw);
      config = { provider: parsed.provider || null, sealed: !!parsed.seal };
    } catch {}

    return new Response(JSON.stringify({ ok: true, ...config }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, provider: null, sealed: false }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * POST /api/byok/verify — server-side integrity verification.
 * Client sends the original apiKey and we verify it matches the sealed store.
 */
export async function verify(req: NextRequest) {
  const body = await req.json();
  const { apiKey } = body as { apiKey: string };

  if (!apiKey) {
    return new Response(JSON.stringify({ valid: false, error: "apiKey required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const dataDir = process.env.DATA_DIR ?? "./data";
    await fs.mkdir(dataDir, { recursive: true });

    const configFile = BYOK_CONFIG_FILE;
    let config: { provider: string; apiKey: string; seal: string } | null = null;

    try {
      const raw = await fs.readFile(configFile, "utf8");
      config = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ valid: false, error: "no config" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!config) return new Response(JSON.stringify({ valid: false, error: "no config" }), { status: 404 });

    // Re-seal and compare
    const hmac = createHmac("sha256", config.seal).update(apiKey).digest("hex");
    const valid = hmac === config.apiKey;

    return new Response(JSON.stringify({ valid }), {
      status: valid ? 200 : 403,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ valid: false, error: "server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}