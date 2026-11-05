/* RIFTWALKER — roguelike de donjons (V1 : le Guerrier)
   Tout le jeu tient dans ce fichier. Graphismes : 0x72 Dungeon Tileset II (CC0). */
'use strict';

// ============================================================
// 1. OUTILS
// ============================================================
const TILE = 16;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sauvegarde (dans le téléphone)
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } },
};
let meta = store.get('rw_meta', { gold: 0, bestFloor: 0, sound: true, runs: 0 });
const saveMeta = () => store.set('rw_meta', meta);

// ============================================================
// 2. GRAPHISMES
// ============================================================
let atlas, atlasWhite, atlasRed, SPR;
async function loadAssets() {
  const [json] = await Promise.all([
    fetch('assets/atlas.json').then((r) => r.json()),
    new Promise((res, rej) => { atlas = new Image(); atlas.onload = res; atlas.onerror = rej; atlas.src = 'assets/atlas.png'; }),
    document.fonts ? Promise.all([document.fonts.load('400 16px Pixel'), document.fonts.load('700 16px Pixel')]).catch(() => {}) : null,
  ]);
  SPR = json;
  atlasWhite = tinted('#ffffff');
  atlasRed = tinted('#ff3a2a');
}
function tinted(color) {
  const c = document.createElement('canvas');
  c.width = atlas.width; c.height = atlas.height;
  const x = c.getContext('2d');
  x.drawImage(atlas, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}
function spr(ctx, name, x, y, opt) {
  const r = SPR[name];
  if (!r) return;
  const img = opt && opt.img ? opt.img : atlas;
  if (opt && (opt.flip || opt.rot)) {
    ctx.save();
    ctx.translate(Math.round(x + r[2] / 2), Math.round(y + r[3] / 2));
    if (opt.flip) ctx.scale(-1, 1);
    if (opt.rot) ctx.rotate(opt.rot);
    ctx.drawImage(img, r[0], r[1], r[2], r[3], -r[2] / 2, -r[3] / 2, r[2], r[3]);
    ctx.restore();
  } else {
    ctx.drawImage(img, r[0], r[1], r[2], r[3], Math.round(x), Math.round(y), r[2], r[3]);
  }
}
const sprSize = (name) => SPR[name] || [0, 0, 16, 16];

// ============================================================
// 3. SON (synthétisé, fonctionne hors ligne)
// ============================================================
let actx = null;
function audioUnlock() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
  if (actx.state === 'suspended') actx.resume();
}
function tone(freq, dur, type = 'square', vol = 0.12, slide = 0, delay = 0) {
  if (!actx || !meta.sound) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.15, hp = 800, delay = 0) {
  if (!actx || !meta.sound) return;
  const t = actx.currentTime + delay;
  const len = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = actx.createBufferSource(); s.buffer = buf;
  const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = actx.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(actx.destination); s.start(t);
}
const SFX = {
  swing: () => noise(0.09, 0.12, 2500),
  hit: () => { tone(180, 0.09, 'square', 0.1, -120); noise(0.05, 0.1, 1200); },
  crit: () => { tone(320, 0.12, 'square', 0.12, -250); noise(0.08, 0.16, 900); },
  hurt: () => { tone(140, 0.2, 'sawtooth', 0.12, -90); },
  coin: () => { tone(880, 0.06, 'square', 0.06); tone(1320, 0.1, 'square', 0.06, 0, 0.06); },
  chest: () => { tone(330, 0.08, 'triangle', 0.12); tone(494, 0.08, 'triangle', 0.12, 0, 0.08); tone(659, 0.16, 'triangle', 0.12, 0, 0.16); },
  lock: () => { noise(0.2, 0.14, 300); tone(90, 0.25, 'square', 0.08, -30); },
  unlock: () => { tone(523, 0.08, 'square', 0.07); tone(784, 0.14, 'square', 0.07, 0, 0.08); },
  whirl: () => { noise(0.35, 0.14, 1500); tone(200, 0.35, 'sawtooth', 0.05, 300); },
  charge: () => { noise(0.25, 0.12, 600); tone(110, 0.25, 'sawtooth', 0.08, 180); },
  potion: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.08, 'triangle', 0.08, 0, i * 0.06)); },
  die: () => { noise(0.18, 0.1, 500); tone(160, 0.2, 'triangle', 0.08, -100); },
  slam: () => { noise(0.4, 0.22, 100); tone(70, 0.4, 'square', 0.12, -40); },
  shoot: () => tone(600, 0.12, 'sawtooth', 0.05, -400),
  key: () => { [659, 880, 1175].forEach((f, i) => tone(f, 0.1, 'square', 0.07, 0, i * 0.07)); },
  portal: () => { tone(220, 0.8, 'sine', 0.12, 660); tone(330, 0.8, 'sine', 0.08, 880); },
  death: () => { tone(220, 0.3, 'square', 0.1, -100); tone(165, 0.3, 'square', 0.1, -80, 0.25); tone(110, 0.6, 'square', 0.1, -60, 0.5); },
  loot: (r) => { const base = [300, 400, 500, 600, 750, 900][r]; tone(base, 0.1, 'triangle', 0.1); tone(base * 1.5, 0.2, 'triangle', 0.1, 0, 0.1); },
};

// ============================================================
// 4. ÉCRAN
// ============================================================
const canvas = $('game');
const ctx = canvas.getContext('2d');
const lightCv = document.createElement('canvas');
const lctx = lightCv.getContext('2d');
let VW = 240, VH = 400, SCALE = 4;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const dw = window.innerWidth * dpr, dh = window.innerHeight * dpr;
  SCALE = Math.max(2, Math.floor(Math.min(dw, dh) / 200));
  VW = Math.ceil(dw / SCALE); VH = Math.ceil(dh / SCALE);
  canvas.width = VW; canvas.height = VH;
  canvas.style.width = (VW * SCALE / dpr) + 'px';
  canvas.style.height = (VH * SCALE / dpr) + 'px';
  lightCv.width = VW; lightCv.height = VH;
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);

// ============================================================
// 5. DONNÉES DU JEU
// ============================================================
const RARITY = [
  { name: 'Médiocre', color: '#9d9d9d', mult: 0.8 },
  { name: 'Commune', color: '#ffffff', mult: 1.0 },
  { name: 'Inhabituelle', color: '#1eff00', mult: 1.22 },
  { name: 'Rare', color: '#0070dd', mult: 1.48 },
  { name: 'Épique', color: '#a335ee', mult: 1.8 },
  { name: 'Légendaire', color: '#ff8000', mult: 2.25 },
];
const WEAPONS = [
  ['weapon_rusty_sword', 'Épée rouillée', 0], ['weapon_regular_sword', 'Épée courte', 1], ['weapon_machete', 'Machette', 1],
  ['weapon_mace', "Masse d'armes", 2], ['weapon_axe', 'Hache de guerre', 2], ['weapon_duel_sword', 'Lame de duel', 2],
  ['weapon_knight_sword', 'Épée de chevalier', 3], ['weapon_katana', 'Katana', 3], ['weapon_cleaver', 'Couperet', 3],
  ['weapon_saw_sword', 'Lame dentelée', 4], ['weapon_red_gem_sword', 'Épée au rubis', 4], ['weapon_big_hammer', 'Grand marteau', 4],
  ['weapon_golden_sword', 'Épée dorée', 5], ['weapon_lavish_sword', 'Lame somptueuse', 5],
];
const SUFFIX = ['du Néant', 'des Profondeurs', 'du Rôdeur', 'de la Tempête', 'du Sanglier', "de l'Ours", 'du Faucon'];

function makeWeapon(floorN, rarity) {
  let w;
  if (rarity === 5) w = Math.random() < 0.5 ? ['weapon_anime_sword', 'Lame de la Faille', 6] : pick(WEAPONS.filter((x) => x[2] >= 4));
  else {
    const tier = clamp(rarity + randi(-1, 1), 0, 5);
    const pool = WEAPONS.filter((x) => Math.abs(x[2] - tier) <= 1);
    w = pick(pool);
  }
  const dmg = Math.round((9 + floorN * 2.2 + w[2] * 1.5) * RARITY[rarity].mult * rand(0.92, 1.08));
  let name = w[1];
  if (rarity >= 3 && name !== 'Lame de la Faille') name += ' ' + pick(SUFFIX);
  return { sprite: w[0], name, rarity, dmg };
}
function rollRarity(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return 1;
}

// sprite, pv, vitesse, dégâts, rayon, portée, préparation, distance (si à distance)
const ENEMY = {
  tiny_zombie: { name: 'Zombie', hp: 16, spd: 30, dmg: 6, r: 4, reach: 12, windup: 0.42, gold: [1, 2] },
  goblin: { name: 'Gobelin', hp: 13, spd: 50, dmg: 5, r: 4, reach: 12, windup: 0.3, gold: [1, 3] },
  skelet: { name: 'Squelette', hp: 24, spd: 36, dmg: 8, r: 4, reach: 13, windup: 0.42, gold: [1, 3] },
  orc_warrior: { name: 'Guerrier orc', hp: 40, spd: 34, dmg: 11, r: 5, reach: 14, windup: 0.5, gold: [2, 4] },
  masked_orc: { name: 'Orc masqué', hp: 55, spd: 38, dmg: 13, r: 5, reach: 14, windup: 0.5, gold: [3, 5] },
  chort: { name: 'Chort', hp: 30, spd: 55, dmg: 9, r: 5, reach: 13, windup: 0.35, gold: [2, 4] },
  imp: { name: 'Diablotin', hp: 15, spd: 40, dmg: 7, r: 4, reach: 0, windup: 0.55, ranged: 72, proj: 85, gold: [1, 3] },
  orc_shaman: { name: 'Chaman orc', hp: 24, spd: 32, dmg: 9, r: 5, reach: 0, windup: 0.6, ranged: 80, proj: 80, gold: [2, 4] },
  mimic: { name: 'Mimic', hp: 45, spd: 46, dmg: 10, r: 6, reach: 14, windup: 0.35, gold: [6, 10], noAnim: true },
  big_zombie: { name: 'Zombie colossal', hp: 160, spd: 26, dmg: 14, r: 9, reach: 18, windup: 0.55, gold: [15, 25], elite: true },
  ogre: { name: 'Ogre', hp: 230, spd: 28, dmg: 17, r: 9, reach: 18, windup: 0.55, gold: [20, 30], elite: true },
  big_demon: { name: 'Démon de la Faille', hp: 320, spd: 32, dmg: 20, r: 9, reach: 18, windup: 0.5, gold: [30, 45], elite: true },
};
function enemyPool(f) {
  const p = ['tiny_zombie', 'tiny_zombie', 'goblin', 'goblin', 'skelet'];
  if (f >= 2) p.push('imp', 'orc_warrior', 'skelet');
  if (f >= 3) p.push('orc_shaman', 'masked_orc', 'chort', 'imp');
  if (f >= 5) p.push('masked_orc', 'chort', 'orc_shaman');
  if (f === 1) p.push('imp');
  return p;
}
const eliteFor = (f) => (f % 3 === 1 ? 'big_zombie' : f % 3 === 2 ? 'ogre' : 'big_demon');

// ============================================================
// 6. GÉNÉRATION DU DONJON
// ============================================================
const GW = 4, GH = 4, CW = 18, CH = 15;
const MW = GW * CW, MH = GH * CH;

function generateFloor(floorN, seed) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const d = tryGenerate(floorN, seed + attempt * 7919);
    if (d) return d;
  }
  return tryGenerate(floorN, seed, true);
}

function tryGenerate(floorN, seed, force) {
  const R = mulberry32(seed);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const rp = (arr) => arr[Math.floor(R() * arr.length)];
  const N = Math.min(12, 7 + Math.min(floorN, 5));
  const key = (cx, cy) => cy * GW + cx;
  const cells = new Map();
  const edges = [];
  const start = { cx: ri(0, GW - 1), cy: ri(0, GH - 1) };
  cells.set(key(start.cx, start.cy), start);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (cells.size < N) {
    const frontier = [];
    for (const c of cells.values()) for (const [dx, dy] of DIRS) {
      const nx = c.cx + dx, ny = c.cy + dy;
      if (nx >= 0 && ny >= 0 && nx < GW && ny < GH && !cells.has(key(nx, ny))) frontier.push([c, nx, ny]);
    }
    if (!frontier.length) break;
    const [c, nx, ny] = rp(frontier);
    const n = { cx: nx, cy: ny };
    cells.set(key(nx, ny), n);
    edges.push([c, n]);
  }
  const hasEdge = (a, b) => edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  const loops = ri(0, 2);
  for (let k = 0; k < loops; k++) {
    const cand = [];
    for (const c of cells.values()) for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const nx = c.cx + dx, ny = c.cy + dy;
      if (nx >= GW || ny >= GH) continue;
      const n = cells.get(key(nx, ny));
      if (n && !hasEdge(c, n)) cand.push([c, n]);
    }
    if (cand.length) edges.push(rp(cand));
  }
  const list = [...cells.values()];
  list.forEach((c, i) => { c.id = i; c.adj = []; });
  edges.forEach(([a, b]) => { a.adj.push(b); b.adj.push(a); });
  // distances depuis le départ
  const q = [start]; start.dist = 0;
  const seen = new Set([start]);
  while (q.length) { const c = q.shift(); for (const n of c.adj) if (!seen.has(n)) { seen.add(n); n.dist = c.dist + 1; q.push(n); } }
  const exit = list.filter((c) => c !== start).sort((a, b) => b.dist - a.dist)[0];
  const leaves = list.filter((c) => c !== start && c !== exit && c.adj.length === 1).sort((a, b) => b.dist - a.dist);
  if (!leaves.length && !force) return null;
  const vault = leaves[0] || null;
  const others = list.filter((c) => c !== start && c !== exit && c !== vault);
  if (others.length < 2 && !force) return null;
  const keyRoom = vault ? rp(others) : null;
  const rest = others.filter((c) => c !== keyRoom);
  const treasures = new Set();
  const nT = Math.min(rest.length - 1, ri(1, 2));
  while (treasures.size < Math.max(0, nT)) treasures.add(rp(rest));
  start.type = 'start'; exit.type = 'exit';
  if (vault) vault.type = 'vault';
  if (keyRoom) keyRoom.type = 'key';
  for (const c of others) if (!c.type) c.type = treasures.has(c) ? 'treasure' : 'combat';

  // --- tuiles ---
  const tiles = new Uint8Array(MW * MH);
  const carve = (x0, y0, x1, y1) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      if (x > 0 && y > 0 && x < MW - 1 && y < MH - 1) tiles[y * MW + x] = 1;
  };
  for (const c of list) {
    let w = ri(7, 11), h = ri(6, 9);
    if (c.type === 'exit') { w = 12; h = 10; }
    if (c.type === 'start') { w = ri(7, 9); h = ri(6, 7); }
    if (c.type === 'vault') { w = ri(7, 8); h = ri(6, 7); }
    w = Math.min(w, CW - 4); h = Math.min(h, CH - 4);
    c.x = c.cx * CW + ri(2, CW - 2 - w);
    c.y = c.cy * CH + ri(2, CH - 2 - h);
    c.w = w; c.h = h; c.doors = [];
    carve(c.x, c.y, c.x + w - 1, c.y + h - 1);
  }
  for (const [p, q2] of edges) {
    if (p.cy === q2.cy) {
      const [A, B] = p.cx < q2.cx ? [p, q2] : [q2, p];
      const b = (A.cx + 1) * CW;
      const ya = ri(A.y + 1, A.y + A.h - 3), yb = ri(B.y + 1, B.y + B.h - 3);
      carve(A.x + A.w, ya, b, ya + 1);
      carve(b - 1, Math.min(ya, yb), b, Math.max(ya, yb) + 1);
      carve(b - 1, yb, B.x - 1, yb + 1);
      A.doors.push({ x: A.x + A.w, y: ya }, { x: A.x + A.w, y: ya + 1 });
      B.doors.push({ x: B.x - 1, y: yb }, { x: B.x - 1, y: yb + 1 });
    } else {
      const [A, B] = p.cy < q2.cy ? [p, q2] : [q2, p];
      const b = (A.cy + 1) * CH;
      const xa = ri(A.x + 1, A.x + A.w - 3), xb = ri(B.x + 1, B.x + B.w - 3);
      carve(xa, A.y + A.h, xa + 1, b);
      carve(Math.min(xa, xb), b - 1, Math.max(xa, xb) + 1, b);
      carve(xb, b - 1, xb + 1, B.y - 1);
      A.doors.push({ x: xa, y: A.y + A.h }, { x: xa + 1, y: A.y + A.h });
      B.doors.push({ x: xb, y: B.y - 1 }, { x: xb + 1, y: B.y - 1 });
    }
  }

  // --- décor ---
  const isF = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && tiles[y * MW + x] === 1;
  const floorVar = new Uint8Array(MW * MH);
  for (let i = 0; i < floorVar.length; i++) { const r = R(); floorVar[i] = r < 0.78 ? 1 : r < 0.84 ? 2 : r < 0.9 ? 3 : r < 0.94 ? 4 : r < 0.97 ? 5 : r < 0.985 ? 6 : r < 0.993 ? 7 : 8; }
  const torches = [], banners = [], props = [];
  for (const c of list) {
    for (let x = c.x; x < c.x + c.w; x++) {
      const y = c.y - 1;
      if (!isF(x, y)) {
        if ((x - c.x) % 4 === 1 && R() < 0.75) torches.push({ x: x * TILE + 8, y: y * TILE + 6 });
        else if (R() < 0.12) banners.push({ x, y, s: rp(['wall_banner_red', 'wall_banner_blue', 'wall_banner_green', 'wall_banner_yellow']) });
      }
    }
    if (c.type !== 'start' && c.type !== 'vault' && R() < 0.6) {
      const n = ri(1, 3);
      for (let k = 0; k < n; k++) props.push({ x: ri(c.x, c.x + c.w - 1), y: ri(c.y, c.y + c.h - 1), s: R() < 0.7 ? 'skull' : 'crate' });
    }
  }
  return { floorN, seed, tiles, floorVar, rooms: list, start, exit, vault, keyRoom, torches, banners, props, edges };
}

// ============================================================
// 7. ÉTAT DU JEU
// ============================================================
let G = null;          // partie en cours
let state = 'loading'; // loading | title | play | pause | dead | trans
const input = { mx: 0, my: 0, keys: {}, attackHeld: false };

function newPlayer() {
  return {
    x: 0, y: 0, r: 4, dir: 1, fx: 1, fy: 0, maxHp: 100, hp: 100, rage: 0,
    weapon: { sprite: 'weapon_regular_sword', name: 'Épée de recrue', rarity: 1, dmg: 10 },
    potions: 1, gold: 0, keys: 0, kills: 0,
    cd: { attack: 0, charge: 0, whirl: 0, potion: 0 },
    cdMax: { attack: 0.36, charge: 7, whirl: 1.2, potion: 1 },
    swing: 0, whirl: 0, charging: 0, chargeTarget: null, inv: 0, hurtT: 0, anim: 0, moving: false, trail: [],
  };
}

function startRun(fromSave) {
  const p = newPlayer();
  let floorN = 1, seed = (Math.random() * 1e9) | 0;
  if (fromSave) {
    Object.assign(p, { maxHp: fromSave.maxHp, hp: fromSave.hp, weapon: fromSave.weapon, potions: fromSave.potions, gold: fromSave.gold, kills: fromSave.kills || 0 });
    floorN = fromSave.floor; seed = fromSave.seed;
  } else { meta.runs++; saveMeta(); }
  G = { p, floorN, time: 0, shake: 0, freeze: 0, fx: [], parts: [], texts: [], projs: [], pickups: [], enemies: [], chests: [], tele: [] };
  enterFloor(floorN, seed);
  showScreen(null);
  $('hud').classList.remove('hidden');
  state = 'play';
  updateHUD(true);
}

function enterFloor(floorN, seed) {
  const D = generateFloor(floorN, seed);
  G.D = D; G.floorN = floorN;
  G.enemies = []; G.chests = []; G.pickups = []; G.projs = []; G.fx = []; G.parts = []; G.texts = []; G.tele = [];
  G.barrier = new Uint8Array(MW * MH);
  G.explored = new Uint8Array(MW * MH);
  G.portal = null; G.room = null;
  G.p.keys = 0;
  const hpM = 1 + 0.22 * (floorN - 1), dmM = 1 + 0.15 * (floorN - 1);
  const pool = enemyPool(floorN);
  for (const room of D.rooms) {
    room.cleared = false; room.visited = false; room.locked = false; room.enemies = [];
    const cx = (room.x + room.w / 2) * TILE, cy = (room.y + room.h / 2) * TILE;
    const spot = () => {
      for (let k = 0; k < 40; k++) {
        const x = (room.x + 1 + Math.random() * (room.w - 2)) * TILE, y = (room.y + 1 + Math.random() * (room.h - 2)) * TILE + 4;
        if (room.doors.every((d) => Math.hypot(d.x * TILE + 8 - x, d.y * TILE + 8 - y) > 40)) return { x, y };
      }
      return { x: cx, y: cy };
    };
    const addEnemies = (n) => { for (let i = 0; i < n; i++) { const s = spot(); spawnEnemy(pick(pool), s.x, s.y, room, hpM, dmM); } };
    const t = room.type;
    if (t === 'combat') addEnemies(Math.min(7, randi(2, 3) + Math.floor(floorN / 2)));
    if (t === 'treasure') { addChest(cx, cy + 4, Math.random() < 0.2 + floorN * 0.03, false); if (Math.random() < 0.55) addEnemies(randi(1, 2)); }
    if (t === 'key') { G.pickups.push({ type: 'key', x: cx, y: cy, vx: 0, vy: 0, t: 0 }); addEnemies(randi(2, 3) + Math.floor(floorN / 3)); }
    if (t === 'vault') { room.sealed = true; addChest(cx - 12, cy + 4, false, true); addChest(cx + 12, cy + 4, false, true); for (const d of room.doors) G.barrier[d.y * MW + d.x] = 2; }
    if (t === 'exit') { spawnEnemy(eliteFor(floorN), cx, cy - 8, room, hpM, dmM); addEnemies(Math.min(3, 1 + Math.floor(floorN / 2))); }
  }
  const s = D.start;
  G.p.x = (s.x + s.w / 2) * TILE; G.p.y = (s.y + s.h / 2) * TILE + 4;
  G.cam = { x: G.p.x, y: G.p.y };
  prerenderMap();
  saveRun();
  if (floorN > meta.bestFloor) { meta.bestFloor = floorN; saveMeta(); }
}

function spawnEnemy(kind, x, y, room, hpM = 1, dmM = 1) {
  const d = ENEMY[kind];
  const e = {
    kind, d, x, y, r: d.r, hp: Math.round(d.hp * hpM), maxHp: Math.round(d.hp * hpM), dmg: Math.round(d.dmg * dmM),
    room, active: false, state: 'chase', t: 0, cd: rand(0.4, 1.2), stun: 0, flash: 0, kvx: 0, kvy: 0, dir: 1,
    anim: Math.random() * 4, moving: false, slamCd: 3.5,
  };
  G.enemies.push(e);
  if (room) room.enemies.push(e);
  return e;
}
function addChest(x, y, mimic, big) { G.chests.push({ x, y, mimic, big, open: false, t: 0 }); }

// ---------- carte & collisions ----------
const isFloor = (tx, ty) => tx >= 0 && ty >= 0 && tx < MW && ty < MH && G.D.tiles[ty * MW + tx] === 1;
const solidTile = (tx, ty) => !isFloor(tx, ty) || G.barrier[ty * MW + tx] > 0;
const solidAt = (px, py) => solidTile(Math.floor(px / TILE), Math.floor(py / TILE));
function blocked(x, y, r) {
  return solidAt(x - r, y - r * 0.6) || solidAt(x + r, y - r * 0.6) || solidAt(x - r, y + r * 0.4) || solidAt(x + r, y + r * 0.4);
}
function move(e, dx, dy) {
  let hit = false;
  if (dx && !blocked(e.x + dx, e.y, e.r)) e.x += dx; else if (dx) hit = true;
  if (dy && !blocked(e.x, e.y + dy, e.r)) e.y += dy; else if (dy) hit = true;
  return hit;
}
function roomAt(px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  for (const r of G.D.rooms) if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return r;
  return null;
}

// ============================================================
// 8. COMBAT
// ============================================================
function nearestEnemy(maxD, filter) {
  let best = null, bd = maxD;
  for (const e of G.enemies) {
    if (!e.active || e.dead || (filter && !filter(e))) continue;
    const d = dist(G.p, e);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function face(p, tx, ty) {
  const a = Math.atan2(ty - p.y, tx - p.x);
  p.fx = Math.cos(a); p.fy = Math.sin(a);
  if (Math.abs(p.fx) > 0.15) p.dir = p.fx > 0 ? 1 : -1;
}

function doAttack() {
  const p = G.p;
  if (p.cd.attack > 0 || p.charging > 0 || p.whirl > 0) return;
  p.cd.attack = p.cdMax.attack;
  const t = nearestEnemy(42);
  if (t) face(p, t.x, t.y);
  p.swing = 0.2;
  SFX.swing();
  const ang = Math.atan2(p.fy, p.fx);
  G.fx.push({ type: 'arc', x: p.x, y: p.y - 6, ang, t: 0.16, T: 0.16, r: 19 });
  let hits = 0;
  for (const e of G.enemies) {
    if (e.dead || !e.active) continue;
    const d = dist(p, e);
    if (d < 22 + e.r && (d < 8 || angDiff(Math.atan2(e.y - p.y, e.x - p.x), ang) < 1.25)) {
      damageEnemy(e, p.weapon.dmg, 1);
      hits++;
    }
  }
  if (hits) gainRage(7 + Math.min(hits - 1, 2) * 3);
}
function doCharge() {
  const p = G.p;
  if (p.cd.charge > 0 || p.charging > 0 || p.whirl > 0) return;
  const t = nearestEnemy(130);
  p.cd.charge = p.cdMax.charge;
  p.charging = t ? 0.5 : 0.18;
  p.chargeTarget = t;
  p.inv = Math.max(p.inv, 0.5);
  if (t) face(p, t.x, t.y);
  SFX.charge();
  G.shake = Math.max(G.shake, 2);
}
function doWhirl() {
  const p = G.p;
  if (p.cd.whirl > 0 || p.rage < 35 || p.charging > 0 || p.whirl > 0) { if (p.rage < 35 && p.cd.whirl <= 0) toast('Pas assez de rage', '#ff8a7a', 0.8); return; }
  p.rage -= 35; p.cd.whirl = p.cdMax.whirl; p.whirl = 0.45; p.whirlHit = new Set();
  SFX.whirl();
}
function doPotion() {
  const p = G.p;
  if (p.cd.potion > 0) return;
  if (p.potions <= 0) { toast('Plus de potion', '#ff8a7a', 0.8); return; }
  if (p.hp >= p.maxHp) { toast('Tu es déjà en pleine forme', '#cfc3e0', 0.8); return; }
  p.potions--; p.cd.potion = p.cdMax.potion;
  const heal = Math.round(p.maxHp * 0.4);
  p.hp = Math.min(p.maxHp, p.hp + heal);
  floatText(p.x, p.y - 22, '+' + heal, '#5fe06a', 9);
  for (let i = 0; i < 14; i++) G.parts.push({ x: p.x + rand(-6, 6), y: p.y - rand(0, 16), vx: rand(-8, 8), vy: rand(-30, -10), life: rand(0.4, 0.8), c: pick(['#5fe06a', '#b6ff9a', '#ffffff']), s: 1 });
  SFX.potion();
  updateHUD();
}
function gainRage(n) { G.p.rage = Math.min(100, G.p.rage + n); }

function damageEnemy(e, base, mult, opt = {}) {
  if (e.dead) return;
  const crit = Math.random() < 0.12;
  const dmg = Math.max(1, Math.round(base * mult * rand(0.9, 1.1) * (crit ? 2 : 1)));
  e.hp -= dmg; e.flash = 0.12;
  const a = Math.atan2(e.y - G.p.y, e.x - G.p.x);
  const kb = (opt.kb || 90) * (e.d.elite ? 0.25 : 1);
  e.kvx = Math.cos(a) * kb; e.kvy = Math.sin(a) * kb;
  if (e.state === 'windup' && !e.d.elite && e.d.ranged) e.state = 'chase';
  floatText(e.x + rand(-4, 4), e.y - sprH(e) - 2, String(dmg), crit ? '#ffe14a' : '#ffffff', crit ? 11 : 8, crit);
  for (let i = 0; i < (crit ? 10 : 5); i++) G.parts.push({ x: e.x, y: e.y - 6, vx: Math.cos(a) * rand(20, 70) + rand(-20, 20), vy: Math.sin(a) * rand(20, 70) + rand(-30, 10), life: rand(0.15, 0.35), c: pick(['#ffffff', '#ffd27a', '#ff9a4a']), s: 1 });
  if (crit) { SFX.crit(); G.freeze = 0.06; G.shake = Math.max(G.shake, 3); } else SFX.hit();
  if (e.hp <= 0) killEnemy(e);
}
const sprH = (e) => (e.d.elite ? 32 : e.kind === 'mimic' ? 14 : 18);

function killEnemy(e) {
  e.dead = true;
  G.p.kills++;
  SFX.die();
  for (let i = 0; i < 16; i++) G.parts.push({ x: e.x, y: e.y - 6, vx: rand(-40, 40), vy: rand(-50, 10), life: rand(0.3, 0.7), c: pick(['#5a4a6a', '#8a7a9a', '#2a2030']), s: rand(1, 2) });
  const [g0, g1] = e.d.gold;
  const coins = randi(g0, g1);
  for (let i = 0; i < Math.min(coins, 8); i++) G.pickups.push({ type: 'coin', value: Math.ceil(coins / Math.min(coins, 8)), x: e.x, y: e.y, vx: rand(-50, 50), vy: rand(-50, 50), t: 0 });
  if (Math.random() < (e.d.elite ? 1 : 0.07)) G.pickups.push({ type: 'potion', x: e.x, y: e.y, vx: rand(-30, 30), vy: rand(-30, 30), t: 0 });
  if (e.d.elite) { G.shake = 6; G.freeze = 0.12; }
  const room = e.room;
  if (room && room.enemies.every((x) => x.dead)) roomCleared(room);
}

function hurtPlayer(dmg, from) {
  const p = G.p;
  if (p.inv > 0 || state !== 'play') return;
  p.hp -= dmg; p.inv = 0.6; p.hurtT = 0.25;
  gainRage(6);
  G.shake = Math.max(G.shake, 4);
  floatText(p.x, p.y - 22, '-' + dmg, '#ff4a3a', 9);
  SFX.hurt();
  if (from) { const a = Math.atan2(p.y - from.y, p.x - from.x); p.kvx = Math.cos(a) * 110; p.kvy = Math.sin(a) * 110; }
  updateHUD();
  if (p.hp <= 0) { p.hp = 0; playerDeath(); }
}

// ============================================================
// 9. SALLES : verrouillage, butin, faille
// ============================================================
function enterRoom(room) {
  room.visited = true;
  const alive = room.enemies.filter((e) => !e.dead);
  if (alive.length && !room.cleared) {
    alive.forEach((e) => { e.active = true; e.cd = rand(0.5, 1.1); });
    room.locked = true; room.lockT = 0.3;
    for (const d of room.doors) G.barrier[d.y * MW + d.x] = 1;
    // s'assurer que le joueur n'est pas coincé dans une herse
    if (blocked(G.p.x, G.p.y, G.p.r)) { const c = { x: (room.x + room.w / 2) * TILE, y: (room.y + room.h / 2) * TILE }; const a = Math.atan2(c.y - G.p.y, c.x - G.p.x); G.p.x += Math.cos(a) * 10; G.p.y += Math.sin(a) * 10; }
    SFX.lock();
    const elite = alive.find((e) => e.d.elite);
    toast(elite ? `☠ ${elite.d.name} ☠` : 'La salle se verrouille !', elite ? '#ff6a5a' : '#ffb07a', 1.4);
  } else if (!room.enemies.length) room.cleared = true;
  if (room.type === 'vault' && room.sealed) toast('Salle scellée', '#ffcf4a', 1);
}
function roomCleared(room) {
  room.cleared = true;
  if (room.locked) {
    room.locked = false; room.lockT = 0.3;
    for (const d of room.doors) if (G.barrier[d.y * MW + d.x] === 1) G.barrier[d.y * MW + d.x] = 0;
    SFX.unlock();
    toast('Salle nettoyée', '#9affa0', 1.1);
  }
  if (room.type === 'exit') {
    G.portal = { x: (room.x + room.w / 2) * TILE, y: (room.y + room.h / 2) * TILE + 6, t: 0 };
    SFX.portal();
    setTimeout(() => toast('Une faille s’ouvre… entre pour descendre', '#c9a2ff', 2.2), 900);
  }
}
function openChest(c) {
  c.open = true; c.t = 0;
  const p = G.p;
  if (c.mimic) {
    const room = roomAt(c.x, c.y);
    G.chests.splice(G.chests.indexOf(c), 1);
    const hpM = 1 + 0.22 * (G.floorN - 1), dmM = 1 + 0.15 * (G.floorN - 1);
    const e = spawnEnemy('mimic', c.x, c.y, room, hpM, dmM);
    e.active = true; e.cd = 0.25; e.state = 'windup'; e.t = 0.45;
    if (room) { room.cleared = false; room.locked = false; enterRoom(room); }
    toast('Un mimic !', '#ff6a5a', 1.2);
    G.shake = 5; SFX.hurt();
    return;
  }
  SFX.chest();
  const coins = c.big ? randi(12, 20) : randi(4, 9);
  for (let i = 0; i < coins; i++) G.pickups.push({ type: 'coin', value: 1 + Math.floor(G.floorN / 2), x: c.x, y: c.y - 4, vx: rand(-60, 60), vy: rand(-40, 70), t: 0 });
  if (c.big || Math.random() < 0.35) G.pickups.push({ type: 'potion', x: c.x, y: c.y, vx: rand(-40, 40), vy: rand(20, 60), t: 0 });
  if (c.big || Math.random() < 0.55) {
    const r = rollRarity(c.big ? [0, 0, 0, 55, 35, 10] : [18, 38, 28, 12, 3.5, 0.5]);
    G.pickups.push({ type: 'weapon', w: makeWeapon(G.floorN, r), x: c.x, y: c.y, vx: rand(-20, 20), vy: rand(30, 60), t: 0 });
  }
  for (let i = 0; i < 18; i++) G.parts.push({ x: c.x, y: c.y - 6, vx: rand(-40, 40), vy: rand(-70, -10), life: rand(0.4, 0.9), c: pick(['#ffe14a', '#fff6c0', '#ffb84a']), s: 1 });
}
function collect(k) {
  const p = G.p;
  if (k.type === 'coin') { p.gold += k.value; SFX.coin(); updateHUD(); }
  if (k.type === 'potion') { if (p.potions >= 5) return false; p.potions++; toast('Potion de soin', '#ff6a6a', 1); SFX.coin(); updateHUD(); }
  if (k.type === 'key') { p.keys++; toast('Clé de la Faille obtenue !', '#ffcf4a', 1.6); SFX.key(); updateHUD(); }
  if (k.type === 'weapon') {
    const w = k.w, R = RARITY[w.rarity];
    if (w.dmg > p.weapon.dmg) {
      p.weapon = w; refreshIcons();
      toast(`<span style="color:${R.color}">[${w.name}]</span><br>${R.name} · ${w.dmg} dégâts (équipée)`, '#fff', 2.4);
    } else {
      const val = Math.max(2, Math.round(w.dmg * 0.8));
      p.gold += val;
      toast(`<span style="color:${R.color}">[${w.name}]</span> ${w.dmg} dég.<br>moins bonne : vendue ${val} or`, '#fff', 2.2);
    }
    SFX.loot(w.rarity);
    updateHUD();
  }
  return true;
}
function tryOpenVault() {
  const room = G.D.vault;
  if (!room || !room.sealed) return;
  const near = room.doors.some((d) => Math.hypot(d.x * TILE + 8 - G.p.x, d.y * TILE + 8 - G.p.y) < 20);
  if (!near) return;
  if (G.p.keys > 0) {
    G.p.keys--; room.sealed = false;
    for (const d of room.doors) G.barrier[d.y * MW + d.x] = 0;
    SFX.unlock(); SFX.key();
    toast('La porte scellée s’ouvre !', '#ffcf4a', 1.5);
    for (const d of room.doors) for (let i = 0; i < 8; i++) G.parts.push({ x: d.x * TILE + 8, y: d.y * TILE + 8, vx: rand(-40, 40), vy: rand(-40, 40), life: rand(0.3, 0.7), c: '#ffcf4a', s: 1 });
    updateHUD();
  } else if (!G.vaultMsgT || G.time - G.vaultMsgT > 3) {
    G.vaultMsgT = G.time;
    toast('Porte scellée : il te faut une clé', '#ffcf4a', 1.6);
  }
}

function nextFloor() {
  state = 'trans';
  $('fade').classList.add('on');
  SFX.portal();
  setTimeout(() => {
    const p = G.p;
    p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.25));
    p.rage = 0; p.charging = 0; p.whirl = 0;
    enterFloor(G.floorN + 1, (Math.random() * 1e9) | 0);
    updateHUD(true);
    $('fade').classList.remove('on');
    toast(`Étage ${G.floorN}`, '#c9a2ff', 1.8);
    state = 'play';
  }, 450);
}

function saveRun() {
  const p = G.p;
  store.set('rw_run', { floor: G.floorN, seed: G.D.seed, hp: p.hp, maxHp: p.maxHp, weapon: p.weapon, potions: p.potions, gold: p.gold, kills: p.kills });
}
function playerDeath() {
  state = 'dead';
  SFX.death();
  const p = G.p;
  meta.gold += p.gold; saveMeta();
  store.del('rw_run');
  setTimeout(() => {
    $('deathText').innerHTML = `Étage atteint : <b>${G.floorN}</b><br>Ennemis vaincus : <b>${p.kills}</b><br>Or ramassé : <b style="color:var(--gold)">${p.gold}</b><br><small style="color:var(--muted)">Ton or est mis de côté pour le futur camp.</small>`;
    showScreen('death');
  }, 900);
}

// ============================================================
// 10. MISE À JOUR
// ============================================================
function update(dt) {
  G.time += dt;
  const p = G.p;
  if (G.freeze > 0) { G.freeze -= dt; return; }

  for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);
  p.inv = Math.max(0, p.inv - dt); p.hurtT = Math.max(0, p.hurtT - dt); p.swing = Math.max(0, p.swing - dt);
  if (input.attackHeld) doAttack();

  // --- déplacement ---
  let mx = input.mx, my = input.my;
  const k = input.keys;
  if (k.ArrowLeft || k.KeyA || k.KeyQ) mx = -1;
  if (k.ArrowRight || k.KeyD) mx = 1;
  if (k.ArrowUp || k.KeyW || k.KeyZ) my = -1;
  if (k.ArrowDown || k.KeyS) my = 1;
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  p.moving = ml > 0.1;
  if (p.charging > 0) {
    p.charging -= dt;
    const t = p.chargeTarget;
    let ax = p.fx, ay = p.fy;
    if (t && !t.dead) { face(p, t.x, t.y); ax = p.fx; ay = p.fy; }
    const sp = 270 * dt;
    const hit = move(p, ax * sp, ay * sp);
    p.trail.push({ x: p.x, y: p.y, t: 0.25 });
    if (t && !t.dead && dist(p, t) < 12 + t.r) {
      p.charging = 0;
      damageEnemy(t, p.weapon.dmg, 0.7, { kb: 160 });
      if (!t.dead) { t.stun = 1.3; t.state = 'chase'; floatText(t.x, t.y - sprH(t) - 10, 'Étourdi', '#ffe9a0', 7); }
      gainRage(20); G.shake = 4;
    } else if (hit && !t) p.charging = 0;
    if (p.charging <= 0 && t && !t.dead && dist(p, t) >= 12 + t.r) gainRage(5);
  } else {
    const speed = p.whirl > 0 ? 45 : 72;
    if (p.moving) {
      move(p, mx * speed * dt, my * speed * dt);
      if (p.swing <= 0 && p.whirl <= 0) { p.fx = mx / (ml || 1); p.fy = my / (ml || 1); if (Math.abs(mx) > 0.15) p.dir = mx > 0 ? 1 : -1; }
      if (Math.random() < dt * 8) G.parts.push({ x: p.x + rand(-3, 3), y: p.y + 2, vx: rand(-6, 6), vy: rand(-8, -2), life: 0.35, c: 'rgba(170,150,190,.6)', s: 1 });
    }
  }
  if (p.kvx || p.kvy) { move(p, p.kvx * dt, p.kvy * dt); p.kvx *= Math.pow(0.0005, dt); p.kvy *= Math.pow(0.0005, dt); if (Math.abs(p.kvx) + Math.abs(p.kvy) < 2) p.kvx = p.kvy = 0; }
  p.anim += dt * (p.moving || p.charging > 0 ? 10 : 5);
  for (const tr of p.trail) tr.t -= dt;
  p.trail = p.trail.filter((tr) => tr.t > 0);

  if (p.whirl > 0) {
    p.whirl -= dt;
    for (const e of G.enemies) {
      if (e.dead || !e.active || p.whirlHit.has(e)) continue;
      if (dist(p, e) < 28 + e.r) { p.whirlHit.add(e); damageEnemy(e, p.weapon.dmg, 1.45, { kb: 140 }); }
    }
    if (Math.random() < dt * 30) { const a = rand(0, 6.28); G.parts.push({ x: p.x + Math.cos(a) * 22, y: p.y - 6 + Math.sin(a) * 16, vx: -Math.sin(a) * 60, vy: Math.cos(a) * 60, life: 0.2, c: '#ffffff', s: 1 }); }
  }

  // rage qui retombe hors combat
  if (!G.room || !G.room.locked) p.rage = Math.max(0, p.rage - dt * 4);

  // --- salles ---
  const room = roomAt(p.x, p.y);
  if (room !== G.room) {
    G.room = room;
    if (room) {
      const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
      const inside = tx > room.x && tx < room.x + room.w - 1 && ty > room.y && ty < room.y + room.h - 1;
      if (inside) enterRoom(room); else G.room = null; // on attend d'être vraiment dedans
    }
  }
  if (G.D.vault && G.D.vault.sealed) tryOpenVault();
  for (const r of G.D.rooms) if (r.lockT > 0) r.lockT -= dt;

  // exploration (mini-carte)
  const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
  for (let y = pty - 5; y <= pty + 5; y++) for (let x = ptx - 6; x <= ptx + 6; x++) if (x >= 0 && y >= 0 && x < MW && y < MH) G.explored[y * MW + x] = 1;

  // --- ennemis ---
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt);
    e.anim += dt * (e.moving ? 9 : 5);
    e.moving = false;
    if (e.kvx || e.kvy) { move(e, e.kvx * dt, e.kvy * dt); e.kvx *= Math.pow(0.001, dt); e.kvy *= Math.pow(0.001, dt); if (Math.abs(e.kvx) + Math.abs(e.kvy) < 3) e.kvx = e.kvy = 0; }
    if (!e.active) continue;
    if (e.stun > 0) { e.stun -= dt; continue; }
    const d = dist(e, p);
    const ax = (p.x - e.x) / (d || 1), ay = (p.y - e.y) / (d || 1);
    if (Math.abs(ax) > 0.2 && e.state !== 'windup') e.dir = ax > 0 ? 1 : -1;
    e.cd -= dt;
    if (e.d.elite) e.slamCd -= dt;
    if (e.state === 'chase') {
      let vx = 0, vy = 0;
      if (e.d.ranged) {
        if (d > e.d.ranged + 10) { vx = ax; vy = ay; } else if (d < e.d.ranged - 18) { vx = -ax; vy = -ay; } else { vx = -ay * 0.6; vy = ax * 0.6; }
        if (e.cd <= 0 && d < 150) { e.state = 'windup'; e.t = e.d.windup; }
      } else {
        if (e.d.elite && e.slamCd <= 0 && d < 60) {
          e.state = 'slam'; e.t = 1.0; e.slamCd = rand(4.5, 6);
          G.tele.push({ x: e.x, y: e.y, r: 38, t: 1.0, T: 1.0, owner: e });
        } else if (d < e.d.reach + e.r + p.r && e.cd <= 0) { e.state = 'windup'; e.t = e.d.windup; }
        else if (d > e.d.reach * 0.7) { vx = ax; vy = ay; }
      }
      // séparation
      for (const o of G.enemies) {
        if (o === e || o.dead || !o.active) continue;
        const od = dist(e, o), min = e.r + o.r + 2;
        if (od < min && od > 0) { vx += (e.x - o.x) / od * 0.8; vy += (e.y - o.y) / od * 0.8; }
      }
      const vl = Math.hypot(vx, vy);
      if (vl > 0.05) { move(e, vx / Math.max(1, vl) * e.d.spd * dt, vy / Math.max(1, vl) * e.d.spd * dt); e.moving = true; }
    } else if (e.state === 'windup') {
      e.t -= dt;
      if (e.t <= 0) {
        if (e.d.ranged) {
          const sp = e.d.proj;
          G.projs.push({ x: e.x, y: e.y - 8, vx: ax * sp, vy: ay * sp, dmg: e.dmg, life: 3, owner: e });
          SFX.shoot();
          e.cd = rand(1.6, 2.4);
        } else {
          // petite ruée vers l'avant
          e.kvx = ax * 70; e.kvy = ay * 70;
          if (d < e.d.reach + e.r + p.r + 7) hurtPlayer(e.dmg, e);
          G.fx.push({ type: 'claw', x: e.x + ax * 10, y: e.y - 6 + ay * 8, ang: Math.atan2(ay, ax), t: 0.15, T: 0.15 });
          e.cd = rand(0.8, 1.3) * (e.d.elite ? 1.2 : 1);
        }
        e.state = 'recover'; e.t = 0.3;
      }
    } else if (e.state === 'slam') {
      e.t -= dt;
      if (e.t <= 0) {
        SFX.slam(); G.shake = 7;
        if (dist(e, p) < 38 + p.r) hurtPlayer(Math.round(e.dmg * 1.4), e);
        for (let i = 0; i < 26; i++) { const a = rand(0, 6.28), r = rand(0, 36); G.parts.push({ x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r * 0.7, vx: Math.cos(a) * 30, vy: -rand(20, 60), life: rand(0.3, 0.6), c: pick(['#6a5a4a', '#9a8a7a', '#ff6a3a']), s: rand(1, 2) }); }
        e.state = 'recover'; e.t = 0.6;
      }
    } else if (e.state === 'recover') {
      e.t -= dt;
      if (e.t <= 0) e.state = 'chase';
    }
  }
  G.tele = G.tele.filter((t) => { t.t -= dt; if (t.owner) { t.x = t.owner.x; t.y = t.owner.y; } return t.t > 0 && !(t.owner && (t.owner.dead || t.owner.state !== 'slam')); });

  // --- projectiles ---
  for (const pr of G.projs) {
    pr.life -= dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (Math.random() < dt * 30) G.parts.push({ x: pr.x, y: pr.y, vx: rand(-5, 5), vy: rand(-5, 5), life: 0.25, c: pick(['#ff9a3a', '#ffd04a']), s: 1 });
    if (solidAt(pr.x, pr.y + 6)) pr.life = 0;
    else if (Math.hypot(pr.x - p.x, pr.y - (p.y - 6)) < 7) { hurtPlayer(pr.dmg, pr); pr.life = 0; }
    if (pr.life <= 0) for (let i = 0; i < 6; i++) G.parts.push({ x: pr.x, y: pr.y, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.25, c: '#ff8a3a', s: 1 });
  }
  G.projs = G.projs.filter((pr) => pr.life > 0);

  // --- coffres ---
  for (const c of G.chests) {
    c.t += dt;
    if (!c.open && Math.hypot(c.x - p.x, c.y - p.y) < 14) { openChest(c); break; }
  }

  // --- objets au sol ---
  for (const k2 of G.pickups) {
    k2.t += dt;
    if (k2.vx || k2.vy) {
      const nx = k2.x + k2.vx * dt, ny = k2.y + k2.vy * dt;
      if (!solidAt(nx, k2.y)) k2.x = nx; else k2.vx *= -0.5;
      if (!solidAt(k2.x, ny)) k2.y = ny; else k2.vy *= -0.5;
      k2.vx *= Math.pow(0.02, dt); k2.vy *= Math.pow(0.02, dt);
      if (Math.abs(k2.vx) + Math.abs(k2.vy) < 3) k2.vx = k2.vy = 0;
    }
    const d = Math.hypot(k2.x - p.x, k2.y - p.y);
    if (k2.t > 0.35 && k2.type === 'coin' && d < 36) { k2.x += (p.x - k2.x) * dt * 8; k2.y += (p.y - 4 - k2.y) * dt * 8; }
    if (k2.t > 0.3 && d < 10) { if (collect(k2)) k2.done = true; }
  }
  G.pickups = G.pickups.filter((k2) => !k2.done);

  // --- faille ---
  if (G.portal) {
    G.portal.t += dt;
    if (G.portal.t > 0.8 && Math.hypot(G.portal.x - p.x, G.portal.y - p.y) < 10) { nextFloor(); return; }
  }

  // --- effets ---
  for (const f of G.fx) f.t -= dt;
  G.fx = G.fx.filter((f) => f.t > 0);
  for (const pt of G.parts) { pt.life -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.92; pt.vy *= 0.92; }
  G.parts = G.parts.filter((pt) => pt.life > 0);
  if (G.parts.length > 400) G.parts.splice(0, G.parts.length - 400);
  for (const t of G.texts) { t.t -= dt; t.y += t.vy * dt; t.vy *= 0.9; }
  G.texts = G.texts.filter((t) => t.t > 0);
  G.shake = Math.max(0, G.shake - dt * 18);

  // caméra
  const lx = p.x + (p.moving ? p.fx * 14 : 0), ly = p.y - 8 + (p.moving ? p.fy * 14 : 0);
  G.cam.x = lerp(G.cam.x, lx, 1 - Math.pow(0.002, dt));
  G.cam.y = lerp(G.cam.y, ly, 1 - Math.pow(0.002, dt));
}
function floatText(x, y, text, color, size, crit) { G.texts.push({ x, y, text, color, size, t: crit ? 0.9 : 0.7, T: crit ? 0.9 : 0.7, vy: -38, crit }); }

// ============================================================
// 11. RENDU
// ============================================================
let mapCv = null;
function prerenderMap() {
  const D = G.D;
  mapCv = document.createElement('canvas');
  mapCv.width = MW * TILE; mapCv.height = MH * TILE;
  const m = mapCv.getContext('2d');
  m.imageSmoothingEnabled = false;
  m.fillStyle = '#07050b'; m.fillRect(0, 0, mapCv.width, mapCv.height);
  const F = (x, y) => isFloor(x, y);
  const face = (x, y) => !F(x, y) && (F(x, y + 1) || F(x, y - 1)) && x >= 0 && y >= 0 && x < MW && y < MH;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (F(x, y)) spr(m, 'floor_' + D.floorVar[y * MW + x], x * TILE, y * TILE);
  }
  for (const pr of D.props) spr(m, pr.s, pr.x * TILE, pr.y * TILE);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (face(x, y)) {
      const r = D.floorVar[y * MW + x];
      spr(m, F(x, y + 1) && r === 7 ? 'wall_hole_1' : F(x, y + 1) && r === 8 ? 'wall_hole_2' : 'wall_mid', x * TILE, y * TILE);
    }
  }
  for (const b of D.banners) spr(m, b.s, b.x * TILE, b.y * TILE);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const v = !F(x, y);
    if (!v) continue;
    const isFace = face(x, y);
    if (!isFace && face(x, y + 1) && F(x, y + 2)) spr(m, 'wall_top_mid', x * TILE, y * TILE);
    if (isFace && F(x, y - 1)) spr(m, 'wall_top_mid', x * TILE, (y - 1) * TILE);
    if (F(x + 1, y) && !isFace) spr(m, 'wall_side_mid_left', x * TILE, y * TILE);
    if (F(x - 1, y) && !isFace) spr(m, 'wall_side_mid_right', x * TILE, y * TILE);
    if (!isFace) {
      if ((F(x + 1, y + 1) || face(x + 1, y + 1)) && !F(x + 1, y) && !F(x, y + 1) && !face(x, y + 1)) spr(m, 'wall_side_top_left', x * TILE, y * TILE);
      if ((F(x - 1, y + 1) || face(x - 1, y + 1)) && !F(x - 1, y) && !F(x, y + 1) && !face(x, y + 1)) spr(m, 'wall_side_top_right', x * TILE, y * TILE);
    }
  }
}

function render() {
  const p = G.p;
  const sx = (Math.random() - 0.5) * G.shake, sy = (Math.random() - 0.5) * G.shake;
  const cx = Math.round(G.cam.x - VW / 2 + sx), cy = Math.round(G.cam.y - VH / 2 + sy);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#07050b'; ctx.fillRect(0, 0, VW, VH);
  // carte
  const srcX = clamp(cx, 0, mapCv.width), srcY = clamp(cy, 0, mapCv.height);
  const w = Math.min(VW - (srcX - cx), mapCv.width - srcX), h = Math.min(VH - (srcY - cy), mapCv.height - srcY);
  if (w > 0 && h > 0) ctx.drawImage(mapCv, srcX, srcY, w, h, srcX - cx, srcY - cy, w, h);
  ctx.translate(-cx, -cy);
  const t = G.time;

  // herses et portes scellées
  for (const r of G.D.rooms) for (const d of r.doors) {
    const b = G.barrier[d.y * MW + d.x];
    const x = d.x * TILE, y = d.y * TILE;
    if (b === 1 || (r.lockT > 0 && !r.locked)) {
      const f = r.lockT > 0 ? (r.locked ? 3 - Math.floor(r.lockT / 0.3 * 3.9) : Math.floor(r.lockT / 0.3 * 3.9)) : 3;
      spr(ctx, 'floor_spikes_anim_f' + clamp(f, 0, 3), x, y);
    } else if (b === 2) {
      ctx.fillStyle = '#1a1206'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#c99a2e';
      for (let i = 1; i < TILE; i += 4) ctx.fillRect(x + i, y, 2, TILE);
      ctx.fillRect(x, y + 3, TILE, 2); ctx.fillRect(x, y + 11, TILE, 2);
      ctx.fillStyle = '#ffe58a'; for (let i = 1; i < TILE; i += 4) ctx.fillRect(x + i, y, 1, TILE);
    }
  }
  if (G.D.vault && G.D.vault.sealed) {
    const d = G.D.vault.doors[0];
    const bob = Math.sin(t * 3) * 1.5;
    spr(ctx, 'key', d.x * TILE + (G.D.vault.doors[1].x !== d.x ? 8 : 0), d.y * TILE - 2 + bob + (G.D.vault.doors[1].y !== d.y ? 8 : 0), { img: undefined });
  }

  // télégraphes au sol (attaques de zone)
  for (const tl of G.tele) {
    const k = 1 - tl.t / tl.T;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 20);
    ctx.fillStyle = '#ff2a1a';
    ctx.beginPath(); ctx.ellipse(tl.x, tl.y, tl.r * k, tl.r * k * 0.7, 0, 0, 6.29); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ff6a4a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(tl.x, tl.y, tl.r, tl.r * 0.7, 0, 0, 6.29); ctx.stroke();
    ctx.restore();
  }

  // faille
  if (G.portal) {
    const k = Math.min(1, G.portal.t / 0.8);
    ctx.save(); ctx.globalAlpha = k;
    spr(ctx, 'portal_f' + (Math.floor(t * 8) % 4), G.portal.x - 8, G.portal.y - 22);
    ctx.restore();
  }

  // liste d'affichage triée par profondeur
  const list = [];
  for (const c of G.chests) list.push({ y: c.y, f: () => drawChest(c) });
  for (const k2 of G.pickups) list.push({ y: k2.y - 1, f: () => drawPickup(k2) });
  for (const e of G.enemies) if (!e.dead) list.push({ y: e.y, f: () => drawEnemy(e) });
  list.push({ y: p.y, f: drawPlayer });
  list.sort((a, b) => a.y - b.y);
  for (const it of list) it.f();

  // torches (sur les murs)
  for (const to of G.D.torches) {
    if (Math.abs(to.x - G.cam.x) > VW || Math.abs(to.y - G.cam.y) > VH) continue;
    spr(ctx, 'torch_f' + (Math.floor(t * 9 + to.x) % 3), to.x - 3, to.y - 4);
  }
  // projectiles
  for (const pr of G.projs) {
    ctx.fillStyle = '#ff7a2a'; ctx.fillRect(Math.round(pr.x) - 2, Math.round(pr.y) - 2, 4, 4);
    ctx.fillStyle = '#ffe07a'; ctx.fillRect(Math.round(pr.x) - 1, Math.round(pr.y) - 1, 2, 2);
  }
  // effets
  for (const f of G.fx) {
    const k = f.t / f.T;
    if (f.type === 'arc') {
      ctx.save(); ctx.globalAlpha = k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      const a0 = f.ang - 1.2, a1 = f.ang - 1.2 + 2.4 * (1 - k * 0.6);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, a0, a1); ctx.stroke();
      ctx.globalAlpha = k * 0.5; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(f.x, f.y, f.r - 3, a0 + 0.3, a1); ctx.stroke();
      ctx.restore();
    } else if (f.type === 'claw') {
      ctx.save(); ctx.globalAlpha = k; ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(f.x + Math.cos(f.ang + 1.57) * i * 3 - Math.cos(f.ang) * 5, f.y + Math.sin(f.ang + 1.57) * i * 3 - Math.sin(f.ang) * 5); ctx.lineTo(f.x + Math.cos(f.ang + 1.57) * i * 3 + Math.cos(f.ang) * 5, f.y + Math.sin(f.ang + 1.57) * i * 3 + Math.sin(f.ang) * 5); ctx.stroke(); }
      ctx.restore();
    }
  }
  // particules
  for (const pt of G.parts) {
    ctx.globalAlpha = Math.min(1, pt.life * 3);
    ctx.fillStyle = pt.c;
    ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.s, pt.s);
  }
  ctx.globalAlpha = 1;

  renderLights(cx, cy);

  // textes de combat (au-dessus de l'obscurité)
  ctx.setTransform(1, 0, 0, 1, -cx, -cy);
  ctx.textAlign = 'center';
  for (const tx of G.texts) {
    const k = tx.t / tx.T;
    const s = tx.crit ? tx.size * (1 + Math.max(0, (k - 0.8)) * 3) : tx.size;
    ctx.font = `700 ${Math.round(s)}px Pixel, monospace`;
    ctx.globalAlpha = Math.min(1, k * 2.5);
    ctx.lineWidth = 2; ctx.strokeStyle = '#000';
    ctx.strokeText(tx.text, Math.round(tx.x), Math.round(tx.y));
    ctx.fillStyle = tx.color; ctx.fillText(tx.text, Math.round(tx.x), Math.round(tx.y));
  }
  ctx.globalAlpha = 1;
  // barres de vie des ennemis blessés
  for (const e of G.enemies) {
    if (e.dead || e.hp >= e.maxHp || !e.active) continue;
    const bw = e.d.elite ? 26 : 14, bx = Math.round(e.x - bw / 2), by = Math.round(e.y - sprH(e) - 6);
    ctx.fillStyle = '#000'; ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
    ctx.fillStyle = '#5a1010'; ctx.fillRect(bx, by, bw, 2);
    ctx.fillStyle = e.d.elite ? '#ff8a2a' : '#e8402a'; ctx.fillRect(bx, by, Math.ceil(bw * e.hp / e.maxHp), 2);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // voile rouge quand on est touché
  if (p.hurtT > 0) { ctx.fillStyle = `rgba(200,20,20,${p.hurtT * 0.8})`; ctx.fillRect(0, 0, VW, VH); }
  if (p.hp / p.maxHp < 0.3 && state === 'play') {
    const a = 0.12 + 0.08 * Math.sin(t * 5);
    const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.max(VW, VH) * 0.7);
    g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(150,0,0,${a * 3})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  }
}

function shadow(x, y, w) {
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y + 1), w, w * 0.4, 0, 0, 6.29); ctx.fill();
}
function drawPlayer() {
  const p = G.p;
  if (p.inv > 0 && p.hurtT <= 0 && p.charging <= 0 && Math.floor(G.time * 20) % 2) return;
  for (const tr of p.trail) {
    ctx.save(); ctx.globalAlpha = tr.t * 1.6;
    spr(ctx, 'knight_m_run_anim_f1', tr.x - 8, tr.y - 24, { flip: p.dir < 0, img: atlasWhite });
    ctx.restore();
  }
  shadow(p.x, p.y, 6);
  const fr = Math.floor(p.anim) % 4;
  const name = p.hurtT > 0 ? 'knight_m_hit_anim_f0' : (p.moving || p.charging > 0 ? 'knight_m_run_anim_f' : 'knight_m_idle_anim_f') + fr;
  const [, , sw, sh] = sprSize(name);
  const bx = p.x - sw / 2, by = p.y - sh + 3;
  // arme derrière si on regarde vers le haut
  const behind = p.fy < -0.5 && p.swing <= 0 && p.whirl <= 0;
  if (behind) drawWeapon();
  spr(ctx, name, bx, by, { flip: p.dir < 0, img: p.hurtT > 0.15 ? atlasWhite : atlas });
  if (!behind) drawWeapon();
}
function drawWeapon() {
  const p = G.p;
  const w = p.weapon.sprite;
  const [, , ww, wh] = sprSize(w);
  let ang;
  const base = Math.atan2(p.fy, p.fx);
  if (p.whirl > 0) ang = G.time * 28;
  else if (p.swing > 0) { const k = 1 - p.swing / 0.2; ang = base - 1.5 + 2.8 * (1 - Math.pow(1 - k, 3)); }
  else if (p.charging > 0) ang = base;
  else ang = p.dir > 0 ? -0.95 : -Math.PI + 0.95;
  const hx = p.x + (p.swing > 0 || p.whirl > 0 || p.charging > 0 ? 0 : p.dir * 4), hy = p.y - 7;
  ctx.save();
  ctx.translate(Math.round(hx), Math.round(hy));
  ctx.rotate(ang + Math.PI / 2);
  const r = SPR[w];
  ctx.drawImage(atlas, r[0], r[1], ww, wh, -ww / 2, -wh + 2, ww, wh);
  ctx.restore();
}
function drawEnemy(e) {
  const d = e.d;
  const fr = Math.floor(e.anim) % (d.noAnim ? 3 : 4);
  let name;
  if (e.kind === 'mimic') name = 'chest_mimic_open_anim_f' + (e.state === 'windup' ? 2 : fr % 3);
  else name = e.kind + (e.moving ? '_run_anim_f' : '_idle_anim_f') + fr;
  const [, , sw, sh] = sprSize(name);
  shadow(e.x, e.y, d.elite ? 12 : 5);
  const img = e.flash > 0 ? atlasWhite : atlas;
  const charging = e.state === 'windup' || e.state === 'slam';
  const ox = charging ? rand(-0.7, 0.7) : 0;
  spr(ctx, name, e.x - sw / 2 + ox, e.y - sh + 3, { flip: e.dir < 0, img });
  if (charging && e.flash <= 0) {
    // l'ennemi rougeoie : il prépare un coup
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.3 * Math.sin(G.time * 30);
    spr(ctx, name, e.x - sw / 2 + ox, e.y - sh + 3, { flip: e.dir < 0, img: atlasRed });
    ctx.restore();
    ctx.fillStyle = '#ff4a3a';
    const top = Math.round(e.y - sh - 3);
    ctx.fillRect(Math.round(e.x) - 1, top - 6, 2, 4); ctx.fillRect(Math.round(e.x) - 1, top - 1, 2, 2);
  }
  if (e.stun > 0) {
    for (let i = 0; i < 3; i++) {
      const a = G.time * 6 + i * 2.1;
      ctx.fillStyle = '#ffe58a';
      ctx.fillRect(Math.round(e.x + Math.cos(a) * 6), Math.round(e.y - sh + Math.sin(a) * 2), 2, 2);
    }
  }
  if (!e.active && e.room && G.room !== e.room) return;
}
function drawChest(c) {
  const fr = c.open ? Math.min(2, Math.floor(c.t / 0.1)) : 0;
  shadow(c.x, c.y, 7);
  spr(ctx, (c.open ? 'chest_empty_open_anim_f' : 'chest_full_open_anim_f') + (c.open ? fr : 0), c.x - 8, c.y - 14);
  if (c.big && !c.open) {
    if (Math.floor(G.time * 4) % 3 === 0) G.parts.push({ x: c.x + rand(-7, 7), y: c.y - rand(4, 14), vx: 0, vy: -10, life: 0.5, c: '#ffe58a', s: 1 });
  }
}
function drawPickup(k) {
  const bob = Math.sin(G.time * 4 + k.x) * 1.5;
  if (k.type === 'coin') spr(ctx, 'coin_anim_f' + (Math.floor(G.time * 8 + k.x) % 4), k.x - 4, k.y - 6);
  else if (k.type === 'potion') { shadow(k.x, k.y, 3); spr(ctx, 'flask_big_red', k.x - 8, k.y - 15 + bob); }
  else if (k.type === 'key') { shadow(k.x, k.y, 4); spr(ctx, 'key', k.x - 8, k.y - 16 + bob); }
  else if (k.type === 'weapon') {
    const [, , ww, wh] = sprSize(k.w.sprite);
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(G.time * 5);
    ctx.fillStyle = RARITY[k.w.rarity].color;
    ctx.beginPath(); ctx.ellipse(k.x, k.y, 7, 3, 0, 0, 6.29); ctx.fill();
    ctx.restore();
    spr(ctx, k.w.sprite, k.x - ww / 2, k.y - wh + bob, { rot: 0.6 });
  }
}

const LIGHT_COLORS = { player: [255, 190, 120], torch: [255, 140, 50], fire: [255, 120, 40], portal: [170, 110, 255], gold: [255, 210, 90], rare: [120, 160, 255] };
function renderLights(cx, cy) {
  const p = G.p, t = G.time;
  const lights = [];
  const fl = Math.sin(t * 13) * 2 + Math.sin(t * 7.3) * 2;
  lights.push([p.x, p.y - 8, 92 + fl, 'player', 0.16]);
  for (const to of G.D.torches) {
    if (Math.abs(to.x - G.cam.x) > VW / 2 + 70 || Math.abs(to.y - G.cam.y) > VH / 2 + 70) continue;
    lights.push([to.x, to.y + 4, 52 + Math.sin(t * 11 + to.x) * 3 + Math.sin(t * 5 + to.y) * 2, 'torch', 0.22]);
  }
  for (const pr of G.projs) lights.push([pr.x, pr.y, 26, 'fire', 0.35]);
  if (G.portal) lights.push([G.portal.x, G.portal.y - 10, 64 * Math.min(1, G.portal.t), 'portal', 0.3]);
  for (const k of G.pickups) if (k.type === 'key' || (k.type === 'weapon' && k.w.rarity >= 3)) lights.push([k.x, k.y - 6, 26, k.type === 'key' ? 'gold' : 'rare', 0.3]);
  for (const c of G.chests) if (c.big && !c.open) lights.push([c.x, c.y - 6, 30, 'gold', 0.25]);
  if (G.D.vault && G.D.vault.sealed) { const d = G.D.vault.doors[0]; lights.push([d.x * TILE + 8, d.y * TILE + 8, 30, 'gold', 0.2]); }
  for (const tl of G.tele) lights.push([tl.x, tl.y, tl.r + 10, 'fire', 0.25]);

  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.fillStyle = 'rgba(4,2,10,0.93)';
  lctx.fillRect(0, 0, VW, VH);
  lctx.globalCompositeOperation = 'destination-out';
  for (const [x, y, r] of lights) {
    const lx = x - cx, ly = y - cy;
    const g = lctx.createRadialGradient(lx, ly, 0, lx, ly, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g; lctx.fillRect(lx - r, ly - r, r * 2, r * 2);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(lightCv, 0, 0);
  // halo coloré (lumière chaude)
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, r, kind, a] of lights) {
    const [cr, cg, cb] = LIGHT_COLORS[kind];
    const lx = x - cx, ly = y - cy;
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 0.8);
    g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`); g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = g; ctx.fillRect(lx - r, ly - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ============================================================
// 12. INTERFACE (HUD)
// ============================================================
const mm = $('minimap'), mmc = mm.getContext('2d');
mm.width = MW; mm.height = MH;
let hudCache = {};
function updateHUD(force) {
  if (!G) return;
  const p = G.p;
  const set = (id, v, fn) => { if (force || hudCache[id] !== v) { hudCache[id] = v; fn(v); } };
  set('hp', p.hp + '/' + p.maxHp, () => { $('hpFill').style.transform = `scaleX(${p.hp / p.maxHp})`; $('hpText').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`; });
  set('gold', p.gold, (v) => { $('goldText').textContent = v; });
  set('keys', p.keys, (v) => { $('keyText').textContent = v; $('keyInv').style.opacity = v ? 1 : 0.35; });
  set('floor', G.floorN, (v) => { $('floorLabel').textContent = 'Étage ' + v; });
  set('pot', p.potions, (v) => { $('potionCount').textContent = v; });
}
function hudFrame() {
  const p = G.p;
  const rg = Math.floor(p.rage);
  if (hudCache.rage !== rg) { hudCache.rage = rg; $('rageFill').style.transform = `scaleX(${rg / 100})`; $('rageText').textContent = rg + ' rage'; }
  const btn = (id, cd, max, off) => {
    const el = $(id);
    const pct = max ? Math.round(cd / max * 100) : 0;
    if (el._p !== pct) { el._p = pct; el.querySelector('.cd').style.setProperty('--p', pct + '%'); if (pct === 0 && max > 1) { el.classList.remove('ready'); void el.offsetWidth; el.classList.add('ready'); } }
    if (el._off !== off) { el._off = off; el.classList.toggle('off', off); }
  };
  btn('btnAttack', p.cd.attack, p.cdMax.attack, false);
  btn('btnCharge', p.cd.charge, p.cdMax.charge, false);
  btn('btnWhirl', p.cd.whirl, p.cdMax.whirl, p.rage < 35);
  btn('btnPotion', p.cd.potion, p.cdMax.potion, p.potions <= 0);
  if (Math.floor(G.time * 6) !== hudCache.mmT) { hudCache.mmT = Math.floor(G.time * 6); drawMinimap(); }
}
function drawMinimap() {
  const D = G.D;
  const img = mmc.createImageData(MW, MH);
  const px = (x, y, r, g, b, a = 255) => { const i = (y * MW + x) * 4; img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a; };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x;
    if (!G.explored[i]) continue;
    if (D.tiles[i]) { const b = G.barrier[i]; if (b === 2) px(x, y, 255, 200, 60); else if (b === 1) px(x, y, 200, 60, 50); else px(x, y, 120, 100, 150); }
    else if (isFloor(x, y + 1) || isFloor(x, y - 1) || isFloor(x + 1, y) || isFloor(x - 1, y)) px(x, y, 45, 35, 60);
  }
  mmc.putImageData(img, 0, 0);
  const dot = (x, y, c, s = 2) => { mmc.fillStyle = c; mmc.fillRect(Math.floor(x / TILE) - (s >> 1), Math.floor(y / TILE) - (s >> 1), s, s); };
  for (const k of G.pickups) if (k.type === 'key' && G.explored[Math.floor(k.y / TILE) * MW + Math.floor(k.x / TILE)]) dot(k.x, k.y, '#ffd84a', 3);
  for (const c of G.chests) if (!c.open && G.explored[Math.floor(c.y / TILE) * MW + Math.floor(c.x / TILE)]) dot(c.x, c.y, '#e8a040', 2);
  if (G.portal) dot(G.portal.x, G.portal.y, '#c080ff', 3);
  const ex = D.exit;
  if (G.explored[(ex.y + 1) * MW + ex.x + 1] && !G.portal) { mmc.fillStyle = '#ff5a4a'; mmc.fillRect(ex.x + Math.floor(ex.w / 2) - 1, ex.y + Math.floor(ex.h / 2) - 1, 3, 3); }
  if (Math.floor(G.time * 3) % 2) dot(G.p.x, G.p.y, '#ffffff', 3); else dot(G.p.x, G.p.y, '#ffffff', 2);
}

let toastT = null;
function toast(html, color, secs) {
  const el = $('toast');
  el.innerHTML = html; el.style.color = color || '#fff';
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), (secs || 1.5) * 1000);
}

function drawIconTo(cv, fn) {
  const s = 32; cv.width = s; cv.height = s;
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, s, s); fn(c, s);
}
function refreshIcons() {
  const w = G ? G.p.weapon.sprite : 'weapon_regular_sword';
  drawIconTo($('btnAttack').querySelector('canvas'), (c) => { const [, , ww, wh] = sprSize(w); c.save(); c.translate(16, 16); c.rotate(0.75); const r = SPR[w]; const k = wh > 24 ? 0.8 : 1; c.drawImage(atlas, r[0], r[1], ww, wh, -ww * k / 2, -wh * k / 2, ww * k, wh * k); c.restore(); });
  drawIconTo($('btnCharge').querySelector('canvas'), (c) => {
    c.globalAlpha = 0.35; spr(c, 'knight_m_run_anim_f1', 1, 3, { img: atlasWhite }); c.globalAlpha = 0.6; spr(c, 'knight_m_run_anim_f1', 5, 3, { img: atlasWhite }); c.globalAlpha = 1; spr(c, 'knight_m_run_anim_f1', 10, 3);
  });
  drawIconTo($('btnWhirl').querySelector('canvas'), (c) => {
    c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.arc(16, 15, 11, 0.3, 5.2); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(26, 21); c.lineTo(29, 13); c.lineTo(22, 15); c.fill();
    spr(c, 'knight_m_idle_anim_f0', 8, 2);
  });
  drawIconTo($('btnPotion').querySelector('canvas'), (c) => spr(c, 'flask_big_red', 8, 6));
  document.querySelectorAll('.ico').forEach((el) => {
    const r = SPR[el.dataset.sprite]; if (!r) return;
    el.style.backgroundImage = `url(assets/atlas.png)`;
    el.style.backgroundPosition = `-${r[0]}px -${r[1]}px`;
    el.style.width = r[2] + 'px'; el.style.height = r[3] + 'px';
  });
}

// ============================================================
// 13. CONTRÔLES TACTILES
// ============================================================
function setupControls() {
  const zone = $('stickZone'), base = $('stickBase'), knob = $('stickKnob');
  let sid = null, ox = 0, oy = 0;
  const R = 44;
  zone.addEventListener('pointerdown', (e) => {
    audioUnlock();
    if (sid !== null) return;
    sid = e.pointerId; ox = e.clientX; oy = e.clientY;
    base.style.left = ox + 'px'; base.style.top = oy + 'px';
    base.classList.add('on'); knob.style.transform = '';
    zone.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== sid) return;
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const l = Math.hypot(dx, dy);
    if (l > R) { // le joystick suit le doigt
      ox += dx - dx / l * R; oy += dy - dy / l * R; dx = dx / l * R; dy = dy / l * R;
      base.style.left = ox + 'px'; base.style.top = oy + 'px';
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.hypot(dx, dy) / R;
    if (m < 0.18) { input.mx = input.my = 0; } else { input.mx = dx / R; input.my = dy / R; }
  });
  const end = (e) => { if (e.pointerId !== sid) return; sid = null; input.mx = input.my = 0; base.classList.remove('on'); };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

  const bind = (id, fn, hold) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); audioUnlock();
      el.classList.add('pressed');
      if (state === 'play') fn();
      if (hold) input.attackHeld = true;
      el.setPointerCapture(e.pointerId);
    });
    const up = () => { el.classList.remove('pressed'); if (hold) input.attackHeld = false; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  bind('btnAttack', doAttack, true);
  bind('btnCharge', doCharge);
  bind('btnWhirl', doWhirl);
  bind('btnPotion', doPotion);

  window.addEventListener('keydown', (e) => {
    audioUnlock();
    input.keys[e.code] = true;
    if (state !== 'play') { if (e.code === 'Escape' && state === 'pause') resume(); return; }
    if (e.code === 'Space' || e.code === 'KeyJ') { input.attackHeld = true; doAttack(); }
    if (e.code === 'KeyK') doCharge();
    if (e.code === 'KeyL') doWhirl();
    if (e.code === 'KeyH') doPotion();
    if (e.code === 'Escape') pause();
  });
  window.addEventListener('keyup', (e) => { input.keys[e.code] = false; if (e.code === 'Space' || e.code === 'KeyJ') input.attackHeld = false; });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (!e.target.closest('#help')) e.preventDefault(); }, { passive: false });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pause(); });
}

// ============================================================
// 14. ÉCRANS
// ============================================================
function showScreen(id) {
  ['title', 'help', 'pause', 'death'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
}
function showTitle() {
  state = 'title';
  $('hud').classList.add('hidden');
  const run = store.get('rw_run', null);
  $('continueBtn').classList.toggle('hidden', !run);
  if (run) $('continueBtn').textContent = `Continuer (étage ${run.floor})`;
  const parts = [];
  if (meta.gold) parts.push(`Or en réserve : ${meta.gold}`);
  if (meta.bestFloor) parts.push(`Record : étage ${meta.bestFloor}`);
  $('titleStats').textContent = parts.join(' · ');
  showScreen('title');
}
function pause() { if (state !== 'play') return; state = 'pause'; input.attackHeld = false; input.mx = input.my = 0; showScreen('pause'); }
function resume() { showScreen(null); state = 'play'; last = performance.now(); }
function setupScreens() {
  $('newBtn').onclick = () => { audioUnlock(); store.del('rw_run'); startRun(null); refreshIcons(); toast('Étage 1', '#c9a2ff', 1.6); };
  $('continueBtn').onclick = () => { audioUnlock(); const r = store.get('rw_run', null); if (r) { startRun(r); refreshIcons(); toast(`Étage ${r.floor}`, '#c9a2ff', 1.6); } };
  $('helpBtn').onclick = () => showScreen('help');
  $('helpBack').onclick = () => showScreen('title');
  $('pauseBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); pause(); });
  $('resumeBtn').onclick = resume;
  const sl = () => { $('soundBtn').textContent = 'Son : ' + (meta.sound ? 'activé' : 'coupé'); };
  sl();
  $('soundBtn').onclick = () => { meta.sound = !meta.sound; saveMeta(); sl(); };
  $('quitBtn').onclick = () => { if (G) { meta.gold += G.p.gold; saveMeta(); } store.del('rw_run'); G = null; showTitle(); };
  $('retryBtn').onclick = () => { startRun(null); refreshIcons(); toast('Étage 1', '#c9a2ff', 1.6); };
  $('menuBtn').onclick = showTitle;
}

// ============================================================
// 15. BOUCLE PRINCIPALE
// ============================================================
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  if (!G) { ctx.fillStyle = '#0b0712'; ctx.fillRect(0, 0, VW, VH); return; }
  if (state === 'play') { update(dt); hudFrame(); }
  else if (state === 'dead') { G.time += dt; for (const pt of G.parts) { pt.life -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; } }
  render();
  if (state === 'play' && Math.floor(G.time) !== hudCache.sec) { hudCache.sec = Math.floor(G.time); updateHUD(); }
}

async function boot() {
  resize();
  try { await loadAssets(); } catch (e) { $('loading').textContent = 'Erreur de chargement. Vérifie ta connexion puis relance.'; return; }
  $('loading').classList.add('hidden');
  setupControls();
  setupScreens();
  refreshIcons();
  showTitle();
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();

// accès pour les tests
window.__rw = { get G() { return G; }, get state() { return state; }, startRun, nextFloor, doAttack, doCharge, doWhirl };
