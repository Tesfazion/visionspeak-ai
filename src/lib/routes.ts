/**
 * Where a visitor lands once they are authenticated.
 *
 * Deliberately framework-free (no `next/headers`, no `node:fs`) so the auth
 * form — a client component — can import it too. The login page, the signup
 * page and the form's cross-link all read the default from here so they cannot
 * drift apart.
 */
export const POST_AUTH_PATH = "/dashboard";
