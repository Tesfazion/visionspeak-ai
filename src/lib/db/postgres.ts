import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

type PostgresState = {
  pool: Pool | null;
  schema: Promise<void> | null;
};

const globalState = globalThis as typeof globalThis & { __visionSpeakPostgres?: PostgresState };

function state(): PostgresState {
  globalState.__visionSpeakPostgres ??= { pool: null, schema: null };
  return globalState.__visionSpeakPostgres;
}

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();

  const current = state();
  if (!current.pool) {
    current.pool = new Pool(createPoolConfig(connectionString));
    current.pool.on("error", (error) => {
      console.error("[postgres] idle client error", error.message);
    });
  }
  return current.pool;
}

export function createPoolConfig(connectionString: string | undefined = process.env.DATABASE_URL?.trim()) {
  if (!connectionString) throw new Error("DATABASE_URL must be set to connect to PostgreSQL.");
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol.");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  ) {
    throw new Error("DATABASE_URL must point to a remote PostgreSQL host.");
  }
  if (!url.pathname || url.pathname === "/") {
    throw new Error("DATABASE_URL must include a PostgreSQL database name.");
  }
  return {
    connectionString,
    ssl: { rejectUnauthorized: true },
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    application_name: "visionspeak-ai",
  } as const;
}

async function ensureSchema(): Promise<void> {
  const current = state();
  if (!current.schema) {
    current.schema = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id text PRIMARY KEY,
          email text NOT NULL UNIQUE,
          data jsonb NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          id text PRIMARY KEY,
          owner_id text,
          client_session_id text,
          created_at timestamptz NOT NULL,
          source text NOT NULL,
          share_token text,
          data jsonb NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS sessions_owner_client_id_unique
          ON sessions (owner_id, client_session_id)
          WHERE client_session_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS sessions_owner_created_at_idx
          ON sessions (owner_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS sessions_created_at_idx
          ON sessions (created_at DESC);
        CREATE INDEX IF NOT EXISTS sessions_share_token_idx
          ON sessions (share_token)
          WHERE share_token IS NOT NULL;
        CREATE TABLE IF NOT EXISTS auth_tokens (
          token_hash text PRIMARY KEY,
          user_id text NOT NULL,
          kind text NOT NULL CHECK (kind IN ('reset', 'verify')),
          created_at bigint NOT NULL,
          expires_at bigint NOT NULL,
          used_at bigint
        );
        CREATE INDEX IF NOT EXISTS auth_tokens_user_kind_idx
          ON auth_tokens (user_id, kind);
        CREATE TABLE IF NOT EXISTS meetings (
          id text PRIMARY KEY,
          host_id text NOT NULL,
          created_at timestamptz NOT NULL,
          status text NOT NULL,
          data jsonb NOT NULL
        );
        CREATE TABLE IF NOT EXISTS external_ai_keys (
          id text PRIMARY KEY,
          owner_id text NOT NULL,
          key_hash text NOT NULL,
          created_at timestamptz NOT NULL,
          data jsonb NOT NULL
        );
        CREATE INDEX IF NOT EXISTS external_ai_keys_owner_created_at_idx
          ON external_ai_keys (owner_id, created_at DESC);
      `);
    })().catch((error) => {
      current.schema = null;
      throw error;
    });
  }
  await current.schema;
}

export async function dbQuery<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<Row>> {
  await ensureSchema();
  return getPool().query<Row>(text, values);
}

export async function withDbTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase(): Promise<void> {
  await dbQuery("SELECT 1");
}
