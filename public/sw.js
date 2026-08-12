// Service worker: cachea el cascarón; datos con network-first.
const CACHE = 'contador-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API: red primero, sin cachear (datos frescos). Si falla, error normal.
  if (url.pathname.startsWith('/api/')) return;
  // Cascarón: cache primero, luego red.
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
