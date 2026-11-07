// =====================================================================
// INTERFACE : HUD, chiffres de dégâts, mini-carte, écran Héros (équipement, compétences, marchand)
// =====================================================================
import * as THREE from 'three';
import { ANIME, setStyle } from './style.js';
import { $, R } from './util.js';
import { SLOTS, SLOT_NAME, RARITY, STAT_NAME, WEAPONS, itemScore, makeItem, rollRarity, looksOf } from './items.js';
import { Character, HERO_H } from './character.js';
import { SFX, settings, applyVolumes, unlock } from './audio.js';

let G = null, H = null;
let ICONS = null, iconImg = null;
const ov = $('overlay'), oc = ov.getContext('2d');
let dpr = 1;

export function resizeOverlay() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  ov.width = Math.round(innerWidth * dpr); ov.height = Math.round(innerHeight * dpr);
}
export function loading(p) { $('loadFill').style.width = Math.round(p * 100) + '%'; }
export function loadError() { $('loadText').textContent = 'Erreur de chargement. Vérifie ta connexion puis relance.'; }
export async function loadIcons() {
  ICONS = await (await fetch('assets/icons_hd.json')).json();
  iconImg = new Image(); iconImg.src = 'assets/icons_hd.png';
  await iconImg.decode();
  document.querySelectorAll('canvas.ico').forEach((c) => drawIcon(c, c.dataset.icon));
}
export function drawIcon(cv, name, pad = 0.06) {
  const r = ICONS && ICONS[name]; if (!r) return;
  cv.width = cv.height = 96;
  const c = cv.getContext('2d'); c.clearRect(0, 0, 96, 96);
  const m = 96 * pad; c.drawImage(iconImg, r[0], r[1], r[2], r[3], m, m, 96 - 2 * m, 96 - 2 * m);
}
// icône d'un objet : dessinée à partir de sa catégorie
const SLOT_ICON = { head: 'i_warrior', shoulders: 'i_warrior', chest: 'i_warrior', hands: 'i_attack', legs: 'i_roll', feet: 'i_roll', mainhand: 'i_attack', offhand: 'i_shield' };
function itemIcon(cv, it) {
  cv.width = cv.height = 96;
  const c = cv.getContext('2d'); c.clearRect(0, 0, 96, 96);
  const col = RARITY[it.rarity].color;
  const g = c.createRadialGradient(48, 40, 4, 48, 48, 50); g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00');
  c.fillStyle = g; c.fillRect(0, 0, 96, 96);
  // pictogramme simple et lisible par emplacement
  c.save(); c.translate(48, 50); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 5; c.lineJoin = 'round'; c.lineCap = 'round';
  const s = it.slot;
  if (s === 'mainhand') {
    if (/axe/.test(it.wtype)) { c.beginPath(); c.moveTo(-22, 26); c.lineTo(16, -18); c.stroke(); c.beginPath(); c.moveTo(8, -26); c.quadraticCurveTo(34, -24, 26, 2); c.lineTo(10, -12); c.closePath(); c.fill(); if (it.wtype === 'greataxe') { c.beginPath(); c.moveTo(4, -30); c.quadraticCurveTo(-12, -36, -10, -12); c.lineTo(8, -16); c.closePath(); c.fill(); } }
    else if (/hammer|maul/.test(it.wtype)) { c.beginPath(); c.moveTo(-22, 26); c.lineTo(10, -8); c.stroke(); c.save(); c.translate(14, -12); c.rotate(-0.75); c.fillRect(-16, -9, 32, 18); c.restore(); }
    else if (it.wtype === 'dagger') { c.beginPath(); c.moveTo(-14, 20); c.lineTo(16, -18); c.stroke(); c.beginPath(); c.moveTo(-18, 6); c.lineTo(-2, 22); c.stroke(); }
    else { c.beginPath(); c.moveTo(-22, 24); c.lineTo(22, -24); c.stroke(); c.lineWidth = 4; c.beginPath(); c.moveTo(-24, 8); c.lineTo(-8, 24); c.stroke(); }
  } else if (s === 'offhand') { c.beginPath(); c.moveTo(0, -28); c.lineTo(24, -18); c.quadraticCurveTo(22, 14, 0, 30); c.quadraticCurveTo(-22, 14, -24, -18); c.closePath(); c.globalAlpha = 0.85; c.fill(); }
  else if (s === 'head') { c.beginPath(); c.arc(0, 2, 22, Math.PI, 0); c.lineTo(22, 22); c.lineTo(-22, 22); c.closePath(); c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1; c.fillStyle = '#0b0a14'; c.fillRect(-14, 4, 28, 6); }
  else if (s === 'shoulders') { c.globalAlpha = 0.85; c.beginPath(); c.ellipse(-16, 0, 14, 10, -0.3, 0, 6.29); c.fill(); c.beginPath(); c.ellipse(16, 0, 14, 10, 0.3, 0, 6.29); c.fill(); }
  else if (s === 'chest') { c.globalAlpha = 0.85; c.beginPath(); c.moveTo(-24, -20); c.lineTo(-10, -26); c.lineTo(0, -18); c.lineTo(10, -26); c.lineTo(24, -20); c.lineTo(18, 26); c.lineTo(-18, 26); c.closePath(); c.fill(); }
  else if (s === 'hands') { c.globalAlpha = 0.85; c.beginPath(); c.roundRect(-16, -10, 30, 32, 8); c.fill(); for (let i = 0; i < 4; i++) c.fillRect(-16 + i * 8, -24, 6, 16); }
  else if (s === 'legs') { c.globalAlpha = 0.85; c.beginPath(); c.moveTo(-20, -26); c.lineTo(20, -26); c.lineTo(18, 28); c.lineTo(4, 28); c.lineTo(0, -4); c.lineTo(-4, 28); c.lineTo(-18, 28); c.closePath(); c.fill(); }
  else if (s === 'feet') { c.globalAlpha = 0.85; c.beginPath(); c.moveTo(-6, -24); c.lineTo(8, -24); c.lineTo(8, 10); c.lineTo(26, 18); c.lineTo(26, 26); c.lineTo(-6, 26); c.closePath(); c.fill(); }
  c.restore();
}

// ---------------------------------------------------------------
export function setup(game, handlers) {
  G = game; H = handlers;
  resizeOverlay();
  $('playBtn').onclick = () => { unlock(); SFX.ui(); H.startPlay(); };
  $('heroBtnTitle').onclick = () => { unlock(); SFX.ui(); openHero(G, 'gear', 'title'); };
  $('heroBtnPause').onclick = () => { SFX.ui(); openHero(G, 'gear', 'play'); };
  $('deathHero').onclick = () => { SFX.ui(); openHero(G, 'gear', 'dead'); };
  $('resumeBtn').onclick = () => { SFX.ui(); H.startPlay(); };
  $('quitBtn').onclick = () => { SFX.ui(); H.saveGame(); H.backToTitle(); };
  $('retryBtn').onclick = () => { SFX.ui(); H.respawn(); };
  $('pauseBtn').onclick = () => { if (G.state === 'play') { G.state = 'pause'; show('pause'); } };
  $('bagBtn').onclick = () => { if (G.state === 'play') openHero(G, 'gear', 'play'); };
  $('heroClose').onclick = () => closeHero();
  $('enterBtn').onclick = () => { closeHero('play'); };
  const sb = $('soundBtn'), mb = $('musicBtn');
  const lab = () => { sb.textContent = 'Sons : ' + (settings.sound ? 'oui' : 'non'); mb.textContent = 'Musique : ' + (settings.music ? 'oui' : 'non'); };
  sb.onclick = () => { unlock(); settings.sound = !settings.sound; G.save.sound = settings.sound; applyVolumes(); lab(); H.saveGame(); SFX.ui(); };
  mb.onclick = () => { unlock(); settings.music = !settings.music; G.save.music = settings.music; applyVolumes(); lab(); H.saveGame(); };
  lab();
  // style graphique : animé japonais ou classique (recharge le jeu pour tout reconstruire)
  $('styleBtn').textContent = 'Style : ' + (ANIME ? 'Animé' : 'Classique');
  $('styleBtn').onclick = () => { SFX.ui(); setStyle(ANIME ? 'classic' : 'anime'); };
  document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => { SFX.ui(); tab(b.dataset.tab); });
}
export function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('show', s.id === id));
}
export function refreshTitle(g) {
  const s = g.save;
  $('titleStats').textContent = `Niveau ${s.level} · Étage record ${s.best} · ${s.gold} or`;
  $('playBtn').textContent = s.floor > 1 || s.level > 1 ? `Continuer — Étage ${s.floor}` : 'Jouer';
}
export function showDeath(g) {
  $('hud').classList.add('hidden'); clearOverlay();
  $('deathText').textContent = `Tu gardes ton niveau, ton or et ton équipement. L'étage ${g.save.floor} sera différent.`;
  show('death');
}
export function banner(title, sub) {
  const b = $('banner'); b.innerHTML = `<b>${title}</b><small>${sub || ''}</small>`;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
export function lootMsg(text, color) {
  const box = $('loot'), d = document.createElement('div');
  d.textContent = text; d.style.color = color; box.appendChild(d);
  while (box.children.length > 6) box.firstChild.remove();
  setTimeout(() => d.remove(), 4200);
}
export function bagDot(on) { $('bagDot').classList.toggle('on', on); }
let fadeEl = null;
export function fade(on) {
  if (!fadeEl) { fadeEl = document.createElement('div'); fadeEl.style.cssText = 'position:fixed;inset:0;z-index:9;background:#000;opacity:0;pointer-events:none;transition:opacity .6s'; document.body.appendChild(fadeEl); }
  fadeEl.style.opacity = on ? 1 : 0;
}

// ---------------------------------------------------------------
// HUD et surimpression (barres de vie, chiffres, cadre de cible)
// ---------------------------------------------------------------
const nums = [];
export function damageNumber(x, y, z, v, color, crit, player) { nums.push({ x, y, z, v: String(v), color, crit, player, t: 0, ox: (R() - 0.5) * 0.6 }); if (nums.length > 40) nums.shift(); }
export function clearOverlay() { ovDirty = true; oc.setTransform(1, 0, 0, 1, 0, 0); oc.clearRect(0, 0, ov.width, ov.height); }
const v3 = new THREE.Vector3();
function proj(camera, x, y, z) { v3.set(x, y, z).project(camera); return [(v3.x * 0.5 + 0.5) * ov.width, (-v3.y * 0.5 + 0.5) * ov.height, v3.z < 1]; }
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
let lastHud = {};
export function updateHUD(g, P, camera) {
  const S = g.save, st = P.st, k = dpr;
  // barres
  const hpF = P.hp / st.maxHp;
  set('.bar.hp .fill', 'transform', `scaleX(${hpF})`); setText('.bar.hp span', `${Math.ceil(P.hp)} / ${st.maxHp}`);
  set('.bar.rage .fill', 'transform', `scaleX(${P.rage / 100})`); setText('.bar.rage span', `${Math.floor(P.rage)} rage`);
  setText('#lvlBadge', S.level); setText('#floorTag', `Étage ${S.floor}`);
  set('#xpBar .fill', 'transform', `scaleX(${S.xp / H.xpNeed(S.level)})`);
  setText('#btnPotion .count', S.potions);
  cd('btnSkill1', P.cd.skill1, 9); cd('btnSkill2', P.cd.skill2, 3); cd('btnSkill3', P.cd.skill3, 25); cd('btnRoll', P.cd.roll, 0.75); cd('btnPotion', P.cd.potion, 1.2);
  $('btnSkill2').classList.toggle('nores', P.rage < 30);
  $('btnSkill3').classList.toggle('locked', S.skills.shout <= 0);
  $('btnSkill3').querySelector('.lock').style.display = S.skills.shout > 0 ? 'none' : '';
  $('btnPotion').classList.toggle('nores', S.potions <= 0);
  // surimpression (on ne l'efface que s'il y avait quelque chose dessus)
  if (ovDirty) clearOverlay();
  ovDirty = false;
  const c = oc, W = ov.width, Hh = ov.height;
  for (const e of g.enemies) {
    if (e.dead || (!e.aggro && e.hp >= e.maxHp)) continue;
    const [x, y, ok] = proj(camera, e.x, e.y + e.T.height * 1.35 + 0.3, e.z);
    if (!ok || x < 0 || x > W || y < 0 || y > Hh) continue;
    const dd = Math.hypot(e.x - P.x, e.z - P.z); if (dd > 22) continue;
    const bw = (e.T.boss ? 90 : 50) * k, bh = 6 * k; ovDirty = true;
    c.fillStyle = 'rgba(0,0,0,.6)'; rr(c, x - bw / 2 - k, y - k, bw + 2 * k, bh + 2 * k, 3 * k); c.fill();
    c.fillStyle = e.T.boss ? '#ff8a20' : e === g.target ? '#ff3a2a' : '#c82a2a'; rr(c, x - bw / 2, y, Math.max(bh, bw * e.hp / e.maxHp), bh, 3 * k); c.fill();
    if (e.stun > 0) { c.fillStyle = '#ffe58a'; c.font = `900 ${12 * k}px Nunito`; c.textAlign = 'center'; c.fillText('✦ ✦', x, y - 6 * k); }
  }
  // chiffres de dégâts
  c.textAlign = 'center'; c.lineJoin = 'round';
  for (let i = nums.length - 1; i >= 0; i--) {
    const n = nums[i]; n.t += 1 / 60;
    if (n.t > 0.9) { nums.splice(i, 1); continue; }
    const [x, y, ok] = proj(camera, n.x + n.ox, n.y + n.t * 1.1, n.z); if (!ok) continue;
    ovDirty = true;
    const pop = n.t < 0.1 ? 1 + (0.1 - n.t) * 6 : 1;
    const sz = (n.crit ? 30 : n.player ? 20 : 22) * k * pop;
    c.globalAlpha = Math.min(1, (0.9 - n.t) * 3);
    c.font = `900 ${sz}px Nunito`; c.lineWidth = 4 * k; c.strokeStyle = 'rgba(0,0,0,.8)';
    c.strokeText(n.v, x, y); c.fillStyle = n.color; c.fillText(n.v, x, y);
  }
  c.globalAlpha = 1;
  // cadre de la cible (nom + vie)
  const t = g.target;
  if (t && !t.dead && (t.aggro || t.hp < t.maxHp)) {
    ovDirty = true;
    const bw = Math.min(240 * k, W * 0.46), by = (W < Hh ? 120 : 14) * k + safeTop() * k, bx = (W - bw) / 2;
    c.fillStyle = 'rgba(10,8,20,.72)'; rr(c, bx - 8 * k, by - 4 * k, bw + 16 * k, 30 * k, 8 * k); c.fill();
    c.font = `800 ${12 * k}px Nunito`; c.fillStyle = t.T.boss ? '#ffb05a' : '#f0e6ff'; c.fillText(t.T.boss ? '☠ ' + t.T.name : t.T.name, W / 2, by + 9 * k);
    c.fillStyle = 'rgba(255,255,255,.12)'; rr(c, bx, by + 14 * k, bw, 7 * k, 3.5 * k); c.fill();
    c.fillStyle = t.T.boss ? '#ff8a20' : '#e83a3a'; rr(c, bx, by + 14 * k, Math.max(7 * k, bw * t.hp / t.maxHp), 7 * k, 3.5 * k); c.fill();
  }
  // vie basse : bords rouges qui battent
  if (hpF < 0.3) {
    ovDirty = true;
    const a = 0.25 + 0.15 * Math.sin(g.time * 6);
    const gr = c.createRadialGradient(W / 2, Hh / 2, Math.min(W, Hh) * 0.3, W / 2, Hh / 2, Math.max(W, Hh) * 0.7);
    gr.addColorStop(0, 'rgba(150,0,0,0)'); gr.addColorStop(1, `rgba(170,0,0,${a})`); c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
  }
  if ((mmFrame = (mmFrame + 1) % 2) === 0) updateMinimap(g, P); // une image sur deux suffit
}
let ovDirty = true, mmFrame = 0;
let _sat = null;
function safeTop() { if (_sat === null) { const d = document.createElement('div'); d.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top);visibility:hidden'; document.body.appendChild(d); _sat = d.offsetHeight || 0; d.remove(); } return _sat; }
function set(sel, prop, val) { if (lastHud[sel + prop] === val) return; lastHud[sel + prop] = val; document.querySelector(sel).style[prop] = val; }
function setText(sel, val) { val = String(val); if (lastHud[sel] === val) return; lastHud[sel] = val; document.querySelector(sel).textContent = val; }
function cd(id, v, max) {
  const el = $(id).querySelector('.cd');
  const txt = v > 0.05 ? (v > 1.5 ? Math.ceil(v) : v.toFixed(1)) : '';
  if (lastHud[id] !== txt) {
    if (lastHud[id] && !txt) { $(id).classList.remove('ready'); void $(id).offsetWidth; $(id).classList.add('ready'); }
    lastHud[id] = txt; el.textContent = txt;
  }
  // on ne touche au style que s'il change vraiment (chaque modification coûte un recalcul de page)
  const bg = v > 0.05 ? `conic-gradient(rgba(0,0,0,.62) ${Math.round(v / max * 90) * 4}deg, transparent 0)` : 'none';
  if (lastHud[id + 'bg'] !== bg) { lastHud[id + 'bg'] = bg; el.style.background = bg; }
}

// ---------------------------------------------------------------
// MINI-CARTE (les zones visitées se dévoilent)
// ---------------------------------------------------------------
let mapCv = null, mapCtx = null, seen = null, Lm = null;
export function initMinimap(L) {
  Lm = L; seen = new Uint8Array(L.W * L.H);
  mapCv = document.createElement('canvas'); mapCv.width = L.W; mapCv.height = L.H; mapCtx = mapCv.getContext('2d');
  mapCtx.clearRect(0, 0, L.W, L.H);
}
function updateMinimap(g, P) {
  if (!Lm) return;
  const L = Lm, px = Math.floor(P.x), pz = Math.floor(P.z), R0 = 9;
  for (let z = pz - R0; z <= pz + R0; z++) for (let x = px - R0; x <= px + R0; x++) {
    if (x < 0 || z < 0 || x >= L.W || z >= L.H) continue;
    const k = z * L.W + x; if (seen[k] || !L.grid[k] || (x - px) ** 2 + (z - pz) ** 2 > R0 * R0) continue;
    seen[k] = 1; mapCtx.fillStyle = L.solid[k] ? '#5a4a6a' : L.region[k] >= 0 ? '#b8a8d0' : '#8a7aa0'; mapCtx.fillRect(x, z, 1, 1);
  }
  const mc = $('minimap'), c = mc.getContext('2d'), S = mc.width, sc = 3.2;
  c.clearRect(0, 0, S, S);
  c.save(); c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, 6.29); c.clip();
  // vue tournée avec la caméra : le haut de la mini-carte = là où regarde la caméra
  const cy = Math.cos(g.camYaw), sy = Math.sin(g.camYaw);
  c.translate(S / 2, S / 2); c.transform(-cy * sc, -sy * sc, sy * sc, -cy * sc, 0, 0);
  c.imageSmoothingEnabled = false;
  c.drawImage(mapCv, -P.x, -P.z);
  // portail et ennemis repérés
  if (L.portal && !g.bossAlive && seen[Math.floor(L.portal.z) * L.W + Math.floor(L.portal.x)]) { c.fillStyle = g.bossAlive ? '#8a5aff' : '#e0b0ff'; c.beginPath(); c.arc(L.portal.x - P.x, L.portal.z - P.z, 1.6, 0, 6.29); c.fill(); }
  c.fillStyle = '#ff4a3a';
  for (const e of g.enemies) if (!e.dead && e.aggro) { c.beginPath(); c.arc(e.x - P.x, e.z - P.z, e.T.boss ? 1.4 : 0.8, 0, 6.29); c.fill(); }
  c.restore();
  // le héros au centre (flèche vers le haut = direction de la caméra)
  c.fillStyle = '#ffd27a'; c.beginPath(); c.moveTo(S / 2, S / 2 - 7); c.lineTo(S / 2 + 5, S / 2 + 5); c.lineTo(S / 2, S / 2 + 2); c.lineTo(S / 2 - 5, S / 2 + 5); c.closePath(); c.fill();
}

// ---------------------------------------------------------------
// ÉCRAN HÉROS : aperçu 3D du personnage + équipement + sac
// ---------------------------------------------------------------
let pv = null, heroFrom = 'title', selected = null;
function previewScene() {
  if (pv) return pv;
  const s = new THREE.Scene();
  s.background = null;
  s.add(new THREE.HemisphereLight(0xc8c0ff, 0x403038, 2));
  const key = new THREE.DirectionalLight(0xffe0c0, 3.2); key.position.set(1.5, 3, 2.5); s.add(key);
  const rim = new THREE.DirectionalLight(0x8a6aff, 2.5); rim.position.set(-2, 2, -2.5); s.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshBasicMaterial({ color: 0x8a6aff, transparent: true, opacity: 0.25 }));
  floor.rotation.x = -Math.PI / 2; s.add(floor);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
  pv = { s, cam, ch: null, rot: 0.4, drag: false };
  // faire tourner le héros au doigt
  const el = $('hero');
  let lx = 0, id = null;
  el.addEventListener('pointerdown', (e) => { if (e.target.closest('button, .slot, .itm, #tooltip, .skill, .ware')) return; id = e.pointerId; lx = e.clientX; });
  el.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; pv.rot += (e.clientX - lx) * 0.012; lx = e.clientX; });
  el.addEventListener('pointerup', () => { id = null; });
  return pv;
}
function rebuildPreview() {
  const p = previewScene();
  if (p.ch) p.ch.dispose();
  p.ch = new Character({ height: HERO_H, vis: 1, hair: ['Hair_SimpleParted', 'Hair_Beard', 'Eyebrows_Regular'] });
  p.ch.setLooks(looksOf(G.save.equip));
  p.ch.anim.loop('Sword_Idle');
  p.s.add(p.ch.group);
}
export function renderPreview(renderer, dt) {
  const p = previewScene(); if (!p.ch) return;
  p.ch.update(dt); p.ch.group.rotation.y = p.rot;
  const w = innerWidth, h = innerHeight, portrait = w < h;
  p.cam.aspect = w / h; p.cam.fov = portrait ? 34 : 26; p.cam.updateProjectionMatrix();
  p.cam.position.set(0, 1.25, portrait ? 6.2 : 5.6);
  p.cam.lookAt(0, portrait ? 0.35 : 0.95, 0);
  // en paysage le héros est au centre de la colonne de gauche ; en portrait, en haut
  p.ch.group.position.x = portrait ? 0 : -1.1;
  renderer.setClearColor(0x0d0a18, 1);
  renderer.render(p.s, p.cam);
}
export function openHero(g, which = 'gear', from) {
  heroFrom = from || (g.state === 'play' ? 'play' : g.state === 'dead' ? 'dead' : 'title');
  g.state = 'hero';
  $('hud').classList.add('hidden'); clearOverlay();
  bagDot(false);
  rebuildPreview();
  show('hero'); tab(which);
  $('enterBtn').textContent = heroFrom === 'play' ? 'Retour au donjon' : heroFrom === 'dead' ? "Revenir au début de l'étage" : 'Entrer dans le donjon';
}
function closeHero(force) {
  hideTip(); SFX.ui(); H.saveGame();
  const from = heroFrom;
  if (force === 'play' && from === 'dead') { H.respawn(); return; }
  if (force === 'play' && from === 'title') { H.onHeroClosed('play'); return; }
  H.onHeroClosed(from);
}
function tab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('show', t.id === 'tab-' + name));
  hideTip();
  refreshHero();
}
export function refreshHero() {
  const S = G.save;
  $('goldText').textContent = S.gold;
  $('ptsDot').classList.toggle('on', S.points > 0);
  // emplacements
  const L = $('slotsL'), Rr = $('slotsR'); L.innerHTML = ''; Rr.innerHTML = '';
  SLOTS.forEach((s, i) => {
    const it = S.equip[s];
    const d = document.createElement('div'); d.className = 'slot' + (it ? '' : ' empty'); d.dataset.label = SLOT_NAME[s];
    if (it) { d.style.setProperty('--rc', RARITY[it.rarity].color); const cv = document.createElement('canvas'); itemIcon(cv, it); d.appendChild(cv); d.onclick = () => tip(it, 'equipped'); }
    (i < 4 ? L : Rr).appendChild(d);
  });
  // statistiques
  const st = H.heroStats();
  $('statsBox').innerHTML = `<b>Niveau ${S.level}</b> · ${S.xp}/${H.xpNeed(S.level)} XP<br>Vie <b>${st.maxHp}</b> · Dégâts <b>${Math.round(st.dmg)}</b><br>Armure <b>${st.armor}</b> (−${Math.round(st.red * 100)} %)<br>Critique <b>${Math.round(st.crit * 100)} %</b> · Vitesse <b>${Math.round(st.atkSpeed * 100)} %</b>`;
  // sac
  $('bagCount').textContent = `${S.bag.length}/40`;
  const bag = $('bag'); bag.innerHTML = '';
  S.bag.forEach((it) => bag.appendChild(itemCell(it, () => tip(it, 'bag'))));
  // compétences
  const SK = SKILLS(S);
  $('ptsText').textContent = S.points > 0 ? `Tu as ${S.points} point${S.points > 1 ? 's' : ''} à dépenser (1 par niveau).` : 'Gagne des niveaux pour obtenir des points de compétence.';
  const list = $('skillList'); list.innerHTML = '';
  for (const k of Object.keys(SK)) {
    const sk = SK[k], rank = S.skills[k];
    const d = document.createElement('div'); d.className = 'skill';
    d.innerHTML = `<canvas class="ic"></canvas><div class="tx"><b>${sk.name}</b><span class="rk">Rang ${rank}/${sk.max}</span><br>${sk.desc(rank)}</div><button>+</button>`;
    drawIcon(d.querySelector('canvas'), sk.icon);
    const btn = d.querySelector('button');
    const lockLv = sk.lvl && S.level < sk.lvl;
    btn.disabled = S.points <= 0 || rank >= sk.max || lockLv;
    if (lockLv) btn.textContent = 'Niv. ' + sk.lvl;
    btn.onclick = () => { S.points--; S.skills[k]++; SFX.equip(); H.saveGame(); H.refreshHeroLooks(); refreshHero(); };
    list.appendChild(d);
  }
  // marchand
  const shop = $('shopList'); shop.innerHTML = '';
  const ilvl = S.level + Math.floor(S.best / 2);
  const wares = [
    { name: 'Potion de soins', desc: 'Rend 45 % de la vie.', icon: 'i_potion', price: 20 + S.level * 4, buy: () => { S.potions++; } },
    { name: 'Coffre du marchand', desc: 'Un objet inhabituel ou mieux, à ton niveau.', icon: 'i_bag', price: 60 + ilvl * 25, buy: () => { const it = makeItem(SLOTS[Math.floor(R() * SLOTS.length)], ilvl, Math.max(2, rollRarity(10))); S.bag.push(it); lootPop(it); } },
    { name: 'Coffre précieux', desc: 'Un objet rare ou mieux, à ton niveau.', icon: 'i_coin', price: 220 + ilvl * 60, buy: () => { const it = makeItem(SLOTS[Math.floor(R() * SLOTS.length)], ilvl + 1, Math.max(3, rollRarity(25))); S.bag.push(it); lootPop(it); } },
  ];
  for (const w of wares) {
    const d = document.createElement('div'); d.className = 'ware';
    d.innerHTML = `<canvas class="ic"></canvas><div class="tx"><b>${w.name}</b>${w.desc}</div><button>${w.price} or</button>`;
    drawIcon(d.querySelector('canvas'), w.icon);
    const btn = d.querySelector('button'); btn.disabled = S.gold < w.price || (w.icon !== 'i_potion' && S.bag.length >= 40);
    btn.onclick = () => { S.gold -= w.price; w.buy(); SFX.coin(); H.saveGame(); refreshHero(); };
    shop.appendChild(d);
  }
  const sell = $('sellBag'); sell.innerHTML = '';
  S.bag.forEach((it) => sell.appendChild(itemCell(it, () => tip(it, 'sell'))));
}
function lootPop(it) { SFX.loot(it.rarity); tip(it, 'bag'); }
function itemCell(it, onClick) {
  const d = document.createElement('div'); d.className = 'itm'; d.style.setProperty('--rc', RARITY[it.rarity].color);
  const cv = document.createElement('canvas'); itemIcon(cv, it); d.appendChild(cv);
  const cur = G.save.equip[it.slot];
  const diff = itemScore(it) - itemScore(cur);
  if (Math.abs(diff) > 0.5) { const u = document.createElement('i'); u.className = 'up' + (diff < 0 ? ' down' : ''); u.textContent = diff > 0 ? '▲' : '▼'; d.appendChild(u); }
  d.onclick = onClick; return d;
}
function statLines(it, cmp) {
  const out = [];
  if (it.dmg) out.push(`<b>${it.dmg}</b> dégâts · vitesse ${Math.round(it.speed * 100)} %` + delta(it.dmg, cmp && cmp.dmg));
  for (const [k, v] of Object.entries(it.stats)) out.push(`+${v} ${STAT_NAME[k]}` + delta(v, cmp && cmp.stats[k]));
  if (cmp) for (const [k, v] of Object.entries(cmp.stats)) if (!(k in it.stats)) out.push(`<span class="r">−${v} ${STAT_NAME[k]}</span>`);
  return out.join('<br>');
}
function delta(a, b) { if (b === undefined) return b === undefined && a ? '' : ''; const d = a - (b || 0); return d ? ` <span class="${d > 0 ? 'g' : 'r'}">(${d > 0 ? '+' : ''}${d})</span>` : ''; }
function tip(it, mode) {
  selected = it; SFX.ui();
  const T = $('tooltip'); T.classList.remove('hidden'); T.style.setProperty('--rc', RARITY[it.rarity].color);
  const cur = G.save.equip[it.slot];
  const cmp = mode !== 'equipped' && cur ? cur : null;
  T.innerHTML = `<div class="nm" style="color:${RARITY[it.rarity].color}">${it.name}</div>
    <div class="sub">${RARITY[it.rarity].name} · ${SLOT_NAME[it.slot]} · Niveau d'objet ${it.ilvl}</div>
    <div class="st">${statLines(it, cmp)}</div>
    ${cmp ? `<div class="sub" style="margin-top:6px">Comparé à : <span style="color:${RARITY[cur.rarity].color}">${cur.name}</span></div>` : ''}
    <div class="btns">${mode === 'bag' ? '<button class="primary" data-a="equip">Équiper</button><button data-a="sell">Vendre ' + it.value + ' or</button>' : mode === 'sell' ? '<button class="primary" data-a="sell">Vendre ' + it.value + ' or</button>' : ''}<button data-a="close">Fermer</button></div>`;
  T.querySelectorAll('button').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const a = b.dataset.a, S = G.save;
    if (a === 'equip') {
      S.bag.splice(S.bag.indexOf(it), 1);
      if (S.equip[it.slot]) S.bag.push(S.equip[it.slot]);
      S.equip[it.slot] = it; SFX.equip(); H.refreshHeroLooks(); rebuildPreview();
    } else if (a === 'sell') { S.bag.splice(S.bag.indexOf(it), 1); S.gold += it.value; SFX.coin(); }
    hideTip(); H.saveGame(); refreshHero();
  });
}
function hideTip() { $('tooltip').classList.add('hidden'); selected = null; }

// compétences du guerrier
function SKILLS() {
  return {
    charge: { name: 'Charge', icon: 'i_charge', max: 5, desc: (r) => `Fonce sur l'ennemi visé, l'étourdit ${(1.2 + r * 0.2).toFixed(1)} s. Recharge ${Math.max(4, 9 - r * 0.5)} s.` },
    whirl: { name: 'Tourbillon', icon: 'i_whirl', max: 5, desc: (r) => `30 rage : 4 coups circulaires à ${Math.round((0.75 + r * 0.12) * 100)} % des dégâts.` },
    shout: { name: 'Cri de guerre', icon: 'i_shout', max: 5, lvl: 3, desc: (r) => `+${25 + r * 5} % de dégâts pendant ${(10 + r * 1.5).toFixed(0)} s, soigne ${8 + r * 3} % et étourdit autour.` },
    vigor: { name: 'Vigueur', icon: 'i_potion', max: 5, desc: (r) => `+${r * 6} % de vie maximum.` },
    might: { name: 'Force brute', icon: 'i_attack', max: 5, desc: (r) => `+${r * 5} % de dégâts.` },
    fury: { name: 'Fureur', icon: 'i_whirl', max: 5, desc: (r) => `+${r * 2} % de chances de coup critique.` },
    iron: { name: 'Peau de fer', icon: 'i_warrior', max: 5, desc: (r) => `+${r * 8} % d'armure.` },
  };
}
