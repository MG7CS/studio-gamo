/*
 * Gamo Live door scanner service worker (scope /scan/). Same-origin only; no inline code.
 * - Scanner pages (GET navigations under /scan/ without a query string): network first, cached copy
 *   when offline, so the scanner opens with no signal.
 * - Hashed build assets (/_astro/…): cache first.
 * - API calls are never cached here (the manifest lives in IndexedDB; scans must reach the server).
 */
const SHELL = 'gamo-scanner-shell-v1';
const ASSETS = 'gamo-scanner-assets-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith('gamo-scanner-') && key !== SHELL && key !== ASSETS) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (
    request.mode === 'navigate' &&
    url.pathname.startsWith('/scan/') &&
    !url.search &&
    !url.pathname.endsWith('/unlock')
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        try {
          const response = await fetch(request);
          if (response.ok && response.type === 'basic') await cache.put(url.pathname, response.clone());
          return response;
        } catch {
          const cached = await cache.match(url.pathname);
          return (
            cached ??
            new Response(
              '<!doctype html><title>Offline</title><p>You are offline and this scanner page is not saved on this phone yet. Reconnect once, then it works offline.</p>',
              {
                status: 503,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
              },
            )
          );
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});
