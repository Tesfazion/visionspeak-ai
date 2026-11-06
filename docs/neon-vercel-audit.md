# Neon PostgreSQL and Vercel deployment audit

## Summary

The application uses `process.env.DATABASE_URL` as its sole PostgreSQL connection
source. PostgreSQL persistence covers accounts, action tokens, speaking sessions,
meetings and external AI keys. The `pg` pool uses verified TLS, is cached per warm
serverless instance, is bounded to five clients and allows idle instances to exit.
Next.js database routes use the default Node.js runtime; meeting signaling already
declares Node.js explicitly.

No live connection was attempted: this workspace does not contain a configured
Neon URL, and the production database must not be used by destructive integration
tests.

The Neon connection information supplied during the follow-up included a database
password in chat. That password should be rotated in Neon before deployment. It was
not copied into a file or sent to Vercel; add the replacement pooled URL directly
to Vercel Project Settings → Environment Variables as `DATABASE_URL`.

## Issues found and fixed

- Removed local PostgreSQL service/credentials from CI and removed the local URL
  placeholder from `.env.example`.
- Removed the previous ignored local `DATABASE_URL` entry; no credential value is
  stored or reproduced in this report.
- Changed CI database tests to use a separately configured `TEST_DATABASE_URL`
  secret. Database integration and smoke tests are skipped until a disposable
  test database is configured.
- Added PostgreSQL URL validation and TLS certificate verification, and bounded
  connection-pool settings for serverless deployments. Missing database hosts
  and loopback hosts are rejected instead of falling back to a local connection.
- Consolidated auth, sessions, meetings and AI-key persistence on PostgreSQL;
  removed MongoDB adapters/dependency and JSON persistence adapters/scripts.
- Updated the health endpoint to check PostgreSQL and return 503 when unavailable.
- Updated deployment, environment, architecture, privacy and testing guidance
  for Neon and Vercel.

## Surfaces audited

- **Authentication and accounts:** registration, login, signed-session lookups,
  profile updates, password changes, reset/verification tokens, revocation and
  account deletion.
- **CRUD and reports:** session save/list/read/update/delete, ownership checks,
  idempotency, report sharing and revocation.
- **Meetings:** meeting create/list/read/update/end records use PostgreSQL.
- **AI:** provider keys are persisted in PostgreSQL and queried by owner/hash.
- **Billing/admin:** billing webhook plan changes update the PostgreSQL user row.
  There is no separate admin console or payment ledger in this repository.
- **Uploads:** no file-upload API or database-linked upload record model was found;
  camera/audio analysis runs in the browser and only derived reports are stored.
- **Migrations/seeds:** tables and indexes are initialized idempotently at runtime;
  sample sessions seed on first read.

## Files changed for this migration

- **Database and persistence:** `src/lib/db/postgres.ts` (added),
  `src/lib/store.ts`, `src/lib/auth-core.ts`, `src/lib/auth.ts`,
  `src/lib/meeting/store.ts`, `src/lib/external-ai-keys/store.ts`.
- **API routes:** `src/app/api/health/route.ts`,
  `src/app/api/auth/me/delete/route.ts`,
  `src/app/api/meetings/route.ts`,
  `src/app/api/meetings/[id]/route.ts`,
  `src/app/api/meetings/signal/[id]/route.ts`,
  `src/app/api/report/[id]/email/route.ts`,
  `src/app/api/sessions/route.ts`,
  `src/app/api/sessions/[id]/route.ts`,
  `src/app/api/sessions/[id]/pdf/route.ts`,
  `src/app/api/sessions/[id]/share/route.ts`,
  `src/app/api/sessions/[id]/verify/route.ts`.
- **Pages and UI:** `src/app/dashboard/page.tsx`,
  `src/app/meeting/[id]/page.tsx`, `src/app/report/[id]/page.tsx`,
  `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`,
  `src/lib/external-ai-keys/types.ts`.
- **Removed Mongo/file-store paths:** `src/lib/db/mongo.ts`,
  `src/lib/db/schema.ts`, `src/lib/mongo-auth.ts`,
  `src/lib/mongo-store.ts`, `src/lib/data-dir.ts`,
  `tests/mongo-store.test.ts`, `tests/data-dir.test.ts`,
  `scripts/backup.mjs`, `scripts/restore.mjs`,
  `scripts/lib/data-dir.mjs`, `scripts/probes/reseed.cjs`.
- **Deployment, tooling and configuration:** `.env.example`,
  `.github/workflows/ci.yml`, `.gitignore`, `README.md`,
  `next.config.ts`, `package.json`, `package-lock.json`,
  `scripts/test.mjs`, `scripts/lib/ts-resolve.mjs`.
- **Tests and documentation:** `tests/auth.test.ts`, `tests/store.test.ts`,
  `tests/share.test.ts`, `tests/postgres-config.test.ts` (added),
  `docs/AUDIT.md`, `docs/README.md`, `docs/neon-vercel-audit.md` (added),
  `docs/wiki/architecture.md`, `docs/wiki/configuration.md`,
  `docs/wiki/deployment.md`, `docs/wiki/project-layout.md`,
  `docs/wiki/quick-start.md`, `docs/wiki/roadmap.md`,
  `docs/wiki/testing.md`.

## Remaining concerns before production traffic

1. Configure the Neon **pooled** `DATABASE_URL` in Vercel for all production
   environments and verify `/api/health` returns 200. This has not been tested
   against the live database from this workspace.
2. Set `AUTH_SECRET` in Vercel to a stable secret of at least 16 characters.
3. Configure `TEST_DATABASE_URL` as a disposable Neon database in GitHub Actions
   to enable destructive integration tests and the HTTP smoke workflow. Never
   point it at production.
4. Existing MongoDB/JSON records are not automatically imported into the new
   PostgreSQL database. Plan and verify a one-time migration separately if
   those accounts or records must be retained.
5. External AI provider keys are currently stored in the `external_ai_keys`
   JSONB records in plaintext. Restrict database access and assess application-
   level encryption before production if this credential exposure is not
   acceptable.
6. Meeting signaling/presence remains process-local in memory; it is not shared
   across independent Vercel function instances. Use a shared signaling service
   or persist/coordinate signaling state before relying on multi-instance rooms.
7. Runtime table creation requires the configured Neon role to have DDL
   permissions. If production credentials should be runtime-restricted, add a
   separate migration/deployment step and grant the app only required DML access.

## Validation

- TypeScript check passed.
- Production build passed after the Neon pool/TLS configuration was finalized.
- Unit tests passed; PostgreSQL integration tests were skipped because no
  disposable `TEST_DATABASE_URL` was configured.
- Pool configuration tests cover PostgreSQL URL validation, verified TLS and
  bounded serverless pooling.
- Remaining localhost/loopback literals are development website origins, CI's
  local HTTP app server, and the database URL guard/tests that reject loopback
  database hosts; none configure a PostgreSQL connection.
- Final validation: TypeScript and production build passed; unit suite passed
  (60 passed, 13 database-dependent cases skipped); lint reported no errors and
  six pre-existing unused-import warnings in auth routes.
