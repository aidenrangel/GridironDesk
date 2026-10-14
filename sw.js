/* Gridiron Desk service worker: app shell cached, ESPN feeds network-first with the last copy kept for offline. */
const SHELL = 'gd-shell-v1', DATA = 'gd-data-v1';
const FILES = ['./', './index.html', './styles.css', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, DATA].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (/espn\.com$/.test(u.hostname)) {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(DATA).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } }))));
    return;
  }
  if (u.origin === location.origin) e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const copy = res.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); return res; })));
});
