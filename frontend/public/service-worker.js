const CLEANUP_CACHE_VERSION = 'shield-cache-cleanup-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: CLEANUP_CACHE_VERSION });
        });
      }),
  );
});

self.addEventListener('fetch', () => {
  // Intentionally do not intercept requests; IIS and the browser should load the latest deployed assets.
});
