import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

/**
 * `data-dir` resolves its path at module load, so each case needs a fresh
 * module instance. The query string on the specifier gives Node a distinct
 * module identity without spawning a process.
 */
let counter = 0;
async function load(env: Record<string, string | undefined>) {
  const saved = {
    VS_DATA_DIR: process.env.VS_DATA_DIR,
    VERCEL: process.env.VERCEL,
    NETLIFY: process.env.NETLIFY,
    AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
  };

  for (const key of Object.keys(saved) as (keyof typeof saved)[]) delete process.env[key];
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }

  try {
    return await import(`@/lib/data-dir.ts?case=${counter++}`);
  } finally {
    for (const key of Object.keys(saved) as (keyof typeof saved)[]) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("local development writes into the repo's data directory", async () => {
  const mod = await load({});
  assert.equal(mod.DATA_DIR, path.join(process.cwd(), "data"));
  assert.equal(mod.STORAGE_IS_EPHEMERAL, false);
  assert.equal(mod.STORAGE_KIND, "local");
  assert.equal(mod.dataFile("sessions.json"), path.join(process.cwd(), "data", "sessions.json"));
});

test("Vercel falls back to the OS temp dir (the bundle is read-only)", async () => {
  const mod = await load({ VERCEL: "1" });
  // This is the whole point: writing to process.cwd() on Vercel throws EROFS.
  assert.equal(mod.DATA_DIR, path.join(os.tmpdir(), "visionspeak-data"));
  assert.notEqual(mod.DATA_DIR, path.join(process.cwd(), "data"));
  assert.equal(mod.STORAGE_IS_EPHEMERAL, true);
  assert.equal(mod.STORAGE_KIND, "ephemeral");
});

test("AWS Lambda and Netlify are treated the same as Vercel", async () => {
  for (const env of [{ AWS_LAMBDA_FUNCTION_NAME: "fn" }, { NETLIFY: "true" }]) {
    const mod = await load(env);
    assert.equal(mod.DATA_DIR, path.join(os.tmpdir(), "visionspeak-data"), JSON.stringify(env));
    assert.equal(mod.STORAGE_IS_EPHEMERAL, true);
  }
});

test("an explicit VS_DATA_DIR always wins and is marked durable", async () => {
  const configured = path.join(os.tmpdir(), "visionpeak-configured");
  const local = await load({ VS_DATA_DIR: configured });
  assert.equal(local.DATA_DIR, configured);
  assert.equal(local.STORAGE_KIND, "configured");
  assert.equal(local.STORAGE_IS_EPHEMERAL, false);

  // Even on serverless, an operator pointing at a mounted volume gets durable
  // storage rather than the temp fallback.
  const serverless = await load({ VS_DATA_DIR: configured, VERCEL: "1" });
  assert.equal(serverless.DATA_DIR, configured);
  assert.equal(serverless.STORAGE_IS_EPHEMERAL, false);
});

test("a relative VS_DATA_DIR is resolved against the working directory", async () => {
  const mod = await load({ VS_DATA_DIR: "./custom-data" });
  assert.equal(mod.DATA_DIR, path.resolve("./custom-data"));
  assert.ok(path.isAbsolute(mod.DATA_DIR));
});

test("dataFile joins onto the resolved directory", async () => {
  const mod = await load({ VERCEL: "1" });
  assert.equal(mod.dataFile("users.json"), path.join(os.tmpdir(), "visionspeak-data", "users.json"));
});
