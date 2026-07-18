const CACHE_NAME = 'scrn-shell-v2';
const SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API / function calls — those need to always be fresh.
  const isApi = url.hostname.includes('dexscreener.com')
    || url.hostname.includes('allorigins.win')
    || url.pathname.includes('/.netlify/functions/');

  if (isApi || event.request.method !== 'GET') {
    return; // let the browser handle it normally (network)
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

/* ---- Background push signals (works with the tab/app fully closed) ---- */
self.addEventListener('push', (event) => {
  let data = {};
  try{ data = event.data ? event.data.json() : {}; }catch(e){
    data = { title: 'SCRN', body: event.data ? event.data.text() : 'Ada sinyal token baru' };
  }
  const title = data.title || 'SCRN — sinyal token baru';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: './icon.svg',
      badge: './icon.svg',
      tag: data.tag || 'scrn-signal',
      data: { url: data.url || './' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
