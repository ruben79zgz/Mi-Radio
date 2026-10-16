const CACHE = "mi-resultados-v1.0.1";
const SHELL = [
  "./",
  "index.html?v=1.0.1",
  "styles.css?v=1.0.1",
  "app.js?v=1.0.1",
  "manifest.webmanifest?v=1.0.1",
  "icon.svg?v=1.0.1"
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
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/data/scores.json")) {
    event.respondWith(
      fetch(new Request(event.request,{cache:"no-store"}))
        .then(response => {
          if (response.ok) {
            const copy=response.clone();
            caches.open(CACHE).then(cache => cache.put(event.request,copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(response => {
        if (response.ok) {
          const copy=response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request,copy));
        }
        return response;
      }).catch(() => null);
      return cached || network;
    })
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