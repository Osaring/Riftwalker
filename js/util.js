// Petits outils partagés par tout le jeu

// Générateur de hasard « à graine » : la même graine redonne toujours le même donjon
export function rng(seed) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  r.range = (a, b) => a + r() * (b - a);
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.weighted = (pairs) => { let s = 0; for (const [, w] of pairs) s += w; let x = r() * s; for (const [v, w] of pairs) { x -= w; if (x <= 0) return v; } return pairs[pairs.length - 1][0]; };
  return r;
}
export const R = rng((Date.now() ^ 0x9e3779b9) >>> 0); // hasard « libre » (combat, butin)

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const angWrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const angDiff = (a, b) => Math.abs(angWrap(a - b));
// approche douce indépendante du nombre d'images par seconde
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const $ = (id) => document.getElementById(id);

// bruit « lisse » 2D (pour les grottes, les murs irréguliers…)
function hash2(x, y, s) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function noise2(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, y, s = 0) => noise2(x, y, s) * 0.6 + noise2(x * 2.1, y * 2.1, s + 7) * 0.3 + noise2(x * 4.3, y * 4.3, s + 13) * 0.1;

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* rien */ } },
};
