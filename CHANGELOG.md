# Changelog

## Unreleased

- Add coach-oriented practice guidance, explicit audio-only capture and voice-only reports, and
  keep dashboard score comparisons within the same practice and capture mode.
- Add private aggregate activation/return metrics and Lemon Squeezy recurring checkout with
  signed, deduplicated subscription updates; live billing remains gated on merchant configuration
  and provider test-mode verification.
- Clarify that scoring tests are not empirical validation and document metric definitions,
  privacy boundaries, and billing setup.
- Require a dedicated Neon test database for CI integration and smoke tests.
- Remove loopback PostgreSQL test support and protect unrelated database rows by
  giving tests unique IDs and limiting cleanup to their own records.
- Seed sample reports even when the sessions table already contains user data.
- Persist the project's development, security, accessibility, and delivery rules
  in `AGENTS.md`.
- Add an authenticated AI workspace for provider-key management, AI chat and saved-session
  feedback; encrypt BYOK credentials at rest and verify session ownership before analysis.
