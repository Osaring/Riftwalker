// Service worker : garde une copie du jeu dans le téléphone pour jouer hors ligne.
// À chaque mise à jour, changer VERSION ici + APP_VERSION dans game.js + version.json.
const VERSION = 'riftwalker-1.8.0';
const FILES = [
  './', 'index.html', 'style.css', 'game.js', 'manifest.json',
  'assets/atlas.png', 'assets/atlas.json',
  'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png',
  'assets/fonts/pixelify-sans-latin-400-normal.woff2', 'assets/fonts/pixelify-sans-latin-700-normal.woff2',
  'assets/atlas2x.png', 'assets/hd_chars.png', 'assets/hd_chars.json', 'assets/hd_env.png', 'assets/hd_env.json', 'assets/icons_hd.png', 'assets/icons_hd.json',
  'r3d.js', 'vendor/three.module.min.js', 'vendor/jsm/loaders/GLTFLoader.js', 'vendor/jsm/utils/BufferGeometryUtils.js', 'vendor/jsm/utils/SkeletonUtils.js',
  'assets/3d/knight.glb', 'assets/3d/mage.glb', 'assets/3d/skeleton.glb', 'assets/3d/dungeon.glb', 'assets/3d/hall.glb', 'assets/3d/props.glb',
  'assets/3d/anim_general.glb', 'assets/3d/anim_movementbasic.glb', 'assets/3d/anim_combatmelee.glb', 'assets/3d/anim_combatranged.glb', 'assets/3d/anim_special.glb',
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
