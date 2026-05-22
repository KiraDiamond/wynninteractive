const CACHE_NAME = "wynnteractive-runtime-v6";

function isCacheable(request) {
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return false;
  }

  if (request.mode === "navigate") {
    return false;
  }

  return (
    /\.(?:js|css|avif|png|jpe?g|webp|svg|woff2?)$/i.test(url.pathname) ||
    url.pathname.includes("/data/")
  );
}

function isCodeOrDataRequest(request) {
  const url = new URL(request.url);
  return /\.(?:js|css)$/i.test(url.pathname) || url.pathname.includes("/data/");
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith("wynnteractive-runtime-") && key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (!isCacheable(event.request)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => cached);

      if (isCodeOrDataRequest(event.request)) {
        return networkFetch;
      }

      return cached || networkFetch;
    })
  );
});
