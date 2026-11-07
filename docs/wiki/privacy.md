# Privacy & security

- **Camera frames, audio and landmarks never leave the device.** There is no upload path in the
  code. Only the derived aggregate (numbers + transcript text) is sent when you press
  *End & analyse*.
- **Optional AI features** run only when requested from `/ai`. Chat messages are sent to the
  selected provider using the account owner's key. Session feedback sends report metrics and
  coaching insights, not the transcript. Provider keys are AES-256-GCM encrypted in PostgreSQL
  with a key derived from the stable `AUTH_SECRET`; replacing that secret requires reconnecting
  provider keys. Provider usage is billed by the provider.
- **Account export** is available from account settings as a JSON archive of the profile, saved
  sessions, attended meetings, and safe metadata for connected AI provider keys. Provider
  credentials and active share-link tokens are intentionally excluded.
- **Samples are read-only.** Seeded sample reports are shared reference material, cannot be
  deleted or edited by an account, and never appear in a user's own history or averages.
- **Share links are explicit and revocable** — an unguessable token plus the report id, expiring
  after 7 days (Free) or 30 days (Pro), revocable from the report page. Shared pages are
  `noindex`.
- **Passwords** are hashed with `scrypt` and a per-user salt; hashes are never returned by an API.
- **Sessions** are HMAC-SHA256 signed, expiring tokens in `httpOnly`, `SameSite=Lax` cookies —
  stateless, so there is no session table to leak. Each token carries its issue time, and
  *sign out everywhere* stores a per-account cut-off, so a copied cookie stops working instead of
  living out its 30 days. Logout revokes the token, not just the cookie.
- **Password change** re-hashes the stored password and verifies the current one; the old password
  never grants access after a change.
- **Report integrity** — the server stores a hash of the inputs a report was built from and
  re-computes it for the badge. It makes edited stored inputs visible; it cannot prove that
  browser-submitted measurements match the camera and microphone signals. Reports are not
  certified performance assessments.
- **Email** — SMTP is plain Node, and a server that offers neither implicit TLS nor STARTTLS
  never receives a password. Billing webhooks are compared in constant time, and `/api/errors`
  is rate-limited because it writes attacker-supplied text into the ops log.
- **Login throttling** — 8 attempts per 15 minutes per IP+email, `429` with `Retry-After`.
  Signup is limited per address (20/hour) and saves are limited per account (30/hour).
- **Payload limits** — a save body above 2 MB is refused with `413` before it is parsed, and the
  aggregate is bounds-checked (finite numbers, depth, array length, transcript length, plan
  duration) rather than cast from JSON.
- **No account enumeration** — unknown email and wrong password return the same `401`, and unknown
  emails still pay a dummy hash so response timing does not leak.
- **Route gating** happens in `src/proxy.ts` before rendering, so it is a real `307` rather than a
  client-side redirect; the page-level check is a second layer.
- **Headers** — CSP (with `wasm-unsafe-eval`, required for MediaPipe), HSTS in production,
  `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and a `Permissions-Policy` that allows
  only camera, microphone and display-capture, for same-origin only.
