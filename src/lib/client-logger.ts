/**
 * Client-side error shipping.
 *
 * The global-error boundary and window error handlers both funnel here. The
 * payload is intentionally small — a message, a stack, a path — so a broken
 * page can still tell us what broke without sending us its DOM.
 */

export interface ClientError {
  message: string;
  stack?: string;
  componentStack?: string;
  path?: string;
  userAgent?: string;
  fingerprint?: string;
}

export async function captureError(error: ClientError) {
  const body = JSON.stringify({
    message: error.message,
    stack: error.stack,
    componentStack: error.componentStack,
    path: error.path,
    userAgent: error.userAgent ?? navigator.userAgent,
    fingerprint: error.fingerprint,
  });

  await fetch("/api/errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}