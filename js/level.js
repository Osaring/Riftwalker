// =====================================================================
// GÉNÉRATION DES NIVEAUX
// Le donjon est découpé en cases de 1 m. Chaque salle a une vraie forme (nef à piliers,
// rotonde, octogone, croix, grotte irrégulière…), une hauteur au sol et une hauteur de plafond.
// Les couloirs serpentent entre les salles et montent/descendent en pente douce.
// Ce fichier ne crée que des données ; world.js les transforme en décor 3D.
// =====================================================================
import { rng, fbm, noise2, clamp } from './util.js';

export const THEMES = ['crypt', 'cave', 'ruins'];
// le biome change tous les 2 étages ; « start » = biome tiré au hasard au début de l'aventure
export const themeOf = (floor, start = 0) => THEMES[(start + Math.floor((floor - 1) / 2)) % THEMES.length];

export function generateLevel(floor, seed, themeStart = 0) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const L = tryGenerate(floor, (seed + attempt * 7919) >>> 0, themeStart);
    if (L) return L;
  }
  throw new Error('génération impossible');
}

function tryGenerate(floor, seed, themeStart) {
  const r = rng(seed);
  const theme = themeOf(floor, themeStart);
  const W = 120, H = 120;
  const N = W * H;
  const grid = new Uint8Array(N);       // 1 = sol praticable
  const solid = new Uint8Array(N);      // 1 = obstacle (pilier, gros rocher…) sur une case de sol
  const height = new Float32Array(N);   // hauteur du sol
  const ceil = new Float32Array(N);     // hauteur du plafond (absolue)
  const region = new Int16Array(N).fill(-1);
  const idx = (x, z) => z * W + x;
  const inside = (x, z) => x >= 2 && z >= 2 && x < W - 2 && z < H - 2;

  // ---------- 1) placement des salles en arbre ----------
  const nRooms = clamp(7 + Math.floor(floor / 2) + r.int(0, 2), 7, 12);
  const rooms = [];
  const shapesFor = {
    crypt: [['nef', 3], ['octo', 2], ['round', 2], ['cross', 2], ['hall', 2], ['L', 1]],
    cave: [['cave', 6], ['round', 1]],
    ruins: [['hall', 2], ['octo', 2], ['round', 1], ['cross', 1], ['cave', 2], ['nef', 1]],
  }[theme];
  const mkRoom = (shape, cx, cz) => {
    const R0 = { shape, cx, cz, rot: r.int(0, 1) };
    if (shape === 'nef') { R0.a = r.int(5, 6); R0.b = r.int(10, 13); }
    else if (shape === 'octo' || shape === 'round') R0.a = r.int(7, 10);
    else if (shape === 'cross') { R0.a = r.int(8, 11); R0.b = r.int(3, 4); }
    else if (shape === 'hall') { R0.a = r.int(6, 8); R0.b = r.int(6, 9); }
    else if (shape === 'L') { R0.a = r.int(8, 10); R0.b = r.int(4, 5); R0.rot = r.int(0, 3); }
    else if (shape === 'cave') { R0.a = r.int(8, 12); R0.seed = r.int(0, 9999); }
    R0.rad = Math.max(R0.a, R0.b || 0) + 1;
    return R0;
  };
  // salle de départ
  rooms.push(mkRoom(theme === 'cave' ? 'cave' : 'octo', 22, H / 2));
  rooms[0].a = Math.min(rooms[0].a, 8); rooms[0].rad = rooms[0].a + 1;
  let guard = 0;
  while (rooms.length < nRooms && guard++ < 400) {
    // on part plutôt des dernières salles pour obtenir un donjon qui s'étire
    const parent = rooms[Math.max(0, rooms.length - 1 - r.int(0, Math.min(3, rooms.length - 1)))];
    const shape = r.weighted(shapesFor);
    const R0 = mkRoom(shape, 0, 0);
    const ang = r.range(-1.3, 1.3) + (r.chance(0.3) ? Math.PI * r.pick([-0.5, 0.5]) : 0);
    const d = parent.rad + R0.rad + r.int(7, 13);
    R0.cx = Math.round(parent.cx + Math.cos(ang) * d); R0.cz = Math.round(parent.cz + Math.sin(ang) * d);
    if (R0.cx - R0.rad < 4 || R0.cz - R0.rad < 4 || R0.cx + R0.rad > W - 4 || R0.cz + R0.rad > H - 4) continue;
    if (rooms.some((o) => Math.hypot(o.cx - R0.cx, o.cz - R0.cz) < o.rad + R0.rad + 5)) continue;
    R0.parent = rooms.indexOf(parent);
    rooms.push(R0);
  }
  if (rooms.length < nRooms) return null;

  // ---------- 2) formes ----------
  const inShape = (R0, x, z) => {
    let dx = x + 0.5 - R0.cx, dz = z + 0.5 - R0.cz;
    if (R0.rot % 2 === 1 && R0.shape !== 'L') [dx, dz] = [dz, dx];
    const a = R0.a, b = R0.b;
    switch (R0.shape) {
      case 'nef': return Math.abs(dx) <= a && Math.abs(dz) <= b;
      case 'round': return dx * dx + dz * dz <= a * a;
      case 'octo': return Math.abs(dx) <= a && Math.abs(dz) <= a && Math.abs(dx) + Math.abs(dz) <= a * 1.42;
      case 'cross': return (Math.abs(dx) <= a && Math.abs(dz) <= b) || (Math.abs(dz) <= a && Math.abs(dx) <= b) || (dx * dx + dz * dz <= (b + 2.5) ** 2);
      case 'hall': return Math.abs(dx) <= a && Math.abs(dz) <= b && !(Math.abs(dx) > a - 2 && Math.abs(dz) > b - 2);
      case 'L': {
        const q = [[1, 1], [-1, 1], [-1, -1], [1, -1]][R0.rot];
        const ux = dx * q[0], uz = dz * q[1];
        return (ux >= -b && ux <= a && uz >= -b && uz <= b) || (uz >= -b && uz <= a && ux >= -b && ux <= b);
      }
      case 'cave': {
        const ang = Math.atan2(dz, dx), d = Math.hypot(dx, dz);
        const rr = a * (0.72 + 0.5 * fbm(Math.cos(ang) * 1.3 + R0.seed, Math.sin(ang) * 1.3, R0.seed));
        return d <= rr;
      }
    }
    return false;
  };
  const baseH = [0];
  rooms.forEach((R0, i) => {
    R0.id = i;
    // hauteur du sol : chaque salle peut être plus haute ou plus basse que sa voisine
    if (i > 0) baseH[i] = clamp(baseH[R0.parent] + r.pick([-1.5, -1, 0, 0, 1, 1.5]), -3, 3);
    R0.h = baseH[i];
    R0.ch = theme === 'cave' ? r.range(7, 10) : R0.shape === 'nef' ? r.range(8, 10) : r.range(6.5, 8.5); // hauteur sous plafond
    R0.cells = [];
    for (let z = R0.cz - R0.rad - 2; z <= R0.cz + R0.rad + 2; z++) for (let x = R0.cx - R0.rad - 2; x <= R0.cx + R0.rad + 2; x++) {
      if (!inside(x, z) || !inShape(R0, x, z)) continue;
      const k = idx(x, z);
      grid[k] = 1; region[k] = i; height[k] = R0.h; ceil[k] = R0.h + R0.ch; R0.cells.push(k);
    }
  });

  // ---------- 3) couloirs ----------
  const edges = [];
  rooms.forEach((R0, i) => { if (i > 0) edges.push([R0.parent, i]); });
  // une ou deux boucles pour ne pas avoir qu'un seul chemin
  for (let t = 0; t < 2; t++) {
    let best = null, bd = 1e9;
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
      if (edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) continue;
      const d = Math.hypot(rooms[i].cx - rooms[j].cx, rooms[i].cz - rooms[j].cz) - rooms[i].rad - rooms[j].rad;
      if (d < bd && d < 16 && r.chance(0.8)) { bd = d; best = [i, j]; }
    }
    if (best) edges.push(best);
  }
  const corrH = theme === 'cave' ? 5 : 4.2;
  const noiseSeed = r.int(0, 9999);
  for (const [a, b] of edges) {
    const A0 = rooms[a], B0 = rooms[b];
    const path = carvePath(A0, B0);
    if (!path) return null;
    // largeur et pente
    const n = path.length;
    for (let i = 0; i < n; i++) {
      const [x, z] = path[i];
      const t = i / Math.max(1, n - 1);
      const hh = A0.h + (B0.h - A0.h) * smooth(t);
      const w = theme === 'cave' ? 1.4 + fbm(x * 0.15, z * 0.15, noiseSeed) * 1.6 : theme === 'ruins' ? 1.7 : 1.5;
      const wi = Math.ceil(w);
      for (let dz = -wi; dz <= wi; dz++) for (let dx = -wi; dx <= wi; dx++) {
        if (dx * dx + dz * dz > w * w + 0.3) continue;
        const X = x + dx, Z = z + dz; if (!inside(X, Z)) continue;
        const k = idx(X, Z);
        if (region[k] >= 0) continue; // ne touche pas aux salles
        if (grid[k]) continue; // déjà creusé par un autre couloir
        height[k] = hh; grid[k] = 1; ceil[k] = hh + corrH + (theme === 'cave' ? fbm(X * 0.2, Z * 0.2, 5) * 1.5 : 0);
      }
    }
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  // chemin entre deux salles : A* avec un coût bruité (le couloir serpente)
  function carvePath(A0, B0) {
    const sx = A0.cx, sz = A0.cz, ex = B0.cx, ez = B0.cz;
    const wiggle = theme === 'cave' ? 3 : theme === 'ruins' ? 1.6 : 0.6;
    const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), dirOf = new Int8Array(N).fill(-1);
    const open = [[0, idx(sx, sz)]]; g[idx(sx, sz)] = 0;
    const goal = idx(ex, ez);
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let it = 0;
    while (open.length && it++ < 60000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, cur] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (cur === goal) break;
      const cx = cur % W, cz = (cur / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = cx + D[d][0], nz = cz + D[d][1];
        if (!inside(nx, nz)) continue;
        const k = idx(nx, nz);
        const reg = region[k];
        // on évite de traverser d'autres salles que les deux à relier
        if (reg >= 0 && reg !== A0.id && reg !== B0.id) continue;
        let c = reg >= 0 ? 0.5 : 1 + fbm(nx * 0.12, nz * 0.12, noiseSeed) * wiggle;
        if (dirOf[cur] >= 0 && dirOf[cur] !== d) c += theme === 'crypt' ? 2.5 : 0.4; // les couloirs de crypte tournent peu
        // rester loin des autres salles
        const ng = g[cur] + c;
        if (ng < g[k]) { g[k] = ng; came[k] = cur; dirOf[k] = d; open.push([ng + (Math.abs(nx - ex) + Math.abs(nz - ez)) * 0.9, k]); }
      }
    }
    if (came[goal] < 0) return null;
    const out = []; let k = goal;
    while (k >= 0) { const reg = region[k]; if (reg < 0) out.push([k % W, (k / W) | 0]); k = came[k]; }
    out.reverse();
    return out.length ? out : [[Math.round((sx + ex) / 2), Math.round((sz + ez) / 2)]];
  }

  // ---------- 4) on lisse les hauteurs de sol des couloirs (pentes régulières) ----------
  for (let pass = 0; pass < 4; pass++) {
    const nh = height.slice();
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
      const k = idx(x, z); if (!grid[k] || region[k] >= 0) continue;
      let s = 0, n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const j = idx(x + dx, z + dz); if (grid[j]) { s += height[j]; n++; } }
      nh[k] = s / n;
    }
    for (let k = 0; k < N; k++) if (grid[k] && region[k] < 0) { const d = nh[k] - height[k]; height[k] = nh[k]; ceil[k] += d; }
  }
  // grottes : sol légèrement bosselé
  if (theme === 'cave') for (let k = 0; k < N; k++) if (grid[k]) { const x = k % W, z = (k / W) | 0; const b = (fbm(x * 0.25, z * 0.25, 11) - 0.5) * 0.5; height[k] += b; }

  // ---------- 5) rôles des salles ----------
  // la sortie est la salle la plus éloignée du départ (en nombre de salles)
  const depth = rooms.map(() => 0);
  rooms.forEach((R0, i) => { if (i > 0) depth[i] = depth[R0.parent] + 1; });
  let exit = 1; rooms.forEach((R0, i) => { if (depth[i] > depth[exit] || (depth[i] === depth[exit] && R0.rad > rooms[exit].rad)) exit = i; });
  rooms.forEach((R0, i) => { R0.type = i === 0 ? 'start' : i === exit ? 'exit' : 'combat'; });
  const others = rooms.filter((R0) => R0.type === 'combat');
  const nTreasure = Math.max(1, Math.round(others.length / 4));
  for (let i = 0; i < nTreasure; i++) { const R0 = r.pick(others.filter((o) => o.type === 'combat')); if (R0) R0.type = 'treasure'; }

  // ---------- 6) décor et obstacles ----------
  const props = [], lights = [];
  const isF = (x, z) => x >= 0 && z >= 0 && x < W && z < H && grid[idx(x, z)] === 1;
  const free = (x, z) => isF(x, z) && !solid[idx(x, z)];
  const wallDir = (x, z) => { // direction vers le mur le plus proche (si collé à un mur)
    if (!isF(x, z - 1)) return [0, -1]; if (!isF(x, z + 1)) return [0, 1]; if (!isF(x - 1, z)) return [-1, 0]; if (!isF(x + 1, z)) return [1, 0]; return null;
  };
  const block = (x, z, rad = 0) => { for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) if (isF(x + dx, z + dz)) solid[idx(x + dx, z + dz)] = 1; };
  const H0 = (x, z) => height[idx(x, z)];
  const P = (kind, x, z, o = {}) => props.push({ kind, x: x + (o.ox ?? 0.5), z: z + (o.oz ?? 0.5), y: o.y ?? H0(x, z), rot: o.rot ?? r.range(0, Math.PI * 2), s: o.s ?? 1, ...o });

  for (const R0 of rooms) {
    const cx = R0.cx, cz = R0.cz, h = R0.h;
    const cells = R0.cells.map((k) => [k % W, (k / W) | 0]);
    const edge = cells.filter(([x, z]) => wallDir(x, z));
    // --- lumières le long des murs ---
    let lastT = -99;
    const step = theme === 'cave' ? 7 : 5;
    edge.sort((p, q) => Math.atan2(p[1] - cz, p[0] - cx) - Math.atan2(q[1] - cz, q[0] - cx));
    edge.forEach(([x, z], i) => {
      const per = 2 * Math.PI * R0.rad;
      const tpos = i / edge.length * per;
      if (tpos - lastT < step) return;
      lastT = tpos;
      const d = wallDir(x, z);
      const rot = Math.atan2(-d[0], -d[1]);
      if (theme === 'cave') {
        if (r.chance(0.7)) { P('crystal', x, z, { ox: 0.5 + d[0] * 0.3, oz: 0.5 + d[1] * 0.3, s: r.range(0.8, 1.5), col: r.pick([0x5ad8ff, 0xb070ff, 0x5affc0]) }); lights.push({ x: x + 0.5, y: h + 1.2, z: z + 0.5, col: props[props.length - 1].col, i: 5, kind: 'crystal' }); }
      } else {
        P('torch', x, z, { ox: 0.5 + d[0] * 0.48, oz: 0.5 + d[1] * 0.48, y: h + 2.2, rot });
        lights.push({ x: x + 0.5 - d[0] * 0.1, y: h + 2.5, z: z + 0.5 - d[1] * 0.1, col: 0xff9a4a, i: 7, kind: 'torch' });
      }
    });
    // --- décor contre les murs ---
    for (const [x, z] of edge) {
      if (!free(x, z) || Math.hypot(x - cx, z - cz) < 3) continue;
      const d = wallDir(x, z);
      const rot = Math.atan2(-d[0], -d[1]);
      const roll = r();
      if (theme === 'cave') {
        if (roll < 0.25) { P('rock', x, z, { s: r.range(1.2, 2.6), ox: 0.5 + d[0] * 0.4, oz: 0.5 + d[1] * 0.4 }); block(x, z); }
        else if (roll < 0.38) P('mushroom', x, z, { s: r.range(0.8, 1.6), glow: r.chance(0.5) });
        else if (roll < 0.5) P('pebble', x, z, { s: r.range(0.6, 1.2) });
      } else {
        if (roll < 0.06) { P(r.pick(['crate', 'crate', 'barrel']), x, z, { s: r.range(0.75, 1) }); block(x, z); }
        else if (roll < 0.1) { P('barrel', x, z); block(x, z); }
        else if (roll < 0.13) P('vase', x, z, { s: r.range(0.8, 1.1) });
        else if (roll < 0.17) P('banner', x, z, { ox: 0.5 + d[0] * 0.46, oz: 0.5 + d[1] * 0.46, y: h + R0.ch * 0.62, rot, s: 1.1 });
        else if (roll < 0.21) P('cobweb', x, z, { ox: 0.5 + d[0] * 0.4, oz: 0.5 + d[1] * 0.4, y: h + R0.ch - 1.2, rot });
        else if (roll < 0.25) P('rubble', x, z, { s: r.range(0.8, 1.4) });
        if (theme === 'ruins') {
          const r2 = r();
          if (r2 < 0.25) P(r.pick(['fern', 'bush', 'grass', 'plant']), x, z, { s: r.range(0.8, 1.6) });
          else if (r2 < 0.33) P('flowers', x, z, { s: r.range(0.8, 1.2) });
        }
      }
    }
    // --- éléments centraux selon la forme ---
    if (R0.shape === 'nef') {
      // deux rangées de piliers
      const along = R0.rot % 2 === 0 ? [0, 1] : [1, 0];
      const side = R0.rot % 2 === 0 ? [1, 0] : [0, 1];
      for (let t = -R0.b + 3; t <= R0.b - 3; t += 4) for (const sgn of [-1, 1]) {
        const x = Math.floor(cx + along[0] * t + side[0] * sgn * (R0.a - 2)), z = Math.floor(cz + along[1] * t + side[1] * sgn * (R0.a - 2));
        if (!isF(x, z)) continue;
        P('pillar', x, z, { rot: 0, top: h + R0.ch }); block(x, z);
      }
    } else if (R0.shape === 'round' || R0.shape === 'octo') {
      const n = R0.a >= 9 ? 8 : 6;
      if (theme !== 'cave' && R0.type !== 'start') for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + 0.3;
        const x = Math.floor(cx + Math.cos(a) * (R0.a - 3)), z = Math.floor(cz + Math.sin(a) * (R0.a - 3));
        if (free(x, z)) { P('pillar', x, z, { rot: 0, top: h + R0.ch }); block(x, z); }
      }
    }
    // pièce maîtresse au centre
    const cxi = Math.floor(cx), czi = Math.floor(cz);
    if (R0.type === 'start') {
      if (theme !== 'cave') { P('brazier', cxi + 3, czi); block(cxi + 3, czi); lights.push({ x: cxi + 3.5, y: h + 1.6, z: czi + 0.5, col: 0xff8a3a, i: 9, kind: 'fire' }); }
    } else if (R0.type === 'treasure') {
      P('chest', cxi, czi, { rot: r.range(-0.5, 0.5) }); block(cxi, czi);
      if (theme !== 'cave') { P('table', cxi + 3, czi + 1, { rot: 0 }); block(cxi + 3, czi + 1, 0); P('chair', cxi + 3, czi + 3, { rot: Math.PI }); }
    } else if (R0.type === 'exit') {
      // le portail vers l'étage suivant
      R0.portal = { x: cx + 0.5, z: cz + 0.5, y: h };
      lights.push({ x: cx + 0.5, y: h + 2, z: cz + 0.5, col: 0xb070ff, i: 12, kind: 'portal', off: true }); // s'allume quand le boss tombe
    } else if (theme !== 'cave' && r.chance(0.45) && (R0.shape === 'octo' || R0.shape === 'round' || R0.shape === 'cross')) {
      if (r.chance(0.5)) { P('statue', cxi, czi, { s: 0.45, rot: r.range(0, 6.3) }); block(cxi, czi, 1); }
      else { P('brazier', cxi, czi); block(cxi, czi); lights.push({ x: cxi + 0.5, y: h + 1.6, z: czi + 0.5, col: 0xff8a3a, i: 9, kind: 'fire' }); }
    }
    if (theme === 'cave') {
      // stalagmites et cristaux au milieu des grottes
      const n = r.int(2, 5);
      for (let i = 0; i < n; i++) {
        const [x, z] = r.pick(cells);
        if (!free(x, z) || Math.hypot(x - cx, z - cz) < 3 || wallDir(x, z)) continue;
        if (r.chance(0.6)) { P('stalagmite', x, z, { s: r.range(0.8, 1.8) }); block(x, z); }
        else { const col = r.pick([0x5ad8ff, 0xb070ff, 0xff70c0]); P('crystal', x, z, { s: r.range(1.2, 2), col }); block(x, z); lights.push({ x: x + 0.5, y: H0(x, z) + 1, z: z + 0.5, col, i: 6, kind: 'crystal' }); }
      }
      // stalactites au plafond
      for (let i = 0; i < 6; i++) { const [x, z] = r.pick(cells); P('stalactite', x, z, { y: ceil[idx(x, z)], s: r.range(0.8, 1.6) }); }
    }
    if (theme === 'ruins' && R0.type !== 'start') {
      for (let i = 0; i < 2; i++) { const [x, z] = r.pick(cells); if (free(x, z) && !wallDir(x, z) && Math.hypot(x - cx, z - cz) > 3) { P('deadtree', x, z, { s: r.range(0.5, 0.8) }); block(x, z); } }
      for (let i = 0; i < 8; i++) { const [x, z] = r.pick(cells); if (free(x, z)) P(r.pick(['grass', 'clover', 'pebble', 'fern']), x, z, { s: r.range(0.7, 1.4) }); }
    }
    // gravats et petites pierres un peu partout (le lieu a vécu)
    for (let i = 0; i < 4; i++) { const [x, z] = r.pick(cells); if (free(x, z)) P(theme === 'cave' ? 'pebble' : 'bricks', x, z, { s: r.range(0.5, 1) }); }
  }
  // torches et pierres dans les couloirs
  for (let z = 2; z < H - 2; z += 1) for (let x = 2; x < W - 2; x++) {
    const k = idx(x, z); if (!grid[k] || region[k] >= 0) continue;
    const d = wallDir(x, z);
    if (d && noise2(x * 0.9, z * 0.9, 3) > 0.83 && theme !== 'cave') {
      P('torch', x, z, { ox: 0.5 + d[0] * 0.48, oz: 0.5 + d[1] * 0.48, y: height[k] + 2, rot: Math.atan2(-d[0], -d[1]) });
      lights.push({ x: x + 0.5, y: height[k] + 2.3, z: z + 0.5, col: 0xff9a4a, i: 6, kind: 'torch' });
    } else if (d && theme === 'cave' && noise2(x * 0.7, z * 0.7, 9) > 0.86) {
      const col = 0x5ad8ff; P('crystal', x, z, { ox: 0.5 + d[0] * 0.3, oz: 0.5 + d[1] * 0.3, s: 0.8, col }); lights.push({ x: x + 0.5, y: height[k] + 1, z: z + 0.5, col, i: 4, kind: 'crystal' });
    } else if (theme === 'ruins' && d && noise2(x * 0.6, z * 0.6, 4) > 0.7) P(r.pick(['fern', 'grass', 'plant']), x, z, { s: r.range(0.7, 1.3) });
  }

  const start = rooms[0];
  const L = {
    floor, seed, theme, W, H, grid, solid, height, ceil, region, rooms, props, lights,
    spawn: { x: start.cx + 0.5, z: start.cz + 0.5 },
    portal: rooms.find((R0) => R0.type === 'exit').portal,
    idx, isF,
  };
  return L;
}

// ---------- requêtes de collision / hauteur ----------
export function walkable(L, x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  if (xi < 0 || zi < 0 || xi >= L.W || zi >= L.H) return false;
  const k = zi * L.W + xi;
  return L.grid[k] === 1 && !L.solid[k];
}
// hauteur du sol (interpolée entre les cases : pentes douces)
export function groundAt(L, x, z) {
  const fx = x - 0.5, fz = z - 0.5;
  const x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
  const hAt = (xi, zi) => { const k = zi * L.W + xi; return L.grid[k] ? L.height[k] : NaN; };
  const h00 = hAt(x0, z0), h10 = hAt(x0 + 1, z0), h01 = hAt(x0, z0 + 1), h11 = hAt(x0 + 1, z0 + 1);
  const c = L.height[Math.floor(z) * L.W + Math.floor(x)];
  const f = (v) => (Number.isNaN(v) ? c : v);
  const a = f(h00) + (f(h10) - f(h00)) * tx, b = f(h01) + (f(h11) - f(h01)) * tx;
  return a + (b - a) * tz;
}
export function ceilAt(L, x, z) { const k = Math.floor(z) * L.W + Math.floor(x); return L.grid[k] ? L.ceil[k] : 0; }

// déplacement avec glissement le long des murs (cercle de rayon rad)
export function moveCircle(L, pos, dx, dz, rad) {
  const tryAxis = (nx, nz) => {
    for (const [ox, oz] of [[rad, 0], [-rad, 0], [0, rad], [0, -rad], [rad * 0.7, rad * 0.7], [-rad * 0.7, rad * 0.7], [rad * 0.7, -rad * 0.7], [-rad * 0.7, -rad * 0.7]]) {
      if (!walkable(L, nx + ox, nz + oz)) return false;
    }
    // pas de marche trop haute (> 0,7 m) d'un coup
    return Math.abs(groundAt(L, nx, nz) - groundAt(L, pos.x, pos.z)) < 0.7;
  };
  if (tryAxis(pos.x + dx, pos.z + dz)) { pos.x += dx; pos.z += dz; return true; }
  let moved = false;
  if (tryAxis(pos.x + dx, pos.z)) { pos.x += dx; moved = true; }
  if (tryAxis(pos.x, pos.z + dz)) { pos.z += dz; moved = true; }
  return moved;
}
// ligne de vue (pour la caméra et les ennemis)
export function lineFree(L, x0, z0, x1, z1, step = 0.25) {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / step);
  for (let i = 1; i < n; i++) { const t = i / n; if (!walkable(L, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false; }
  return true;
}
