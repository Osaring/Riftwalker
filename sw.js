// Service worker : garde une copie du jeu dans le téléphone pour jouer hors ligne.
// À chaque mise à jour, changer VERSION ici + APP_VERSION dans game.js + version.json.
const VERSION = 'riftwalker-1.3.0';
const FILES = [
  './', 'index.html', 'style.css', 'game.js', 'manifest.json',
  'assets/atlas.png', 'assets/atlas.json',
  'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png',
  'assets/fonts/pixelify-sans-latin-400-normal.woff2', 'assets/fonts/pixelify-sans-latin-700-normal.woff2',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' = on va chercher la version fraîche sur GitHub, pas une vieille copie
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // le fichier de version n'est jamais gardé en copie
  if (url.pathname.endsWith('version.json')) { e.respondWith(fetch(req.url, { cache: 'no-store' })); return; }
  // Réseau d'abord (toujours vérifié auprès de GitHub), copie locale si pas de connexion
  e.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
