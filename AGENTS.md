<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project development rules

Follow these project rules for all code, design, and implementation decisions. If a
rule conflicts with the user's explicit request, explain the conflict and follow
the user's request. If requirements are unclear, ask before building.

### Core principles

- Apply YAGNI and KISS: build only what is required and choose the simplest complete solution.
- Keep each function, class, component, and file focused on one responsibility.
- Keep logic, rules, and values in one reusable place; use meaningful names and named constants.
- Comments explain why, not obvious mechanics. Keep business rules separate from UI and infrastructure.
- Refactor small related problems as you touch them; do not introduce shortcuts or speculative abstractions.
- Make code, names, docs, and structure predictable for maintainers and automation.
- Optimize for clear onboarding, independent modules, small reviews, and low technical debt.

### Code quality

- Separate presentation, styles, data, and business logic. Fail fast with clear errors and early returns.
- Prefer short functions (ideally under 30 lines), few parameters, composition, pure functions, and readable code.
- Avoid deep nesting, global mutable state, dead/commented-out code, and production debug logging.
- Handle errors explicitly: give users useful messages and log technical details without sensitive data.
- Reuse existing helpers and well-maintained dependencies; do not add dependencies for trivial tasks.
- Use strict types, consistent repository formatting, and the existing linter and test tools.
- Use camelCase for variables/functions, PascalCase for components/classes, kebab-case for files/CSS,
  UPPER_SNAKE_CASE for constants, question-form boolean names, and action-form function names.
- Keep files organized and focused; continuously reduce related technical debt without unrelated rewrites.

### Design and user experience

- Design mobile-first and responsively; use consistent design tokens, spacing, typography, and colors.
- Keep a clear visual hierarchy, readable contrast and body text (at least 16px), whitespace, and
  touch targets of at least 44px.
- Keep navigation within three clicks and use action-specific button labels.
- Provide loading, success, empty, and helpful error states. Keep forms short, validated inline, and
  preserve user input on errors.
- Do not add dark/light mode unless requested. Support the local context, including language,
  date/number formatting, and Ethiopic font rendering where relevant.

### Performance

- Compress images, prefer modern formats, lazy-load heavy/non-critical content, and avoid blocking scripts.
- Minimize requests and bundle size; use code splitting, caching/CDNs, and image dimensions to prevent shift.
- Optimize for slow networks, Core Web Vitals, and system or subset fonts with limited weights.
- Keep production JavaScript and CSS minified.

### Security and privacy

- Treat all input as untrusted; validate it on the server and use parameterized database queries.
- Use HTTPS, secure HTTP-only cookies, appropriately short-lived tokens, narrow CORS, and security headers.
- Hash passwords with bcrypt or Argon2; never store plaintext passwords.
- Keep secrets in environment variables, never in source control; apply least privilege and rate limits.
- Restrict uploads by type and size; never execute uploaded files.
- Do not expose stack traces or internal details. Log security events without passwords, tokens, or
  unnecessary personal data; collect only data the product needs.
- Keep dependencies maintained and remove unused packages.

### Accessibility and SEO

- Use semantic HTML, keyboard support, visible focus, meaningful image alt text, and labeled fields.
- Use correct page language, one clear H1 and a logical heading order; do not communicate by color alone.
- Maintain titles, descriptions, Open Graph metadata, sitemap, robots.txt, and readable URLs.

### Database and API

- Design schemas with appropriate keys, relationships, and indexes; use migrations for schema changes.
- Keep development, test, staging, and production environments separate.
- Never edit production data/schema by hand or run destructive data changes without explicit approval.
- Back up databases regularly and verify restoration procedures.
- Version APIs where needed for compatibility; document endpoints, input/output shapes, and errors.
- Validate requests/responses, use consistent response formats and correct status codes, and paginate lists.
- Handle external service failures with clear user feedback and appropriate retries.
- For this project, use Neon PostgreSQL: `DATABASE_URL` is the application connection and
  `TEST_DATABASE_URL` must be a dedicated disposable Neon database/branch. Never configure a local
  PostgreSQL fallback or point tests at production. Tests may clean up only uniquely identified
  records created by their own run; never truncate or wipe shared tables.

### Testing and workflow

- Add unit tests for new logic and integration tests for critical flows and edge cases.
- Run the smallest relevant test, then lint/typecheck/build as needed; do not deliver failing checks.
- Test target browsers/devices when feasible and clearly state what could not be exercised.
- Use Git and small, focused, clearly described changes; review for bugs, security, and rule compliance.
- Keep README setup, environment, test, and deployment guidance current, plus a changelog for notable
  changes. Keep `.env.example` complete and free of real credentials.
- Include automated tests, lint, and build checks in CI. Ensure missing required test services fail
  clearly instead of silently reducing coverage.
- Before coding, state a concise 2–5-line plan. Afterward summarize changes/files, tests, assumptions,
  risks, and conflicts. Provide complete working changes, explain how to run/test them, and do not
  invent APIs or leave placeholders.
- Suggest out-of-scope improvements without applying them. Ask one clear question at a time when
  information is missing; confirm before large or risky changes.
- Keep client data and credentials private and separate. Respect copyright; use only appropriately
  licensed assets and code. Include practical handover and maintenance guidance for client work.

### Delivery checklist

- Does it work on mobile?
- Is it secure, with validated input and no committed secrets?
- Is the solution simple and consistently named?
- Are tests present, lint clean, and docs current?
- Does it stay within the agreed scope?
