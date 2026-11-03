# Configuration

All variables are optional for local development. Copy `.env.example` to `.env.local`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUTH_SECRET` | production | Signs session cookies. Without it a random secret is generated once into `data/auth-secret` — fine locally, but on a serverless host that means every cold start signs everyone out. |
| `NEXT_PUBLIC_SITE_URL` | production | Absolute origin for OpenGraph URLs, share links, `robots.txt` and `sitemap.xml`. |
| `VS_DATA_DIR` | optional | Where `sessions.json` / `users.json` are written. Defaults to `<repo>/data` locally and the OS temp dir on serverless. |
| `NEXT_PUBLIC_PRO_CHECKOUT_URL` | to sell | Checkout link for Pro. Unset ⇒ `/pricing` states that billing is not enabled. |
| `BILLING_WEBHOOK_SECRET` | to sell | Shared secret the provider sends as `x-billing-signature` to `POST /api/billing/webhook`. Unset ⇒ that route answers `410`. |
| `SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` · `SMTP_PASS` · `SMTP_FROM` | to email | Sends verification, reset and report emails. Port 587 upgrades with STARTTLS; port 465 (or `SMTP_SECURE=1`) uses implicit TLS. Without these nothing is sent and the UI says so. |
| `NEXT_PUBLIC_BRAND_NAME` · `NEXT_PUBLIC_BRAND_TAGLINE` | optional | White-label the product name and tagline. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | production | Contact address on `/privacy` and `/terms`, and for deletion requests. |
| `NEXT_PUBLIC_LEGAL_ENTITY` · `NEXT_PUBLIC_LEGAL_JURISDICTION` | production | Operator name and governing law shown on the legal pages. |

Generate a secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```
