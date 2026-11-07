# Deployment

## PostgreSQL

PostgreSQL is the only persistent store for accounts, sessions, meetings,
authentication tokens and external AI keys. Set `DATABASE_URL` wherever the
application runs; keep it private and URL-encode reserved characters in its
credentials. For Neon, use its pooled connection string. Connections require TLS
with certificate verification; the application creates its tables and indexes
on first use.

The database must be reachable from every application instance. Set
`DATABASE_URL` in the hosting environment. For tests that exercise database
behavior, set `TEST_DATABASE_URL` to a dedicated disposable Neon branch. Tests
remove only the records they create. GitHub Actions requires the same value as a
repository secret for integration and smoke tests; never use production data.

## Vercel

1. Import the repository at [vercel.com/new](https://vercel.com/new). The framework preset and
   build command are declared in `vercel.json`.
2. Add the Neon pooled `DATABASE_URL`, `AUTH_SECRET` and `NEXT_PUBLIC_SITE_URL` in Project →
   Settings → Environment Variables. Generate `AUTH_SECRET` using the command in
   [configuration](configuration.md), and keep it stable: BYOK provider keys are encrypted with
   a key derived from it. If you rotate `AUTH_SECRET`, users must reconnect their AI provider keys.
3. Deploy. `npm install` runs `scripts/setup-assets.mjs`, which installs the vision runtime assets.

`/api/health` reports PostgreSQL availability and returns HTTP 503 when it cannot connect.

## Self-hosting (Node)

```bash
npm ci
npm run build
npm start
```

Set `DATABASE_URL` and `AUTH_SECRET` in the process environment before starting the server. Put the
app behind a reverse proxy with TLS — `getUserMedia` requires a secure context.

## Docker

The app container does not include PostgreSQL; point it at a managed PostgreSQL instance or run a
separate database service. For a database container, keep its data volume separate from the
application image and configure `DATABASE_URL` through the deployment environment.

## Backups

Use PostgreSQL's native tools to back up and restore the configured database. Keep backup files
outside the repository and protect them like the database itself.

## Testing the studio from another device

`getUserMedia` is only available in a secure context, so a phone cannot open the studio over a
plain-HTTP LAN address. Use:

```bash
npm run dev:https
```
