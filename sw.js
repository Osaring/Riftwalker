// Service worker : garde une copie du jeu dans le téléphone pour jouer hors ligne.
// À chaque mise à jour, changer VERSION ici + APP_VERSION dans js/main.js + version.json.
const VERSION = 'riftwalker-3.2.0';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.json',
  'js/main.js', 'js/assets.js', 'js/character.js', 'js/level.js', 'js/world.js', 'js/items.js', 'js/audio.js', 'js/input.js', 'js/ui.js', 'js/util.js', 'js/style.js',
  'vendor/three.module.min.js', 'vendor/jsm/loaders/GLTFLoader.js', 'vendor/jsm/utils/BufferGeometryUtils.js', 'vendor/jsm/utils/SkeletonUtils.js',
  'assets/3d/gear.glb', 'assets/3d/anim.glb', 'assets/3d/hall.glb', 'assets/3d/nature.glb', 'assets/3d/props.glb',
  'assets/tex/T_Knight_2_BaseColor.jpg', 'assets/tex/T_Knight_3_BaseColor.jpg', 'assets/tex/T_Noble_2_BaseColor.jpg', 'assets/tex/T_Noble_3_BaseColor.jpg', 'assets/tex/T_Wizard_2_BaseColor.jpg', 'assets/tex/T_Wizard_3_BaseColor.jpg',
  'assets/icons_hd.png', 'assets/icons_hd.json', 'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png',
  'assets/fonts/nunito-latin-700-normal.woff2', 'assets/fonts/nunito-latin-900-normal.woff2',
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
