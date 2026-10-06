const CACHE_SCHEMA = "v8-official-brand";
const RELEASE_VERSION = new URL(self.location.href).searchParams.get("v") || "unknown";
const BUILD_VERSION = `${CACHE_SCHEMA}-${RELEASE_VERSION}`;
const SHELL_CACHE = `cutinapp-shell-${BUILD_VERSION}`;
const RUNTIME_CACHE = `cutinapp-runtime-${BUILD_VERSION}`;
const APP_SHELL = ["/", "/manifest.json", "/images/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("cutinapp-") && ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

const networkFirst = async (request, cacheName = SHELL_CACHE) => {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (_) {
    return (await caches.match(request)) || (request.mode === "navigate" ? await caches.match("/") : null) || Response.error();
  }
};

const validatedAsset = async (request) => {
  try {
    // JS/CSS bundles are release-critical. Revalidate instead of serving an
    // old service-worker copy first, then keep the current response for offline fallback.
    const response = await fetch(request, { cache: "no-cache" });
    if (response.ok && response.type !== "opaque") {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (_) {
    return (await caches.match(request)) || Response.error();
  }
};

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request).then((response) => {
    if (response.ok && response.type !== "opaque") cache.put(request, response.clone()).catch(() => {});
    return response;
  }).catch(() => null);
  return cached || (await refresh) || Response.error();
};

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (/\.(?:js|css)$/i.test(url.pathname)) {
    event.respondWith(validatedAsset(request));
    return;
  }

  if (/\.(?:png|jpe?g|gif|ico|svg|webp|avif|woff2?|ttf)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
