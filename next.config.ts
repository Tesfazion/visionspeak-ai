import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy.
 *
 * `'unsafe-inline'` is required for the style attributes this UI uses and for
 * Next's inlined bootstrap script; a nonce-based policy would need middleware
 * that rewrites every script tag. `wasm-unsafe-eval` is what makes MediaPipe's
 * WebAssembly run — without it the studio cannot start. External origins are
 * limited to the two CDNs the engine falls back to when local assets are
 * missing (see MODELS / CDN_WASM in src/lib/analysis/engine.ts).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ""}'wasm-unsafe-eval'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  // `ws:`/`wss:` are scheme-sources (valid); bare `ws://` is not a valid source
  // expression, so browsers ignore it *and* log an error on every page. The
  // meeting transport is HTTP long-poll, but Next's dev HMR still needs ws:.
  "connect-src 'self' blob: data: https://storage.googleapis.com https://cdn.jsdelivr.net ws: wss:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Camera and mic are the product; everything else is denied.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=()",
  },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

/**
 * Static generation forks one worker per CPU minus one (7 here), and every
 * worker loads the whole app. On a memory-constrained machine that exhausts RAM
 * and the native allocator aborts the build mid-way — `next build` exits with
 * "memory allocation of N bytes failed" and no useful stack. Lowering the worker
 * count makes the same build succeed; CI and developer machines leave this unset
 * and keep the default.
 */
const buildWorkers = Number(process.env.NEXT_BUILD_WORKERS);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // MediaPipe ships WASM assets that must not be bundled by webpack/turbopack.
  serverExternalPackages: [],
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
    ...(Number.isInteger(buildWorkers) && buildWorkers > 0 ? { cpus: buildWorkers } : {}),
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The service worker must never be cached by the browser, or a fix to it
      // can take days to roll out.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
