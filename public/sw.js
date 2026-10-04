/* Minimal offline shell — never leave a navigation without a Response. */
const CACHE = "apuracao-shell-v4-admin-reports";
const ASSETS = ["/", "/fiscal", "/admin", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function offlinePage() {
  return new Response(
    "<!doctype html><html lang=pt-BR><meta charset=utf-8><title>Recarregue</title><body style=\"font-family:sans-serif;padding:2rem\"><h1>Não deu para abrir</h1><p><a href=\"/admin\">Voltar ao admin</a></p></body></html>",
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 200 }
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(request)) ||
            (await cache.match("/admin")) ||
            offlinePage()
          );
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || offlinePage());
      return cached || fetched;
    })
  );
});
