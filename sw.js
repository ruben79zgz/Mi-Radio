const CACHE = 'mi-radio-shell-v14';
const SHELL = [
  './',
  './index.html',
  './styles.css?v=13',
  './app.js?v=13',
  './stations.js?v=13',
  './podcasts.js?v=13',
  './tv.js?v=13',
  './navigation.js?v=14',
  './manifest.webmanifest?v=13',
  './icons/mi-radio.svg?v=13'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function updateCache(request, response) {
  if (!response || !response.ok) return response;
  const copy = response.clone();
  caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
  return response;
}

function staleWhileRevalidate(request) {
  return caches.match(request).then(cached => {
    const network = fetch(request)
      .then(response => updateCache(request, response))
      .catch(() => null);
    return cached || network;
  });
}

function boundedNetworkFirst(request, timeoutMs) {
  return caches.match(request).then(cached => {
    let timer;
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve(cached || null), timeoutMs);
    });

    const network = fetch(new Request(request, { cache: 'no-store' }))
      .then(response => {
        clearTimeout(timer);
        return updateCache(request, response);
      })
      .catch(() => {
        clearTimeout(timer);
        return cached || null;
      });

    return Promise.race([network, timeout]).then(result => result || network);
  });
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // Datos que pueden cambiar: se intenta Internet, pero nunca bloqueamos la app
  // durante decenas de segundos si GitHub tarda en responder.
  if (
    path.endsWith('/stations.js') ||
    path.endsWith('/podcasts.js') ||
    path.endsWith('/tv.js') ||
    path.endsWith('/podcasts-data.json')
  ) {
    event.respondWith(boundedNetworkFirst(event.request, 1800));
    return;
  }

  // HTML, JS, CSS, iconos y resto del shell: abrir inmediatamente desde caché
  // y refrescar silenciosamente en segundo plano.
  event.respondWith(staleWhileRevalidate(event.request));
});
