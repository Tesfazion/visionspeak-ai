# Changelog

## Unreleased

- Require a dedicated Neon test database for CI integration and smoke tests.
- Remove loopback PostgreSQL test support and protect unrelated database rows by
  giving tests unique IDs and limiting cleanup to their own records.
- Seed sample reports even when the sessions table already contains user data.
- Persist the project's development, security, accessibility, and delivery rules
  in `AGENTS.md`.
