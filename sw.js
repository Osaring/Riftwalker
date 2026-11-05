// Service worker : garde une copie du jeu dans le téléphone pour jouer hors ligne.
// Change VERSION à chaque mise à jour pour que les téléphones récupèrent la nouvelle version.
const VERSION = 'riftwalker-v1.0.0';
const FILES = [
  './', 'index.html', 'style.css', 'game.js', 'manifest.json',
  'assets/atlas.png', 'assets/atlas.json',
  'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png',
  'assets/fonts/pixelify-sans-latin-400-normal.woff2', 'assets/fonts/pixelify-sans-latin-700-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord (pour recevoir les mises à jour), copie locale si pas de connexion.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
