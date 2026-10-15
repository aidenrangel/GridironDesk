/* Gridiron Desk service worker.
   App files: network-first (so uploads show up on the next load), cached copy only when offline.
   ESPN feeds: network-first, last copy kept for offline viewing. */
const VERSION = 'v7.8';
const SHELL = 'gd-shell-' + VERSION, DATA = 'gd-data-' + VERSION;
const FILES = ['./', './index.html', './styles.css', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, DATA].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  const netFirst = cacheName => fetch(e.request, { cache: 'no-store' }).then(r => { if (r.ok) { const copy = r.clone(); caches.open(cacheName).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request).then(r => r || new Response(cacheName === DATA ? '{}' : 'Offline', { status: 503, headers: { 'Content-Type': cacheName === DATA ? 'application/json' : 'text/plain' } })));
  if (/espn\.com$/.test(u.hostname)) { e.respondWith(netFirst(DATA)); return; }
  if (u.origin === location.origin) e.respondWith(netFirst(SHELL));
});
