# Deployment

## Vercel — one click after import

1. Import the repository at [vercel.com/new](https://vercel.com/new). The framework preset and
   build command are already declared in `vercel.json`.
2. Add environment variables (Project → Settings → Environment Variables):
   - `AUTH_SECRET` — a 64-character hex secret (see [configuration](configuration.md)). **Without
     this, sign-ins break on every cold start.**
   - `NEXT_PUBLIC_SITE_URL` — `https://<your-domain>`.
3. Deploy. `npm install` runs `scripts/setup-assets.mjs`, which copies the WASM runtime and
   bundles the three model files into the deployment.

Verify a deployment in one request:

```bash
curl -s https://<your-domain>/api/health
# {"ok":true,"service":"visionspeak-ai","storage":"ephemeral","durable":false,...}
```

> ### ⚠️ Serverless storage is ephemeral
>
> A deployment bundle is **read-only**, so the JSON store falls back to the OS temp directory. That
> keeps the app fully functional — signup, sessions and reports all work — but the data lives only
> as long as the instance stays warm. A cold start resets it.
>
> `/api/health` reports `"durable": false` and the dashboard shows a **temporary storage** badge in
> this state, so it is never a silent surprise.
>
> For data that must survive, pick one:
>
> - **Set `VS_DATA_DIR`** to a mounted persistent volume (Fly.io, Railway, Render, a VM).
> - **Back the store with a database.** `src/lib/store.ts` is ~130 lines behind five functions
>   (`listSessions`, `getSession`, `saveSession`, `deleteSession`, `updateSession`) — swapping in
>   Postgres or SQLite is a contained change, and `src/lib/auth-core.ts` is the same for users.

## Self-hosting (Node)

```bash
npm ci
npm run build
AUTH_SECRET=$(openssl rand -hex 32) npm start   # http://localhost:3000
```

`data/` is writable here, so sessions and accounts persist across restarts. Put the app behind a
reverse proxy with TLS — `getUserMedia` requires a secure context.

## Docker

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
```

Mount a volume at `/app/data` (or set `VS_DATA_DIR`) to keep the JSON store durable.

## Testing the studio from another device

`getUserMedia` is only available in a secure context, so a phone cannot open the studio over a
plain-HTTP LAN address. Use:

```bash
npm run dev:https     # self-signed HTTPS origin your browser will accept for local dev
```
