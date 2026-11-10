// =====================================================================
// SON : bruitages et ambiance musicale fabriqués par le téléphone (rien à télécharger)
// Sons « modernes » : impacts sourds, souffles, nappes d'ambiance avec écho — pas de bips rétro.
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
  }
  if (ctx.state === 'suspended') ctx.resume();
}
export function applyVolumes() {
  if (!ctx) return;
  sfx.gain.setTargetAtTime(settings.sound ? 1 : 0, ctx.currentTime, 0.05);
  mus.gain.setTargetAtTime(settings.music ? 0.55 : 0, ctx.currentTime, 0.4);
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
export const SFX = {
  swing: (k = 1) => hiss(0.16, { vol: 0.16, f: 900 * k, sweep: 2600 * k, q: 1.4, wet: 0.1 }),
  heavy: () => { hiss(0.32, { vol: 0.22, f: 400, sweep: 1600, q: 1 }); tone(90, 0.3, { vol: 0.12, slide: -40 }); },
  // impact : un « boum » grave (le corps), un craquement (la chair) et un éclat métallique (la lame)
  hit: () => { tone(95, 0.16, { vol: 0.42, slide: -55, wet: 0.08 }); hiss(0.1, { vol: 0.3, f: 900, q: 0.6 }); hiss(0.05, { vol: 0.14, f: 4200, type: 'highpass' }); tone(55, 0.12, { vol: 0.25, slide: -15, wet: 0 }); },
  heavyHit: () => { tone(70, 0.3, { vol: 0.55, slide: -35, wet: 0.2 }); hiss(0.2, { vol: 0.35, f: 500, q: 0.6, type: 'lowpass' }); hiss(0.08, { vol: 0.2, f: 2600, q: 0.8 }); tone(46, 0.35, { vol: 0.3, slide: -10, wet: 0.3 }); },
  crit: () => { tone(80, 0.22, { vol: 0.45, slide: -40 }); hiss(0.14, { vol: 0.32, f: 1100 }); tone(1800, 0.12, { type: 'triangle', vol: 0.06, slide: -900 }); },
  block: () => { tone(420, 0.16, { type: 'triangle', vol: 0.12, slide: -120 }); tone(1260, 0.1, { type: 'triangle', vol: 0.05 }); hiss(0.06, { vol: 0.15, f: 3000 }); },
  hurt: () => { tone(160, 0.2, { type: 'triangle', vol: 0.18, slide: -80 }); hiss(0.12, { vol: 0.18, f: 600, type: 'lowpass' }); },
  roll: () => hiss(0.3, { vol: 0.13, f: 500, sweep: 400, q: 0.6, type: 'lowpass' }),
  step: () => hiss(0.05, { vol: 0.05, f: 420 + Math.random() * 200, type: 'lowpass', wet: 0.05 }),
  charge: () => { hiss(0.45, { vol: 0.2, f: 300, sweep: 1800, q: 0.7 }); tone(70, 0.4, { vol: 0.15, slide: 50 }); },
  whirl: () => { hiss(0.5, { vol: 0.2, f: 700, sweep: 1500, q: 2 }); hiss(0.5, { vol: 0.12, f: 1400, sweep: -900, q: 2, delay: 0.15 }); },
  shout: () => { tone(110, 0.5, { type: 'sawtooth', vol: 0.06, slide: 30 }); tone(165, 0.5, { type: 'sawtooth', vol: 0.04, slide: 40 }); hiss(0.45, { vol: 0.08, f: 500, q: 0.5 }); },
  slam: () => { tone(55, 0.6, { vol: 0.5, slide: -25, wet: 0.4 }); hiss(0.5, { vol: 0.3, f: 220, type: 'lowpass', wet: 0.4 }); },
  // cris des monstres : chaque type a sa « voix » (grave pour la brute, aiguë pour le possédé…)
  enemyDie: (type) => { const v = VOICE[type] || VOICE.ghoul; hiss(0.4, { vol: 0.14, f: 300, type: 'lowpass' }); tone(v[0] * 1.3, 0.45, { type: 'sawtooth', vol: 0.05, slide: -v[0] * 0.7, a: 0.02 }); hiss(0.35, { vol: 0.06, f: v[1], q: 4, sweep: -v[1] * 0.5 }); },
  growl: (type) => { const v = VOICE[type] || VOICE.ghoul; tone(v[0], 0.6, { type: 'sawtooth', vol: 0.05, slide: -v[0] * 0.25, a: 0.08 }); tone(v[0] * 1.5, 0.5, { type: 'sawtooth', vol: 0.025, slide: -v[0] * 0.3, a: 0.1 }); hiss(0.5, { vol: 0.07, f: v[1], q: 3, a: 0.08 }); },
  roar: () => { [55, 82, 110].forEach((f, i) => tone(f, 1.4, { type: 'sawtooth', vol: 0.07, slide: -f * 0.3, a: 0.15, wet: 0.6, delay: i * 0.05 })); hiss(1.2, { vol: 0.12, f: 300, q: 2, a: 0.15, sweep: -150, wet: 0.5 }); },
  parry: () => { tone(1320, 0.4, { type: 'triangle', vol: 0.12, slide: -200, wet: 0.5 }); tone(1980, 0.3, { type: 'triangle', vol: 0.06, wet: 0.5 }); tone(660, 0.25, { type: 'triangle', vol: 0.1, slide: -100 }); hiss(0.12, { vol: 0.25, f: 4000, q: 0.8 }); },
  execute: () => { tone(48, 0.6, { vol: 0.6, slide: -20, wet: 0.4 }); hiss(0.4, { vol: 0.35, f: 400, type: 'lowpass', wet: 0.4 }); hiss(0.15, { vol: 0.25, f: 2200, q: 0.7 }); tone(220, 0.5, { type: 'sawtooth', vol: 0.04, slide: -150, wet: 0.5 }); },
  leap: () => { hiss(0.4, { vol: 0.16, f: 400, sweep: 1600, q: 0.7 }); tone(120, 0.3, { vol: 0.1, slide: 60 }); },
  avatar: () => { [65, 98, 131, 196].forEach((f, i) => tone(f, 1.6, { type: 'sawtooth', vol: 0.06, slide: f * 0.15, a: 0.2, wet: 0.7, delay: i * 0.04 })); hiss(1.4, { vol: 0.1, f: 600, sweep: 2400, q: 0.8, a: 0.2, wet: 0.6 }); tone(40, 1.2, { vol: 0.4, slide: -8, wet: 0.5 }); },
  explode: () => { tone(42, 0.9, { vol: 0.65, slide: -18, wet: 0.5 }); hiss(0.8, { vol: 0.45, f: 260, type: 'lowpass', wet: 0.5 }); hiss(0.3, { vol: 0.2, f: 2400, q: 0.5 }); },
  fuse: () => { hiss(0.9, { vol: 0.1, f: 1800, sweep: 3200, q: 4, a: 0.1 }); tone(300, 0.9, { type: 'square', vol: 0.03, slide: 500, a: 0.1 }); },
  summon: () => { tone(110, 1, { type: 'sawtooth', vol: 0.05, slide: -40, a: 0.1, wet: 0.7 }); hiss(0.9, { vol: 0.08, f: 900, q: 6, sweep: -600, a: 0.1, wet: 0.7 }); [523, 494, 466].forEach((f, i) => tone(f, 0.5, { vol: 0.03, delay: i * 0.1, wet: 0.8 })); },
  coin: () => { tone(1568, 0.25, { type: 'triangle', vol: 0.05, wet: 0.3 }); tone(2093, 0.3, { type: 'triangle', vol: 0.04, delay: 0.06, wet: 0.3 }); },
  loot: (r) => {
    const base = [330, 392, 440, 523, 587, 659][r];
    [1, 1.25, 1.5, 2].forEach((k, i) => tone(base * k, 0.6, { type: 'sine', vol: 0.07, delay: i * 0.07, wet: 0.5 }));
    if (r >= 4) { hiss(1.2, { vol: 0.05, f: 6000, type: 'highpass', wet: 0.6 }); tone(base * 4, 1.2, { type: 'sine', vol: 0.04, delay: 0.3, wet: 0.7 }); }
  },
  pickup: () => { tone(880, 0.12, { type: 'triangle', vol: 0.06 }); tone(1320, 0.16, { type: 'triangle', vol: 0.05, delay: 0.05 }); },
  equip: () => { hiss(0.12, { vol: 0.12, f: 2500, q: 1.5 }); tone(330, 0.12, { type: 'triangle', vol: 0.06 }); },
  potion: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { vol: 0.06, delay: i * 0.06, wet: 0.5 })); hiss(0.3, { vol: 0.05, f: 900, type: 'lowpass' }); },
  levelUp: () => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.9, { type: 'triangle', vol: 0.07, delay: i * 0.09, wet: 0.6 })); hiss(1.5, { vol: 0.05, f: 5000, type: 'highpass', delay: 0.3, wet: 0.6 }); },
  portal: () => { tone(110, 2, { vol: 0.12, slide: 220, a: 0.3, wet: 0.7 }); tone(165, 2, { vol: 0.08, slide: 330, a: 0.3, wet: 0.7 }); hiss(1.8, { vol: 0.08, f: 1200, sweep: 3000, q: 1, a: 0.3 }); },
  chest: () => { hiss(0.2, { vol: 0.12, f: 500, type: 'lowpass' }); [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.6, { type: 'triangle', vol: 0.06, delay: 0.15 + i * 0.06, wet: 0.5 })); },
  ui: () => tone(1046, 0.06, { type: 'triangle', vol: 0.05, wet: 0 }),
  death: () => { [220, 196, 147].forEach((f, i) => tone(f, 1.2, { type: 'triangle', vol: 0.1, delay: i * 0.35, wet: 0.7 })); },
};

// ---------- ambiance musicale : nappes graves + carillons lointains ; tambours en combat ----------
let musicState = 'explore', nextT = 0, step = 0;
const SCALE = [0, 3, 5, 7, 10];
export function setMusic(s) { musicState = s; }
export function musicTick() {
  if (!ctx || !settings.music || ctx.state !== 'running') return;
  if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
  while (nextT < ctx.currentTime + 0.3) {
    const boss = musicState === 'boss', fight = musicState === 'combat' || boss;
    const t = nextT, beat = boss ? 0.24 : fight ? 0.3 : 0.5;
    const bar = Math.floor(step / 16) % 4, roots = [45, 41, 43, 40];
    const root = roots[bar];
    if (step % 16 === 0) pad(boss ? root - 12 : root, beat * 16, fight ? 0.05 : 0.07);
    if (musicState === 'explore' && step % 8 === 4 && Math.random() < 0.6) bell(root + 24 + SCALE[Math.floor(Math.random() * 5)], t);
    if (fight) {
      // combat : tambours et cordes pincées ; contre le boss, plus vite, plus grave, avec des coups de timbales
      if (step % 4 === 0) drum(t, step % 8 === 0 ? 1 : 0.6);
      if (step % 8 === 6) drum(t, 0.4);
      if (boss && step % 2 === 1 && Math.random() < 0.5) drum(t, 0.3);
      if (step % 2 === 0) pluck(root + (boss ? 0 : 12) + SCALE[(step / 2) % 5 | 0], t);
      if (boss && step % 16 === 8) bell(root + 12, t);
    }
    step++; nextT += beat / 2;
  }
}
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
function pad(root, dur, vol) {
  const t = ctx.currentTime;
  for (const [m, det] of [[root, -6], [root + 7, 5], [root + 12, 0], [root + 15, -4]]) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = mf(m); o.detune.value = det;
    f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 0.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
    o.connect(f); f.connect(g); g.connect(mus); const w = ctx.createGain(); w.gain.value = 0.6; g.connect(w); w.connect(verb);
    o.start(t); o.stop(t + dur * 1.1);
  }
}
function bell(m, t) {
  for (const [k, v] of [[1, 0.05], [2.76, 0.015], [5.4, 0.008]]) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = mf(m) * k;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    o.connect(g); g.connect(mus); const w = ctx.createGain(); w.gain.value = 1; g.connect(w); w.connect(verb); o.start(t); o.stop(t + 2.6);
  }
}
function drum(t, v) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(g); g.connect(mus); const w = ctx.createGain(); w.gain.value = 0.3; g.connect(w); w.connect(verb); o.start(t); o.stop(t + 0.45);
}
function pluck(m, t) {
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = mf(m);
  f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.25);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.04, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(f); f.connect(g); g.connect(mus); o.start(t); o.stop(t + 0.35);
}
