/**
 * Jotril Service Worker — offline shell + stale-while-revalidate caching.
 *
 * Goals (in priority order):
 *   1. The app shell paints something even when the network is dead — a
 *      cached `offline.html` instead of the browser's "no internet" page.
 *   2. Repeat loads on a slow link are instant — _next/static immutable JS/CSS
 *      is cache-first.
 *   3. Per-user GETs that don't NEED to be fresh (quota, dashboard) come
 *      from cache immediately and refresh in the background.
 *   4. Never cache POSTs, never cache /api/auth/*, never cache the gradio
 *      proxy or the report renderer (those need real-time semantics).
 *
 * Version bump = forced refresh: change CACHE_VERSION when the SW logic
 * changes; old caches are deleted on activate.
 */

const CACHE_VERSION = "jotril-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const SHELL_ASSETS = ["/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Helpers -----------------------------------------------------------------

const SWR_PATHS = ["/api/quota", "/api/dashboard"];
const NEVER_CACHE_PATHS = ["/api/auth/", "/api/gradio-proxy", "/api/report", "/api/analyze", "/api/attribute"];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isStaticAsset(url) {
  // Next's hashed build output — safe to cache long-term because filenames
  // include a content hash.
  if (url.pathname.startsWith("/_next/static/")) return true;
  // SVGs / fonts / icons in /public.
  if (/\.(?:svg|ico|woff2?|ttf|png|jpe?g|webp|gif)$/i.test(url.pathname)) return true;
  return false;
}

function isStaleWhileRevalidate(url) {
  return SWR_PATHS.some((p) => url.pathname === p);
}

function isNeverCache(url) {
  return NEVER_CACHE_PATHS.some((p) => url.pathname.startsWith(p));
}

// Fetch handler -----------------------------------------------------------

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // POST/PUT/DELETE always passthrough

  const url = new URL(req.url);
  if (!isSameOrigin(url)) return; // CDN / third-party untouched

  if (isNeverCache(url)) return;

  // Navigation requests → network-first with offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(networkFirstWithOfflineShell(req));
    return;
  }

  // Hashed/static assets → cache-first.
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Whitelisted dashboard GETs → stale-while-revalidate.
  if (isStaleWhileRevalidate(url)) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }
});

async function networkFirstWithOfflineShell(req) {
  try {
    const res = await fetch(req);
    return res;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const offline = await cache.match("/offline.html");
    return (
      offline ||
      new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
    );
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    // Asset missing AND offline — pass the error up so the browser shows it.
    throw e;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  return cached || (await network) ||
    new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
}
