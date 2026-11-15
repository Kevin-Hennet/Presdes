// Replace the legacy cache-first worker. HTTP caching handles immutable build assets.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('labellens-shell-')).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
