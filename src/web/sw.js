// Service worker for the web version. Keeps the app shell available offline and lets the site be
// installed to a phone's home screen. Scores are never cached here: they always come from the network.
// Network first for the app's own files, so a reload always picks up a new build when online.
const CACHE = 'sportshub-%BUILD_ID%';
const SHELL = ['./', 'index.html', 'app.js?v=%BUILD_ID%', 'app.css?v=%BUILD_ID%', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sportshub-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // ESPN, Squiggle, logos: straight to the network
  const fromNetwork = () =>
    fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    });
  // app.js / app.css carry the build id (?v=…), so a cached copy is always the right one.
  if (url.searchParams.has('v')) {
    e.respondWith(caches.match(req).then((hit) => hit || fromNetwork()));
    return;
  }
  e.respondWith(
    fromNetwork().catch(() =>
      caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : fetch(req)))
    )
  );
});

// Tapping a score notification brings the app back to the front.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      return open ? open.focus() : self.clients.openWindow('./');
    })
  );
});
