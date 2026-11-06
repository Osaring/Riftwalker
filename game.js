/* RIFTWALKER — roguelike de donjons (V1 : le Guerrier)
   Tout le jeu tient dans ce fichier. Graphismes : 0x72 Dungeon Tileset II (CC0). */
'use strict';
const APP_VERSION = '1.9.1';

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
let meta = store.get('rw_meta', { gold: 0, bestFloor: 0, sound: true, music: true, runs: 0 });
if (meta.music === undefined) meta.music = true;
if (!meta.gfx) meta.gfx = 'classic';
if (meta.sound === undefined) meta.sound = true;
const saveMeta = () => store.set('rw_meta', meta);

// ============================================================
// 2. GRAPHISMES
// ============================================================
let atlas, atlasWhite, atlasRed, atlasIce, SPR;
// Mode graphique : 'classic' (pixel 16 px), 'hd' (pixel détaillé), 'cel' (3D cel-shading)
let GFX = 'classic', RES = 1;
const TWIN = new Map();          // atlas classique -> sa version agrandie 2x
let hdImg = null, HDS = null;    // personnages détaillés (LPC)
let envImg = null, ENV = null;   // décors détaillés (LPC 32 px)
let iconImg = null, ICONS = null; // icônes de capacités détaillées
const tintCache = new Map();
async function loadAssets() {
  const [json] = await Promise.all([
    fetch('assets/atlas.json').then((r) => r.json()),
    new Promise((res, rej) => { atlas = new Image(); atlas.onload = res; atlas.onerror = rej; atlas.src = 'assets/atlas.png'; }),
    document.fonts ? Promise.all([document.fonts.load('400 16px Pixel'), document.fonts.load('700 16px Pixel')]).catch(() => {}) : null,
  ]);
  SPR = json;
  atlasWhite = tinted('#ffffff');
  atlasRed = tinted('#ff3a2a');
  atlasIce = tinted('#bdf0ff');
  // version 2x (Scale2x) pour le mode HD
  const [hdJson, a2] = await Promise.all([
    fetch('assets/hd_chars.json').then((r) => r.json()),
    new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'assets/atlas2x.png'; }),
    new Promise((res, rej) => { hdImg = new Image(); hdImg.onload = res; hdImg.onerror = rej; hdImg.src = 'assets/hd_chars.png'; }),
  ]);
  HDS = hdJson;
  [ENV, ICONS] = await Promise.all([fetch('assets/hd_env.json').then((r) => r.json()), fetch('assets/icons_hd.json').then((r) => r.json())]);
  await Promise.all([
    new Promise((res, rej) => { envImg = new Image(); envImg.onload = res; envImg.onerror = rej; envImg.src = 'assets/hd_env.png'; }),
    new Promise((res, rej) => { iconImg = new Image(); iconImg.onload = res; iconImg.onerror = rej; iconImg.src = 'assets/icons_hd.png'; }),
  ]);
  const tint2 = (color) => { const c = document.createElement('canvas'); c.width = a2.width; c.height = a2.height; const x = c.getContext('2d'); x.drawImage(a2, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); return c; };
  TWIN.set(atlas, a2); TWIN.set(atlasWhite, tint2('#ffffff')); TWIN.set(atlasRed, tint2('#ff3a2a')); TWIN.set(atlasIce, tint2('#bdf0ff'));
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
  const r0 = SPR[name];
  if (!r0) return;
  let img = opt && opt.img ? opt.img : atlas;
  let r = r0;
  if (ctx._hd && TWIN.has(img)) { img = TWIN.get(img); r = [r0[0] * 2, r0[1] * 2, r0[2] * 2, r0[3] * 2]; }
  const dw = r0[2], dh = r0[3];
  if (opt && (opt.flip || opt.rot)) {
    ctx.save();
    ctx.translate(Math.round(x + dw / 2), Math.round(y + dh / 2));
    if (opt.flip) ctx.scale(-1, 1);
    if (opt.rot) ctx.rotate(opt.rot);
    ctx.drawImage(img, r[0], r[1], r[2], r[3], -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(img, r[0], r[1], r[2], r[3], Math.round(x), Math.round(y), dw, dh);
  }
}
const sprSize = (name) => SPR[name] || [0, 0, 16, 16];

// ============================================================
// 3. SON & MUSIQUE (tout est synthétisé : rien à télécharger, marche hors ligne)
// ============================================================
let actx = null, sfxBus, musicBus, musicFilter, noiseBuf, reverbIn;
function audioUnlock() {
  if (!actx) {
    try {
      // iOS : jouer le son même si le téléphone est en mode silencieux (iOS 17+)
      if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch (e) { } }
      actx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    buildAudioGraph();
    setInterval(musicTick, 25);
  }
  if (actx.state === 'suspended') actx.resume();
}
function buildAudioGraph() {
  const comp = actx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  const master = actx.createGain(); master.gain.value = 2.0;
  comp.connect(master); master.connect(actx.destination);
  // écho de donjon (réverbération synthétique)
  const len = Math.floor(actx.sampleRate * 1.6);
  const ir = actx.createBuffer(2, len, actx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  const conv = actx.createConvolver(); conv.buffer = ir;
  reverbIn = actx.createGain(); reverbIn.gain.value = 1;
  const wet = actx.createGain(); wet.gain.value = 0.32;
  reverbIn.connect(conv); conv.connect(wet); wet.connect(comp);
  // effets sonores
  sfxBus = actx.createGain(); sfxBus.gain.value = meta.sound ? 1 : 0;
  sfxBus.connect(comp);
  const sfxSend = actx.createGain(); sfxSend.gain.value = 0.35; sfxBus.connect(sfxSend); sfxSend.connect(reverbIn);
  // musique (avec un filtre : la musique s'étouffe quand on met pause)
  musicBus = actx.createGain(); musicBus.gain.value = meta.music ? 0.9 : 0;
  musicFilter = actx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 18000;
  musicBus.connect(musicFilter); musicFilter.connect(comp);
  const mSend = actx.createGain(); mSend.gain.value = 0.45; musicFilter.connect(mSend); mSend.connect(reverbIn);
  const delay = actx.createDelay(1); delay.delayTime.value = 0.33;
  const fb = actx.createGain(); fb.gain.value = 0.28;
  const dWet = actx.createGain(); dWet.gain.value = 0.18;
  musicFilter.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(dWet); dWet.connect(comp);
  // bruit blanc réutilisable
  noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
}
function setVolumes() {
  if (!actx) return;
  const t = actx.currentTime;
  sfxBus.gain.setTargetAtTime(meta.sound ? 1 : 0, t, 0.05);
  musicBus.gain.setTargetAtTime(meta.music ? 0.9 : 0, t, 0.2);
}
function muffleMusic(on) { if (actx) musicFilter.frequency.setTargetAtTime(on ? 550 : 18000, actx.currentTime, 0.15); }

// --- briques sonores ---
function osc(bus, freq, t, dur, type, vol, o = {}) {
  const os = actx.createOscillator(), g = actx.createGain();
  os.type = type; os.frequency.setValueAtTime(freq, t);
  if (o.slide) os.frequency.exponentialRampToValueAtTime(Math.max(25, freq + o.slide), t + dur);
  if (o.detune) os.detune.value = o.detune;
  const a = o.attack || 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  if (o.sustain) { g.gain.setValueAtTime(vol, t + Math.max(a, dur - (o.release || 0.1))); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
  else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = os;
  if (o.lp) { const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; os.connect(f); node = f; }
  node.connect(g); g.connect(bus);
  os.start(t); os.stop(t + dur + 0.05);
}
function nz(bus, t, dur, vol, type = 'highpass', freq = 800, q = 1) {
  const s = actx.createBufferSource(); s.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(bus);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
const ok = () => actx && meta.sound;
const now = (d = 0) => actx.currentTime + d;
function tone(freq, dur, type = 'square', vol = 0.12, slide = 0, delay = 0) { if (ok()) osc(sfxBus, freq, now(delay), dur, type, vol, { slide }); }
function noise(dur, vol = 0.15, hp = 800, delay = 0, type = 'highpass') { if (ok()) nz(sfxBus, now(delay), dur, vol, type, hp); }
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

let coinCombo = 0, coinComboT = 0;
const SFX = {
  swing: () => { noise(0.1, 0.13, 2200, 0, 'bandpass'); noise(0.06, 0.06, 5000); },
  hit: () => { tone(170, 0.09, 'square', 0.09, -110); noise(0.06, 0.13, 1100, 0, 'bandpass'); tone(90, 0.08, 'sine', 0.15, -40); },
  crit: () => { tone(330, 0.14, 'square', 0.1, -260); noise(0.1, 0.18, 900, 0, 'bandpass'); tone(70, 0.16, 'sine', 0.22, -30); tone(1600, 0.08, 'triangle', 0.05, -800); },
  hurt: () => { tone(150, 0.22, 'sawtooth', 0.11, -95); noise(0.12, 0.1, 400, 0, 'lowpass'); },
  coin: () => {
    if (!ok()) return;
    coinCombo = (actx.currentTime - coinComboT < 0.5) ? Math.min(coinCombo + 1, 10) : 0;
    coinComboT = actx.currentTime;
    const f = 880 * Math.pow(2, coinCombo / 12);
    tone(f, 0.05, 'square', 0.045); tone(f * 1.5, 0.09, 'square', 0.045, 0, 0.05);
  },
  chest: () => { tone(110, 0.15, 'sawtooth', 0.06, 40); noise(0.12, 0.08, 600, 0, 'lowpass'); [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.09, 0, 0.1 + i * 0.07)); },
  lock: () => { noise(0.25, 0.16, 300, 0, 'lowpass'); tone(85, 0.3, 'square', 0.07, -25); noise(0.08, 0.1, 3000, 0.05); },
  unlock: () => { tone(523, 0.08, 'square', 0.06); tone(659, 0.08, 'square', 0.06, 0, 0.08); tone(784, 0.2, 'square', 0.06, 0, 0.16); },
  whirl: () => { noise(0.4, 0.15, 1200, 0, 'bandpass'); tone(180, 0.4, 'sawtooth', 0.05, 340); tone(120, 0.35, 'triangle', 0.06, 200, 0.05); },
  charge: () => { noise(0.3, 0.13, 500, 0, 'bandpass'); tone(100, 0.28, 'sawtooth', 0.08, 200); },
  potion: () => { noise(0.15, 0.05, 700, 0, 'lowpass'); [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'triangle', 0.07, 0, i * 0.055)); },
  die: () => { noise(0.2, 0.11, 500, 0, 'lowpass'); tone(170, 0.22, 'triangle', 0.08, -110); },
  slam: () => { noise(0.5, 0.25, 180, 0, 'lowpass'); tone(65, 0.5, 'sine', 0.28, -35); tone(110, 0.3, 'square', 0.06, -60); },
  shoot: () => { tone(620, 0.14, 'sawtooth', 0.045, -420); noise(0.1, 0.05, 2000); },
  key: () => { [659, 880, 1175, 1568].forEach((f, i) => tone(f, 0.16, 'square', 0.05, 0, i * 0.07)); tone(2093, 0.4, 'sine', 0.04, 0, 0.3); },
  portal: () => { tone(220, 1.1, 'sine', 0.1, 660); tone(330, 1.1, 'sine', 0.07, 990); noise(0.9, 0.05, 1500, 0, 'bandpass'); },
  death: () => { [220, 196, 165, 110].forEach((f, i) => tone(f, i === 3 ? 1 : 0.32, 'square', 0.08, i === 3 ? -50 : 0, i * 0.28)); },
  loot: (r) => {
    const base = [262, 294, 330, 392, 440, 523][r];
    tone(base, 0.12, 'triangle', 0.09); tone(base * 1.26, 0.12, 'triangle', 0.09, 0, 0.09); tone(base * 1.5, 0.25, 'triangle', 0.09, 0, 0.18);
    if (r >= 4) { [2, 2.52, 3, 4].forEach((k, i) => tone(base * k, 0.3, 'square', 0.035, 0, 0.3 + i * 0.08)); noise(0.6, 0.04, 6000, 0.3); }
  },
  step: (alt) => { noise(0.04, 0.035, alt ? 900 : 650, 0, 'lowpass'); },
  roar: () => { tone(130, 0.9, 'sawtooth', 0.11, -70); tone(98, 0.9, 'square', 0.06, -50); noise(0.8, 0.14, 350, 0, 'lowpass'); },
  heart: () => { tone(62, 0.12, 'sine', 0.3, -15); tone(55, 0.14, 'sine', 0.24, -12, 0.18); },
  ui: () => { tone(660, 0.04, 'square', 0.04); tone(990, 0.05, 'square', 0.03, 0, 0.03); },
  pickup: () => { tone(523, 0.06, 'square', 0.05); tone(784, 0.08, 'square', 0.05, 0, 0.05); },
  floor: () => { [57, 60, 64, 69, 72, 76, 81].forEach((m, i) => tone(midi(m), 0.3, 'triangle', 0.07, 0, i * 0.07)); noise(1, 0.04, 5000, 0.4); },
  cast: () => { tone(220, 0.6, 'sine', 0.05, 440); noise(0.55, 0.035, 3000, 0, 'bandpass'); },
  fire: () => { noise(0.25, 0.12, 900, 0, 'bandpass'); tone(300, 0.2, 'sawtooth', 0.04, -180); },
  boom: () => { noise(0.35, 0.2, 400, 0, 'lowpass'); tone(90, 0.3, 'sine', 0.22, -50); noise(0.15, 0.08, 2500); },
  nova: () => { [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, 0.35, 'triangle', 0.04, 0, i * 0.03)); noise(0.4, 0.1, 4000); tone(140, 0.25, 'sine', 0.12, -60); },
  blink: () => { tone(900, 0.18, 'square', 0.04, -700); tone(300, 0.2, 'sine', 0.06, 900, 0.05); noise(0.15, 0.06, 5000); },
  fizzle: () => { noise(0.18, 0.06, 1500, 0, 'bandpass'); tone(400, 0.15, 'triangle', 0.04, -250); },
  shatter: () => { [2637, 3520, 2093].forEach((f, i) => tone(f, 0.12, 'square', 0.03, 0, i * 0.04)); noise(0.2, 0.12, 5000); },
  rageFull: () => { tone(220, 0.15, 'sawtooth', 0.05, 220); tone(440, 0.2, 'square', 0.04, 0, 0.1); },
};

// --- musique ---
const CHORDS = {
  Am: [45, [57, 60, 64]], F: [41, [57, 60, 65]], C: [48, [55, 60, 64]], G: [43, [55, 59, 62]], E: [40, [56, 59, 64]],
  Dm: [38, [57, 62, 65]], Bb: [46, [58, 62, 65]], Gm: [43, [55, 58, 62]], A: [45, [57, 61, 64]], Em: [40, [55, 59, 64]],
};
const TRACKS = {
  title: {
    bpm: 66, chords: ['Am', 'F', 'C', 'E'], pad: 0.05, bass: 'r...............', bassType: 'triangle', bassVol: 0.14,
    arp: '0.1.2.1.0.1.2.1.', arpType: 'triangle', arpVol: 0.04, arpOct: 12,
    lead: [76, 0, 0, 0, 0, 0, 72, 0, 77, 0, 0, 0, 76, 0, 0, 0, 79, 0, 0, 0, 76, 0, 74, 0, 71, 0, 0, 0, 0, 0, 0, 0],
    leadType: 'sine', leadVol: 0.09, leadEvery: 1, bell: true,
  },
  explore: {
    bpm: 80, chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'E'], pad: 0.05, bass: 'r.......r.......', bassType: 'triangle', bassVol: 0.13,
    arp: '0120012001200120', arpType: 'triangle', arpVol: 0.04, arpOct: 12,
    drums: { h: '..h...h...h...h.' }, hatVol: 0.012,
    lead: [76, 0, 0, 0, 74, 0, 72, 0, 72, 0, 0, 0, 69, 0, 0, 0, 72, 0, 74, 0, 76, 0, 79, 0, 74, 0, 0, 0, 0, 0, 0, 0,
      76, 0, 0, 0, 77, 0, 76, 0, 74, 0, 72, 0, 69, 0, 0, 0, 69, 0, 72, 0, 74, 0, 77, 0, 71, 0, 0, 0, 68, 0, 0, 0],
    leadType: 'triangle', leadVol: 0.08, leadEvery: 2, bell: true,
  },
  combat: {
    bpm: 136, chords: ['Am', 'F', 'C', 'E'], bass: 'r.r.o.r.r.r.o.r.', bassType: 'sawtooth', bassVol: 0.09, bassLp: 700,
    arp: '0120012001200120', arpType: 'square', arpVol: 0.02, arpOct: 12,
    drums: { k: 'k.......k.k.....', s: '....s.......s...', h: 'hhhhhhhhhhhhhhhh' }, hatVol: 0.018,
    lead: [69, 72, 76, 72, 77, 76, 74, 72, 72, 0, 69, 72, 74, 72, 69, 0, 67, 72, 76, 79, 77, 76, 74, 72, 71, 68, 71, 74, 76, 0, 0, 0],
    leadType: 'square', leadVol: 0.04, leadEvery: 1, leadLp: 2600,
  },
  boss: {
    bpm: 150, chords: ['Dm', 'Bb', 'Gm', 'A'], bass: 'rrrorrrorrrorrro', bassType: 'sawtooth', bassVol: 0.09, bassLp: 900,
    arp: '0.2.1.2.0.2.1.2.', arpType: 'square', arpVol: 0.02, arpOct: 0, stab: true,
    drums: { k: 'k..k..k.k..k..k.', s: '....s.......s..s', h: 'h.h.h.h.h.h.h.hh' }, hatVol: 0.022,
    lead: [62, 65, 69, 65, 70, 69, 67, 65, 70, 0, 65, 70, 74, 72, 70, 69, 67, 70, 74, 70, 72, 70, 69, 67, 69, 73, 76, 73, 69, 0, 0, 0],
    leadType: 'sawtooth', leadVol: 0.035, leadEvery: 1, leadLp: 2200,
  },
};
const music = { track: null, target: null, step: 0, loop: 0, next: 0 };
function setMusic(name) { music.target = name; if (actx && !music.track && name) { music.track = name; music.step = 0; music.loop = 0; music.next = actx.currentTime + 0.1; } }
function musicTick() {
  if (!actx || actx.state !== 'running') return;
  if (!music.track) return;
  if (music.next < actx.currentTime - 0.5) music.next = actx.currentTime + 0.05; // l'app revient d'une pause
  while (music.next < actx.currentTime + 0.15) {
    const T = TRACKS[music.track];
    const bars = T.chords.length;
    if (music.step % 4 === 0 && music.target !== music.track) { // changement de morceau sur le temps suivant
      music.track = music.target; music.step = 0; music.loop = 0;
      if (!music.track) return;
      continue;
    }
    if (meta.music) playStep(T, music.step, music.next, music.loop);
    music.next += 60 / T.bpm / 4;
    music.step++;
    if (music.step >= bars * 16) { music.step = 0; music.loop++; }
  }
}
function playStep(T, step, t, loop) {
  const bar = Math.floor(step / 16), s = step % 16;
  const [root, tones] = CHORDS[T.chords[bar]];
  const st = 60 / T.bpm / 4; // durée d'une double-croche
  // nappe
  if (T.pad && s === 0) for (const m of tones) { osc(musicBus, midi(m), t, st * 16, 'sawtooth', T.pad / 3, { attack: 0.5, sustain: true, release: 0.6, lp: 900, detune: rand(-8, 8) }); }
  // basse
  const b = T.bass[s];
  if (b !== '.') {
    const m = root + (b === 'o' ? 12 : b === 'f' ? 7 : 0);
    const len = T.bass.indexOf('r', s + 1) > 0 ? st * 1.8 : st * 8;
    osc(musicBus, midi(m), t, Math.min(len, st * (T.bpm > 120 ? 1.6 : 8)), T.bassType, T.bassVol, { lp: T.bassLp || 1200 });
  }
  // arpège
  const a = T.arp[s];
  if (a && a !== '.') osc(musicBus, midi(tones[+a] + T.arpOct), t, st * 1.5, T.arpType, T.arpVol, { lp: 3000 });
  // accords plaqués (boss)
  if (T.stab && (s === 0 || s === 6 || s === 12)) for (const m of tones) osc(musicBus, midi(m), t, st * 2, 'square', 0.018, { lp: 1800 });
  // batterie
  if (T.drums) {
    if (T.drums.k && T.drums.k[s] === 'k') { osc(musicBus, 150, t, 0.22, 'sine', 0.35, { slide: -110 }); }
    if (T.drums.s && T.drums.s[s] === 's') { nz(musicBus, t, 0.16, 0.13, 'bandpass', 1900, 0.8); osc(musicBus, 190, t, 0.07, 'triangle', 0.08); }
    if (T.drums.h && T.drums.h[s] === 'h') nz(musicBus, t, 0.035, T.hatVol * (s % 4 === 2 ? 1.6 : 1), 'highpass', 7500);
  }
  // mélodie (toutes les croches = pas pairs)
  if (s % 2 === 0 && loop % T.leadEvery === 0) {
    const idx = (bar * 8 + s / 2) % T.lead.length;
    let m = T.lead[idx];
    if (m) {
      if (loop % 4 === 3 && Math.random() < 0.3) m += 12; // petite variation
      let dur = st * 2;
      for (let k = idx + 1; k < T.lead.length && !T.lead[k] && dur < st * 8; k++) dur += st * 2;
      osc(musicBus, midi(m), t, dur * 0.95, T.leadType, T.leadVol, { lp: T.leadLp, attack: T.bell ? 0.005 : 0.01 });
      if (T.bell) osc(musicBus, midi(m + 12), t, dur * 0.6, 'sine', T.leadVol * 0.3);
    }
  }
}

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
  RES = GFX === 'hd' ? 2 : 1;
  // classique : ~200 pixels de jeu sur le petit côté ; HD : 2x plus de détails
  SCALE = RES === 2 ? Math.max(1, Math.floor(Math.min(dw, dh) / 380)) : Math.max(2, Math.floor(Math.min(dw, dh) / 200));
  const cw = Math.ceil(dw / SCALE), ch = Math.ceil(dh / SCALE);
  canvas.width = cw; canvas.height = ch;
  VW = cw / RES; VH = ch / RES;
  canvas.style.width = (cw * SCALE / dpr) + 'px';
  canvas.style.height = (ch * SCALE / dpr) + 'px';
  lightCv.width = cw; lightCv.height = ch;
  ctx._hd = RES === 2;
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
const STAVES = [
  ['weapon_green_magic_staff', 'Bâton noueux', 0], ['weapon_green_magic_staff', "Bâton d'apprenti", 1], ['weapon_green_magic_staff', 'Bâton de saule', 2],
  ['weapon_green_magic_staff', "Bâton de l'adepte", 3], ['weapon_red_magic_staff', 'Bâton de braise', 3], ['weapon_red_magic_staff', 'Sceptre écarlate', 4],
  ['weapon_red_magic_staff', "Bâton de l'archimage", 5],
];
const SUFFIX = ['du Néant', 'des Profondeurs', 'du Rôdeur', 'de la Tempête', 'du Sanglier', "de l'Ours", 'du Faucon'];

function makeWeapon(floorN, rarity, cls = 'warrior') {
  let w;
  const LIST = cls === 'mage' ? STAVES : WEAPONS;
  const legend = cls === 'mage' ? ['weapon_red_magic_staff', 'Bâton de la Faille', 6] : ['weapon_anime_sword', 'Lame de la Faille', 6];
  if (rarity === 5) w = Math.random() < 0.5 ? legend : pick(LIST.filter((x) => x[2] >= 4));
  else {
    const tier = clamp(rarity + randi(-1, 1), 0, 5);
    const pool = LIST.filter((x) => Math.abs(x[2] - tier) <= 1);
    w = pick(pool);
  }
  const dmg = Math.round((9 + floorN * 2.2 + w[2] * 1.5) * RARITY[rarity].mult * rand(0.92, 1.08));
  let name = w[1];
  if (rarity >= 3 && w[2] !== 6) name += ' ' + pick(SUFFIX);
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
  // --- décor hors zone de jeu (purement visuel) ---
  // distance de chaque case à la zone jouable
  const distF = new Uint8Array(MW * MH).fill(255);
  const q2 = [];
  for (let i = 0; i < MW * MH; i++) if (tiles[i]) { distF[i] = 0; q2.push(i); }
  for (let h = 0; h < q2.length; h++) {
    const i = q2[h], x = i % MW, y = (i / MW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const j = ny * MW + nx;
      if (distF[j] === 255) { distF[j] = distF[i] + 1; q2.push(j); }
    }
  }
  const decor = new Uint8Array(MW * MH); // 0 sol de caverne, 1 lave, 2 gouffre, 3 roche noire
  const kinds = floorN >= 3 ? [1, 1, 2, 3] : [1, 2, 2, 3, 3];
  const nPools = ri(8, 14);
  for (let k = 0; k < nPools; k++) {
    const cx = ri(0, MW - 1), cy = ri(0, MH - 1);
    if (distF[cy * MW + cx] < 4) continue;
    const t = rp(kinds), rx = ri(2, 5), ry = ri(2, 4);
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
      const dd = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (dd <= 1 + R() * 0.3 && distF[y * MW + x] >= 3) decor[y * MW + x] = t;
    }
  }
  // on enlève les morceaux trop fins (érosion puis dilatation)
  for (let pass = 0; pass < 2; pass++) {
    const src = decor.slice();
    for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
      const i = y * MW + x, t = src[i];
      if (pass === 0 && t && !(src[i - 1] === t && src[i + 1] === t && src[i - MW] === t && src[i + MW] === t)) decor[i] = 0;
      if (pass === 1 && !t && distF[i] >= 3) { const n = [src[i - 1], src[i + 1], src[i - MW], src[i + MW]].find((v) => v); if (n) decor[i] = n; }
    }
  }
  const scatter = [], glows = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x;
    if (tiles[i] || distF[i] < 2) continue;
    if (!decor[i] && R() < 0.07) scatter.push({ x, y, s: rp(['boulder', 'stone', 'pebbles', 'pebbles2', 'pebbles', 'mushroom', 'bigrock']) });
    if (decor[i] === 1 && (x + y * 3) % 7 === 0) glows.push({ x: x * TILE + 8, y: y * TILE + 8 });
  }
  return { floorN, seed, tiles, floorVar, rooms: list, start, exit, vault, keyRoom, torches, banners, props, edges, distF, decor, scatter, glows };
}

// ============================================================
// 7. ÉTAT DU JEU
// ============================================================
let G = null;          // partie en cours
let state = 'loading'; // loading | title | play | pause | dead | trans
const input = { mx: 0, my: 0, keys: {}, attackHeld: false };
// angle de la caméra en vue 3ème personne (0 = on regarde vers le haut de la carte)
let camYaw = 0, camManualT = 0, camPitch = 0.22;
// en 3ème personne, « haut » sur le joystick = droit devant la caméra
function toWorld(jx, jy) {
  if (GFX !== 'tps') return [jx, jy];
  const c = Math.cos(camYaw), s = Math.sin(camYaw);
  return [jx * c - jy * s, jx * s + jy * c];
}

const CLASSES = {
  warrior: { name: 'Guerrier', sprite: 'knight_m', hp: 100, weapon: { sprite: 'weapon_regular_sword', name: 'Épée de recrue', rarity: 1, dmg: 10 } },
  mage: { name: 'Mage', sprite: 'wizzard_m', hp: 75, weapon: { sprite: 'weapon_green_magic_staff', name: "Bâton d'apprenti", rarity: 1, dmg: 10 } },
};
// Sorts du mage : coût en mana, temps d'incantation
const MAGE = { fireCost: 8, castTime: 0.65, blinkCost: 15, novaCost: 25, regen: 9, regenIdle: 22 };

function newPlayer(cls = 'warrior') {
  const C = CLASSES[cls];
  const mage = cls === 'mage';
  return {
    cls, x: 0, y: 0, r: 4, dir: 1, fx: 1, fy: 0, maxHp: C.hp, hp: C.hp, rage: 0, mana: 100, maxMana: 100, casting: 0,
    weapon: { ...C.weapon },
    potions: 1, gold: 0, keys: 0, kills: 0,
    cd: { attack: 0, charge: 0, whirl: 0, potion: 0 },
    cdMax: mage ? { attack: 0.12, charge: 7, whirl: 9, potion: 1 } : { attack: 0.36, charge: 7, whirl: 1.2, potion: 1 },
    swing: 0, whirl: 0, charging: 0, chargeTarget: null, inv: 0, hurtT: 0, anim: 0, moving: false, trail: [],
  };
}

function startRun(fromSave, cls) {
  const p = newPlayer((fromSave && fromSave.cls) || cls || 'warrior');
  let floorN = 1, seed = (Math.random() * 1e9) | 0;
  if (fromSave) {
    Object.assign(p, { maxHp: fromSave.maxHp, hp: fromSave.hp, weapon: fromSave.weapon, potions: fromSave.potions, gold: fromSave.gold, kills: fromSave.kills || 0 });
    floorN = fromSave.floor; seed = fromSave.seed;
  } else { meta.runs++; saveMeta(); }
  G = { p, floorN, time: 0, shake: 0, freeze: 0, fx: [], parts: [], texts: [], projs: [], fire: [], pickups: [], enemies: [], chests: [], tele: [] };
  enterFloor(floorN, seed);
  showScreen(null);
  $('hud').classList.remove('hidden');
  state = 'play';
  updateHUD(true);
}

function enterFloor(floorN, seed) {
  const D = generateFloor(floorN, seed);
  G.D = D; G.floorN = floorN; G.MW = MW; G.MH = MH;
  G.enemies = []; G.chests = []; G.pickups = []; G.projs = []; G.fire = []; G.fx = []; G.parts = []; G.texts = []; G.tele = [];
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
  // 3e personne : au début de l'étage, la caméra regarde vers une sortie de la salle
  const d0 = s.doors[0];
  if (d0) { const dx = d0.x * TILE + 8 - G.p.x, dy = d0.y * TILE + 8 - G.p.y, l = Math.hypot(dx, dy) || 1; G.p.fx = dx / l; G.p.fy = dy / l; camYaw = Math.atan2(dx, -dy); }
  camPitch = 0.22;
  prerenderMap();
  G.outMask = buildOutMask(D);
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

// Les 3 boutons font des choses différentes selon la classe
const actMain = () => (G.p.cls === 'mage' ? startCast() : doAttack());
const act2 = () => (G.p.cls === 'mage' ? doBlink() : doCharge());
const act3 = () => (G.p.cls === 'mage' ? doNova() : doWhirl());

// ---------- MAGE ----------
let hintT = 0;
function startCast() {
  const p = G.p;
  if (p.casting > 0 || p.cd.attack > 0) return;
  if (p.mana < MAGE.fireCost) { if (G.time - hintT > 1.5) { hintT = G.time; toast('Pas assez de mana', '#7ab8ff', 0.9); } return; }
  if (p.moving) { if (G.time - hintT > 3) { hintT = G.time; toast('Arrête-toi pour incanter', '#ffb07a', 1.1); } return; }
  p.casting = MAGE.castTime; p.castT = MAGE.castTime;
  const t = nearestEnemy(170);
  if (t) face(p, t.x, t.y);
  SFX.cast();
}
function releaseFireball() {
  const p = G.p;
  const t = nearestEnemy(180);
  if (t) face(p, t.x, t.y - 4);
  p.mana -= MAGE.fireCost;
  p.cd.attack = p.cdMax.attack;
  p.castFx = 0.2;
  const sp = 200;
  G.fire.push({ x: p.x + p.fx * 8, y: p.y - 9 + p.fy * 6, vx: p.fx * sp, vy: p.fy * sp, life: 1.4, dmg: p.weapon.dmg });
  SFX.fire();
}
function explode(f, direct) {
  SFX.boom();
  G.shake = Math.max(G.shake, 2.5);
  G.fx.push({ type: 'ring', x: f.x, y: f.y + 4, t: 0.25, T: 0.25, r0: 4, r1: 20, c: '#ffb84a' });
  G.fx.push({ type: 'flash', x: f.x, y: f.y, t: 0.15, T: 0.15 });
  for (let i = 0; i < 18; i++) { const a = rand(0, 6.28); G.parts.push({ x: f.x, y: f.y, vx: Math.cos(a) * rand(20, 90), vy: Math.sin(a) * rand(20, 90), life: rand(0.2, 0.5), c: pick(['#ffe07a', '#ff9a3a', '#ff5a2a', '#ffffff']), s: rand(1, 2) }); }
  for (const e of G.enemies) {
    if (e.dead || !e.active) continue;
    const d = Math.hypot(e.x - f.x, e.y - 6 - f.y);
    if (e === direct || d < 18 + e.r) {
      const shatter = e.frozen > 0;
      damageEnemy(e, f.dmg, e === direct ? 1.6 : 0.8, { kb: 70, forceCrit: shatter, label: shatter ? 'Brisure !' : null });
      if (shatter) SFX.shatter();
      if (!e.dead) { e.burn = 3; e.burnDmg = Math.max(1, Math.round(f.dmg * 0.15)); e.burnTick = e.burnTick > 0 ? e.burnTick : 0.5; }
    }
  }
}
function doBlink() {
  const p = G.p;
  if (p.cd.charge > 0) return;
  if (p.mana < MAGE.blinkCost) { toast('Pas assez de mana', '#7ab8ff', 0.9); return; }
  let dx, dy;
  const [wx, wy] = toWorld(input.mx, input.my);
  const ml = Math.hypot(wx, wy);
  if (ml > 0.2) { dx = wx / ml; dy = wy / ml; }
  else {
    const t = nearestEnemy(90);
    if (t) { const a = Math.atan2(p.y - t.y, p.x - t.x); dx = Math.cos(a); dy = Math.sin(a); } else { dx = p.fx; dy = p.fy; }
  }
  const ox = p.x, oy = p.y;
  let moved = 0;
  for (let d = 4; d <= 72; d += 4) { if (blocked(ox + dx * d, oy + dy * d, p.r)) break; moved = d; }
  if (moved < 10) { toast('Pas de place pour se téléporter', '#cfc3e0', 0.9); return; }
  p.x = ox + dx * moved; p.y = oy + dy * moved;
  p.casting = 0; p.mana -= MAGE.blinkCost; p.cd.charge = p.cdMax.charge; p.inv = Math.max(p.inv, 0.3);
  if (Math.abs(dx) > 0.2) p.dir = dx > 0 ? 1 : -1;
  G.fx.push({ type: 'blink', x0: ox, y0: oy - 8, x1: p.x, y1: p.y - 8, t: 0.3, T: 0.3 });
  for (const [x, y] of [[ox, oy], [p.x, p.y]]) for (let i = 0; i < 14; i++) G.parts.push({ x: x + rand(-5, 5), y: y - rand(0, 20), vx: rand(-25, 25), vy: rand(-40, 0), life: rand(0.3, 0.6), c: pick(['#c9a2ff', '#8a5aff', '#ffffff']), s: 1 });
  SFX.blink();
}
function doNova() {
  const p = G.p;
  if (p.cd.whirl > 0) return;
  if (p.mana < MAGE.novaCost) { toast('Pas assez de mana', '#7ab8ff', 0.9); return; }
  p.mana -= MAGE.novaCost; p.cd.whirl = p.cdMax.whirl; p.casting = 0; p.castFx = 0.3;
  G.fx.push({ type: 'ring', x: p.x, y: p.y, t: 0.4, T: 0.4, r0: 6, r1: 48, c: '#bdf0ff', w: 3 });
  G.fx.push({ type: 'ring', x: p.x, y: p.y, t: 0.5, T: 0.5, r0: 2, r1: 36, c: '#ffffff' });
  for (let i = 0; i < 30; i++) { const a = rand(0, 6.28); G.parts.push({ x: p.x, y: p.y - 4, vx: Math.cos(a) * rand(40, 120), vy: Math.sin(a) * rand(30, 80), life: rand(0.3, 0.6), c: pick(['#bdf0ff', '#ffffff', '#6ac8ff']), s: rand(1, 2) }); }
  SFX.nova();
  let n = 0;
  for (const e of G.enemies) {
    if (e.dead || !e.active || dist(p, e) > 48 + e.r) continue;
    e.frozen = e.d.elite ? 1.3 : 2.8; e.state = 'chase'; e.t = 0; e.kvx = e.kvy = 0; n++;
    damageEnemy(e, p.weapon.dmg, 0.35, { kb: 0 });
  }
  if (n) floatText(p.x, p.y - 30, 'Gelés !', '#bdf0ff', 8);
}

// ---------- GUERRIER ----------
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
function gainRage(n) { if (G.p.cls === 'warrior') G.p.rage = Math.min(100, G.p.rage + n); }

function damageEnemy(e, base, mult, opt = {}) {
  if (e.dead) return;
  const crit = opt.forceCrit || Math.random() < 0.12;
  const dmg = Math.max(1, Math.round(base * mult * rand(0.9, 1.1) * (crit ? 2 : 1)));
  e.hp -= dmg; e.flash = 0.12;
  const a = Math.atan2(e.y - G.p.y, e.x - G.p.x);
  const kb = (opt.kb ?? 90) * (e.d.elite ? 0.25 : 1) * (e.frozen > 0 ? 0 : 1);
  e.kvx = Math.cos(a) * kb; e.kvy = Math.sin(a) * kb;
  if (e.state === 'windup' && !e.d.elite && e.d.ranged) e.state = 'chase';
  floatText(e.x + rand(-4, 4), e.y - sprH(e) - 2, String(dmg), crit ? '#ffe14a' : '#ffffff', crit ? 11 : 8, crit);
  if (opt.label) floatText(e.x, e.y - sprH(e) - 14, opt.label, '#bdf0ff', 8);
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
    if (elite) { SFX.roar(); G.shake = 5; }
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
    G.pickups.push({ type: 'weapon', w: makeWeapon(G.floorN, r, G.p.cls), x: c.x, y: c.y, vx: rand(-20, 20), vy: rand(30, 60), t: 0 });
  }
  for (let i = 0; i < 18; i++) G.parts.push({ x: c.x, y: c.y - 6, vx: rand(-40, 40), vy: rand(-70, -10), life: rand(0.4, 0.9), c: pick(['#ffe14a', '#fff6c0', '#ffb84a']), s: 1 });
}
function collect(k) {
  const p = G.p;
  if (k.type === 'coin') { p.gold += k.value; SFX.coin(); updateHUD(); }
  if (k.type === 'potion') { if (p.potions >= 5) return false; p.potions++; toast('Potion de soin', '#ff6a6a', 1); SFX.pickup(); updateHUD(); }
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
    p.rage = 0; p.charging = 0; p.whirl = 0; p.casting = 0; p.mana = p.maxMana;
    enterFloor(G.floorN + 1, (Math.random() * 1e9) | 0);
    updateHUD(true);
    $('fade').classList.remove('on');
    toast(`Étage ${G.floorN}`, '#c9a2ff', 1.8);
    SFX.floor();
    state = 'play';
  }, 450);
}

function saveRun() {
  const p = G.p;
  store.set('rw_run', { cls: p.cls, floor: G.floorN, seed: G.D.seed, hp: p.hp, maxHp: p.maxHp, weapon: p.weapon, potions: p.potions, gold: p.gold, kills: p.kills });
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
  p.castFx = Math.max(0, (p.castFx || 0) - dt);
  if (input.attackHeld) actMain();

  // --- déplacement ---
  let mx = input.mx, my = input.my;
  const k = input.keys;
  if (k.ArrowLeft || k.KeyA || k.KeyQ) mx = -1;
  if (k.ArrowRight || k.KeyD) mx = 1;
  if (k.ArrowUp || k.KeyW || k.KeyZ) my = -1;
  if (k.ArrowDown || k.KeyS) my = 1;
  const jx = mx, jy = my;
  [mx, my] = toWorld(mx, my);
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  p.moving = ml > 0.1;
  if (p.cls === 'mage') {
    const inFight = G.room && G.room.locked;
    p.mana = Math.min(p.maxMana, p.mana + dt * (inFight ? MAGE.regen : MAGE.regenIdle));
    if (p.casting > 0) {
      if (p.moving) { p.casting = 0; p.cd.attack = 0.2; floatText(p.x, p.y - 30, 'Interrompu', '#a89cb8', 7); SFX.fizzle(); }
      else {
        p.casting -= dt;
        const tx = p.x + p.fx * 6, ty = p.y - 18;
        if (Math.random() < dt * 40) { const a = rand(0, 6.28); G.parts.push({ x: tx + Math.cos(a) * 9, y: ty + Math.sin(a) * 9, vx: -Math.cos(a) * 30, vy: -Math.sin(a) * 30, life: 0.25, c: pick(['#ffe07a', '#ff9a3a']), s: 1 }); }
        if (p.casting <= 0) { p.casting = 0; releaseFireball(); }
      }
    }
  }
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
      p.stepT = (p.stepT || 0) + dt;
      if (p.stepT > 0.27) { p.stepT = 0; p.stepAlt = !p.stepAlt; SFX.step(p.stepAlt); }
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

  // battement de cœur quand la vie est basse
  if (p.hp / p.maxHp < 0.3) { G.heartT = (G.heartT || 0) - dt; if (G.heartT <= 0) { G.heartT = 1.05; SFX.heart(); } }
  if (p.cls === 'warrior' && p.rage >= 35 && (G.lastRage || 0) < 35) SFX.rageFull();
  G.lastRage = p.rage;
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
    if (e.burn > 0) {
      e.burn -= dt; e.burnTick -= dt;
      if (Math.random() < dt * 14) G.parts.push({ x: e.x + rand(-4, 4), y: e.y - rand(2, 14), vx: rand(-4, 4), vy: rand(-30, -12), life: 0.35, c: pick(['#ff9a3a', '#ffd04a', '#ff5a2a']), s: 1 });
      if (e.burnTick <= 0) {
        e.burnTick = 0.5; e.hp -= e.burnDmg;
        floatText(e.x + rand(-5, 5), e.y - sprH(e), String(e.burnDmg), '#ff9a3a', 7);
        if (e.hp <= 0) { killEnemy(e); continue; }
      }
    }
    if (e.frozen > 0) {
      e.frozen -= dt; e.kvx = e.kvy = 0;
      if (e.frozen <= 0) for (let i = 0; i < 8; i++) G.parts.push({ x: e.x + rand(-5, 5), y: e.y - rand(0, 14), vx: rand(-20, 20), vy: rand(-20, 10), life: 0.4, c: '#bdf0ff', s: 1 });
      continue;
    }
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

  // --- boules de feu du mage ---
  for (const f of G.fire) {
    f.life -= dt;
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (Math.random() < dt * 60) G.parts.push({ x: f.x + rand(-1, 1), y: f.y + rand(-1, 1), vx: -f.vx * 0.1 + rand(-10, 10), vy: -f.vy * 0.1 + rand(-10, 10), life: rand(0.15, 0.3), c: pick(['#ffe07a', '#ff9a3a', '#ff5a2a']), s: 1 });
    let hitE = null;
    for (const e of G.enemies) { if (!e.dead && e.active && Math.hypot(e.x - f.x, e.y - 7 - f.y) < e.r + 6) { hitE = e; break; } }
    if (hitE || solidAt(f.x, f.y + 6) || f.life <= 0) { explode(f, hitE); f.life = 0; }
  }
  G.fire = G.fire.filter((f) => f.life > 0);

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
  mapCv.width = MW * TILE * RES; mapCv.height = MH * TILE * RES;
  mapCv._res = RES;
  const m = mapCv.getContext('2d');
  m.scale(RES, RES); m._hd = RES === 2;
  m.imageSmoothingEnabled = false;
  m.fillStyle = '#07050b'; m.fillRect(0, 0, MW * TILE, MH * TILE);
  const F = (x, y) => isFloor(x, y);
  const face = (x, y) => !F(x, y) && (F(x, y + 1) || F(x, y - 1)) && x >= 0 && y >= 0 && x < MW && y < MH;
  const HD = RES === 2;
  drawOutside(m, D);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (!F(x, y)) continue;
    if (HD) { const v = D.floorVar[y * MW + x]; envSpr(m, v === 5 || v === 6 ? 'floorv_' + (y % 3) : `floor_${x % 3}_${y % 3}`, x * TILE, y * TILE); }
    else spr(m, 'floor_' + D.floorVar[y * MW + x], x * TILE, y * TILE);
  }
  for (const pr of D.props) {
    if (HD && pr.s === 'crate') envSpr(m, 'barrel', pr.x * TILE, pr.y * TILE - 4);
    else spr(m, pr.s, pr.x * TILE, pr.y * TILE);
  }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (!face(x, y)) continue;
    if (HD) {
      const k = !face(x - 1, y) ? 0 : !face(x + 1, y) ? 2 : 1;
      if (F(x, y + 1)) { envSpr(m, 'wbase_' + k, x * TILE, y * TILE); if (!F(x, y - 1) && !face(x, y - 1)) envSpr(m, 'wtop_' + k, x * TILE, (y - 1) * TILE); }
      else envSpr(m, 'wtop_' + k, x * TILE, y * TILE);
      continue;
    }
    const r = D.floorVar[y * MW + x];
    spr(m, F(x, y + 1) && r === 7 ? 'wall_hole_1' : F(x, y + 1) && r === 8 ? 'wall_hole_2' : 'wall_mid', x * TILE, y * TILE);
  }
  for (const b of D.banners) spr(m, b.s, b.x * TILE, b.y * TILE);
  if (HD) {
    // bords latéraux des murs : liseré de pierre claire
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (F(x, y) || face(x, y)) continue;
      const X = x * TILE, Y = y * TILE;
      if (F(x + 1, y)) { m.fillStyle = '#2a2230'; m.fillRect(X + 11, Y, 1, TILE); m.fillStyle = '#9d93a3'; m.fillRect(X + 12, Y, 3, TILE); m.fillStyle = '#d6cfd8'; m.fillRect(X + 12, Y, 1, TILE); m.fillStyle = '#2a2230'; m.fillRect(X + 15, Y, 1, TILE); }
      if (F(x - 1, y)) { m.fillStyle = '#2a2230'; m.fillRect(X, Y, 1, TILE); m.fillStyle = '#9d93a3'; m.fillRect(X + 1, Y, 3, TILE); m.fillStyle = '#d6cfd8'; m.fillRect(X + 1, Y, 1, TILE); m.fillStyle = '#2a2230'; m.fillRect(X + 4, Y, 1, TILE); }
    }
    return;
  }
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

// dessine une tuile du décor détaillé (32 px) à la taille du monde (16 px par case)
function envSpr(c, name, x, y, w, h) {
  const r = ENV[name]; if (!r) return;
  c.drawImage(envImg, r[0], r[1], r[2], r[3], x, y, w ?? r[2] / 2, h ?? r[3] / 2);
}
// Décor en dehors de la zone de jeu : caverne, lave, gouffres, rochers — assombri pour bien se distinguer
function drawOutside(m, D) {
  const BLOB = { 1: 'lava', 2: 'pit', 3: 'rock' };
  const dec = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH ? 0 : D.decor[y * MW + x]);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x;
    if (D.tiles[i]) continue;
    const X = x * TILE, Y = y * TILE;
    envSpr(m, 'cave_' + ((x * 7 + y * 13 + (x * y) % 5) % 3), X, Y);
    const t = D.decor[i];
    if (t) {
      const ii = dec(x - 1, y) !== t ? 0 : dec(x + 1, y) !== t ? 2 : 1;
      const jj = dec(x, y - 1) !== t ? 0 : dec(x, y + 1) !== t ? 2 : 1;
      envSpr(m, `${BLOB[t]}_${ii}_${jj}`, X, Y);
    }
  }
  for (const sc of D.scatter) envSpr(m, sc.s, sc.x * TILE, sc.s === 'bigrock' ? (sc.y - 1) * TILE : sc.y * TILE);
  // voile sombre : plus on est près des murs, plus c'est sombre (la zone jouable ressort)
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x;
    if (D.tiles[i]) continue;
    const d = D.distF[i];
    let a = d <= 1 ? 0.86 : d === 2 ? 0.7 : 0.55;
    if (D.decor[i] === 1) a -= 0.2;
    m.fillStyle = `rgba(6,4,14,${a})`;
    m.fillRect(x * TILE, y * TILE, TILE, TILE);
  }
}

// Sol peint en pixel art HD pour le style « HD 2.5D » (sol de la zone de jeu, ou décor extérieur)
function groundCanvas(kind) {
  const D = G.D;
  const c = document.createElement('canvas'); c.width = MW * TILE * 2; c.height = MH * TILE * 2;
  const m = c.getContext('2d'); m.imageSmoothingEnabled = false; m.scale(2, 2); m._hd = true;
  if (kind === 'outside') { m.fillStyle = '#100a0e'; m.fillRect(0, 0, MW * TILE, MH * TILE); drawOutside(m, D); return c; }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (!isFloor(x, y)) continue;
    const v = D.floorVar[y * MW + x];
    envSpr(m, v === 5 || v === 6 ? 'floorv_' + (y % 3) : `floor_${x % 3}_${y % 3}`, x * TILE, y * TILE);
  }
  for (const pr of D.props) if (pr.s === 'skull') spr(m, 'skull', pr.x * TILE, pr.y * TILE);
  return c;
}
// masque de visibilité du décor extérieur (1 pixel par case)
function buildOutMask(D) {
  const c = document.createElement('canvas'); c.width = MW; c.height = MH;
  const x = c.getContext('2d'); const img = x.createImageData(MW, MH);
  for (let i = 0; i < MW * MH; i++) {
    if (D.tiles[i]) continue;
    const d = D.distF[i];
    let a = d <= 1 ? 0 : d === 2 ? 0.3 : 0.5;
    if (D.decor[i] === 1) a = Math.min(0.75, a + 0.25);
    img.data[i * 4 + 3] = Math.round(a * 255);
  }
  x.putImageData(img, 0, 0);
  return c;
}

function render() {
  const p = G.p;
  const sx = (Math.random() - 0.5) * G.shake, sy = (Math.random() - 0.5) * G.shake;
  const cx = Math.round(G.cam.x - VW / 2 + sx), cy = Math.round(G.cam.y - VH / 2 + sy);
  if (mapCv._res !== RES) prerenderMap();
  baseT(ctx);
  ctx.fillStyle = '#07050b'; ctx.fillRect(0, 0, VW, VH);
  // carte
  const MWp = MW * TILE, MHp = MH * TILE;
  const srcX = clamp(cx, 0, MWp), srcY = clamp(cy, 0, MHp);
  const w = Math.min(VW - (srcX - cx), MWp - srcX), h = Math.min(VH - (srcY - cy), MHp - srcY);
  if (w > 0 && h > 0) ctx.drawImage(mapCv, srcX * RES, srcY * RES, w * RES, h * RES, srcX - cx, srcY - cy, w, h);
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
    if (RES === 2) {
      envSpr(ctx, 'torch', to.x - 8, to.y - 17);
      const f = Math.sin(t * 17 + to.x) > 0.3 ? 1 : 0;
      ctx.fillStyle = '#fff2b0'; ctx.fillRect(to.x - 0.5, to.y - 15 - f, 1, 1.5);
    } else spr(ctx, 'torch_f' + (Math.floor(t * 9 + to.x) % 3), to.x - 3, to.y - 4);
  }
  // boules de feu
  for (const f of G.fire) {
    const x = Math.round(f.x), y = Math.round(f.y);
    ctx.fillStyle = '#c0300a'; ctx.fillRect(x - 3, y - 2, 6, 4); ctx.fillRect(x - 2, y - 3, 4, 6);
    ctx.fillStyle = '#ff9a3a'; ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.fillStyle = '#fff2b0'; ctx.fillRect(x - 1, y - 1, 2, 2);
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
    } else if (f.type === 'ring') {
      const r = f.r0 + (f.r1 - f.r0) * (1 - k);
      ctx.save(); ctx.globalAlpha = k; ctx.strokeStyle = f.c; ctx.lineWidth = f.w || 2;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.7, 0, 0, 6.29); ctx.stroke(); ctx.restore();
    } else if (f.type === 'blink') {
      ctx.save(); ctx.globalAlpha = k * 0.8; ctx.strokeStyle = '#c9a2ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(f.x0, f.y0); ctx.lineTo(f.x1, f.y1); ctx.stroke(); ctx.restore();
    } else if (f.type === 'flash') {
      ctx.save(); ctx.globalAlpha = k; ctx.fillStyle = '#fff6c0';
      ctx.beginPath(); ctx.arc(f.x, f.y, 7 * k + 3, 0, 6.29); ctx.fill(); ctx.restore();
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
  baseT(ctx, -cx, -cy);
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
  // barre d'incantation du mage
  if (p.cls === 'mage' && p.casting > 0) {
    const k = 1 - p.casting / p.castT, bw = 22, bx = Math.round(p.x - bw / 2), by = Math.round(p.y - 34);
    ctx.fillStyle = '#000'; ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
    ctx.fillStyle = '#3a2008'; ctx.fillRect(bx, by, bw, 3);
    ctx.fillStyle = '#ffb02a'; ctx.fillRect(bx, by, Math.round(bw * k), 3);
    ctx.fillStyle = '#fff2b0'; ctx.fillRect(bx, by, Math.round(bw * k), 1);
  }
  // barres de vie des ennemis blessés
  for (const e of G.enemies) {
    if (e.dead || e.hp >= e.maxHp || !e.active) continue;
    const bw = e.d.elite ? 26 : 14, bx = Math.round(e.x - bw / 2), by = Math.round(e.y - sprH(e) - 6);
    ctx.fillStyle = '#000'; ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
    ctx.fillStyle = '#5a1010'; ctx.fillRect(bx, by, bw, 2);
    ctx.fillStyle = e.d.elite ? '#ff8a2a' : '#e8402a'; ctx.fillRect(bx, by, Math.ceil(bw * e.hp / e.maxHp), 2);
  }
  baseT(ctx);
  // voile rouge quand on est touché
  if (p.hurtT > 0) { ctx.fillStyle = `rgba(200,20,20,${p.hurtT * 0.8})`; ctx.fillRect(0, 0, VW, VH); }
  if (p.hp / p.maxHp < 0.3 && state === 'play') {
    const a = 0.12 + 0.08 * Math.sin(t * 5);
    const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.max(VW, VH) * 0.7);
    g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(150,0,0,${a * 3})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  }
}

function baseT(c, tx = 0, ty = 0) { c.setTransform(RES, 0, 0, RES, tx * RES, ty * RES); }

// ---------- personnages détaillés (mode HD) ----------
const dirOf = (fx, fy) => (Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? 'right' : 'left') : (fy > 0 ? 'down' : 'up'));
function tintedFrame(key, color) {
  const ck = key + color;
  let c = tintCache.get(ck);
  if (!c) {
    const r = HDS[key];
    c = document.createElement('canvas'); c.width = r[2]; c.height = r[3];
    const x = c.getContext('2d');
    x.drawImage(hdImg, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, r[2], r[3]);
    tintCache.set(ck, c);
  }
  return c;
}
function drawHD(key, x, y, sc = 1, tint, alpha) {
  const r = HDS[key];
  if (!r) return false;
  const k = 0.5 * sc;
  const dx = x + r[4] * k, dy = y + r[5] * k + 2;
  if (!tint) ctx.drawImage(hdImg, r[0], r[1], r[2], r[3], dx, dy, r[2] * k, r[3] * k);
  else {
    ctx.save(); if (alpha != null) ctx.globalAlpha = alpha;
    ctx.drawImage(tintedFrame(key, tint), dx, dy, r[2] * k, r[3] * k);
    ctx.restore();
  }
  return true;
}
function playerHDKey(p) {
  const base = p.cls === 'mage' ? 'p_mage' : 'p_warrior';
  const d = dirOf(p.fx, p.fy);
  if (p.hurtT > 0) return `${base}_hurt_down_2`;
  if (p.cls === 'mage') {
    if (p.casting > 0) return `${base}_spell_${d}_${Math.min(4, Math.floor((1 - p.casting / p.castT) * 5))}`;
    if (p.castFx > 0) return `${base}_spell_${d}_${p.castFx > 0.1 ? 5 : 6}`;
  } else {
    if (p.whirl > 0) return `${base}_slash_${['down', 'left', 'up', 'right'][Math.floor(G.time * 18) % 4]}_4`;
    if (p.swing > 0) return `${base}_slash_${d}_${Math.min(5, Math.floor((1 - p.swing / 0.2) * 6))}`;
  }
  if (p.moving || p.charging > 0) return `${base}_walk_${d}_${1 + (Math.floor(p.anim) % 8)}`;
  return `${base}_walk_${d}_0`;
}
function drawPlayerHD() {
  const p = G.p;
  for (const tr of p.trail) drawHD(playerHDKey(p), tr.x, tr.y, 1, '#ffffff', tr.t * 1.4);
  shadow(p.x, p.y, 6);
  const key = playerHDKey(p);
  drawHD(key, p.x, p.y);
  if (p.hurtT > 0.15) drawHD(key, p.x, p.y, 1, '#ffffff', 0.8);
  if (p.cls === 'mage' && p.casting > 0) {
    const k = 1 - p.casting / p.castT, s = 2 + k * 3;
    const hx = p.x + (dirOf(p.fx, p.fy) === 'left' ? -5 : dirOf(p.fx, p.fy) === 'right' ? 5 : 0), hy = p.y - 30;
    ctx.fillStyle = '#ff7a2a'; ctx.fillRect(hx - s / 2 - 1, hy - s / 2 - 1, s + 2, s + 2);
    ctx.fillStyle = '#ffe07a'; ctx.fillRect(hx - s / 2, hy - s / 2, s, s);
  }
}
function enemyHDKey(e) {
  const d = dirOf(G.p.x - e.x, G.p.y - e.y);
  const ranged = !!e.d.ranged;
  if (e.state === 'windup') return ranged ? `${e.kind}_spell_${d}_${Math.min(4, 1 + Math.floor((1 - e.t / e.d.windup) * 4))}` : `${e.kind}_slash_${d}_1`;
  if (e.state === 'slam') return `${e.kind}_slash_${d}_1`;
  if (e.state === 'recover' && e.t > 0.12) return ranged ? `${e.kind}_spell_${d}_5` : `${e.kind}_slash_${d}_4`;
  if (e.moving) return `${e.kind}_walk_${d}_${1 + (Math.floor(e.anim) % 8)}`;
  return `${e.kind}_walk_${d}_0`;
}
function drawEnemyHD(e) {
  const key = enemyHDKey(e);
  if (!HDS[key]) return false;
  const sc = e.d.elite ? 2 : 1;
  const charging = e.state === 'windup' || e.state === 'slam';
  const ox = charging ? rand(-0.6, 0.6) : 0;
  shadow(e.x, e.y, e.d.elite ? 12 : 5);
  drawHD(key, e.x + ox, e.y, sc);
  if (e.flash > 0) drawHD(key, e.x + ox, e.y, sc, '#ffffff', 0.9);
  else if (e.frozen > 0) drawHD(key, e.x, e.y, sc, '#bdf0ff', 0.6);
  else if (charging) drawHD(key, e.x + ox, e.y, sc, '#ff3a2a', 0.3 + 0.3 * Math.sin(G.time * 30));
  const top = Math.round(e.y - sprH(e) - 4);
  if (charging && e.flash <= 0 && !(e.frozen > 0)) { ctx.fillStyle = '#ff4a3a'; ctx.fillRect(Math.round(e.x) - 1, top - 6, 2, 4); ctx.fillRect(Math.round(e.x) - 1, top - 1, 2, 2); }
  if (e.stun > 0) for (let i = 0; i < 3; i++) { const a = G.time * 6 + i * 2.1; ctx.fillStyle = '#ffe58a'; ctx.fillRect(Math.round(e.x + Math.cos(a) * 6), Math.round(top + 2 + Math.sin(a) * 2), 2, 2); }
  return true;
}

// En mode 3D, le canevas 2D ne dessine plus que les textes et barres par-dessus la scène
function renderOverlay3D() {
  const p = G.p;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const k = canvas.width / window.innerWidth;
  const P = (x, y, h) => { const r = R3D.project(x, y, h); return [r[0] * k, r[1] * k, r[2]]; };
  // barres de vie des ennemis + signal d'attaque
  for (const e of G.enemies) {
    if (e.dead || !e.active) continue;
    const look = { big_zombie: 1.9, ogre: 2, big_demon: 2.15, goblin: 0.8, imp: 0.8, tiny_zombie: 0.85 }[e.kind] || 1;
    const [x, y, ok] = P(e.x, e.y, (e.kind === 'mimic' ? 0.7 : 1.3 * look) * R3D.charScale);
    if (!ok) continue;
    if (e.hp < e.maxHp) {
      const bw = e.d.elite ? 28 : 15, bx = Math.round(x - bw / 2), by = Math.round(y - 6);
      ctx.fillStyle = '#000'; ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
      ctx.fillStyle = '#5a1010'; ctx.fillRect(bx, by, bw, 2);
      ctx.fillStyle = e.d.elite ? '#ff8a2a' : '#e8402a'; ctx.fillRect(bx, by, Math.ceil(bw * e.hp / e.maxHp), 2);
    }
    if ((e.state === 'windup' || e.state === 'slam') && !(e.frozen > 0)) { ctx.fillStyle = '#ff4a3a'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 16, 2, 5); ctx.fillRect(Math.round(x) - 1, Math.round(y) - 9, 2, 2); }
    if (e.stun > 0) for (let i = 0; i < 3; i++) { const a = G.time * 6 + i * 2.1; ctx.fillStyle = '#ffe58a'; ctx.fillRect(Math.round(x + Math.cos(a) * 6), Math.round(y - 12 + Math.sin(a) * 2), 2, 2); }
  }
  // barre d'incantation
  if (p.cls === 'mage' && p.casting > 0) {
    const [x, y] = P(p.x, p.y, 1.75 * R3D.charScale);
    const kk = 1 - p.casting / p.castT, bw = 24, bx = Math.round(x - bw / 2), by = Math.round(y - 4);
    ctx.fillStyle = '#000'; ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
    ctx.fillStyle = '#3a2008'; ctx.fillRect(bx, by, bw, 3);
    ctx.fillStyle = '#ffb02a'; ctx.fillRect(bx, by, Math.round(bw * kk), 3);
  }
  // nombres de dégâts
  ctx.textAlign = 'center';
  for (const tx of G.texts) {
    const [x, y, ok] = P(tx.x, tx.y + 18, 1.3 * R3D.charScale);
    if (!ok) continue;
    const kk = tx.t / tx.T;
    const s = tx.crit ? tx.size * (1 + Math.max(0, kk - 0.8) * 3) : tx.size;
    ctx.font = `700 ${Math.round(s)}px Pixel, monospace`;
    ctx.globalAlpha = Math.min(1, kk * 2.5);
    ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.strokeText(tx.text, Math.round(x), Math.round(y));
    ctx.fillStyle = tx.color; ctx.fillText(tx.text, Math.round(x), Math.round(y));
  }
  ctx.globalAlpha = 1;
  if (p.hurtT > 0) { ctx.fillStyle = `rgba(200,20,20,${p.hurtT * 0.7})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  if (p.hp / p.maxHp < 0.3 && state === 'play') {
    const W = canvas.width, H = canvas.height, a = 0.12 + 0.08 * Math.sin(G.time * 5);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(150,0,0,${a * 3})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}

function shadow(x, y, w) {
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y + 1), w, w * 0.4, 0, 0, 6.29); ctx.fill();
}
function drawPlayer() {
  const p = G.p;
  if (p.inv > 0 && p.hurtT <= 0 && p.charging <= 0 && Math.floor(G.time * 20) % 2) return;
  if (GFX === 'hd') return drawPlayerHD();
  for (const tr of p.trail) {
    ctx.save(); ctx.globalAlpha = tr.t * 1.6;
    spr(ctx, 'knight_m_run_anim_f1', tr.x - 8, tr.y - 24, { flip: p.dir < 0, img: atlasWhite });
    ctx.restore();
  }
  shadow(p.x, p.y, 6);
  const fr = Math.floor(p.anim) % 4;
  const base = CLASSES[p.cls].sprite;
  const name = p.hurtT > 0 ? base + '_hit_anim_f0' : (p.moving || p.charging > 0 ? base + '_run_anim_f' : base + '_idle_anim_f') + fr;
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
  if (p.cls === 'mage') ang = p.casting > 0 ? (p.dir > 0 ? -1.1 : -Math.PI + 1.1) : (p.dir > 0 ? -1.4 : -Math.PI + 1.4);
  else if (p.whirl > 0) ang = G.time * 28;
  else if (p.swing > 0) { const k = 1 - p.swing / 0.2; ang = base - 1.5 + 2.8 * (1 - Math.pow(1 - k, 3)); }
  else if (p.charging > 0) ang = base;
  else ang = p.dir > 0 ? -0.95 : -Math.PI + 0.95;
  const hx = p.x + (p.swing > 0 || p.whirl > 0 || p.charging > 0 ? 0 : p.dir * 4), hy = p.y - 7;
  ctx.save();
  ctx.translate(Math.round(hx), Math.round(hy));
  ctx.rotate(ang + Math.PI / 2);
  const r = SPR[w];
  if (ctx._hd) ctx.drawImage(TWIN.get(atlas), r[0] * 2, r[1] * 2, ww * 2, wh * 2, -ww / 2, -wh + 2, ww, wh);
  else ctx.drawImage(atlas, r[0], r[1], ww, wh, -ww / 2, -wh + 2, ww, wh);
  if (p.cls === 'mage' && p.casting > 0) {
    const k = 1 - p.casting / p.castT;
    const s = 2 + Math.round(k * 3);
    ctx.fillStyle = '#ff7a2a'; ctx.fillRect(-s / 2 - 1, -wh - s / 2 - 1, s + 2, s + 2);
    ctx.fillStyle = '#ffe07a'; ctx.fillRect(-s / 2, -wh - s / 2, s, s);
  }
  ctx.restore();
}
function drawEnemy(e) {
  const d = e.d;
  if (GFX === 'hd' && drawEnemyHD(e)) return;
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
  if (e.frozen > 0) {
    ctx.save(); ctx.globalAlpha = 0.65;
    spr(ctx, name, e.x - sw / 2, e.y - sh + 3, { flip: e.dir < 0, img: atlasIce });
    ctx.restore();
    ctx.fillStyle = '#e8fbff';
    for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(e.x - sw / 2 + 3 + i * (sw - 6) / 2), Math.round(e.y - sh + 6 + (i % 2) * 8), 1, 2);
  }
  if (charging && e.flash <= 0 && !(e.frozen > 0)) {
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
  if (RES === 2) {
    envSpr(ctx, c.open && fr >= 1 ? 'chest_open' : 'chest_closed', c.x - 8, c.y - 15);
    if (c.big && !c.open) { ctx.save(); ctx.globalAlpha = 0.25 + 0.15 * Math.sin(G.time * 4); ctx.fillStyle = '#ffd36a'; ctx.fillRect(c.x - 8, c.y - 15, 16, 16); ctx.restore(); }
  } else spr(ctx, (c.open ? 'chest_empty_open_anim_f' : 'chest_full_open_anim_f') + (c.open ? fr : 0), c.x - 8, c.y - 14);
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

const LIGHT_COLORS = { lava: [255, 110, 40], ice: [150, 220, 255], player: [255, 190, 120], torch: [255, 140, 50], fire: [255, 120, 40], portal: [170, 110, 255], gold: [255, 210, 90], rare: [120, 160, 255] };
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
  for (const f of G.fire) lights.push([f.x, f.y, 34, 'fire', 0.45]);
  for (const f of G.fx) {
    if (f.type === 'flash') lights.push([f.x, f.y, 60 * (f.t / f.T) + 10, 'fire', 0.5]);
    if (f.type === 'ring' && f.c === '#bdf0ff') lights.push([f.x, f.y, 60, 'ice', 0.35 * (f.t / f.T)]);
  }
  if (p.cls === 'mage' && p.casting > 0) lights.push([p.x + p.fx * 6, p.y - 22, 20 + 20 * (1 - p.casting / p.castT), 'fire', 0.4]);
  if (G.portal) lights.push([G.portal.x, G.portal.y - 10, 64 * Math.min(1, G.portal.t), 'portal', 0.3]);
  for (const k of G.pickups) if (k.type === 'key' || (k.type === 'weapon' && k.w.rarity >= 3)) lights.push([k.x, k.y - 6, 26, k.type === 'key' ? 'gold' : 'rare', 0.3]);
  for (const c of G.chests) if (c.big && !c.open) lights.push([c.x, c.y - 6, 30, 'gold', 0.25]);
  for (const g of G.D.glows || []) {
    if (Math.abs(g.x - G.cam.x) > VW / 2 + 40 || Math.abs(g.y - G.cam.y) > VH / 2 + 40) continue;
    lights.push([g.x, g.y, 30 + Math.sin(t * 2 + g.x) * 4, 'fire', 0.1]);
  }
  if (G.D.vault && G.D.vault.sealed) { const d = G.D.vault.doors[0]; lights.push([d.x * TILE + 8, d.y * TILE + 8, 30, 'gold', 0.2]); }
  for (const tl of G.tele) lights.push([tl.x, tl.y, tl.r + 10, 'fire', 0.25]);

  lctx.setTransform(RES, 0, 0, RES, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.fillStyle = 'rgba(4,2,10,0.93)';
  lctx.fillRect(0, 0, VW, VH);
  lctx.globalCompositeOperation = 'destination-out';
  // le décor extérieur reste faiblement visible (sans éclairer les salles inexplorées)
  if (G.outMask) {
    lctx.imageSmoothingEnabled = true;
    lctx.drawImage(G.outMask, 0, 0, MW, MH, -cx, -cy, MW * TILE, MH * TILE);
    lctx.imageSmoothingEnabled = false;
  }
  for (const [x, y, r] of lights) {
    const lx = x - cx, ly = y - cy;
    const g = lctx.createRadialGradient(lx, ly, 0, lx, ly, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g; lctx.fillRect(lx - r, ly - r, r * 2, r * 2);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(lightCv, 0, 0);
  baseT(ctx);
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
  set('cls', p.cls, (v) => {
    const mage = v === 'mage';
    $('resBar').classList.toggle('mana', mage);
    $('costCharge').textContent = mage ? MAGE.blinkCost : '';
    $('costWhirl').textContent = mage ? MAGE.novaCost : 35;
    $('costAttack').textContent = mage ? MAGE.fireCost : '';
    refreshIcons();
  });
}
function hudFrame() {
  const p = G.p;
  const mage = p.cls === 'mage';
  const rg = Math.floor(mage ? p.mana : p.rage);
  if (hudCache.rage !== rg) { hudCache.rage = rg; $('rageFill').style.transform = `scaleX(${rg / 100})`; $('rageText').textContent = rg + (mage ? ' mana' : ' rage'); }
  const btn = (id, cd, max, off) => {
    const el = $(id);
    const pct = max ? Math.round(cd / max * 100) : 0;
    if (el._p !== pct) { el._p = pct; el.querySelector('.cd').style.setProperty('--p', pct + '%'); if (pct === 0 && max > 1) { el.classList.remove('ready'); void el.offsetWidth; el.classList.add('ready'); } }
    if (el._off !== off) { el._off = off; el.classList.toggle('off', off); }
  };
  if (mage) {
    btn('btnAttack', p.casting > 0 ? p.casting : p.cd.attack, p.casting > 0 ? p.castT : p.cdMax.attack, p.mana < MAGE.fireCost);
    btn('btnCharge', p.cd.charge, p.cdMax.charge, p.mana < MAGE.blinkCost);
    btn('btnWhirl', p.cd.whirl, p.cdMax.whirl, p.mana < MAGE.novaCost);
  } else {
    btn('btnAttack', p.cd.attack, p.cdMax.attack, false);
    btn('btnCharge', p.cd.charge, p.cdMax.charge, false);
    btn('btnWhirl', p.cd.whirl, p.cdMax.whirl, p.rage < 35);
  }
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
function hdIcon(btn, name) {
  const cv = $(btn).querySelector('canvas'); const r = ICONS[name];
  cv.width = 48; cv.height = 48;
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, 48, 48);
  c.drawImage(iconImg, r[0], r[1], r[2], r[3], 4, 4, 40, 40);
}
function refreshIcons() {
  const w = G ? G.p.weapon.sprite : 'weapon_regular_sword';
  if (GFX !== 'classic' && ICONS) {
    const mage = G && G.p.cls === 'mage';
    hdIcon('btnAttack', mage ? 'i_fire' : 'i_attack');
    hdIcon('btnCharge', mage ? 'i_blink' : 'i_charge');
    hdIcon('btnWhirl', mage ? 'i_nova' : 'i_whirl');
    hdIcon('btnPotion', 'i_potion');
    return refreshInv(true);
  }
  if (G && G.p.cls === 'mage') { mageIcons(); return refreshInv(); }
  drawIconTo($('btnAttack').querySelector('canvas'), (c) => { const [, , ww, wh] = sprSize(w); c.save(); c.translate(16, 16); c.rotate(0.75); const r = SPR[w]; const k = wh > 24 ? 0.8 : 1; c.drawImage(atlas, r[0], r[1], ww, wh, -ww * k / 2, -wh * k / 2, ww * k, wh * k); c.restore(); });
  drawIconTo($('btnCharge').querySelector('canvas'), (c) => {
    c.globalAlpha = 0.35; spr(c, 'knight_m_run_anim_f1', 1, 3, { img: atlasWhite }); c.globalAlpha = 0.6; spr(c, 'knight_m_run_anim_f1', 5, 3, { img: atlasWhite }); c.globalAlpha = 1; spr(c, 'knight_m_run_anim_f1', 10, 3);
  });
  drawIconTo($('btnWhirl').querySelector('canvas'), (c) => {
    c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.arc(16, 15, 11, 0.3, 5.2); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(26, 21); c.lineTo(29, 13); c.lineTo(22, 15); c.fill();
    spr(c, 'knight_m_idle_anim_f0', 8, 2);
  });
  refreshInv();
}
function mageIcons() {
  drawIconTo($('btnAttack').querySelector('canvas'), (c) => {
    c.fillStyle = '#ff7a2a'; for (let i = 0; i < 4; i++) c.fillRect(4 + i * 3, 21 - i * 3, 5, 5);
    c.fillStyle = '#c0300a'; c.fillRect(15, 7, 12, 12); c.fillRect(13, 9, 16, 8);
    c.fillStyle = '#ff9a3a'; c.fillRect(16, 9, 10, 8);
    c.fillStyle = '#fff2b0'; c.fillRect(19, 11, 4, 4);
  });
  drawIconTo($('btnCharge').querySelector('canvas'), (c) => {
    c.globalAlpha = 0.4; spr(c, 'wizzard_m_idle_anim_f0', 1, 3, { img: atlasWhite });
    c.globalAlpha = 1; c.fillStyle = '#c9a2ff'; for (let i = 0; i < 6; i++) c.fillRect(8 + i * 3, 16 + (i % 2) * 2, 2, 2);
    spr(c, 'wizzard_m_idle_anim_f0', 14, 3);
  });
  drawIconTo($('btnWhirl').querySelector('canvas'), (c) => {
    c.strokeStyle = '#bdf0ff'; c.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; c.beginPath(); c.moveTo(16 - Math.cos(a) * 11, 16 - Math.sin(a) * 11); c.lineTo(16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11); c.stroke(); }
    c.fillStyle = '#ffffff'; c.fillRect(14, 14, 4, 4);
  });
  drawIconTo($('btnPotion').querySelector('canvas'), (c) => spr(c, 'flask_big_red', 8, 6));
}
function refreshInv(keepPotion) {
  if (!keepPotion) drawIconTo($('btnPotion').querySelector('canvas'), (c) => spr(c, 'flask_big_red', 8, 6));
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
  // 3ème personne : glisser le doigt à droite de l'écran fait tourner la caméra
  const cz = $('camZone');
  let cid = null, clx = 0, cly = 0;
  cz.addEventListener('pointerdown', (e) => { audioUnlock(); if (cid !== null) return; cid = e.pointerId; clx = e.clientX; cly = e.clientY; cz.setPointerCapture(e.pointerId); e.preventDefault(); });
  cz.addEventListener('pointermove', (e) => {
    if (e.pointerId !== cid) return;
    camYaw += (e.clientX - clx) * 0.009;
    camPitch = clamp(camPitch + (e.clientY - cly) * 0.006, -0.15, 0.75);
    clx = e.clientX; cly = e.clientY; camManualT = 2.5;
  });
  const cend = (e) => { if (e.pointerId === cid) cid = null; };
  cz.addEventListener('pointerup', cend); cz.addEventListener('pointercancel', cend);
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
  bind('btnAttack', () => actMain(), true);
  bind('btnCharge', () => act2());
  bind('btnWhirl', () => act3());
  bind('btnPotion', doPotion);

  window.addEventListener('keydown', (e) => {
    audioUnlock();
    input.keys[e.code] = true;
    if (state !== 'play') { if (e.code === 'Escape' && state === 'pause') resume(); return; }
    if (e.code === 'Space' || e.code === 'KeyJ') { input.attackHeld = true; actMain(); }
    if (e.code === 'KeyK') act2();
    if (e.code === 'KeyL') act3();
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
  ['title', 'help', 'pause', 'death', 'classSel'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
  setTimeout(refreshUpdateBar, 0);
}
function showTitle() {
  state = 'title';
  $('hud').classList.add('hidden');
  const run = store.get('rw_run', null);
  $('continueBtn').classList.toggle('hidden', !run);
  if (run) $('continueBtn').textContent = `Continuer : ${CLASSES[run.cls || 'warrior'].name}, étage ${run.floor}`;
  const parts = [];
  if (meta.gold) parts.push(`Or en réserve : ${meta.gold}`);
  if (meta.bestFloor) parts.push(`Record : étage ${meta.bestFloor}`);
  $('titleStats').textContent = parts.join(' · ');
  showScreen('title');
}
function drawPortraits() {
  document.querySelectorAll('canvas[data-portrait]').forEach((cv) => {
    const base = cv.dataset.portrait;
    cv.width = 24; cv.height = 42;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, 24, 42);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(12, 37, 8, 3, 0, 0, 6.29); c.fill();
    const w = base === 'wizzard_m' ? 'weapon_green_magic_staff' : 'weapon_regular_sword';
    const r = SPR[w];
    c.drawImage(atlas, r[0], r[1], r[2], r[3], 15, 30 - r[3] + 6, r[2], r[3]);
    spr(c, base + '_idle_anim_f0', 4, 10);
  });
}
function pause() { if (state !== 'play') return; state = 'pause'; input.attackHeld = false; input.mx = input.my = 0; showScreen('pause'); muffleMusic(true); }
function resume() { showScreen(null); state = 'play'; last = performance.now(); muffleMusic(false); }
function setupScreens() {
  const begin = (cls) => { audioUnlock(); store.del('rw_run'); startRun(null, cls); refreshIcons(); toast(`${CLASSES[cls].name} · Étage 1`, '#c9a2ff', 1.6); };
  $('newBtn').onclick = () => { drawPortraits(); showScreen('classSel'); };
  document.querySelectorAll('.classCard').forEach((b) => { b.onclick = () => begin(b.dataset.cls); });
  $('classBack').onclick = showTitle;
  $('continueBtn').onclick = () => { audioUnlock(); const r = store.get('rw_run', null); if (r) { startRun(r); refreshIcons(); toast(`Étage ${r.floor}`, '#c9a2ff', 1.6); } };
  $('helpBtn').onclick = () => showScreen('help');
  $('helpBack').onclick = () => showScreen('title');
  $('pauseBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); pause(); });
  $('resumeBtn').onclick = resume;
  const sl = () => {
    document.querySelectorAll('.musicBtn').forEach((b) => { b.textContent = 'Musique : ' + (meta.music ? 'oui' : 'non'); });
    document.querySelectorAll('.sfxBtn').forEach((b) => { b.textContent = 'Effets : ' + (meta.sound ? 'oui' : 'non'); });
  };
  sl();
  const GFX_NAMES = { classic: 'Classique', hd: 'Pixel HD', hd3d: 'HD 2.5D', cel: 'Cel-shading 3D', tps: '3D 3ème personne' };
  const gl = () => document.querySelectorAll('.gfxBtn').forEach((b) => { b.textContent = 'Graphismes : ' + GFX_NAMES[meta.gfx]; });
  gl();
  document.querySelectorAll('.gfxBtn').forEach((b) => { b.onclick = async () => {
    const order = ['classic', 'hd', 'hd3d', 'cel', 'tps'];
    meta.gfx = order[(order.indexOf(meta.gfx) + 1) % order.length]; saveMeta(); gl();
    await setGfx(meta.gfx);
  }; });
  document.querySelectorAll('.musicBtn').forEach((b) => { b.onclick = () => { audioUnlock(); meta.music = !meta.music; saveMeta(); setVolumes(); sl(); }; });
  document.querySelectorAll('.sfxBtn').forEach((b) => { b.onclick = () => { audioUnlock(); meta.sound = !meta.sound; saveMeta(); setVolumes(); sl(); SFX.ui(); }; });
  // petit clic sur tous les boutons de menu
  document.querySelectorAll('.screen button').forEach((b) => b.addEventListener('pointerdown', () => { audioUnlock(); SFX.ui(); }));
  // le premier toucher sur l'écran titre lance la musique (iOS l'exige)
  document.addEventListener('pointerdown', () => audioUnlock(), { passive: true });
  $('quitBtn').onclick = () => { if (G) { meta.gold += G.p.gold; saveMeta(); } store.del('rw_run'); G = null; muffleMusic(false); showTitle(); };
  $('retryBtn').onclick = () => { drawPortraits(); showScreen('classSel'); };
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
  if (state === 'title') setMusic('title');
  else if (state === 'dead') setMusic(null);
  else if (G && (state === 'play' || state === 'pause')) {
    const r = G.room;
    setMusic(r && r.locked ? (r.enemies.some((e) => !e.dead && e.d.elite) ? 'boss' : 'combat') : 'explore');
  }
  if (!G) { ctx.fillStyle = '#0b0712'; ctx.fillRect(0, 0, VW, VH); return; }
  if (state === 'play') { update(dt); hudFrame(); }
  else if (state === 'dead') { G.time += dt; for (const pt of G.parts) { pt.life -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; } }
  if (is3D(GFX) && R3D && R3D.enabled) { R3D.render(); renderOverlay3D(); }
  else render();
  if (state === 'play' && Math.floor(G.time) !== hudCache.sec) { hudCache.sec = Math.floor(G.time); updateHUD(); }
}

const is3D = (m) => m === 'cel' || m === 'hd3d' || m === 'tps';
async function setGfx(mode) {
  GFX = mode;
  if (is3D(mode) && !(await start3D())) { toast('Le mode 3D n’a pas pu démarrer sur cet appareil', '#ff8a7a', 2.5); mode = 'classic'; meta.gfx = 'classic'; saveMeta(); GFX = mode; }
  document.body.classList.toggle('tps', mode === 'tps');
  if (!is3D(mode)) stop3D(); else { R3D.setStyle(mode === 'hd3d' ? 'pixel' : 'cel'); R3D.resize(); }
  if (mode === 'tps' && G) { const p = G.p; camYaw = Math.atan2(p.fx, -p.fy); }
  resize();
  if (G && !is3D(mode)) prerenderMap();
  refreshIcons();
}
// le mode 3D est chargé seulement si on le choisit (fichier r3d.js)
let R3D = null;
async function start3D() {
  try {
    if (!R3D) { toast('Chargement de la 3D…', '#c9a2ff', 4); const m = await import('./r3d.js'); R3D = await m.create(canvas3d(), {
      getGame: () => G, getState: () => state, getStyle: () => (GFX === 'hd3d' ? 'pixel' : 'cel'),
      getCamMode: () => (GFX === 'tps' ? 'tps' : 'top'), getYaw: () => camYaw, getPitch: () => camPitch,
      groundCanvas, playerKey: () => playerHDKey(G.p), enemyKey: enemyHDKey,
      get HDS() { return HDS; }, get SPR() { return SPR; }, get ENV() { return ENV; },
      get hdImg() { return hdImg; }, get envImg() { return envImg; }, get atlas2x() { return TWIN.get(atlas); },
    }); }
    R3D.enable(true);
    document.body.classList.add('cel');
    return true;
  } catch (e) { console.error(e); return false; }
}
function stop3D() { if (R3D) R3D.enable(false); document.body.classList.remove('cel'); }
function canvas3d() { let c = document.getElementById('game3d'); if (!c) { c = document.createElement('canvas'); c.id = 'game3d'; document.body.insertBefore(c, canvas.nextSibling); } return c; }

async function boot() {
  GFX = is3D(meta.gfx) ? 'classic' : meta.gfx;
  resize();
  try { await loadAssets(); } catch (e) { $('loading').textContent = 'Erreur de chargement. Vérifie ta connexion puis relance.'; return; }
  $('loading').classList.add('hidden');
  setupControls();
  setupScreens();
  refreshIcons();
  showTitle();
  if (meta.gfx !== 'classic') setGfx(meta.gfx);
  requestAnimationFrame(frame);
  setupUpdates();
}

// ============================================================
// 16. MISES À JOUR
// ============================================================
let swReg = null, pendingUpdate = null, updateToastShown = false;
function setupUpdates() {
  $('versionLabel').textContent = 'v' + APP_VERSION;
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => { swReg = r; }).catch(() => {});
  }
  $('updateBtn').onclick = applyUpdate;
  setTimeout(checkUpdate, 1500);
  setInterval(checkUpdate, 3 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
}
async function checkUpdate() {
  if (pendingUpdate) return;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const info = await r.json();
    if (info.version && info.version !== APP_VERSION) { pendingUpdate = info; refreshUpdateBar(); }
  } catch (e) { /* hors ligne : on réessaiera plus tard */ }
}
function refreshUpdateBar() {
  const show = !!pendingUpdate && state !== 'play';
  $('updateBar').classList.toggle('hidden', !show);
  if (pendingUpdate) $('updateNotes').textContent = pendingUpdate.notes ? 'Nouveautés : ' + pendingUpdate.notes : '';
  if (pendingUpdate && state === 'play' && !updateToastShown) {
    updateToastShown = true;
    toast('Mise à jour disponible<br><small>Ouvre la pause pour l’installer</small>', '#c9a2ff', 3);
  }
}
async function applyUpdate() {
  const btn = $('updateBtn');
  btn.textContent = 'Mise à jour…'; btn.disabled = true;
  if (G && (state === 'play' || state === 'pause')) saveRun(); // tu reprendras au début de l'étage
  let done = false;
  const reload = () => { if (done) return; done = true; location.reload(); };
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', reload);
  try { if (swReg) await swReg.update(); } catch (e) { }
  setTimeout(async () => {
    try { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch (e) { }
    reload();
  }, 2500);
}
boot();

// accès pour les tests
window.__rw = { get R3D() { return R3D; }, get GFX() { return GFX; }, get actMain() { return actMain; }, get act2() { return act2; }, get act3() { return act3; }, checkUpdate, get pending() { return pendingUpdate; }, get G() { return G; }, get state() { return state; }, get music() { return music; }, get actx() { return actx; }, SFX, startRun, nextFloor, doAttack, doCharge, doWhirl };
