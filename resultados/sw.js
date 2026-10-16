const CACHE = "mi-resultados-v1.3.1";
const SHELL = [
  "./",
  "index.html?v=1.3.1",
  "styles.css?v=1.3.1",
  "leagues.js?v=1.3.1",
  "app.js?v=1.3.1",
  "manifest.webmanifest?v=1.3.1",
  "icon.svg?v=1.3.1"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("mi-resultados-") && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(new Request(request,{cache:"no-store"}));
    if (response && response.ok) {
      const copy=response.clone();
      caches.open(CACHE).then(cache => cache.put(request,copy));
    }
    return response;
  } catch {
    return (await caches.match(request)) || Response.error();
  }
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const dynamic =
    event.request.mode === "navigate" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/styles.css") ||
    url.pathname.endsWith("/leagues.js") ||
    url.pathname.endsWith("/data/scores.json") ||
    url.pathname.endsWith("/data/catalog.json") ||
    url.pathname.endsWith("/data/engine.json");

  if (dynamic) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || networkFirst(event.request))
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({type:"window",includeUncontrolled:true}).then(list => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("./");
    })
  );
});