import assert from "node:assert/strict";
import { test } from "node:test";
import { createPoolConfig } from "@/lib/db/postgres";

test("PostgreSQL pool requires a PostgreSQL DATABASE_URL", () => {
  assert.throws(() => createPoolConfig(""), /DATABASE_URL must be set/);
  assert.throws(() => createPoolConfig("https://db.example.test"), /must use the postgres/);
  assert.throws(() => createPoolConfig("postgresql:///app"), /remote PostgreSQL host/);
  assert.throws(() => createPoolConfig("postgresql://[::1]/app"), /remote PostgreSQL host/);
  assert.throws(() => createPoolConfig("postgresql://db.example.test"), /database name/);
});

test("PostgreSQL pool enables verified TLS and serverless-safe pooling", () => {
  const config = createPoolConfig(
    "postgresql://ep-example.neon.tech/app?channel_binding=require&sslmode=require",
  );
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.equal(config.max, 5);
  assert.equal(config.allowExitOnIdle, true);
  assert.match(config.connectionString, /channel_binding=require/);
  assert.match(config.connectionString, /sslmode=require/);
});
