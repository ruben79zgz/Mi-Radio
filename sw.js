const CACHE = 'mi-radio-shell-v12';
const SHELL = [
  './',
  './index.html',
  './styles.css?v=12',
  './app.js?v=12',
  './stations.js?v=12',
  './podcasts.js?v=12',
  './tv.js?v=12',
  './manifest.webmanifest?v=12',
  './icons/mi-radio.svg?v=12'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // stations.js y podcasts-data.json son datos vivos: red primero y caché solo como respaldo.
  if (url.pathname.endsWith('/stations.js') || url.pathname.endsWith('/podcasts-data.json') || url.pathname.endsWith('/podcasts.js')) {
    event.respondWith(
      fetch(new Request(event.request, { cache: 'no-store' }))
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
