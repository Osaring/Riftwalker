// =====================================================================
// SON
// - Bruitages ENREGISTRÉS (packs libres de droits CC0 : Kenney, OpenGameArt) regroupés dans
//   un seul fichier assets/sfx/sfx.wav ; sfx.json indique où commence chaque son.
//   Chaque bruitage a plusieurs variantes jouées au hasard, avec une hauteur qui varie un peu,
//   pour ne jamais entendre deux fois exactement le même coup.
// - Des sons « calculés » (graves, souffles) s'ajoutent par-dessus pour donner du poids,
//   et servent de secours tant que le fichier n'est pas chargé.
// - Musiques : vrais morceaux (Kevin MacLeod, Alexander Nakarada) qui se fondent l'un dans
//   l'autre selon la situation : exploration, combat, boss.
// =====================================================================
export const settings = { sound: true, music: true };
let ctx = null, sfx, mus, verb, noiseBuf;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    const master = ctx.createDynamicsCompressor(); master.connect(ctx.destination);
    const out = ctx.createGain(); out.gain.value = 1.6; out.connect(master);
    sfx = ctx.createGain(); sfx.connect(out);
    mus = ctx.createGain(); mus.gain.value = 0; mus.connect(out);
    // écho de crypte (réverbération)
    verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = 0.35; verb.connect(vg); vg.connect(out);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    applyVolumes();
    loadSamples();
    startMusic();
  }
  if (ctx.state === 'suspended') ctx.resume();
  for (const k in tracks) { const a = tracks[k].el; if (a.paused && settings.music) a.play().catch(() => {}); }
}

// ---------- bruitages enregistrés ----------
let bank = null, sprite = null;
const sfxFile = fetch('assets/sfx/sfx.wav').then((r) => r.arrayBuffer()).catch(() => null); // téléchargé dès le lancement
const sfxMeta = fetch('assets/sfx/sfx.json').then((r) => r.json()).catch(() => null);
async function loadSamples() {
  try {
    const [buf, meta] = await Promise.all([sfxFile, sfxMeta]);
    if (!buf || !meta) return;
    sprite = await new Promise((ok, ko) => ctx.decodeAudioData(buf.slice(0), ok, ko));
    bank = meta;
  } catch (e) { bank = null; }
}
// joue une variante au hasard du son « name » ; rate = hauteur (1 = normale)
function smp(name, { vol = 0.6, rate = 1, vary = 0.07, delay = 0, wet = 0.15, pick = -1 } = {}) {
  if (!on() || !bank || !bank[name] || !bank[name].length) return false;
  const v = bank[name], [off, dur] = v[pick >= 0 ? pick % v.length : Math.floor(Math.random() * v.length)];
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = sprite; s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
  g.gain.value = vol; s.connect(g); g.connect(sfx);
  if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
  const t = t0(delay); s.start(t, off, dur); s.stop(t + dur / s.playbackRate.value + 0.05);
  return true;
}

// ---------- musiques ----------
// Les 3 morceaux tournent en boucle en même temps ; on monte le volume de celui qui correspond
// à la situation et on baisse les autres (fondu enchaîné). Sur iPhone, c'est la façon la plus
// fiable : chaque piste est « autorisée » une fois pour toutes au premier toucher d'écran.
const tracks = {};
const TRACKS = { explore: 'assets/music/explore.mp3', combat: 'assets/music/combat.mp3', boss: 'assets/music/boss.mp3' };
const LEVEL = { explore: 0.75, combat: 0.85, boss: 0.95 };
function startMusic() {
  for (const [k, url] of Object.entries(TRACKS)) {
    const el = new Audio(url); el.loop = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
    const g = ctx.createGain(); g.gain.value = k === musicState ? LEVEL[k] : 0.0001;
    try { const src = ctx.createMediaElementSource(el); src.connect(g); g.connect(mus); } catch (e) { /* lecteur simple */ }
    tracks[k] = { el, g };
    if (settings.music) el.play().catch(() => {});
  }
}
function fadeMusic() {
  if (!ctx) return;
  for (const [k, tr] of Object.entries(tracks)) {
    const on = k === musicState;
    // le combat arrive vite, le retour au calme est plus lent
    tr.g.gain.setTargetAtTime(on ? LEVEL[k] : 0.0001, ctx.currentTime, on ? (k === 'explore' ? 1.2 : 0.35) : (k === 'explore' ? 0.3 : 1.4));
  }
}
export function applyVolumes() {
  if (!ctx) return;
  sfx.gain.setTargetAtTime(settings.sound ? 1 : 0, ctx.currentTime, 0.05);
  mus.gain.setTargetAtTime(settings.music ? 0.55 : 0, ctx.currentTime, 0.4);
  for (const k in tracks) { const a = tracks[k].el; if (settings.music) a.play().catch(() => {}); else a.pause(); }
}
const on = () => ctx && settings.sound;
const t0 = (d = 0) => ctx.currentTime + d;

function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(f, d, { type = 'sine', vol = 0.2, slide = 0, delay = 0, wet = 0.2, a = 0.005 } = {}) {
  if (!on()) return;
  const t = t0(delay), o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + d);
  env(g, t, a, vol, d); o.connect(g); g.connect(sfx);
  if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
  o.start(t); o.stop(t + d + a + 0.05);
}
function hiss(d, { vol = 0.2, f = 1000, q = 0.8, type = 'bandpass', delay = 0, sweep = 0, wet = 0.25, a = 0.004 } = {}) {
  if (!on()) return;
  const t = t0(delay), s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(40, f + sweep), t + d);
  env(g, t, a, vol, d); s.connect(fl); fl.connect(g); g.connect(sfx);
  if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
  s.start(t, Math.random() * 0.5); s.stop(t + d + a + 0.05);
}
// voix des monstres : [fréquence de la voix, timbre du souffle]
const VOICE = { ghoul: [85, 280], skeleton: [140, 900], cultist: [120, 600], brute: [55, 200], boss: [48, 180], berserker: [75, 320], thrower: [150, 1100], necro: [100, 700], bomber: [220, 1600], minion: [180, 1300] };
// chaque type de monstre a sa « voix » : [banque de cris, hauteur]
const CRY = { ghoul: ['zombie', 1], bomber: ['zombie', 1.35], skeleton: ['shade', 1.25], minion: ['shade', 1.45], thrower: ['shade', 1.15], cultist: ['shade', 0.95], necro: ['shade', 0.8], brute: ['ogre', 0.95], berserker: ['beast', 1], boss: ['giant', 0.85] };
const cry = (type, k = 1, vol = 0.5) => { const [b, r] = CRY[type] || CRY.ghoul; return smp(b, { vol, rate: r * k, vary: 0.08, wet: 0.35 }); };
export const SFX = {
  swing: (k = 1) => { k = +k || 1; if (!smp('swing', { vol: 0.45, rate: 0.9 + k * 0.12, wet: 0.08 })) hiss(0.16, { vol: 0.16, f: 900 * k, sweep: 2600 * k, q: 1.4, wet: 0.1 }); },
  // impact : le coup enregistré (chair) + la lame qui tranche + un « boum » grave calculé (le poids)
  hit: () => { if (smp('hit', { vol: 0.75 })) { smp('slice', { vol: 0.3, rate: 1.1 }); tone(70, 0.14, { vol: 0.22, slide: -30, wet: 0 }); } else { tone(95, 0.16, { vol: 0.42, slide: -55, wet: 0.08 }); hiss(0.1, { vol: 0.3, f: 900, q: 0.6 }); } },
  heavyHit: () => { if (smp('heavy', { vol: 0.85, rate: 0.9 })) { smp('slice', { vol: 0.35, rate: 0.85 }); tone(52, 0.32, { vol: 0.4, slide: -18, wet: 0.2 }); } else { tone(70, 0.3, { vol: 0.55, slide: -35, wet: 0.2 }); hiss(0.2, { vol: 0.35, f: 500, q: 0.6, type: 'lowpass' }); } },
  crit: () => { if (smp('heavy', { vol: 0.9 })) { smp('metalm', { vol: 0.3, rate: 1.2 }); smp('slice', { vol: 0.4 }); tone(48, 0.3, { vol: 0.4, slide: -12, wet: 0.2 }); } else { tone(80, 0.22, { vol: 0.45, slide: -40 }); hiss(0.14, { vol: 0.32, f: 1100 }); } },
  block: () => { if (!smp('metal', { vol: 0.65, wet: 0.3 })) { tone(420, 0.16, { type: 'triangle', vol: 0.12, slide: -120 }); hiss(0.06, { vol: 0.15, f: 3000 }); } },
  parry: () => { if (smp('metal', { vol: 0.75, wet: 0.3 })) smp('bell', { vol: 0.45, rate: 1.2, wet: 0.6 }); else { tone(1320, 0.4, { type: 'triangle', vol: 0.12, slide: -200, wet: 0.5 }); hiss(0.12, { vol: 0.25, f: 4000, q: 0.8 }); } },
  hurt: () => { if (smp('thud', { vol: 0.7, rate: 0.9 })) { tone(110, 0.18, { type: 'triangle', vol: 0.1, slide: -50 }); } else { tone(160, 0.2, { type: 'triangle', vol: 0.18, slide: -80 }); hiss(0.12, { vol: 0.18, f: 600, type: 'lowpass' }); } },
  roll: () => { if (smp('cloth', { vol: 0.5 })) smp('step', { vol: 0.3, delay: 0.25 }); else hiss(0.3, { vol: 0.13, f: 500, sweep: 400, q: 0.6, type: 'lowpass' }); },
  step: () => { if (!smp('step', { vol: 0.18, vary: 0.1, wet: 0.05 })) hiss(0.05, { vol: 0.05, f: 420 + Math.random() * 200, type: 'lowpass', wet: 0.05 }); },
  charge: () => { smp('draw', { vol: 0.35 }); [0, 0.11, 0.22, 0.33].forEach((d) => smp('step', { vol: 0.35, delay: d, rate: 0.9 })); hiss(0.45, { vol: 0.15, f: 300, sweep: 1800, q: 0.7 }); tone(70, 0.4, { vol: 0.12, slide: 50 }); },
  whirl: () => { [0, 0.26, 0.52, 0.78].forEach((d) => { if (!smp('swing', { vol: 0.45, delay: d, rate: 1 })) hiss(0.2, { vol: 0.15, f: 900, sweep: 1500, q: 2, delay: d }); }); },
  shout: () => { tone(110, 0.5, { type: 'sawtooth', vol: 0.06, slide: 30 }); tone(165, 0.5, { type: 'sawtooth', vol: 0.04, slide: 40 }); hiss(0.45, { vol: 0.08, f: 500, q: 0.5 }); },
  slam: () => { smp('rubble', { vol: 0.7, rate: 0.8, wet: 0.4 }); tone(55, 0.6, { vol: 0.5, slide: -25, wet: 0.4 }); hiss(0.5, { vol: 0.25, f: 220, type: 'lowpass', wet: 0.4 }); },
  enemyDie: (type) => { if (!cry(type, 0.85, 0.55)) { hiss(0.4, { vol: 0.14, f: 300, type: 'lowpass' }); tone(140, 0.45, { type: 'sawtooth', vol: 0.05, slide: -90 }); } smp('thud', { vol: 0.35, rate: 0.8, delay: 0.35 }); },
  growl: (type) => { if (!cry(type, 1, 0.45)) { tone(85, 0.6, { type: 'sawtooth', vol: 0.05, slide: -20, a: 0.08 }); hiss(0.5, { vol: 0.07, f: 280, q: 3, a: 0.08 }); } },
  roar: () => { if (smp('giant', { vol: 0.9, rate: 0.7, wet: 0.6 })) tone(42, 1.2, { vol: 0.3, slide: -8, wet: 0.5 }); else [55, 82, 110].forEach((f, i) => tone(f, 1.4, { type: 'sawtooth', vol: 0.07, slide: -f * 0.3, a: 0.15, wet: 0.6, delay: i * 0.05 })); },
  execute: () => { smp('heavy', { vol: 0.95, rate: 0.75 }); smp('slice', { vol: 0.6, rate: 0.8 }); smp('rubble', { vol: 0.35, rate: 0.7 }); tone(44, 0.6, { vol: 0.55, slide: -18, wet: 0.4 }); },
  leap: () => { smp('cloth', { vol: 0.5 }); smp('swing', { vol: 0.4, rate: 0.7 }); hiss(0.4, { vol: 0.1, f: 400, sweep: 1600, q: 0.7 }); },
  avatar: () => { smp('giant', { vol: 0.6, rate: 1.1, wet: 0.6 }); [65, 98, 131, 196].forEach((f, i) => tone(f, 1.6, { type: 'sawtooth', vol: 0.05, slide: f * 0.15, a: 0.2, wet: 0.7, delay: i * 0.04 })); tone(40, 1.2, { vol: 0.4, slide: -8, wet: 0.5 }); },
  explode: () => { smp('rubble', { vol: 0.8, rate: 0.75, wet: 0.5 }); smp('rubble', { vol: 0.5, rate: 0.6, delay: 0.08 }); tone(42, 0.9, { vol: 0.65, slide: -18, wet: 0.5 }); hiss(0.8, { vol: 0.4, f: 260, type: 'lowpass', wet: 0.5 }); },
  fuse: () => { cry('bomber', 1.2, 0.4); hiss(0.9, { vol: 0.08, f: 1800, sweep: 3200, q: 4, a: 0.1 }); },
  summon: () => { smp('magic', { vol: 0.5, rate: 0.7, wet: 0.7 }); cry('necro', 0.9, 0.35); tone(110, 1, { type: 'sawtooth', vol: 0.04, slide: -40, a: 0.1, wet: 0.7 }); },
  coin: () => { if (!smp('coin', { vol: 0.45, wet: 0.1 })) { tone(1568, 0.25, { type: 'triangle', vol: 0.05, wet: 0.3 }); tone(2093, 0.3, { type: 'triangle', vol: 0.04, delay: 0.06, wet: 0.3 }); } },
  loot: (r) => {
    const base = [330, 392, 440, 523, 587, 659][r];
    smp('pickup', { vol: 0.4 });
    [1, 1.25, 1.5, 2].forEach((k, i) => tone(base * k, 0.6, { type: 'sine', vol: 0.06, delay: i * 0.07, wet: 0.5 }));
    if (r >= 4) { smp('bell', { vol: 0.35, rate: 1.5, wet: 0.8 }); hiss(1.2, { vol: 0.05, f: 6000, type: 'highpass', wet: 0.6 }); tone(base * 4, 1.2, { type: 'sine', vol: 0.04, delay: 0.3, wet: 0.7 }); }
  },
  pickup: () => { if (!smp('pickup', { vol: 0.45 })) { tone(880, 0.12, { type: 'triangle', vol: 0.06 }); tone(1320, 0.16, { type: 'triangle', vol: 0.05, delay: 0.05 }); } },
  equip: () => { if (!smp('equip', { vol: 0.55 })) { hiss(0.12, { vol: 0.12, f: 2500, q: 1.5 }); tone(330, 0.12, { type: 'triangle', vol: 0.06 }); } },
  potion: () => { if (smp('bottle', { vol: 0.5, pick: 0 })) smp('bottle', { vol: 0.4, delay: 0.2 }); [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { vol: 0.04, delay: 0.25 + i * 0.06, wet: 0.5 })); },
  levelUp: () => { smp('bell', { vol: 0.4, rate: 1.4, wet: 0.7 }); [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.9, { type: 'triangle', vol: 0.07, delay: i * 0.09, wet: 0.6 })); hiss(1.5, { vol: 0.05, f: 5000, type: 'highpass', delay: 0.3, wet: 0.6 }); },
  portal: () => { smp('magic', { vol: 0.4, rate: 0.6, wet: 0.8 }); tone(110, 2, { vol: 0.12, slide: 220, a: 0.3, wet: 0.7 }); tone(165, 2, { vol: 0.08, slide: 330, a: 0.3, wet: 0.7 }); hiss(1.8, { vol: 0.08, f: 1200, sweep: 3000, q: 1, a: 0.3 }); },
  chest: () => { smp('creak', { vol: 0.6, wet: 0.3 }); smp('coin', { vol: 0.5, delay: 0.25 }); [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.6, { type: 'triangle', vol: 0.05, delay: 0.25 + i * 0.06, wet: 0.5 })); },
  ui: () => { if (!smp('click', { vol: 0.35, vary: 0.02, wet: 0 })) tone(1046, 0.06, { type: 'triangle', vol: 0.05, wet: 0 }); },
  death: () => { smp('thud', { vol: 0.8, rate: 0.7 }); [220, 196, 147].forEach((f, i) => tone(f, 1.2, { type: 'triangle', vol: 0.1, delay: 0.3 + i * 0.35, wet: 0.7 })); },
};

// ---------- état de la musique ----------
let musicState = 'explore';
export function setMusic(st) { if (st === musicState) return; musicState = st; fadeMusic(); }
export function musicTick() { /* la musique est maintenant jouée par de vrais morceaux (voir startMusic) */ }
// l'app passe en arrière-plan : on coupe la musique (batterie) et on la relance au retour
document.addEventListener('visibilitychange', () => {
  for (const k in tracks) { const a = tracks[k].el; if (document.hidden) a.pause(); else if (settings.music) a.play().catch(() => {}); }
});
