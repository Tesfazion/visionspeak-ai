# Configuration

Use `.env.example` as a variable checklist. Configure production values in Vercel's Environment
Variables; never commit secrets. PostgreSQL and an auth secret are required.

| Variable                                                            | Required   | Purpose                                                                                                                                                                              |
| ------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                                      | required   | Neon PostgreSQL connection string used by all platform persistence. Use Neon’s pooled URL (`-pooler` host) with `sslmode=require`; TLS certificate verification is enabled. URL-encode reserved characters. |
| `AUTH_SECRET`                                                       | production | Signs session cookies. Set a stable secret of at least 16 characters; generate one with the command below.                                                                       |
| `NEXT_PUBLIC_SITE_URL`                                              | production | Absolute origin for OpenGraph URLs, share links, `robots.txt` and `sitemap.xml`.                                                                                                     |
| `LEMON_SQUEEZY_API_KEY`                                             | to sell    | Server-only API key used to create user-bound recurring checkout sessions.                                                                                                           |
| `LEMON_SQUEEZY_STORE_ID`                                            | to sell    | Lemon Squeezy store ID.                                                                                                                                            |
| `LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_ID`                              | to sell    | Pro monthly recurring variant ID.                                                                                                                                |
| `LEMON_SQUEEZY_PRO_YEARLY_VARIANT_ID`                               | to sell    | Pro yearly recurring variant ID.                                                                                                                                 |
| `LEMON_SQUEEZY_WEBHOOK_SECRET`                                      | to sell    | Signing secret configured for `/api/billing/webhook`; requests are checked with the `X-Signature` HMAC header.                                                     |
| `ANALYTICS_ADMIN_EMAIL`                                             | optional   | Account allowed to view aggregate, privacy-preserving product metrics at `/admin/metrics`.                                                                         |
| `SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` · `SMTP_PASS` · `SMTP_FROM` | to email   | Sends verification, reset and report emails. Port 587 upgrades with STARTTLS; port 465 (or `SMTP_SECURE=1`) uses implicit TLS. Without these nothing is sent and the UI says so.     |
| `NEXT_PUBLIC_BRAND_NAME` · `NEXT_PUBLIC_BRAND_TAGLINE`              | optional   | White-label the product name and tagline.                                                                                                                                            |
| `NEXT_PUBLIC_SUPPORT_EMAIL`                                         | production | Contact address on `/privacy` and `/terms`, and for deletion requests.                                                                                                               |
| `NEXT_PUBLIC_LEGAL_ENTITY` · `NEXT_PUBLIC_LEGAL_JURISDICTION`       | production | Operator name and governing law shown on the legal pages.                                                                                                                            |

`TEST_DATABASE_URL` is used only by tests. Set it locally to a dedicated disposable Neon database
branch and add the same value as the GitHub Actions `TEST_DATABASE_URL` secret. CI fails early if
the secret is missing. Tests use verified TLS and clean up only rows they created; never point this
variable at production.

To enable paid plans, create recurring monthly and yearly variants in Lemon Squeezy, configure a
webhook for subscription lifecycle events at `/api/billing/webhook`, and set the API key, store ID,
variant IDs, and webhook signing secret above. Test user attribution, checkout completion, renewal,
cancellation, and expiration against the provider's test mode first. Do not enable live billing
until those real provider events have been verified.

On Vercel, set only `DATABASE_URL` for the application; the app does not read the individual
`PG*`, `POSTGRES_*`, unpooled, or Prisma-specific variables. Never paste database credentials into
source files or commit them.

Generate a secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```
