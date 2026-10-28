/* VisionSpeak AI service worker.
 *
 * Deliberately conservative:
 *  - navigation requests are NETWORK-ONLY, with a static /offline fallback.
 *    Page HTML is never cached, so a signed-out browser can never be served a
 *    cached dashboard from a previous account.
 *  - static build assets (_next/static, icons, mediapipe) are cache-first,
 *    which is where the real repeat-visit win is.
 */
const VERSION = "v1";
const STATIC_CACHE = `vs-static-${VERSION}`;
const SHELL_CACHE = `vs-shell-${VERSION}`;

const SHELL = ["/offline", "/icons/icon-192.png", "/icons/mark.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const isStaticAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/icons/") ||
  url.pathname.startsWith("/mediapipe/") ||
  /\.(?:css|js|mjs|woff2|png|svg|ico|wasm|task)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match("/offline");
        return cached ?? new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }),
    );
    return;
  }

  if (!isStaticAsset(url)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
