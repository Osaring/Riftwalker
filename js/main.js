// =====================================================================
// RIFTWALKER — roguelike d'action en vue du dessus, façon Diablo
// Boucle de jeu, héros guerrier, ennemis, combat, butin, étages.
// =====================================================================
import * as THREE from 'three';
import { loadAll, scene as piece } from './assets.js';
import { Character, HERO_H } from './character.js';
import { generateLevel, walkable, groundAt, ceilAt, moveCircle, lineFree } from './level.js';
import { buildWorld, glowTexture, cutout, preloadStone } from './world.js';
import { SLOTS, RARITY, randomDrop, makeItem, starterGear, looksOf, rollRarity, setCounts, legendaryPowers } from './items.js';
import { SKILLS as WSK, warriorDefaults, hasTalent, mainSkill } from './warrior.js';
import { initVFX } from './vfx.js';
import { SFX, unlock, settings, applyVolumes, setMusic, musicTick } from './audio.js';
import { input, setupInput, consume } from './input.js';
import * as UI from './ui.js';
import { R, clamp, lerp, damp, angWrap, angDiff, store, $ } from './util.js';

export const APP_VERSION = '5.1.0';

// ---------------------------------------------------------------
// MOTEUR 3D
// ---------------------------------------------------------------
const canvas = $('view');
document.body.classList.add('dark');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// résolution dynamique : on démarre net, et si l'iPhone n'arrive plus à suivre 60 images/s,
// on baisse un peu la définition (invisible en pleine action) plutôt que de saccader
const DPR = window.devicePixelRatio || 1;
const res = { max: Math.min(DPR, 1.6), min: Math.min(DPR, 0.85), cur: Math.min(DPR, 1.35), acc: 0, n: 0, calm: 0 };
renderer.setPixelRatio(res.cur);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// rendu « cinéma » (ACES) : noirs profonds et lumières chaudes, façon Diablo
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene3 = new THREE.Scene();
scene3.fog = new THREE.Fog(0x120c1c, 10, 42);
const hemi = new THREE.HemisphereLight(0x8a90ff, 0x3a2030, 1.2); scene3.add(hemi);
// un faible clair de lune froid (qui projette les ombres des personnages)
const moon = new THREE.DirectionalLight(0x8ea4ff, 1.3); moon.position.set(-0.5, 1, -0.35); scene3.add(moon); scene3.add(moon.target);
{
  moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024); moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.03;
  const sc = moon.shadow.camera; sc.left = sc.bottom = -15; sc.right = sc.top = 15; sc.near = 1; sc.far = 40;
}
const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 70);
// le halo de lumière chaude autour du héros, comme dans Diablo (au-delà, l'obscurité)
const heroLight = new THREE.PointLight(0xffc890, 36, 13, 1.6); scene3.add(heroLight);
// reflets doux sur le métal (sans ça, une armure en métal paraît noire)
{
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x1a1a22, side: THREE.BackSide })));
  const panel = (c, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
  panel(0xffb070, -4, 3, 2); panel(0x7090ff, 4, 4, -3); panel(0xfff0e0, 0, 4.9, 0);
  scene3.environment = pm.fromScene(es, 0.04).texture; scene3.environmentIntensity = 0.6;
} // lumière douce autour du héros (lisibilité)
const THEME_LOOK = {
  crypt: { fog: 0x050407, hemi: [0x5a6488, 0x1a1210, 0.55], name: 'La Crypte' },
  cave: { fog: 0x03060c, hemi: [0x4a6a98, 0x141828, 0.6], name: 'Les Grottes de cristal' },
  ruins: { fog: 0x040705, hemi: [0x6a8070, 0x181a10, 0.6], name: 'Les Ruines englouties' },
};

// qualité automatique : 1) on baisse la définition ; 2) si ça ne suffit toujours pas,
// on coupe les ombres portées (le plus gourmand). Le joueur n'a rien à régler.
let slowChecks = 0;
function adaptRes(dt) {
  res.acc += dt; res.n++;
  if (res.acc < 1) return;
  const avg = res.acc / res.n; res.acc = 0; res.n = 0;
  let next = res.cur;
  if (avg > 0.0195) { next = Math.max(res.min, res.cur - (avg > 0.026 ? 0.2 : 0.1)); res.calm = 0; }
  else if (avg < 0.0172) { res.calm++; if (res.calm >= 5) { next = Math.min(res.max, res.cur + 0.05); res.calm = 0; } }
  if (Math.abs(next - res.cur) > 0.001) { res.cur = next; renderer.setPixelRatio(next); renderer.setSize(window.innerWidth, window.innerHeight, false); }
  // déjà au minimum et toujours lent : on retire les ombres (une seule fois)
  if (res.cur <= res.min + 0.001 && avg > 0.021 && renderer.shadowMap.enabled) {
    if (++slowChecks >= 4) {
      renderer.shadowMap.enabled = false; moon.castShadow = false;
      scene3.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
      res.max = Math.min(res.max, 1.3);
    }
  } else slowChecks = 0;
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 78 : 62;
  camera.updateProjectionMatrix();
  UI.resizeOverlay();
}
addEventListener('resize', resize);

// ---------------------------------------------------------------
// SAUVEGARDE (on garde tout : niveau, or, équipement)
// ---------------------------------------------------------------
const SAVE_KEY = 'rw2_save';
function newSave() {
  return { v: 2, themeStart: Math.floor(Math.random() * 3), level: 1, xp: 0, gold: 0, potions: 3, equip: starterGear(), bag: [], spec: 'arms', talents: {}, skills: {}, points: 0, floor: 1, best: 1, kills: 0, sound: true, music: true };
}
export const G = {
  save: store.get(SAVE_KEY) || newSave(),
  state: 'loading', // loading | title | play | pause | hero | dead
  L: null, world: null, enemies: [], drops: [], chests: [], projs: [], hazards: [], music: "",
  time: 0, hitstop: 0, shake: 0,
  camYaw: 0, camPitch: 0.18, camManual: 0,
  target: null, inCombat: false, bossAlive: false,
};
if (G.save.v !== 2) G.save = newSave();
if (G.save.themeStart === undefined) G.save.themeStart = Math.floor(Math.random() * 3); // biome de départ au hasard
warriorDefaults(G.save); // nouveaux champs du guerrier (spécialisation, talents, compétences)
settings.sound = G.save.sound !== false; settings.music = G.save.music !== false;
export function saveGame() { store.set(SAVE_KEY, G.save); }

// ---------------------------------------------------------------
// STATISTIQUES DU HÉROS
// ---------------------------------------------------------------
export function heroStats() {
  const S = G.save, s = { str: 0, sta: 0, armor: 0, crit: 0, haste: 0 };
  for (const k of SLOTS) { const it = S.equip[k]; if (it) for (const [n, v] of Object.entries(it.stats)) s[n] = (s[n] || 0) + v; }
  const w = S.equip.mainhand, lv = S.level, sk = S.skills, spec = S.spec;
  const sets = setCounts(S.equip), T = (id) => hasTalent(S, id);
  // spécialisation, talents et ensembles modifient les statistiques de base
  let hpM = 1 + sk.vigor * 0.06, dmgM = 1 + sk.might * 0.05, armM = 1 + sk.iron * 0.08, critB = sk.fury * 0.02, spdM = 1;
  let critMult = 2, rageGen = 1, leech = 0, block = 0, taken = 1, costRed = 0;
  if (spec === 'arms') { dmgM *= 1.15; critMult = 2.3; }
  if (spec === 'fury') { spdM *= 1.2; rageGen = 1.3; leech += 0.04; }
  if (spec === 'prot') { armM *= 1.4; hpM *= 1.15; dmgM *= 0.9; block = 0.2; }
  if (T('bloodthirst')) leech += 0.06;
  if (T('stoneskin')) { armM *= 1.2; taken *= 0.9; }
  if ((sets.warlord || 0) >= 2) dmgM *= 1.1;
  if ((sets.warlord || 0) >= 4) { costRed = 10; critB += 0.1; }
  if ((sets.dawn || 0) >= 2) armM *= 1.2;
  const maxHp = Math.round((110 + (lv - 1) * 16 + s.sta * 9) * hpM);
  const dmg = (w ? w.dmg : 4) * (1 + s.str * 0.018) * dmgM * (1 + (lv - 1) * 0.03);
  const armor = s.armor * armM;
  const red = Math.min(0.78, armor / (armor + 70 + lv * 14));
  const crit = Math.min(0.65, 0.05 + s.crit * 0.004 + critB);
  const haste = 1 + s.haste * 0.006;
  return { ...s, maxHp, dmg, armor: Math.round(armor), red, crit, haste, atkSpeed: haste * (w ? w.speed : 1) * spdM,
    critMult, rageGen, leech, block, taken, costRed, sets, legend: legendaryPowers(S.equip), spec };
}
export const xpNeed = (lv) => Math.round(90 * Math.pow(lv, 1.55));

// ---------------------------------------------------------------
// HÉROS
// ---------------------------------------------------------------
const P = {
  ch: null, x: 0, z: 0, y: 0, face: 0, hp: 100, rage: 0, st: null,
  state: 'free', t: 0, combo: 0, queued: false, hitDone: false, inv: 0, moving: false, speed: 0,
  cd: { skill1: 0, skill2: 0, skill3: 0, ult: 0, parry: 0, roll: 0, potion: 0 },
  stk: { skill1: 1, skill3: 1 }, // charges disponibles (talents « Double charge », légendaire « Poigne du Titan »)
  stepT: 0, hurtT: 0, avatar: 0, avatarS: 1, lust: 0, swift: 0, shield: 0, swCd: 0, combo3: 0, execReady: false,
};
function buildHero() {
  if (P.ch) P.ch.dispose();
  P.ch = new Character({ height: HERO_H, rim: 0x9ab0ff, rimS: 0.22, hair: ['Hair_SimpleParted', 'Hair_Beard', 'Eyebrows_Regular'] });
  // cercle doré sous le héros (repère visuel comme sous les champions de LoL)
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 40), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.renderOrder = 2; P.ch.group.add(ring);
  P.ch.setLooks(looksOf(G.save.equip));
  scene3.add(P.ch.group);
  P.ch.anim.loop('Idle_Loop');
}
export function refreshHeroLooks() {
  if (P.ch) { P.ch.setLooks(looksOf(G.save.equip)); }
  P.st = heroStats(); P.hp = Math.min(P.hp, P.st.maxHp);
}

// ---------------------------------------------------------------
// ENNEMIS
// ---------------------------------------------------------------
const ETYPES = {
  ghoul: { name: 'Goule', hp: 46, dmg: 9, speed: 2.4, range: 1.7, height: 1.75, xp: 12, gold: [2, 6], walk: 'Zombie_Walk_Fwd_Loop', idle: 'Zombie_Idle_Loop', atk: 'Zombie_Scratch', atkHit: 0.42, atkSpeed: 1.5, windup: 0.5, cd: 1.6, looks: { chest: { part: 'Peasant_Body', tint: 0x8a8070 }, legs: { part: 'Peasant_Legs', tint: 0x7a7060 }, hands: { part: 'Peasant_Arms' }, feet: { part: 'Peasant_Feet' } }, poise: 0 },
  skeleton: { name: 'Squelette', hp: 60, dmg: 13, speed: 3.6, range: 2.1, height: 1.8, xp: 16, gold: [3, 8], walk: 'Jog_Fwd_Loop', idle: 'Sword_Idle', atk: 'Sword_Attack', atkHit: 0.42, atkSpeed: 1.25, windup: 0.6, cd: 2, looks: { chest: { part: 'Knight_Body_Cloth', tint: 0x7a7a8a }, head: { part: 'Knight_Head_Armet', metal: true, tint: 0x9a9aa8 }, legs: { part: 'Peasant_Legs', tint: 0x6a6a70 }, mainhand: { part: 'W_Sword_Bronze', tint: 0x8a8a8a } }, poise: 0 },
  cultist: { name: 'Cultiste', hp: 38, dmg: 11, speed: 3, range: 9, height: 1.8, xp: 15, gold: [3, 9], walk: 'Jog_Fwd_Loop', idle: 'Spell_Simple_Idle_Loop', atk: 'Spell_Simple_Shoot', atkHit: 0.45, atkSpeed: 0.8, windup: 0.75, cd: 2.4, ranged: true, looks: { chest: { part: 'Wizard_Body', tex: 'T_Wizard_3_BaseColor' }, legs: { part: 'Wizard_Legs', tex: 'T_Wizard_3_BaseColor' }, hands: { part: 'Wizard_Arms', tex: 'T_Wizard_3_BaseColor' }, feet: { part: 'Wizard_Feet' }, head: { part: 'Ranger_Head_Hood', tint: 0x5a3a7a } }, poise: 0 },
  brute: { name: 'Brute', hp: 150, dmg: 24, speed: 2.1, range: 2.6, height: 2.35, xp: 40, gold: [8, 18], walk: 'Walk_Loop', idle: 'Idle_Loop', atk: 'Sword_Attack', atkHit: 0.45, atkSpeed: 0.9, windup: 0.95, cd: 2.8, slam: 2.8, looks: { chest: { part: 'Knight_Body_Armor', tint: 0x6a5a5a, metal: true }, shoulders: { part: 'Knight_Acc_Pauldron_Spike', metal: true }, legs: { part: 'Knight_Legs_Armor', metal: true, tint: 0x7a6a6a }, feet: { part: 'Knight_Feet_Armor' }, mainhand: { part: 'W_Hammer_Large_Bronze', tint: 0x7a7070 } }, poise: 2 },
  boss: { name: 'Seigneur des Failles', hp: 520, dmg: 26, speed: 3.2, range: 2.8, height: 2.45, xp: 160, gold: [40, 70], walk: 'Jog_Fwd_Loop', idle: 'Sword_Idle', atk: 'Sword_Regular_C', atkHit: 0.42, atkSpeed: 1.15, windup: 0.75, cd: 1.7, slam: 3.4, looks: { chest: { part: 'Knight_Body_Armor', tex: 'T_Knight_3_BaseColor', metal: true, glow: 0x6a2aff }, head: { part: 'Knight_Head_Horns', tex: 'T_Knight_3_BaseColor', metal: true }, shoulders: { part: 'Knight_Acc_Pauldron_Spike', tex: 'T_Knight_3_BaseColor', metal: true }, legs: { part: 'Knight_Legs_Armor', tex: 'T_Knight_3_BaseColor', metal: true }, hands: { part: 'Knight_Arms', tex: 'T_Knight_3_BaseColor', metal: true }, feet: { part: 'Knight_Feet_Armor', tex: 'T_Knight_3_BaseColor' }, mainhand: { part: 'W_Axe_Double_Bronze', tint: 0xb8a0ff, glow: 0x8a4aff } }, poise: 3, boss: true },
};
// nouveaux monstres : chacun a une attaque reconnaissable
Object.assign(ETYPES, {
  // Berserker : se met en garde puis CHARGE en ligne droite (couloir rouge au sol : sors-en !)
  berserker: { name: 'Berserker', hp: 95, dmg: 16, speed: 3, range: 2.1, height: 1.95, xp: 26, gold: [5, 12], walk: 'Jog_Fwd_Loop', idle: 'Sword_Idle', atk: 'Sword_Attack', atkHit: 0.25, atkSpeed: 1.2, windup: 0.55, cd: 2, dash: true, looks: { chest: { part: 'Knight_Body_Cloth', tint: 0x8a3a2a }, shoulders: { part: 'Ranger_Acc_Pauldron', tint: 0x6a4a3a }, legs: { part: 'Ranger_Legs', tint: 0x5a3a2a }, feet: { part: 'Ranger_Feet_Boots' }, hands: { part: 'Ranger_Arms', tint: 0x7a5a4a }, mainhand: { part: 'W_Axe_Bronze', tint: 0x9a8a7a } }, poise: 1 },
  // Lanceur de couteaux : reste à distance et lance des dagues rapides en ligne droite
  thrower: { name: 'Lanceur de couteaux', hp: 40, dmg: 12, speed: 3.4, range: 10, height: 1.75, xp: 18, gold: [3, 9], walk: 'Jog_Fwd_Loop', idle: 'Sword_Idle', atk: 'OverhandThrow', atkHit: 0.27, atkSpeed: 1, windup: 0.6, cd: 2.2, ranged: 'dagger', looks: { chest: { part: 'Ranger_Body', tint: 0x6a6a5a }, head: { part: 'Ranger_Head_Hood', tint: 0x3a3a3a }, legs: { part: 'Ranger_Legs', tint: 0x4a4a40 }, hands: { part: 'Ranger_Arms' }, feet: { part: 'Ranger_Feet_Boots' }, mainhand: { part: 'W_Dagger_Bronze', tint: 0x9a9aa0 } }, poise: 0 },
  // Nécromancien : invoque des squelettes et fuit le contact
  necro: { name: 'Nécromancien', hp: 70, dmg: 10, speed: 2.8, range: 11, height: 1.85, xp: 34, gold: [8, 16], walk: 'Walk_Loop', idle: 'Spell_Simple_Idle_Loop', atk: 'Spell_Simple_Shoot', atkHit: 0.45, atkSpeed: 0.7, windup: 1, cd: 4.5, ranged: 'summon', looks: { chest: { part: 'Wizard_Body', tex: 'T_Wizard_2_BaseColor', tint: 0x5a4a6a }, legs: { part: 'Wizard_Legs', tex: 'T_Wizard_2_BaseColor', tint: 0x4a3a5a }, hands: { part: 'Wizard_Arms', tex: 'T_Wizard_2_BaseColor' }, feet: { part: 'Wizard_Feet' }, head: { part: 'Ranger_Head_Hood', tint: 0x2a1a3a } }, poise: 0 },
  // Possédé : court vers toi en brillant puis EXPLOSE (cercle au sol : éloigne-toi)
  bomber: { name: 'Possédé', hp: 30, dmg: 22, speed: 4.4, range: 1.8, height: 1.7, xp: 14, gold: [2, 6], walk: 'Sprint_Loop', idle: 'Zombie_Idle_Loop', atk: 'Idle_Shield_Break', atkHit: 0.3, atkSpeed: 1, windup: 0.95, cd: 99, explode: 2.9, looks: { chest: { part: 'Peasant_Body', tint: 0x6a4a3a }, legs: { part: 'Peasant_Legs', tint: 0x5a3a2a }, hands: { part: 'Peasant_Arms' } }, poise: 0, glow: 0xff5a1a },
  // Serviteur : petit squelette invoqué par le Nécromancien
  minion: { name: 'Serviteur', hp: 18, dmg: 6, speed: 3.4, range: 1.7, height: 1.45, xp: 3, gold: [0, 1], walk: 'Jog_Fwd_Loop', idle: 'Sword_Idle', atk: 'Sword_Attack', atkHit: 0.42, atkSpeed: 1.4, windup: 0.5, cd: 1.6, looks: { chest: { part: 'Peasant_Body', tint: 0x9a9080 }, mainhand: { part: 'W_Dagger_Bronze', tint: 0x7a7a7a } }, poise: 0, noLoot: true },
});
// Élites : versions renforcées avec un pouvoir (nom doré)
const AFFIX = {
  fast: { name: 'rapide', col: 0xffe04a },
  fiery: { name: 'enflammé', col: 0xff6a1a },
  shielded: { name: 'protégé', col: 0x5ab0ff },
};
const SKIN = { crypt: [0xb8b0a0, 0x7affd0], cave: [0x9a88c8, 0x5ad8ff], ruins: [0x8ab080, 0xffd04a] };
function spawnEnemy(type, x, z, room, elite = null) {
  const T = ETYPES[type], f = G.save.floor;
  const skin = SKIN[G.L.theme];
  const scale = elite ? 1.18 : 1;
  const ch = new Character({ height: T.height * scale, rim: type === 'boss' ? 0xb070ff : elite ? AFFIX[elite].col : 0x80301c, rimS: elite ? 0.55 : 0.3, skin: type === 'skeleton' || type === 'minion' ? 0xe0d8c8 : skin[0], eyes: type === 'boss' ? 0xff3a1a : T.glow || skin[1] });
  ch.setLooks(T.looks);
  scene3.add(ch.group);
  const hpM = (1 + 0.38 * (f - 1)) * (elite ? 2.6 : 1), dmM = (1 + 0.2 * (f - 1)) * (elite ? 1.3 : 1);
  const e = { type, T, ch, x, z, y: groundAt(G.L, x, z), face: R() * 6.28, hp: Math.round(T.hp * hpM), maxHp: Math.round(T.hp * hpM), dmg: T.dmg * dmM, room, state: 'idle', t: 0, cd: R() * 1.5, stun: 0, flinch: 0, dead: false, deadT: 0, rad: 0.42 * T.height * scale / 1.8, aggro: false,
    elite, spd: T.speed * (elite === 'fast' ? 1.45 : 1), dots: [], phase: 1, shield: 0, shieldMax: 0, calm: 0, fireT: 0 };
  e.name = elite ? `${T.name} ${AFFIX[elite].name}` : T.name;
  if (elite) {
    // anneau coloré sous les pieds des élites
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: AFFIX[elite].col, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.position.y = 0.05; ring.scale.setScalar(scale * T.height / 1.8); ch.group.add(ring);
  }
  if (elite === 'shielded') {
    e.shieldMax = Math.round(e.maxHp * 0.4); e.shield = e.shieldMax;
    e.bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0x5ab0ff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
    e.bubble.scale.set(0.75 * scale, T.height * scale * 0.62, 0.75 * scale); e.bubble.position.y = T.height * scale * 0.55; ch.group.add(e.bubble);
  }
  ch.anim.loop(T.idle, 0.8 + R() * 0.4);
  ch.anim.mixer.update(R() * 2);
  G.enemies.push(e);
  return e;
}

// ---------------------------------------------------------------
// EFFETS : étincelles, poussière, éclats (une seule « nuée » de particules)
// ---------------------------------------------------------------
const PMAX = 700;
const parts = { pos: new Float32Array(PMAX * 3), col: new Float32Array(PMAX * 3), size: new Float32Array(PMAX), vel: new Float32Array(PMAX * 3), life: new Float32Array(PMAX), max: new Float32Array(PMAX), grav: new Float32Array(PMAX), n: 0 };
const pgeo = new THREE.BufferGeometry();
pgeo.setAttribute('position', new THREE.BufferAttribute(parts.pos, 3));
pgeo.setAttribute('color', new THREE.BufferAttribute(parts.col, 3));
pgeo.setAttribute('size', new THREE.BufferAttribute(parts.size, 1));
const pmat = new THREE.ShaderMaterial({
  uniforms: { map: { value: glowTexture('#ffffff', '#ffffff') }, scale: { value: 400 } },
  vertexShader: 'attribute float size; attribute vec3 color; varying vec3 vc; uniform float scale; void main(){ vc = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform sampler2D map; varying vec3 vc; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vc * t.rgb, t.a); }',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const points = new THREE.Points(pgeo, pmat); points.frustumCulled = false; scene3.add(points);
const FX = initVFX(scene3); // ondes de choc, sang, feu, visée
const tmpC = new THREE.Color();
export function burst(x, y, z, n, col, { speed = 4, size = 0.25, life = 0.5, grav = 6, up = 1 } = {}) {
  tmpC.set(col);
  for (let i = 0; i < n; i++) {
    const k = parts.n++ % PMAX;
    parts.pos.set([x, y, z], k * 3);
    const a = R() * Math.PI * 2, el = (R() - 0.2) * 1.2, s = speed * (0.4 + R() * 0.8);
    parts.vel.set([Math.cos(a) * Math.cos(el) * s, Math.sin(el) * s * up + speed * 0.3, Math.sin(a) * Math.cos(el) * s], k * 3);
    parts.col.set([tmpC.r, tmpC.g, tmpC.b], k * 3);
    parts.size[k] = size * (0.6 + R() * 0.8); parts.life[k] = parts.max[k] = life * (0.6 + R() * 0.8); parts.grav[k] = grav;
  }
}
let partsAlive = true;
function updateParts(dt) {
  if (!partsAlive && parts.n === partsN0) return; // rien à animer
  partsN0 = parts.n; let alive = false;
  for (let k = 0; k < PMAX; k++) {
    if (parts.life[k] <= 0) { parts.size[k] = 0; continue; }
    alive = true;
    parts.life[k] -= dt;
    const f = Math.max(0, parts.life[k] / parts.max[k]);
    parts.vel[k * 3 + 1] -= parts.grav[k] * dt;
    parts.pos[k * 3] += parts.vel[k * 3] * dt; parts.pos[k * 3 + 1] += parts.vel[k * 3 + 1] * dt; parts.pos[k * 3 + 2] += parts.vel[k * 3 + 2] * dt;
    parts.vel[k * 3] *= 0.96; parts.vel[k * 3 + 2] *= 0.96;
    if (parts.life[k] <= 0) parts.size[k] = 0;
    else parts.size[k] *= f > 0.3 ? 1 : 0.92;
  }
  partsAlive = alive;
  pgeo.attributes.position.needsUpdate = true; pgeo.attributes.size.needsUpdate = true; pgeo.attributes.color.needsUpdate = true;
}
let partsN0 = 0;

// traînée de l'épée : un ruban lumineux, lissé en courbe, qui ne s'allume que pendant la frappe
const TRAIL_SEG = 40, TRAIL_LIFE = 0.16;
const trailGeo = new THREE.BufferGeometry();
const trailPos = new Float32Array(TRAIL_SEG * 2 * 3), trailA = new Float32Array(TRAIL_SEG * 2);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute('alpha', new THREE.BufferAttribute(trailA, 1));
const tIdx = []; for (let i = 0; i < TRAIL_SEG - 1; i++) { const a = i * 2; tIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
trailGeo.setIndex(tIdx);
const trailMat = new THREE.ShaderMaterial({
  uniforms: { col: { value: new THREE.Color(0xffd890) } },
  vertexShader: 'attribute float alpha; varying float va; void main(){ va = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  // cœur blanc près de la lame, couleur dorée qui s'estompe vers la queue
  fragmentShader: 'uniform vec3 col; varying float va; void main(){ vec3 c = mix(col, vec3(1.0), va * va * 0.7); gl_FragColor = vec4(c, va * va * 0.7); }',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const trail = new THREE.Mesh(trailGeo, trailMat); trail.frustumCulled = false; scene3.add(trail);
const trailPts = []; let trailOn = 0, trailClock = 0;
const vA = new THREE.Vector3(), vB = new THREE.Vector3();
function cr(p0, p1, p2, p3, t) { // courbe de Catmull-Rom : passe par les points en arrondissant les angles
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function updateTrail(dt) {
  trailClock += dt;
  const w = P.ch && P.ch.parts.mainhand && P.ch.parts.mainhand[0];
  if (w && trailOn > 0) {
    if (w.userData.tipY === undefined) { // longueur de la lame, mesurée une fois par arme
      let my = 0.6; w.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); my = Math.max(my * (my === 0.6 ? 0 : 1), o.position.y + o.geometry.boundingBox.max.y * o.scale.y); } });
      w.userData.tipY = my;
    }
    const tip = w.userData.tipY;
    w.updateWorldMatrix(true, false);
    vA.set(0, tip * 0.45, 0).applyMatrix4(w.matrixWorld); vB.set(0, tip, 0).applyMatrix4(w.matrixWorld);
    trailPts.unshift({ a: [vA.x, vA.y, vA.z], b: [vB.x, vB.y, vB.z], t: trailClock });
  }
  trailOn -= dt;
  while (trailPts.length && trailClock - trailPts[trailPts.length - 1].t > TRAIL_LIFE) trailPts.pop();
  const n = trailPts.length;
  trail.visible = n >= 2;
  if (!trail.visible) return;
  // on subdivise entre les points enregistrés pour obtenir un arc bien rond
  for (let i = 0; i < TRAIL_SEG; i++) {
    const f = (i / (TRAIL_SEG - 1)) * (n - 1), j = Math.min(n - 2, Math.floor(f)), u = f - j;
    const p0 = trailPts[Math.max(0, j - 1)], p1 = trailPts[j], p2 = trailPts[j + 1], p3 = trailPts[Math.min(n - 1, j + 2)];
    const age = (trailClock - (p1.t + (p2.t - p1.t) * u)) / TRAIL_LIFE;
    const life = Math.max(0, 1 - age) * (1 - i / TRAIL_SEG);
    for (let c = 0; c < 3; c++) {
      const A = cr(p0.a[c], p1.a[c], p2.a[c], p3.a[c], u), B = cr(p0.b[c], p1.b[c], p2.b[c], p3.b[c], u);
      // la base se resserre vers la pointe en vieillissant : forme de croissant
      trailPos[i * 6 + c] = B + (A - B) * (0.2 + 0.8 * life); trailPos[i * 6 + 3 + c] = B;
    }
    trailA[i * 2] = life * 0.15; trailA[i * 2 + 1] = life;
  }
  trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.alpha.needsUpdate = true;
}

// signal d'attaque au sol (cercle ou cône rouge qui se remplit)
const tele = [];
// ang = 'line' : un couloir rectangulaire de longueur r et de largeur 1,6 m (charge, lancer)
function telegraph(x, z, y, r, dur, ang = null, face = 0) {
  let geo;
  if (ang === 'line') { geo = new THREE.PlaneGeometry(1.6, r).translate(0, r / 2, 0); geo.rotateX(-Math.PI / 2); geo.rotateY(Math.PI); }
  else { geo = ang ? new THREE.CircleGeometry(r, 24, -ang / 2, ang) : new THREE.CircleGeometry(r, 32); geo.rotateX(-Math.PI / 2); }
  const outer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.22, depthWrite: false }));
  const inner = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: 0.4, depthWrite: false }));
  const g = new THREE.Group(); g.add(outer); g.add(inner);
  g.position.set(x, y + 0.04, z); g.rotation.y = ang === 'line' ? face : ang ? face - Math.PI / 2 : 0;
  inner.scale.setScalar(0.01); scene3.add(g);
  const t = { g, inner, t: 0, dur }; tele.push(t); return t;
}
function updateTele(dt) {
  for (let i = tele.length - 1; i >= 0; i--) {
    const t = tele[i]; t.t += dt;
    t.inner.scale.setScalar(Math.min(1, t.t / t.dur));
    if (t.t >= t.dur || t.dead) { scene3.remove(t.g); t.g.children.forEach((m) => { m.geometry.dispose(); m.material.dispose(); }); tele.splice(i, 1); }
  }
}

// ---------------------------------------------------------------
// ÉTAGES
// ---------------------------------------------------------------
function clearFloor() {
  if (G.world) G.world.dispose();
  for (const e of G.enemies) e.ch.dispose();
  for (const d of G.drops) scene3.remove(d.obj);
  for (const c of G.chests) scene3.remove(c.obj);
  for (const p of G.projs) scene3.remove(p.obj);
  G.enemies = []; G.drops = []; G.chests = []; G.projs = []; G.hazards = [];
  tele.forEach((t) => { t.dead = true; });
  FX.clear();
}
export function enterFloor(floor, fresh = true) {
  clearFloor();
  G.save.floor = floor; G.save.best = Math.max(G.save.best, floor);
  const seed = fresh ? (Date.now() ^ (floor * 2654435761)) >>> 0 : (G.save.seed || 1);
  G.save.seed = seed;
  const L = generateLevel(floor, seed, G.save.themeStart);
  G.L = L;
  const look = THEME_LOOK[L.theme];
  scene3.fog.color.setHex(look.fog); renderer.setClearColor(look.fog);
  hemi.color.setHex(look.hemi[0]); hemi.groundColor.setHex(look.hemi[1]); hemi.intensity = look.hemi[2];
  G.world = buildWorld(renderer, scene3, L);
  // ennemis selon la salle
  const f = floor;
  for (const room of L.rooms) {
    if (room.type === 'start') continue;
    const cells = room.cells.filter((k) => !L.solid[k]);
    const spot = () => { for (let i = 0; i < 40; i++) { const k = cells[Math.floor(R() * cells.length)]; const x = (k % L.W) + 0.5, z = Math.floor(k / L.W) + 0.5; if (Math.hypot(x - room.cx, z - room.cz) < room.rad - 1.5) return [x, z]; } return [room.cx + 0.5, room.cz + 0.5]; };
    if (room.type === 'exit') {
      spawnEnemy('boss', room.cx + 0.5, room.cz + 2.5, room);
      for (let i = 0; i < Math.min(3, 1 + Math.floor(f / 2)); i++) spawnEnemy(R() < 0.5 ? 'skeleton' : 'ghoul', ...spot(), room);
      continue;
    }
    const n = room.type === 'treasure' ? R() < 0.5 ? 0 : 2 : Math.min(7, 2 + Math.floor(f * 0.6) + Math.floor(R() * 3));
    // une salle de combat sur 4 (puis plus souvent) contient une élite
    const eliteAt = room.type === 'combat' && R() < Math.min(0.6, 0.22 + f * 0.06) ? Math.floor(R() * n) : -1;
    for (let i = 0; i < n; i++) {
      const pool = [['ghoul', 4], ['skeleton', 3], ['bomber', f >= 2 ? 1.4 : 0.6], ['cultist', f >= 2 ? 2 : 0.6], ['thrower', f >= 2 ? 1.6 : 0.5], ['brute', f >= 2 ? 1 : 0.3], ['berserker', f >= 2 ? 1.3 : 0.3], ['necro', f >= 3 ? 0.9 : 0]];
      let s = 0; for (const [, w] of pool) s += w; let x = R() * s, type = 'ghoul';
      for (const [t, w] of pool) { x -= w; if (x <= 0) { type = t; break; } }
      const elite = i === eliteAt && type !== 'bomber' ? ['fast', 'fiery', 'shielded'][Math.floor(R() * 3)] : null;
      spawnEnemy(type, ...spot(), room, elite);
    }
  }
  // coffres
  for (const pr of L.props) if (pr.kind === 'chest') {
    const obj = piece('props', 'chest').clone(true); obj.scale.setScalar(1.1);
    obj.position.set(pr.x, pr.y, pr.z); obj.rotation.y = pr.rot; scene3.add(obj);
    G.chests.push({ x: pr.x, z: pr.z, y: pr.y, obj, open: false });
  }
  G.bossAlive = true; G.music = '';
  // héros au départ
  P.x = L.spawn.x; P.z = L.spawn.z; P.y = groundAt(L, P.x, P.z);
  P.st = heroStats(); P.hp = P.st.maxHp; P.rage = 0; P.state = 'free'; P.inv = 1;
  for (const k in P.cd) P.cd[k] = 0;
  P.stk.skill1 = maxStk('skill1'); P.stk.skill3 = maxStk('skill3');
  P.avatar = 0; P.lust = 0; P.swift = 0; P.shield = 0; P.combo3 = 0; P.ch.group.scale.setScalar(1); P.avatarS = 1;
  // la caméra regarde vers la sortie la plus proche
  const room0 = L.rooms[0], first = L.rooms.find((r) => r.parent === 0) || L.rooms[1];
  G.camYaw = 0; P.face = Math.atan2(first.cx - room0.cx, first.cz - room0.cz); // caméra fixe (vue LoL), le héros regarde vers la sortie
  camInit = false;
  UI.initMinimap(L);
  UI.banner(`Étage ${floor}`, look.name);
  setMusic('explore');
  saveGame();
}

// ---------------------------------------------------------------
// CIBLAGE : l'ennemi le plus proche devant la caméra
// ---------------------------------------------------------------
function camFwd() { return [Math.sin(G.camYaw), Math.cos(G.camYaw)]; }
function pickTarget(maxD) {
  const fa = P.face; // vue du dessus : on privilégie ce qui est devant le héros, mais on regarde tout autour
  let best = null, bs = Infinity;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
    if (d > maxD) continue;
    const da = angDiff(Math.atan2(dx, dz), fa);
    if (!lineFree(G.L, P.x, P.z, e.x, e.z)) continue;
    const s = d * (1 + da * 0.35);
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}

// ---------------------------------------------------------------
// DÉGÂTS
// ---------------------------------------------------------------
// src : 'melee' (coup d'arme, génère de la rage), 'skill', 'dot' (saignement/brûlure), 'reflect'
function hitEnemy(e, base, { heavy = false, kb = 0.4, stun = 0, from = null, src = 'melee', noCrit = false, color = null } = {}) {
  if (e.dead) return false;
  const st = P.st;
  const crit = !noCrit && src !== 'dot' && R() < st.crit;
  const av = P.avatar > 0 ? 1.3 + G.save.skills.avatar * 0.05 : 1;
  let dmg = base * (src === 'dot' ? 1 : 0.9 + R() * 0.2) * (crit ? st.critMult : 1) * av;
  dmg = Math.max(1, Math.round(dmg));
  e.aggro = true; e.calm = 0;
  const hy = e.y + e.T.height * 0.6;
  // bouclier des élites « protégées » : absorbe d'abord
  if (e.shield > 0) {
    const ab = Math.min(e.shield, dmg); e.shield -= ab; dmg -= ab;
    if (e.bubble) e.bubble.material.opacity = 0.45;
    if (e.shield <= 0 && e.bubble) { e.bubble.visible = false; burst(e.x, hy, e.z, 30, 0x8ad0ff, { speed: 5, size: 0.25, life: 0.5 }); SFX.block(); }
    if (!dmg) { UI.damageNumber(e.x, hy + 0.3, e.z, 'absorbé', '#8ad0ff', false); return false; }
  }
  e.hp -= dmg;
  if (src === 'dot') { UI.damageNumber(e.x, hy + 0.1, e.z, dmg, color || '#ff9a4a', false); }
  else {
    UI.damageNumber(e.x, hy + 0.3, e.z, dmg, crit ? '#ffd23a' : '#ffffff', crit);
    burst(e.x, hy, e.z, crit ? 18 : 10, crit ? 0xffc040 : 0xfff0d0, { speed: crit ? 6 : 4, size: 0.2, life: 0.3 });
    // sang (sombre, il retombe) et tache au sol
    burst(e.x, hy, e.z, crit ? 16 : 9, e.type === 'skeleton' || e.type === 'minion' ? 0x9a9488 : 0x7a0a0a, { speed: 3.5, size: 0.17, life: 0.6, grav: 14, up: 0.6 });
    if (e.type !== 'skeleton' && e.type !== 'minion' && R() < (crit || heavy ? 0.9 : 0.4)) FX.bloodDecal(e.x, e.y, e.z, heavy || crit ? 1.4 : 0.9);
    e.ch.flash(0xffffff, 0.12);
    crit ? SFX.crit() : heavy ? SFX.heavyHit() : SFX.hit();
    if (src === 'melee') P.rage = Math.min(100, P.rage + (crit ? 12 : 8) * st.rageGen);
    if (st.leech > 0) P.hp = Math.min(st.maxHp, P.hp + dmg * st.leech);
    // légendaire Cendre-Éternelle : les coups enflamment
    if (st.legend.has('ashbringer') && src !== 'reflect') e.dots.push({ dps: dmg * 0.1, t: 3, col: '#ff8a3a', fx: 0xff6a1a });
    G.hitstop = Math.max(G.hitstop, heavy || crit ? 0.075 : 0.035);
    G.shake = Math.max(G.shake, heavy || crit ? 0.18 : 0.08);
  }
  // recul et étourdissement
  if (kb > 0) {
    const ax = e.x - (from ? from.x : P.x), az = e.z - (from ? from.z : P.z), al = Math.hypot(ax, az) || 1;
    const k = kb / (1 + e.T.poise * 0.6) / (e.elite ? 1.5 : 1);
    moveCircle(G.L, e, (ax / al) * k, (az / al) * k, e.rad);
  }
  if (stun && !(e.T.boss && e.phaseT > 0)) e.stun = Math.max(e.stun, e.T.boss ? stun * 0.5 : stun);
  if (e.hp <= 0) { killEnemy(e); return true; }
  if ((heavy || e.T.poise === 0) && e.state !== 'attack' && src !== 'dot' && e.state !== 'dash' && e.state !== 'fuse') {
    // interrompt l'ennemi (sauf les plus robustes, sauf coup lourd)
    if (e.T.poise <= (heavy ? 2 : 0) && !e.elite) {
      if (e.tele) { e.tele.dead = true; e.tele = null; }
      e.state = 'stagger'; e.t = heavy ? 0.6 : 0.35;
      e.ch.anim.play(R() < 0.5 ? 'Hit_Chest' : 'Hit_Head', { speed: 1.1 });
    }
  }
  return false;
}
function killEnemy(e) {
  e.dead = true; e.deadT = 0; e.hp = 0;
  if (e.tele) { e.tele.dead = true; e.tele = null; }
  if (e.bubble) e.bubble.visible = false;
  e.ch.anim.play('Death01', { speed: 1.3, hold: true });
  SFX.enemyDie(e.type);
  // il se désagrège : braises qui montent + fumée sombre
  burst(e.x, e.y + 1, e.z, 22, e.T.boss ? 0xb070ff : 0xff7a3a, { speed: 2, size: 0.14, life: 1.1, grav: -2.5 });
  burst(e.x, e.y + 0.6, e.z, 12, 0x1a1418, { speed: 1.2, size: 0.7, life: 1.2, grav: -1 });
  if (e.type !== 'skeleton' && e.type !== 'minion') FX.bloodDecal(e.x, e.y, e.z, 1.7);
  if (G.target === e) G.target = null;
  if (P.st.legend.has('bloodlust')) P.lust = 4;
  if (e.T.noLoot) { G.save.kills++; return; }
  // expérience, or, butin
  const f = G.save.floor, el = e.elite ? 3 : 1;
  gainXp(Math.round(e.T.xp * (1 + 0.3 * (f - 1)) * el));
  const [g0, g1] = e.T.gold;
  dropGold(e.x, e.z, Math.round((g0 + R() * (g1 - g0)) * (1 + 0.25 * (f - 1)) * el));
  const ilvl = G.save.level + Math.floor(f / 2);
  if (e.T.boss) {
    G.bossAlive = false;
    dropItem(e.x + 1, e.z, makeItem(SLOTS[Math.floor(R() * SLOTS.length)], ilvl + 1, Math.max(3, rollRarity(20))));
    dropItem(e.x - 1, e.z, randomDrop(ilvl + 1, 15));
    UI.banner('Seigneur vaincu', 'Le portail est ouvert');
    G.world.openPortal(); SFX.portal(); setMusic('combat');
    burst(G.L.portal.x, G.L.portal.y + 1.9, G.L.portal.z, 70, 0xb070ff, { speed: 5, size: 0.35, life: 1.2, grav: -1 });
    FX.shockwave(e.x, e.y, e.z, 9, 0xb070ff, 0.9); FX.flash(e.x, e.y, e.z, 0xb070ff, 60, 1);
    G.shake = 0.4; G.hitstop = 0.25;
  } else if (e.elite) {
    dropItem(e.x + 0.8, e.z, randomDrop(ilvl + 1, 18));
    if (R() < 0.6) dropItem(e.x - 0.8, e.z, randomDrop(ilvl, 10));
  } else if (R() < (e.type === 'brute' ? 0.55 : 0.2)) dropItem(e.x, e.z, randomDrop(ilvl, e.type === 'brute' ? 8 : 0));
  if (R() < (e.elite ? 0.4 : 0.07)) dropPotion(e.x, e.z);
  G.save.kills++;
}
// kind : 'melee' (coup au contact), 'proj' (projectile), 'aoe' (explosion, onde : ne se pare pas)
function hurtPlayer(dmg, from, heavy = false, kind = 'melee') {
  if (P.inv > 0 || P.state === 'dead') return 'miss';
  const st = P.st;
  if (P.state === 'parry' && kind !== 'aoe') { parrySuccess(from, kind); return 'parried'; }
  // Protection : chance de bloquer un coup venu de face
  if (st.block > 0 && kind !== 'aoe' && from && angDiff(Math.atan2(from.x - P.x, from.z - P.z), P.face) < 1.1 && R() < st.block) {
    UI.damageNumber(P.x, P.y + 2, P.z, 'Bloqué', '#9ad0ff', false, true); SFX.block();
    burst(P.x + Math.sin(P.face) * 0.6, P.y + 1.2, P.z + Math.cos(P.face) * 0.6, 14, 0xd0e8ff, { speed: 4, size: 0.18, life: 0.3 });
    P.rage = Math.min(100, P.rage + 6);
    if (st.legend.has('azerothtear')) stunWave(3.5, 1.5, 0x8ad0ff);
    return 'blocked';
  }
  dmg = Math.max(1, Math.round(dmg * (1 - st.red) * st.taken * (0.9 + R() * 0.2)));
  // bouclier du talent « Second souffle »
  if (P.shield > 0) { const ab = Math.min(P.shield, dmg); P.shield -= ab; dmg -= ab; if (!dmg) { UI.damageNumber(P.x, P.y + 2, P.z, 'absorbé', '#ffe08a', false, true); return 'absorbed'; } }
  P.hp -= dmg; P.hurtT = 0.4;
  P.rage = Math.min(100, P.rage + 5 * st.rageGen);
  UI.damageNumber(P.x, P.y + 2, P.z, dmg, '#ff4a3a', false, true);
  P.ch.flash(0xff2a1a, 0.18);
  SFX.hurt(); G.shake = Math.max(G.shake, heavy ? 0.3 : 0.14);
  burst(P.x, P.y + 1.2, P.z, 10, 0x8a0a0a, { speed: 3, size: 0.18, life: 0.5, grav: 12 });
  // légendaire Couronne d'Épines : renvoie une partie des coups au contact
  if (kind === 'melee' && from && !from.dead && from.hp && st.legend.has('thorncrown')) hitEnemy(from, dmg * 0.4 / (1 - st.red + 0.01), { src: 'reflect', noCrit: true, kb: 0 });
  if (P.hp <= 0) { P.hp = 0; die(); return 'dead'; }
  if (hasTalent(G.save, 'secondwind') && P.hp < st.maxHp * 0.3 && P.swCd <= 0) {
    P.shield = st.maxHp * 0.3; P.swCd = 60; SFX.shout(); UI.lootMsg('Second souffle !', '#ffe08a');
    FX.shockwave(P.x, P.y, P.z, 3, 0xffe08a, 0.5); burst(P.x, P.y + 1, P.z, 30, 0xffe08a, { speed: 3, size: 0.25, life: 0.8, grav: -2 });
  }
  if (heavy && !['whirl', 'leap', 'charge'].includes(P.state) && P.avatar <= 0) {
    P.state = 'hit'; P.t = 0.55;
    P.ch.anim.play('Hit_Knockback', { speed: 1.2 });
    const ax = P.x - from.x, az = P.z - from.z, al = Math.hypot(ax, az) || 1;
    P.kbx = ax / al * 6; P.kbz = az / al * 6;
  } else if (P.state === 'free') P.ch.anim.play('Hit_Chest', { upper: P.moving, speed: 1.2 });
  return 'hit';
}
// étourdit tous les ennemis autour du héros (onde visible)
function stunWave(rad, dur, col) {
  FX.shockwave(P.x, P.y, P.z, rad, col, 0.5);
  for (const e of G.enemies) if (!e.dead && Math.hypot(e.x - P.x, e.z - P.z) < rad + e.rad) { e.stun = Math.max(e.stun, e.T.boss ? dur * 0.4 : dur); e.aggro = true; }
}
// PARADE réussie : le coup est annulé et le héros riposte
function parrySuccess(from, kind) {
  const st = P.st, S = G.save, r = S.skills.parry;
  SFX.parry(); G.hitstop = 0.12; G.shake = 0.2;
  const fx = P.x + Math.sin(P.face) * 0.7, fz = P.z + Math.cos(P.face) * 0.7;
  burst(fx, P.y + 1.3, fz, 30, 0xe0f0ff, { speed: 6, size: 0.2, life: 0.35 });
  FX.flash(fx, P.y, fz, 0x9ad0ff, 40, 0.3); FX.shockwave(P.x, P.y, P.z, 2.2, 0x9ad0ff, 0.35);
  UI.damageNumber(P.x, P.y + 2.2, P.z, 'Paré !', '#9ad0ff', true, true);
  P.rage = Math.min(100, P.rage + 10);
  P.state = 'riposte'; P.t = 0.4; P.inv = 0.4;
  P.ch.anim.play('Sword_Regular_A', { speed: 1.8, fade: 0.05 }); trailOn = 0.3;
  if (from && !from.dead && from.hp && kind === 'melee' && Math.hypot(from.x - P.x, from.z - P.z) < 4) {
    P.face = P.wantFace = Math.atan2(from.x - P.x, from.z - P.z);
    hitEnemy(from, st.dmg * (1.5 + r * 0.25), { heavy: true, kb: 1, stun: 0.8, src: 'skill' });
  }
  if (hasTalent(S, 'riposte')) for (const e of G.enemies) if (!e.dead && e !== from && Math.hypot(e.x - P.x, e.z - P.z) < 3.4 + e.rad) hitEnemy(e, st.dmg, { kb: 0.8, src: 'skill' });
  if (hasTalent(S, 'battlerage')) { P.rage = Math.min(100, P.rage + 30); P.stk.skill1 = maxStk('skill1'); P.cd.skill1 = 0; }
  if ((st.sets.dawn || 0) >= 4) stunWave(4, 2, 0xffe8a0);
  if (st.legend.has('azerothtear')) stunWave(3.5, 1.5, 0x8ad0ff);
  if (st.legend.has('voidwhisper')) { P.hp = Math.min(st.maxHp, P.hp + st.maxHp * 0.1); burst(P.x, P.y + 1, P.z, 16, 0xb070ff, { speed: 2, size: 0.25, life: 0.7, grav: -2 }); }
}
function die() {
  P.state = 'dead'; P.t = 0;
  P.ch.anim.play('Death01', { speed: 1, hold: true });
  SFX.death(); setMusic('explore');
  setTimeout(() => { G.state = 'dead'; UI.showDeath(G); }, 2300);
}
function gainXp(n) {
  const S = G.save; S.xp += n;
  while (S.xp >= xpNeed(S.level)) {
    S.xp -= xpNeed(S.level); S.level++; S.points++;
    P.st = heroStats(); P.hp = P.st.maxHp;
    SFX.levelUp(); UI.banner(`Niveau ${S.level}`, '+1 point de compétence');
    burst(P.x, P.y + 1, P.z, 60, 0xffd27a, { speed: 4, size: 0.3, life: 1.2, grav: -2 });
    UI.lootMsg(`Niveau ${S.level} atteint !`, '#ffd27a');
  }
}

// ---------------------------------------------------------------
// BUTIN AU SOL
// ---------------------------------------------------------------
const coinSrc = () => piece('props', 'coins');
function dropGold(x, z, amount) {
  const obj = coinSrc().clone(true); obj.scale.setScalar(1.6);
  const y = groundAt(G.L, x, z); obj.position.set(x, y + 0.1, z);
  scene3.add(obj);
  G.drops.push({ kind: 'gold', amount, x: x + (R() - 0.5), z: z + (R() - 0.5), y, obj, t: 0, vy: 4 });
}
function dropPotion(x, z) {
  const g = new THREE.Group();
  const flask = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: 0xff3a5a, emissive: 0xff2a4a, emissiveIntensity: 0.8, roughness: 0.2 }));
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.14, 8), new THREE.MeshStandardMaterial({ color: 0xd8c8b8 }));
  neck.position.y = 0.18; g.add(flask); g.add(neck);
  const y = groundAt(G.L, x, z); g.position.set(x, y + 0.3, z); scene3.add(g);
  G.drops.push({ kind: 'potion', x, z, y, obj: g, t: 0, vy: 3 });
}
const beamTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 64; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 64, 0, 0); g.addColorStop(0, '#ffffffff'); g.addColorStop(0.4, '#ffffff88'); g.addColorStop(1, '#ffffff00'); x.fillStyle = g; x.fillRect(0, 0, 4, 64); const t = new THREE.CanvasTexture(c); return t; })();
function dropItem(x, z, item) {
  const col = new THREE.Color(RARITY[item.rarity].color);
  const g = new THREE.Group();
  const h = 1.6 + item.rarity * 0.5;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12 + item.rarity * 0.02, 0.22, h, 10, 1, true), new THREE.MeshBasicMaterial({ map: beamTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.y = h / 2; g.add(beam);
  const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.2, roughness: 0.3 }));
  orb.position.y = 0.45; g.add(orb);
  const y = groundAt(G.L, x, z); g.position.set(x, y, z); scene3.add(g);
  G.drops.push({ kind: 'item', item, x, z, y, obj: g, orb, t: 0 });
  if (item.rarity >= 3) { SFX.loot(item.rarity); }
}
function updateDrops(dt) {
  for (let i = G.drops.length - 1; i >= 0; i--) {
    const d = G.drops[i]; d.t += dt;
    const dx = P.x - d.x, dz = P.z - d.z, dist = Math.hypot(dx, dz);
    if (d.kind === 'gold' || d.kind === 'potion') {
      // petit saut puis attirance vers le héros
      if (d.vy !== undefined) { d.vy -= 14 * dt; d.hop = (d.hop || 0) + d.vy * dt; if (d.hop < 0) { d.hop = 0; d.vy = d.vy < -2 ? -d.vy * 0.3 : 0; } }
      if (d.t > 0.5 && dist < 3.2 && P.state !== 'dead') { const k = Math.min(1, dt * 9); d.x += dx * k; d.z += dz * k; }
      d.obj.position.set(d.x, groundAt(G.L, d.x, d.z) + 0.08 + (d.hop || 0), d.z); d.obj.rotation.y += dt * 3;
      if (dist < 0.6 && d.t > 0.5) {
        if (d.kind === 'gold') { G.save.gold += d.amount; SFX.coin(); UI.lootMsg(`+${d.amount} or`, '#ffd27a'); }
        else { G.save.potions++; SFX.pickup(); UI.lootMsg('Potion de soins', '#ff7a8a'); }
        scene3.remove(d.obj); G.drops.splice(i, 1);
      }
    } else {
      d.orb.rotation.y += dt * 2; d.orb.position.y = 0.45 + Math.sin(d.t * 3) * 0.08;
      if (dist < 1.4 && P.state !== 'dead') {
        if (G.save.bag.length >= 40) { if (!d.warned) { UI.lootMsg('Sac plein !', '#ff6a5a'); d.warned = true; } continue; }
        G.save.bag.push(d.item); SFX.pickup();
        UI.lootMsg(`[${d.item.name}]`, RARITY[d.item.rarity].color);
        UI.bagDot(true);
        scene3.remove(d.obj); G.drops.splice(i, 1); saveGame();
      }
    }
  }
  // coffres : s'ouvrent quand on s'approche
  for (const c of G.chests) {
    if (c.open || Math.hypot(P.x - c.x, P.z - c.z) > 1.9) continue;
    c.open = true; SFX.chest();
    burst(c.x, c.y + 0.8, c.z, 40, 0xffd27a, { speed: 4, size: 0.3, life: 1, grav: 2 });
    const ilvl = G.save.level + Math.floor(G.save.floor / 2);
    const n = 1 + (R() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) dropItem(c.x + Math.cos(i * 2.5) * 1.2, c.z + Math.sin(i * 2.5) * 1.2, randomDrop(ilvl, 12));
    dropGold(c.x, c.z + 0.8, Math.round((15 + R() * 20) * G.save.floor));
    c.obj.rotation.x = -0.15; c.obj.scale.y = 0.9;
  }
}

// ---------------------------------------------------------------
// CHAMP DE DIRECTION : chaque case connaît le chemin vers le héros (les ennemis contournent les murs)
// ---------------------------------------------------------------
let flow = null, flowT = 0;
function updateFlow(dt) {
  flowT -= dt; if (flowT > 0 && flow) return; flowT = 0.3;
  const L = G.L, W = L.W, N = W * L.H;
  if (!flow || flow.length !== N) flow = new Float32Array(N);
  flow.fill(1e9);
  const start = Math.floor(P.z) * W + Math.floor(P.x);
  const q = new Int32Array(N); let h = 0, t = 0; q[t++] = start; flow[start] = 0;
  while (h < t) {
    const k = q[h++], d = flow[k]; if (d > 40) continue;
    const x = k % W, z = (k / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (z + dz) * W + x + dx;
      if (L.grid[n] && !L.solid[n] && flow[n] > d + 1 && Math.abs(L.height[n] - L.height[k]) < 0.7) { flow[n] = d + 1; q[t++] = n; }
    }
  }
}
function flowDir(e) {
  const L = G.L, W = L.W, x = Math.floor(e.x), z = Math.floor(e.z), k = z * W + x;
  let best = flow[k], bx = 0, bz = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const n = (z + dz) * W + x + dx;
    if (flow[n] < best && (dx === 0 || dz === 0 || (L.grid[z * W + x + dx] && L.grid[(z + dz) * W + x]))) { best = flow[n]; bx = dx; bz = dz; }
  }
  if (!bx && !bz) return [P.x - e.x, P.z - e.z];
  return [x + bx + 0.5 - e.x, z + bz + 0.5 - e.z];
}

// ---------------------------------------------------------------
// MISE À JOUR DU HÉROS
// ---------------------------------------------------------------
// Les 3 coups viennent d'un seul enchaînement animé d'un bloc (Sword_Regular_Combo) : chaque coup
// est un morceau de cette animation, donc le passage d'un coup au suivant est naturel.
// s / e = début / fin du morceau, hit = instant où la lame frappe (en secondes dans l'animation)
const COMBO = 'Sword_Regular_Combo', COMBO_DUR = 3.0;
const ATK = [
  { clip: COMBO, s: 0.0, e: 0.42, hit: 0.235, mult: 1, range: 2.5, arc: 1.3, lunge: 0.4 },
  { clip: COMBO, s: 0.42, e: 0.98, hit: 0.715, mult: 1.1, range: 2.5, arc: 1.3, lunge: 0.45 },
  { clip: COMBO, s: 0.98, e: 1.95, hit: 1.545, mult: 1.9, range: 2.9, arc: 1.7, lunge: 0.7, heavy: true },
];
const ATK_SPEED = 1.15;
const rank = (k) => G.save.skills[k] || 1;
// nombre de charges et temps de recharge de chaque compétence
function maxStk(k) {
  const S = G.save, lg = P.st ? P.st.legend : new Set();
  if (k === 'skill1') return hasTalent(S, 'doublecharge') ? 2 : 1;
  if (k === 'skill3') return lg.has('titangrip') ? 2 : 1;
  return 1;
}
function fullCd(btn, skill) {
  const S = G.save, r = rank(skill);
  switch (skill) {
    case 'charge': return Math.max(5, 8 - r * 0.4);
    case 'leap': return Math.max(5, 12 - r * 0.5 - (hasTalent(S, 'brutalland') ? 3 : 0));
    case 'avatar': return 60 - r * 3;
    case 'parry': return Math.max(2.5, 6 - r * 0.3 - (S.spec === 'prot' ? 2 : 0));
    default: return WSK[skill].cd;
  }
}
const ready = (btn) => (btn in P.stk ? P.stk[btn] > 0 : P.cd[btn] <= 0);
function useCd(btn, skill) {
  if (btn in P.stk) { P.stk[btn]--; if (P.cd[btn] <= 0) P.cd[btn] = fullCd(btn, skill); }
  else P.cd[btn] = fullCd(btn, skill);
}
function rechargeStacks() {
  for (const k in P.stk) {
    const m = maxStk(k), sk = k === 'skill1' ? 'charge' : 'leap';
    if (P.stk[k] > m) P.stk[k] = m;
    if (P.stk[k] < m && P.cd[k] <= 0) { P.stk[k]++; if (P.stk[k] < m) P.cd[k] = fullCd(k, sk); }
  }
}
let noRageT = 0;
function needRage(cost) {
  if (P.rage >= cost) return true;
  if (noRageT <= 0) { UI.lootMsg('Pas assez de rage', '#ff7a5a'); SFX.ui(); noRageT = 1.2; }
  return false;
}
// direction choisie : visée au doigt (glisser depuis le bouton), sinon la cible, sinon devant soi
function aimOf(btn, range, auto) {
  const a = input.aimed[btn]; delete input.aimed[btn];
  if (a) return { ang: Math.atan2(-a.x, a.y), dist: Math.max(1.5, range * a.len), aimed: true }; // écran : droite = −x, haut = +z
  if (auto) return { ang: Math.atan2(auto.x - P.x, auto.z - P.z), dist: Math.min(range, Math.hypot(auto.x - P.x, auto.z - P.z)), tgt: auto };
  return { ang: P.face, dist: range * 0.6 };
}
// lance une attaque (coup du combo ou compétence de mêlée) : M = { clip, s, e, hit, speed, … , onHit }
function startMove(M, chained = false) {
  P.state = 'attack'; P.move = M; P.queued = false; P.hitDone = false; P.lunged = 0; P.swung = false;
  P.atkSp = (M.speed || ATK_SPEED) * P.st.atkSpeed * (P.lust > 0 ? 1.25 : 1);
  const dur = P.ch.anim.act(M.clip).getClip().duration;
  if (!chained) { P.ch.anim.play(M.clip, { speed: P.atkSp, upper: P.moving && !M.full, from: M.s / dur, fade: 0.1, hold: true }); P.clipT = M.s; }
  else if (P.ch.anim.one) P.ch.anim.one.timeScale = P.atkSp; // l'animation continue toute seule
}
function startAttack(step) {
  const chained = P.state === 'attack' && P.move && P.move.step === step - 1 && P.ch.anim.oneName === COMBO;
  P.combo = step;
  startMove({ ...ATK[step], step }, chained);
  const t = G.target && !G.target.dead ? G.target : pickTarget(4.5);
  if (t) { G.target = t; P.wantFace = Math.atan2(t.x - P.x, t.z - P.z); }
}
function doHit(A) {
  const fa = P.face;
  let any = false;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
    if (d > A.range + e.rad) continue;
    if (d > 0.8 && angDiff(Math.atan2(dx, dz), fa) > A.arc / 2 + 0.25) continue;
    if (Math.abs(e.y - P.y) > 1.6) continue;
    if (A.onEach) A.onEach(e); else hitEnemy(e, P.st.dmg * (A.mult || 1), { heavy: A.heavy, kb: A.heavy ? 1.2 : 0.4 });
    any = true;
  }
  return any;
}
// dégâts qui durent (saignement, brûlure) : on les applique par petits tics
function updateDots(dt) {
  for (const e of G.enemies) {
    if (e.dead || !e.dots.length) continue;
    e.dotT = (e.dotT || 0) - dt;
    if (e.dotT > 0) { for (const d of e.dots) d.t -= dt; continue; }
    e.dotT = 0.5;
    let tot = 0, col = null, fx = null;
    for (const d of e.dots) { tot += d.dps * 0.5; d.t -= dt; col = d.col; fx = d.fx; }
    e.dots = e.dots.filter((d) => d.t > 0);
    if (tot >= 1) { hitEnemy(e, tot, { src: 'dot', kb: 0, color: col }); burst(e.x, e.y + 1, e.z, 4, fx, { speed: 1.5, size: 0.18, life: 0.4, grav: fx === 0x7a0a0a ? 10 : -2 }); }
  }
}
// zones au sol (feu) : celles du héros brûlent les ennemis, celles des ennemis brûlent le héros
function addHazard(x, z, r, dps, dur, owner, col = 0xff6a1a) {
  const y = groundAt(G.L, x, z);
  G.hazards.push({ x, z, r, dps, t: dur, owner, tick: 0, f: FX.firePatch(x, y, z, r, dur, col) });
}
function updateHazards(dt) {
  for (let i = G.hazards.length - 1; i >= 0; i--) {
    const h = G.hazards[i]; h.t -= dt; h.tick -= dt;
    if (R() < dt * 10) burst(h.x + (R() - 0.5) * h.r, groundAt(G.L, h.x, h.z) + 0.1, h.z + (R() - 0.5) * h.r, 1, h.owner === 'player' ? 0xff8a3a : 0xff4a1a, { speed: 0.6, size: 0.3, life: 0.6, grav: -3 });
    if (h.tick <= 0) {
      h.tick = 0.5;
      if (h.owner === 'player') { for (const e of G.enemies) if (!e.dead && Math.hypot(e.x - h.x, e.z - h.z) < h.r + e.rad) hitEnemy(e, h.dps * 0.5, { src: 'dot', kb: 0, color: '#ff9a4a' }); }
      else if (Math.hypot(P.x - h.x, P.z - h.z) < h.r && P.state !== 'leap') hurtPlayer(h.dps * 0.5, null, false, 'aoe');
    }
    if (h.t <= 0) G.hazards.splice(i, 1);
  }
}

// ---------------- compétences ----------------
function castCharge() {
  const S = G.save, r = rank('charge');
  const a = aimOf('skill1', WSK.charge.range, pickTarget(13));
  let tgt = a.tgt || null;
  if (a.aimed) { // la cible la plus proche dans la direction visée
    let bs = 1e9;
    for (const e of G.enemies) {
      if (e.dead) continue; const d = Math.hypot(e.x - P.x, e.z - P.z);
      if (d > a.dist + 1.5 || angDiff(Math.atan2(e.x - P.x, e.z - P.z), a.ang) > 0.38) continue;
      if (d < bs && lineFree(G.L, P.x, P.z, e.x, e.z)) { bs = d; tgt = e; }
    }
  }
  useCd('skill1', 'charge');
  P.state = 'charge'; P.chargeT = tgt; P.t = 0.85; P.inv = 0.4; P.trailX = P.x; P.trailZ = P.z;
  P.face = P.wantFace = tgt ? Math.atan2(tgt.x - P.x, tgt.z - P.z) : a.ang;
  P.chargeGoal = tgt ? null : { x: P.x + Math.sin(a.ang) * a.dist, z: P.z + Math.cos(a.ang) * a.dist };
  if (tgt) G.target = tgt;
  P.ch.anim.loop('Sprint_Loop', 1.6, 0.08); P.ch.anim.stopOne(0.05); SFX.charge();
  void r;
}
function chargeImpact(t) {
  const S = G.save, r = rank('charge'), st = P.st;
  if (t && !t.dead) hitEnemy(t, st.dmg * (1.3 + r * 0.15), { heavy: true, kb: 1.4, stun: 1 + r * 0.2, src: 'skill' });
  P.rage = Math.min(100, P.rage + 20 * st.rageGen);
  FX.shockwave(P.x, P.y, P.z, 2.4, 0xffd0a0, 0.35);
  burst(P.x, P.y + 0.2, P.z, 18, 0xa89878, { speed: 4, size: 0.4, life: 0.5, grav: 6, up: 0.4 });
  if (hasTalent(S, 'shockcharge')) { stunWave(3.2, 1, 0xffd060); for (const e of G.enemies) if (!e.dead && e !== t && Math.hypot(e.x - P.x, e.z - P.z) < 3.4) hitEnemy(e, st.dmg * 0.5, { kb: 0.8, src: 'skill' }); }
  P.state = 'attack'; P.move = null; P.hitDone = true; P.queued = false;
  P.t = P.ch.anim.play('Sword_Attack', { speed: 2.2, from: 0.3 }) * 0.6; trailOn = 0.25;
  G.shake = 0.22;
}
function castMain(S) {
  const st = P.st, cost = (k) => Math.max(0, WSK[k].rage - st.costRed);
  // EXÉCUTION : remplace la compétence principale quand la cible est presque morte
  if (P.execReady) {
    if (!needRage(cost('execute'))) return;
    const t = G.target; P.cd.skill2 = WSK.execute.cd;
    const extra = Math.min(30, P.rage - cost('execute')); P.rage -= cost('execute') + extra;
    P.wantFace = P.face = Math.atan2(t.x - P.x, t.z - P.z);
    const r = rank('execute');
    startMove({ clip: 'Sword_Attack', s: 0.18, e: 0.95, hit: 0.48, speed: 1.6, full: true, range: 3, arc: 1.2, lunge: 0.5, heavy: true,
      onEach: () => {}, // les dégâts sont faits dans onHit, sur la cible seule
      onHit: () => {
        const killed = t && !t.dead && Math.hypot(t.x - P.x, t.z - P.z) < 3.4 + t.rad ? hitEnemy(t, st.dmg * (3 + r * 0.4) * (1 + extra / 30), { heavy: true, kb: 1.5, src: 'skill' }) : false;
        FX.shockwave(t.x, t.y, t.z, 2.6, 0xff2a1a, 0.4); FX.flash(t.x, t.y, t.z, 0xff2a1a, 45, 0.4);
        burst(t.x, t.y + 1.1, t.z, 40, 0x8a0a0a, { speed: 6, size: 0.22, life: 0.7, grav: 12 });
        SFX.execute(); G.hitstop = 0.16; G.shake = 0.35;
        if (killed && st.legend.has('scourge')) { P.stk.skill1 = maxStk('skill1'); P.stk.skill3 = maxStk('skill3'); P.cd.skill1 = P.cd.skill3 = 0; UI.lootMsg('Porte-Fléau : Charge et Bond rechargés', '#ff8000'); }
      } });
    return;
  }
  const k = mainSkill(S), r = rank(k);
  if (!needRage(cost(k))) return;
  if (k === 'whirl') {
    P.rage -= cost(k); P.cd.skill2 = WSK.whirl.cd;
    P.state = 'whirl'; P.t = 1.1; P.whirlTick = 0; P.whirlN = 0;
    P.ch.anim.play('Sword_Regular_C', { speed: 1.4, upper: false, from: 0.25, hold: true }); SFX.whirl(); trailOn = 1.1;
    return;
  }
  const a = aimOf('skill2', WSK[k].range, G.target && !G.target.dead && Math.hypot(G.target.x - P.x, G.target.z - P.z) < 6 ? G.target : pickTarget(5));
  P.rage -= cost(k); P.cd.skill2 = WSK[k].cd;
  P.wantFace = P.face = a.ang; P.lockFace = 0.6;
  if (k === 'mortal') {
    // FRAPPE MORTELLE : le 3e coup du combo, accéléré, énorme et qui fait saigner
    startMove({ clip: COMBO, s: 0.98, e: 1.85, hit: 1.545, speed: 1.7, range: 3.3, arc: 1.5, lunge: 0.6, heavy: true,
      onEach: (e) => { hitEnemy(e, st.dmg * (2.2 + r * 0.25), { heavy: true, kb: 1.2, src: 'skill' }); e.dots.push({ dps: st.dmg * (0.4 + r * 0.1) / 4, t: 4, col: '#ff4a4a', fx: 0x7a0a0a }); },
      onHit: () => { const fx = P.x + Math.sin(P.face) * 1.6, fz = P.z + Math.cos(P.face) * 1.6; FX.shockwave(fx, P.y, fz, 2.2, 0xff5a3a, 0.35); FX.flash(fx, P.y, fz, 0xff6a3a, 30, 0.3); SFX.heavyHit(); } });
  } else {
    // COUP DE BOUCLIER : rapide, étourdit, plus fort avec beaucoup d'armure
    startMove({ clip: 'Shield_OneShot', s: 0, e: 0.5, hit: 0.1, speed: 1.1, range: 2.8, arc: 1.4, lunge: 0.5, heavy: true, full: false,
      onEach: (e) => hitEnemy(e, st.dmg * (1.5 + r * 0.2) + st.armor * 0.3, { heavy: true, kb: 1.6, stun: 1.2 + r * 0.15, src: 'skill' }),
      onHit: () => { const fx = P.x + Math.sin(P.face) * 1.2, fz = P.z + Math.cos(P.face) * 1.2; FX.shockwave(fx, P.y, fz, 2, 0x8ac8ff, 0.3); FX.flash(fx, P.y, fz, 0x8ac8ff, 30, 0.25); burst(fx, P.y + 1.2, fz, 22, 0xd0e8ff, { speed: 5, size: 0.2, life: 0.3 }); SFX.block(); SFX.heavyHit(); } });
  }
}
function castLeap() {
  const r = rank('leap');
  const a = aimOf('skill3', WSK.leap.range, G.target && !G.target.dead && Math.hypot(G.target.x - P.x, G.target.z - P.z) < 10 ? G.target : null);
  // point d'atterrissage : on recule le long de la ligne jusqu'à trouver du sol praticable
  let d = a.aimed || a.tgt ? a.dist : 6, gx = P.x, gz = P.z;
  for (; d > 0.5; d -= 0.4) { const x = P.x + Math.sin(a.ang) * d, z = P.z + Math.cos(a.ang) * d; if (walkable(G.L, x, z) && walkable(G.L, x + 0.4, z) && walkable(G.L, x - 0.4, z) && walkable(G.L, x, z + 0.4) && walkable(G.L, x, z - 0.4)) { gx = x; gz = z; break; } }
  useCd('skill3', 'leap');
  P.state = 'leap'; P.leap = { x0: P.x, z0: P.z, y0: P.y, x1: gx, z1: gz, t: 0, dur: 0.55 + d * 0.025 }; P.inv = P.leap.dur + 0.1;
  P.face = P.wantFace = a.ang;
  P.ch.anim.play('Jump_Start', { speed: 2.2, fade: 0.05, hold: true }); SFX.leap();
  burst(P.x, P.y + 0.2, P.z, 14, 0xa89878, { speed: 3, size: 0.4, life: 0.5, grav: 5, up: 0.4 });
  void r;
}
function leapLand() {
  const S = G.save, r = rank('leap'), st = P.st;
  const mult = (1.2 + r * 0.2) * (hasTalent(S, 'brutalland') ? 1.6 : 1);
  for (const e of G.enemies) if (!e.dead && Math.hypot(e.x - P.x, e.z - P.z) < 3.6 + e.rad) hitEnemy(e, st.dmg * mult, { heavy: true, kb: 1.6, stun: hasTalent(S, 'shockwave') ? 1.5 : 0, src: 'skill' });
  FX.shockwave(P.x, P.y, P.z, 4.2, 0xffb060, 0.55); FX.flash(P.x, P.y, P.z, 0xffa050, 50, 0.45);
  burst(P.x, P.y + 0.2, P.z, 46, 0x9a8a70, { speed: 7, size: 0.5, life: 0.7, grav: 8, up: 0.5 });
  burst(P.x, P.y + 0.3, P.z, 20, 0xffb060, { speed: 5, size: 0.25, life: 0.5, grav: 4 });
  SFX.slam(); G.shake = 0.45; G.hitstop = 0.08;
  if (hasTalent(S, 'swiftleap')) { P.swift = 3; P.cd.roll = 0; }
  P.state = 'land'; P.t = 0.32; P.ch.anim.play('Jump_Land', { speed: 2.6, fade: 0.06 });
}
function castParry() {
  const r = rank('parry');
  useCd('parry', 'parry');
  P.state = 'parry'; P.t = (0.55 + r * 0.05) * (hasTalent(G.save, 'bladewall') ? 2 : 1);
  P.ch.anim.play('Sword_Block', { speed: 2.2, fade: 0.05, hold: true }); SFX.swing(1.4);
  burst(P.x + Math.sin(P.face) * 0.6, P.y + 1.3, P.z + Math.cos(P.face) * 0.6, 8, 0x9ad0ff, { speed: 1.5, size: 0.2, life: 0.3, grav: 0 });
}
function castAvatar() {
  const r = rank('avatar');
  useCd('ult', 'avatar');
  P.avatar = 12 + r * 2 + (hasTalent(G.save, 'longavatar') ? 10 : 0); P.avatarHits = 0;
  P.state = 'shout'; P.t = 0.7; P.inv = 0.7;
  P.ch.anim.play('Idle_Shield_Break', { speed: 1.3 }); SFX.avatar();
  FX.shockwave(P.x, P.y, P.z, 6, 0xff9a3a, 0.7); FX.flash(P.x, P.y, P.z, 0xff9a3a, 60, 0.8);
  burst(P.x, P.y + 1, P.z, 70, 0xffa040, { speed: 6, size: 0.3, life: 0.9, grav: -1 });
  G.shake = 0.35; UI.banner('Avatar', 'Tu deviens un colosse');
  stunWave(4, 1, 0xff9a3a);
}

function updatePlayer(dt) {
  const L = G.L, st = P.st, S = G.save;
  P.inv = Math.max(0, P.inv - dt); P.hurtT = Math.max(0, P.hurtT - dt);
  for (const k in P.cd) P.cd[k] = Math.max(0, P.cd[k] - dt);
  rechargeStacks();
  P.lust = Math.max(0, P.lust - dt); P.swift = Math.max(0, P.swift - dt); P.swCd = Math.max(0, P.swCd - dt); noRageT -= dt;
  P.lockFace = Math.max(0, (P.lockFace || 0) - dt);
  if (P.avatar > 0) {
    P.avatar -= dt; P.rage = Math.min(100, P.rage + 5 * dt);
    if (R() < dt * 14) burst(P.x + (R() - 0.5), P.y + R() * 2.4, P.z + (R() - 0.5), 1, 0xffa040, { speed: 0.6, size: 0.25, life: 0.7, grav: -3 });
    if (P.avatar <= 0) UI.lootMsg("L'Avatar s'estompe", '#ffa040');
  }
  // l'Avatar fait grandir le héros en douceur
  P.avatarS = damp(P.avatarS, P.avatar > 0 ? 1.3 : 1, 6, dt); P.ch.group.scale.setScalar(P.avatarS);
  if (!G.inCombat) P.rage = Math.max(0, P.rage - dt * 3);
  if (P.state === 'dead') { P.ch.update(dt); return; }
  // Exécution disponible ? (cible proche presque morte)
  const thr = hasTalent(S, 'executioner') ? 0.35 : 0.2, tg = G.target;
  P.execReady = S.level >= WSK.execute.lvl && tg && !tg.dead && tg.hp / tg.maxHp < thr && Math.hypot(tg.x - P.x, tg.z - P.z) < 5;

  // direction voulue (joystick relatif à la caméra)
  const [fx, fz] = camFwd();
  const rx = -fz, rz = fx;
  const mx = input.mx, my = input.my;
  const ml = Math.min(1, Math.hypot(mx, my));
  const dirX = fx * my + rx * mx, dirZ = fz * my + rz * mx; // droite du joystick = droite de l'écran
  const dl = Math.hypot(dirX, dirZ) || 1;
  P.moving = ml > 0.15 && ['free', 'attack', 'whirl', 'shout'].includes(P.state);
  const canAct = ['free', 'attack'].includes(P.state);

  // actions
  if (consume('roll') && P.cd.roll <= 0 && ['free', 'attack', 'shout', 'hit', 'land', 'riposte'].includes(P.state)) {
    P.state = 'roll'; P.t = 0.55; P.inv = 0.5; P.cd.roll = 0.75;
    P.rollX = ml > 0.15 ? dirX / dl : Math.sin(P.face); P.rollZ = ml > 0.15 ? dirZ / dl : Math.cos(P.face);
    P.face = Math.atan2(P.rollX, P.rollZ);
    P.ch.anim.play('Roll', { speed: 3.2, fade: 0.08 }); SFX.roll(); trailOn = 0; P.swung = false;
    burst(P.x, P.y + 0.2, P.z, 10, 0xa898c0, { speed: 2, size: 0.4, life: 0.5, grav: 1 });
    if (st.legend.has('wanderer')) { P.fireRoll = 3; }
  }
  if (consume('potion') && P.cd.potion <= 0 && S.potions > 0 && P.hp < st.maxHp && P.state !== 'roll') {
    S.potions--; P.cd.potion = 1.2; P.healT = 0.6; P.healAmt = st.maxHp * 0.45 / 0.6;
    P.ch.anim.play('Consume', { upper: true, speed: 1.6 }); SFX.potion();
    burst(P.x, P.y + 1, P.z, 30, 0xff6a8a, { speed: 2, size: 0.3, life: 1, grav: -2 });
  }
  if (P.healT > 0) { P.healT -= dt; P.hp = Math.min(st.maxHp, P.hp + P.healAmt * dt); }
  if (consume('skill1') && canAct) { if (ready('skill1')) castCharge(); }
  if (consume('skill2') && canAct) { if (P.cd.skill2 <= 0) castMain(S); }
  if (consume('skill3') && canAct) { if (S.level >= WSK.leap.lvl && ready('skill3')) castLeap(); }
  if (consume('parry') && ['free', 'attack', 'hit'].includes(P.state)) { if (S.level >= WSK.parry.lvl && P.cd.parry <= 0) castParry(); }
  if (consume('ult') && canAct) { if (S.level >= WSK.avatar.lvl && P.cd.ult <= 0) castAvatar(); }
  const atkHeld = input.held.attack;
  if ((consume('attack') || atkHeld) && P.state === 'free') startAttack(0);
  else if (P.state === 'attack' && P.move && P.move.step !== undefined && (input.pressed.has('attack') || atkHeld) && P.clipT > P.move.s + 0.08) { input.pressed.delete('attack'); P.queued = true; }

  // états
  let speed = 0;
  P.t -= dt;
  const runSpeed = 5.6 * (P.swift > 0 ? 1.4 : 1);
  switch (P.state) {
    case 'free':
      speed = ml > 0.15 ? (ml > 0.6 ? runSpeed : 2.4) : 0;
      if (ml > 0.15) P.wantFace = Math.atan2(dirX, dirZ);
      break;
    case 'attack': {
      const A = P.move;
      if (A) {
        P.clipT += dt * P.atkSp;
        speed = P.moving && !A.full ? 1.6 : 0;
        if (P.lockFace <= 0) {
          if (P.moving && !(G.target && !G.target.dead)) P.wantFace = Math.atan2(dirX, dirZ);
          if (G.target && !G.target.dead && Math.hypot(G.target.x - P.x, G.target.z - P.z) < 6) P.wantFace = Math.atan2(G.target.x - P.x, G.target.z - P.z);
        }
        // son du coup juste avant l'impact, traînée de lame seulement pendant la frappe
        if (!P.swung && P.clipT >= A.hit - 0.1) { P.swung = true; SFX.swing(A.heavy ? 0.7 : 1); }
        if (P.clipT >= A.hit - 0.12 && P.clipT <= A.hit + 0.08) trailOn = 0.05;
        // élan vers l'avant réparti autour de la frappe (plus de « téléportation »)
        const lw = A.heavy ? 0.22 : 0.16;
        if (P.clipT > A.hit - lw && P.lunged < A.lunge) {
          const stp = Math.min(A.lunge - P.lunged, (A.lunge / lw) * dt * P.atkSp);
          const near = G.target && !G.target.dead && Math.hypot(G.target.x - P.x, G.target.z - P.z) < 1.1 + G.target.rad;
          if (!near) moveCircle(L, P, Math.sin(P.face) * stp, Math.cos(P.face) * stp, 0.38);
          P.lunged += stp;
        }
        if (!P.hitDone && P.clipT >= A.hit) {
          P.hitDone = true; doHit(A); A.onHit && A.onHit();
          if (A.step === 2) {
            // légendaire Brise-Faille : le 3e coup libère une onde de choc
            if (st.legend.has('riftbreaker')) { FX.shockwave(P.x, P.y, P.z, 4, 0xb070ff, 0.45); for (const e of G.enemies) if (!e.dead && Math.hypot(e.x - P.x, e.z - P.z) < 4 + e.rad) hitEnemy(e, st.dmg * 0.8, { kb: 1, src: 'skill' }); }
          }
          // talent Tempête de lames : pendant l'Avatar, chaque 3e coup déclenche un tourbillon gratuit
          if (P.avatar > 0 && hasTalent(S, 'bladestorm') && A.step !== undefined && ++P.avatarHits % 3 === 0) { P.freeWhirl = true; }
        }
        if (P.clipT >= A.e) {
          P.swung = false;
          if (P.freeWhirl) { P.freeWhirl = false; P.state = 'whirl'; P.t = 1.1; P.whirlTick = 0; P.whirlN = 0; P.ch.anim.play('Sword_Regular_C', { speed: 1.4, from: 0.25, hold: true }); SFX.whirl(); trailOn = 1.1; break; }
          if (P.queued && A.step !== undefined && A.step < 2) startAttack(A.step + 1);
          else { P.state = 'free'; P.move = null; P.ch.anim.stopOne(A.step === 2 || A.heavy ? 0.35 : 0.25); }
        }
      } else if (P.t <= 0) { P.state = 'free'; P.ch.anim.stopOne(0.2); }
      break;
    }
    case 'roll': {
      const k = 7.5 * (0.5 + P.t / 0.55);
      moveCircle(L, P, P.rollX * k * dt, P.rollZ * k * dt, 0.38);
      P.wantFace = P.face;
      if (P.fireRoll > 0 && R() < dt * 12) { addHazard(P.x, P.z, 1, st.dmg * 0.6, 3, 'player'); P.fireRoll--; }
      if (P.t <= 0) { P.state = 'free'; P.fireRoll = 0; }
      break;
    }
    case 'charge': {
      const t = P.chargeT;
      const goal = t && !t.dead ? t : P.chargeGoal || { x: P.x + Math.sin(P.face) * 2, z: P.z + Math.cos(P.face) * 2 };
      const dx = goal.x - P.x, dz = goal.z - P.z, d = Math.hypot(dx, dz);
      if (d > 0.05) { P.face = Math.atan2(dx, dz); P.wantFace = P.face; }
      const step = 17 * dt;
      const reach = t && !t.dead ? 1.4 + t.rad : 0.3;
      if (d > reach && P.t > 0) {
        const ok = moveCircle(L, P, dx / d * Math.min(step, d - reach), dz / d * Math.min(step, d - reach), 0.38);
        if (R() < 0.6) burst(P.x, P.y + 0.3, P.z, 2, 0xd8c8ff, { speed: 1, size: 0.5, life: 0.4, grav: 0 });
        // talent Charge enflammée : une traînée de feu
        if (hasTalent(S, 'firecharge') && Math.hypot(P.x - P.trailX, P.z - P.trailZ) > 1.1) { addHazard(P.x, P.z, 1, st.dmg * 0.7, 4, 'player'); P.trailX = P.x; P.trailZ = P.z; }
        if (!ok) P.t = 0;
      } else chargeImpact(t && !t.dead && d <= reach + 0.6 ? t : null);
      break;
    }
    case 'whirl': {
      speed = P.moving ? 3 : 0;
      P.spin = (P.spin || 0) + dt * 16;
      P.whirlTick -= dt;
      if (P.whirlTick <= 0 && P.whirlN < 4) {
        P.whirlTick = 0.26; P.whirlN++;
        for (const e of G.enemies) if (!e.dead && Math.hypot(e.x - P.x, e.z - P.z) < 3.1 + e.rad && Math.abs(e.y - P.y) < 1.6) hitEnemy(e, st.dmg * (0.8 + rank('whirl') * 0.12), { kb: 0.7 });
        FX.shockwave(P.x, P.y, P.z, 3.2, 0xffd0a0, 0.25);
        SFX.swing(0.8);
      }
      if (P.t <= 0) { P.state = 'free'; P.spin = 0; P.ch.anim.stopOne(0.2); }
      break;
    }
    case 'leap': {
      const lp = P.leap; lp.t += dt;
      const k = Math.min(1, lp.t / lp.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      P.x = lp.x0 + (lp.x1 - lp.x0) * e; P.z = lp.z0 + (lp.z1 - lp.z0) * e;
      const gy = groundAt(L, P.x, P.z);
      P.y = Math.max(gy, lp.y0 + (groundAt(L, lp.x1, lp.z1) - lp.y0) * k) + Math.sin(k * Math.PI) * 2.6;
      if (k > 0.35 && P.ch.anim.oneName === 'Jump_Start') P.ch.anim.play('Jump_Loop', { speed: 1, fade: 0.15, hold: true });
      if (k >= 1) { P.y = groundAt(L, P.x, P.z); leapLand(); }
      break;
    }
    case 'land': case 'riposte':
      if (P.t <= 0) { P.state = 'free'; P.ch.anim.stopOne(0.2); }
      break;
    case 'parry':
      P.wantFace = G.target && !G.target.dead ? Math.atan2(G.target.x - P.x, G.target.z - P.z) : P.face;
      if (P.t <= 0) { P.state = 'free'; P.ch.anim.stopOne(0.15); }
      break;
    case 'shout': if (P.t <= 0) P.state = 'free'; break;
    case 'hit':
      if (P.kbx) { moveCircle(L, P, P.kbx * dt, P.kbz * dt, 0.38); P.kbx *= 0.85; P.kbz *= 0.85; }
      if (P.t <= 0) { P.state = 'free'; P.kbx = 0; }
      break;
  }
  if (speed > 0 && ml > 0.15) moveCircle(L, P, dirX / dl * speed * dt, dirZ / dl * speed * dt, 0.38);
  P.speed = speed;
  // orientation douce
  if (P.wantFace !== undefined) P.face += angWrap(P.wantFace - P.face) * Math.min(1, dt * (P.state === 'attack' ? 18 : 12));
  if (P.state !== 'leap') P.y = damp(P.y, groundAt(L, P.x, P.z), 18, dt);

  // animation de base selon la vitesse
  if (P.state === 'free' || P.state === 'attack' || P.state === 'shout') {
    if (speed > 3) P.ch.anim.loop('Jog_Fwd_Loop', speed / 4.6);
    else if (speed > 0.1) P.ch.anim.loop('Walk_Loop', speed / 1.9 + 0.3);
    else P.ch.anim.loop(G.inCombat ? 'Sword_Idle' : 'Idle_Loop');
  } else if (P.state === 'whirl') P.ch.anim.loop(speed > 0.1 ? 'Jog_Fwd_Loop' : 'Sword_Idle');
  if (speed > 3) { P.stepT -= dt * speed; if (P.stepT <= 0) { P.stepT = 2.4; SFX.step(); } }

  P.ch.group.position.set(P.x, P.y, P.z);
  P.ch.group.rotation.y = P.face + (P.state === 'whirl' ? P.spin : 0);
  P.ch.update(dt);
  heroLight.position.set(P.x, P.y + 3.4, P.z);
  heroLight.color.setHex(P.avatar > 0 ? 0xffa868 : 0xffc890);
  { moon.target.position.set(P.x, P.y, P.z); moon.position.set(P.x - 8, P.y + 16, P.z - 5.6); }
  updateAim();

  // portail
  if (L.portal && !G.bossAlive && G.world.portal && G.world.portal.userData.openT > 0.6 && Math.hypot(P.x - L.portal.x, P.z - L.portal.z) < 1.6) nextFloor();
}
// indicateur de visée au sol pendant qu'on glisse le doigt depuis un bouton
const AIM_INFO = { skill1: ['charge', 'dir'], skill3: ['leap', 'point'] };
function updateAim() {
  const a = input.aim;
  if (!a) { FX.hideAim(); return; }
  let skill, type;
  if (a.name === 'skill2') { skill = P.execReady ? null : mainSkill(G.save); type = skill === 'whirl' ? null : 'cone'; }
  else [skill, type] = AIM_INFO[a.name] || [];
  if (!skill || !type) { FX.hideAim(); return; }
  const range = WSK[skill].range;
  const ang = a.len > 0.18 ? Math.atan2(-a.x, a.y) : P.face;
  const dist = type === 'point' ? (a.len > 0.18 ? Math.max(1.5, range * a.len) : 6) : range;
  FX.showAim(type, P.x, P.y, P.z, ang, dist, range, type === 'point' ? 3.6 : 0, a.cancel);
}
let changing = false;
function nextFloor() {
  if (changing) return; changing = true;
  SFX.portal(); UI.fade(true);
  setTimeout(() => { enterFloor(G.save.floor + 1); UI.fade(false); changing = false; }, 700);
}

// ---------------------------------------------------------------
// MISE À JOUR DES ENNEMIS
// ---------------------------------------------------------------
function updateEnemies(dt) {
  const L = G.L;
  let combat = false, boss = false;
  for (const e of G.enemies) {
    // on ne dessine (et n'anime) que les ennemis proches : gros gain sur iPhone
    const ddx = e.x - P.x, ddz = e.z - P.z;
    const vis = Math.abs(ddx) < 22 && ddz > -11 && ddz < 20;
    e.ch.group.visible = vis;
    if (vis || e.aggro) e.ch.update(dt);
    if (e.dead) {
      e.deadT += dt;
      if (e.deadT > 1.2) { e.ch.group.position.y -= dt * 0.9; if (R() < dt * 8 && vis) burst(e.x, e.ch.group.position.y + 0.6, e.z, 1, 0x2a2024, { speed: 0.4, size: 0.5, life: 0.8, grav: -1 }); } // il s'enfonce en fumant
      if (e.deadT > 3.2) { e.ch.dispose(); e.gone = true; }
      continue;
    }
    const T = e.T;
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz);
    // repérage du héros
    if (!e.aggro && d < 13 && Math.abs(P.y - e.y) < 3 && lineFree(L, e.x, e.z, P.x, P.z)) {
      e.aggro = true; SFX.growl(e.type);
      for (const o of G.enemies) if (!o.dead && o.room === e.room) o.aggro = true; // les voisins de salle sont alertés
    }
    if (e.aggro && P.state !== 'dead') { combat = true; if (T.boss) boss = true; }
    e.cd -= dt * (e.elite === 'fast' ? 1.6 : 1); e.calm += dt;
    // élite protégée : le bouclier revient après 8 s sans prendre de coups
    if (e.elite === 'shielded') {
      if (e.bubble) e.bubble.material.opacity = damp(e.bubble.material.opacity, 0.16, 4, dt);
      if (e.shield <= 0 && e.calm > 8) { e.shield = e.shieldMax; e.bubble.visible = true; burst(e.x, e.y + 1, e.z, 20, 0x8ad0ff, { speed: 2, size: 0.2, life: 0.5, grav: -2 }); }
    }
    // élite enflammée : laisse des flaques de feu derrière elle
    if (e.elite === 'fiery' && e.aggro) { e.fireT -= dt; if (e.fireT <= 0 && (e.state === 'chase' || e.state === 'dash')) { e.fireT = 1.4; addHazard(e.x, e.z, 1.2, e.dmg * 0.5, 5, 'enemy', 0xff4a1a); } }
    // BOSS : phases
    if (T.boss && e.aggro) updateBossPhase(e, dt);
    if (e.phaseT > 0) { e.phaseT -= dt; placeEnemy(e, dt); continue; }
    if (e.stun > 0) {
      e.stun -= dt; e.ch.anim.loop(T.idle, 0.4); placeEnemy(e, dt);
      if (e.tele) { e.tele.dead = true; e.tele = null; }
      if (['windup', 'attack', 'dash', 'fuse'].includes(e.state)) e.state = 'chase';
      if (R() < dt * 3) burst(e.x, e.y + T.height * 1.35 + 0.2, e.z, 1, 0xffe58a, { speed: 0.6, size: 0.15, life: 0.5, grav: 0 });
      continue;
    }
    let mvx = 0, mvz = 0, sp = 0;
    switch (e.state) {
      case 'idle':
        e.ch.anim.loop(T.idle);
        if (e.aggro) e.state = 'chase';
        break;
      case 'chase': {
        if (!e.aggro || P.state === 'dead') { e.state = 'idle'; break; }
        const ranged = !!T.ranged;
        const wantRange = T.ranged === 'summon' ? 8 : ranged ? 6.5 : T.range + 0.2;
        const see = d < 18 && lineFree(L, e.x, e.z, P.x, P.z);
        if (d > wantRange || !see) {
          const [ax, az] = see && d < 8 ? [dx, dz] : flowDir(e);
          const al = Math.hypot(ax, az) || 1; mvx = ax / al; mvz = az / al; sp = e.spd;
        } else if (ranged && d < (T.ranged === 'summon' ? 5.5 : 4)) { mvx = -dx / d; mvz = -dz / d; sp = e.spd * 0.85; } // garde ses distances
        e.face += angWrap(Math.atan2(dx, dz) - e.face) * Math.min(1, dt * 8);
        if (sp > 0) e.ch.anim.loop(T.walk, /Jog|Sprint/.test(T.walk) ? sp / 4.2 : sp / 1.6 * (T.height / 1.8));
        else e.ch.anim.loop(T.idle);
        if (Math.abs(P.y - e.y) > 1.8 || e.cd > 0) break;
        // Berserker : charge si le héros est à moyenne distance et en vue
        if (T.dash && d > 3.5 && d < 10 && see) {
          e.state = 'dashWind'; e.t = 0.75; e.dashA = Math.atan2(dx, dz);
          e.tele = telegraph(e.x, e.z, e.y, 10, e.t, 'line', e.dashA);
          e.ch.anim.play('Idle_Shield_Break', { speed: 1.3 }); SFX.growl('berserker');
          break;
        }
        // Possédé : s'allume puis explose
        if (T.explode) {
          if (d < 2.7) {
            e.state = 'fuse'; e.t = T.windup; e.tele = telegraph(e.x, e.z, e.y, T.explode, e.t);
            e.ch.anim.play(T.atk, { speed: 1 }); e.ch.flash(0xff6a1a, T.windup); SFX.fuse();
          }
          break; // le Possédé n'a pas d'autre attaque
        }
        // Nécromancien : invoque des serviteurs (4 au maximum en vie)
        if (T.ranged === 'summon' && see && d < T.range) {
          const alive = G.enemies.filter((o) => o.summoner === e && !o.dead).length;
          if (alive < 4) { e.state = 'windup'; e.t = T.windup; e.wind0 = e.t; e.summon = true; e.ch.anim.play(T.atk, { speed: 0.6 }); burst(e.x, e.y + 1.5, e.z, 16, 0x8a3aff, { speed: 1.5, size: 0.3, life: 0.8, grav: -2 }); break; }
        }
        const inRange = ranged ? d < T.range && see && T.ranged !== 'summon' : d < T.range + e.rad + 0.3;
        if (inRange) {
          const slam = T.slam && (R() < 0.45 || T.boss && R() < 0.6);
          e.state = 'windup'; e.t = T.windup * (slam ? 1.3 : 1) * (e.elite === 'fast' ? 0.7 : 1); e.wind0 = e.t; e.slam = slam; e.summon = false;
          const clip = slam ? 'Sword_Attack' : T.atk;
          e.ch.anim.play(clip, { speed: (T.atkHit * e.ch.anim.act(clip).getClip().duration) / e.t });
          if (T.ranged === 'dagger') e.tele = telegraph(e.x, e.z, e.y, Math.min(d + 2, 12), e.t, 'line', Math.atan2(dx, dz));
          else if (!ranged) e.tele = slam ? telegraph(e.x, e.z, e.y, T.slam, e.t) : telegraph(e.x, e.z, e.y, T.range + 0.9, e.t, 1.6, Math.atan2(dx, dz));
          if (T.boss && R() < 0.3) SFX.growl('boss');
        }
        break;
      }
      case 'windup':
        e.t -= dt;
        if (!e.slam) e.face += angWrap(Math.atan2(dx, dz) - e.face) * Math.min(1, dt * (T.ranged === 'dagger' ? 1.5 : 3));
        if (e.tele && !e.slam) e.tele.g.rotation.y = T.ranged === 'dagger' ? e.face : e.face - Math.PI / 2;
        if (e.t <= 0) {
          e.state = 'attack'; e.t = 0.6; e.cd = T.cd * (0.8 + R() * 0.4);
          if (e.tele) { e.tele.dead = true; e.tele = null; }
          if (e.summon) summon(e);
          else if (T.ranged) shoot(e);
          else if (e.slam) {
            SFX.slam(); G.shake = Math.max(G.shake, 0.25);
            burst(e.x, e.y + 0.2, e.z, 40, 0xb08a6a, { speed: 6, size: 0.45, life: 0.7, grav: 8, up: 0.5 });
            FX.shockwave(e.x, e.y, e.z, T.slam + 0.5, 0xffa070, 0.45);
            if (d < T.slam + 0.3) hurtPlayer(e.dmg * 1.35, e, true, 'melee');
          } else {
            const ang = angDiff(Math.atan2(dx, dz), e.face);
            if (d < T.range + e.rad + 1.1 && ang < 0.95) hurtPlayer(e.dmg, e, T.poise >= 2, 'melee');
            else SFX.swing(0.7);
          }
        }
        break;
      case 'dashWind':
        e.t -= dt;
        if (e.t <= 0) { e.state = 'dash'; e.t = 0.72; e.hitP = false; if (e.tele) { e.tele.dead = true; e.tele = null; } SFX.charge(); }
        break;
      case 'dash': {
        // charge en ligne droite : touche le héros s'il est sur le passage
        e.t -= dt; e.face = e.dashA; e.ch.anim.loop('Sprint_Loop', 1.8, 0.05);
        const ok = moveCircle(L, e, Math.sin(e.dashA) * 14 * dt, Math.cos(e.dashA) * 14 * dt, e.rad);
        if (R() < 0.5) burst(e.x, e.y + 0.3, e.z, 2, 0xa89878, { speed: 1, size: 0.45, life: 0.4, grav: 0 });
        if (!e.hitP && d < 1.3 + e.rad) { e.hitP = true; hurtPlayer(e.dmg * 1.4, e, true, 'melee'); }
        if (e.t <= 0 || !ok) { e.state = 'attack'; e.t = 0.7; e.cd = T.cd + 1.5; e.ch.anim.play('Sword_Attack', { speed: 1.6, from: 0.4 }); if (!ok) { e.stun = 0.9; G.shake = Math.max(G.shake, 0.12); SFX.slam(); } }
        break;
      }
      case 'fuse':
        e.t -= dt;
        if (R() < dt * 25) burst(e.x, e.y + 1.2, e.z, 1, 0xff6a1a, { speed: 2, size: 0.25, life: 0.4, grav: -1 });
        if (e.t <= 0) explode(e);
        break;
      case 'attack': case 'stagger':
        e.t -= dt; if (e.t <= 0) e.state = 'chase';
        break;
    }
    // séparation entre ennemis
    if (e.state !== 'dash') for (const o of G.enemies) {
      if (o === e || o.dead) continue;
      const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), min = e.rad + o.rad + 0.1;
      if (od < min && od > 0.001) { mvx += ox / od * (min - od) * 3; mvz += oz / od * (min - od) * 3; if (!sp) sp = 1; }
    }
    // ne pas traverser le héros
    if (d < e.rad + 0.45 && d > 0.01 && e.state !== 'dash') { mvx -= dx / d; mvz -= dz / d; if (!sp) sp = 1.5; }
    if (sp > 0) moveCircle(L, e, mvx * sp * dt, mvz * sp * dt, e.rad);
    placeEnemy(e, dt);
  }
  G.enemies = G.enemies.filter((e) => !e.gone);
  const mode = boss ? 'boss' : combat ? 'combat' : 'explore';
  if (mode !== G.music) { G.music = mode; setMusic(mode); }
  G.inCombat = combat;
}
// le Possédé explose : gros dégâts autour de lui (s'éloigner ou rouler)
function explode(e) {
  const d = Math.hypot(P.x - e.x, P.z - e.z);
  FX.shockwave(e.x, e.y, e.z, e.T.explode + 0.6, 0xff6a1a, 0.5); FX.flash(e.x, e.y, e.z, 0xff6a1a, 60, 0.5);
  burst(e.x, e.y + 1, e.z, 60, 0xff7a2a, { speed: 7, size: 0.35, life: 0.6, grav: 2 });
  burst(e.x, e.y + 1, e.z, 20, 0x1a1214, { speed: 3, size: 0.8, life: 1, grav: -1 });
  SFX.explode(); G.shake = Math.max(G.shake, 0.35);
  if (d < e.T.explode) hurtPlayer(e.dmg * 2, e, true, 'aoe');
  for (const o of G.enemies) if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.z - e.z) < e.T.explode) { o.hp -= e.dmg; if (o.hp <= 0) killEnemy(o); }
  e.tele && (e.tele.dead = true); e.tele = null;
  e.dead = true; e.deadT = 2; e.hp = 0; e.ch.group.visible = false; e.gone = true; e.ch.dispose();
  if (G.target === e) G.target = null;
  gainXp(Math.round(e.T.xp * (1 + 0.3 * (G.save.floor - 1))));
}
// le Nécromancien fait surgir 2 serviteurs
function summon(e) {
  for (let i = 0; i < 2; i++) {
    const a = e.face + (i ? 0.9 : -0.9), x = e.x + Math.sin(a) * 1.6, z = e.z + Math.cos(a) * 1.6;
    if (!walkable(G.L, x, z)) continue;
    const m = spawnEnemy('minion', x, z, e.room); m.aggro = true; m.summoner = e; m.state = 'chase';
    burst(x, groundAt(G.L, x, z) + 0.3, z, 24, 0x8a3aff, { speed: 3, size: 0.3, life: 0.7, grav: -2 });
    FX.shockwave(x, m.y, z, 1.6, 0x8a3aff, 0.4);
  }
  SFX.summon();
}
// BOSS : 3 phases. À 66 % : il rugit, appelle des renforts et s'énerve. À 33 % : nova de faille et feu.
function updateBossPhase(e, dt) {
  const f = e.hp / e.maxHp;
  if (e.phase === 1 && f < 0.66) {
    e.phase = 2; e.phaseT = 1.3; e.spd *= 1.25; e.stun = 0;
    e.ch.anim.play('Idle_Shield_Break', { speed: 0.9 }); SFX.roar();
    UI.banner('Le Seigneur entre en rage', 'Des serviteurs surgissent de la faille');
    FX.shockwave(e.x, e.y, e.z, 7, 0xb070ff, 0.8); FX.flash(e.x, e.y, e.z, 0xb070ff, 50, 0.8); G.shake = 0.4;
    for (let i = 0; i < 3; i++) { const a = i * 2.1, x = e.x + Math.sin(a) * 3, z = e.z + Math.cos(a) * 3; if (walkable(G.L, x, z)) { const m = spawnEnemy(i === 2 ? 'skeleton' : 'minion', x, z, e.room); m.aggro = true; m.state = 'chase'; burst(x, m.y + 0.3, z, 20, 0x8a3aff, { speed: 3, size: 0.3, life: 0.7, grav: -2 }); } }
  }
  if (e.phase === 2 && f < 0.33) {
    e.phase = 3; e.phaseT = 1.3; e.novaT = 2;
    e.ch.anim.play('Idle_Shield_Break', { speed: 0.9 }); SFX.roar();
    UI.banner('Fureur de la faille', 'Roule ou pare pour éviter la nova !');
    FX.shockwave(e.x, e.y, e.z, 8, 0xff3a6a, 0.8); G.shake = 0.45;
  }
  if (e.phase === 3 && e.phaseT <= 0) {
    e.novaT -= dt;
    if (e.novaT <= 0 && !e.nova) {
      // NOVA : un grand cercle se remplit autour du boss, puis une onde le traverse
      e.nova = { t: 1.3 }; e.tele = telegraph(e.x, e.z, e.y, 7.5, 1.3); e.state = 'attack'; e.t = 1.6;
      e.ch.anim.play('Spell_Simple_Shoot', { speed: 0.5 }); SFX.charge();
      // et le sol s'enflamme sous les pieds du héros
      for (let i = 0; i < 3; i++) { const x = P.x + (R() - 0.5) * 4, z = P.z + (R() - 0.5) * 4; if (walkable(G.L, x, z)) { const tt = telegraph(x, z, groundAt(G.L, x, z), 1.4, 1); setTimeout(() => { if (G.L && !tt.dead) addHazard(x, z, 1.4, e.dmg * 0.6, 5, 'enemy', 0xb050ff); }, 1000); } }
    }
    if (e.nova) {
      e.nova.t -= dt;
      if (e.nova.t <= 0) {
        e.nova = null; e.novaT = 7 + R() * 2; e.tele = null;
        FX.shockwave(e.x, e.y, e.z, 8, 0xff3a6a, 0.6); FX.flash(e.x, e.y, e.z, 0xff3a6a, 60, 0.6); SFX.explode(); G.shake = 0.4;
        burst(e.x, e.y + 0.5, e.z, 60, 0xff3a6a, { speed: 9, size: 0.3, life: 0.6, grav: 1, up: 0.2 });
        if (Math.hypot(P.x - e.x, P.z - e.z) < 7.5) hurtPlayer(e.dmg * 1.6, e, true, P.state === 'parry' ? 'melee' : 'aoe');
      }
    }
  }
}
function placeEnemy(e, dt) {
  e.y = damp(e.y, groundAt(G.L, e.x, e.z), 14, dt);
  e.ch.group.position.set(e.x, e.y, e.z);
  e.ch.group.rotation.y = e.face;
}
// projectiles : boule d'énergie (cultiste) ou dague qui tournoie (lanceur de couteaux)
const projMat = new THREE.MeshBasicMaterial({ color: 0xd8a0ff });
function shoot(e) {
  const dagger = e.T.ranged === 'dagger';
  SFX.swing(dagger ? 2 : 1.6);
  let obj;
  if (dagger) { obj = new THREE.Group(); const k = piece('gear', 'W_Dagger_Bronze'); if (k) { const m = k.clone(true); m.rotation.x = Math.PI / 2; obj.add(m); } }
  else {
    obj = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), projMat);
    obj.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0x8a3aff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })));
  }
  const y = e.y + 1.4; obj.position.set(e.x, y, e.z); scene3.add(obj);
  // la dague part tout droit dans la direction du signal ; la boule vise le héros
  const sp = dagger ? 15 : 9;
  const ang = dagger ? e.face : Math.atan2(P.x - e.x, P.z - e.z);
  const dy = (P.y + 1.1 - y) / Math.max(1, Math.hypot(P.x - e.x, P.z - e.z));
  G.projs.push({ obj, x: e.x, y, z: e.z, vx: Math.sin(ang) * sp, vz: Math.cos(ang) * sp, vy: dy * sp, t: 3, dmg: e.dmg, from: e, dagger });
}
function updateProjs(dt) {
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i];
    p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; p.t -= dt;
    p.obj.position.set(p.x, p.y, p.z);
    if (p.dagger) { p.obj.rotation.y = Math.atan2(p.vx, p.vz); p.obj.rotation.x += dt * 25; }
    else if (R() < 0.5) burst(p.x, p.y, p.z, 1, 0xb070ff, { speed: 0.5, size: 0.3, life: 0.3, grav: 0 });
    let done = p.t <= 0 || !walkable(G.L, p.x, p.z);
    if (!done && Math.hypot(p.x - P.x, p.z - P.z) < 0.6 && Math.abs(p.y - (P.y + 1)) < 1.1) { hurtPlayer(p.dmg, p.from, false, 'proj'); done = true; }
    if (done) { burst(p.x, p.y, p.z, 14, p.dagger ? 0xd0d0d0 : 0xb070ff, { speed: 3, size: p.dagger ? 0.15 : 0.3, life: 0.4 }); scene3.remove(p.obj); G.projs.splice(i, 1); }
  }
}

// ---------------------------------------------------------------
// CAMÉRA par-dessus l'épaule (façon PUBG Mobile)
// ---------------------------------------------------------------
const tv = new THREE.Vector3();
let camInit = false;
// Caméra « vue LoL » : haute, inclinée à ~56°, orientation fixe (le haut de l'écran = le nord),
// elle suit le héros en douceur et anticipe un peu dans la direction où il court.
const cam = { fx: 0, fy: 0, fz: 0, lx: 0, lz: 0, shakeT: 0 };
const CAM_PITCH = 0.96; // ~55°, l'angle de Wild Rift
const hv = new THREE.Vector3();
function updateCamera(dt) {
  input.camDX = input.camDY = 0; // plus de rotation de caméra
  const portrait = camera.aspect < 1;
  const D = portrait ? 18 : 14;
  // anticipation : on décale un peu le cadre vers là où va le héros
  const leadX = P.moving ? Math.sin(P.face) * 1.6 : 0, leadZ = P.moving ? Math.cos(P.face) * 1.6 : 0;
  const kl = 1 - Math.exp(-dt * 2.5);
  cam.lx += (leadX - cam.lx) * kl; cam.lz += (leadZ - cam.lz) * kl;
  const ty = P.y + 0.6;
  if (!camInit) { cam.fx = P.x; cam.fy = ty; cam.fz = P.z; cam.lx = cam.lz = 0; }
  const kf = 1 - Math.exp(-dt * 9), ky = 1 - Math.exp(-dt * 5);
  cam.fx += (P.x + cam.lx - cam.fx) * kf; cam.fz += (P.z + cam.lz - cam.fz) * kf; cam.fy += (ty - cam.fy) * ky;
  camInit = true;
  const sh = G.shake; G.shake = Math.max(0, G.shake - dt * 1.4); cam.shakeT += dt;
  const ox = Math.sin(cam.shakeT * 47) * sh * 0.3, oy = Math.sin(cam.shakeT * 61 + 1.3) * sh * 0.3;
  camera.position.set(cam.fx + ox, cam.fy + Math.sin(CAM_PITCH) * D + oy, cam.fz - Math.cos(CAM_PITCH) * D);
  tv.set(cam.fx + ox, cam.fy, cam.fz); camera.lookAt(tv);
  scene3.fog.near = D + 2; scene3.fog.far = D + 16;
  // trou de visibilité : position du héros à l'écran (en pixels) et sa distance à la caméra
  camera.updateMatrixWorld();
  hv.set(P.x, P.y + 1, P.z).applyMatrix4(camera.matrixWorldInverse);
  cutout.depth.value = -hv.z;
  hv.applyMatrix4(camera.projectionMatrix);
  const cw = renderer.domElement.width, ch = renderer.domElement.height;
  cutout.hero.value.set((hv.x * 0.5 + 0.5) * cw, (hv.y * 0.5 + 0.5) * ch);
  cutout.radius.value = ch * 0.17;
}

// ---------------------------------------------------------------
// BOUCLE PRINCIPALE
// ---------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  musicTick();
  if (G.state === 'play') {
    if (consume('pause')) return openPause();
    if (consume('bag')) return UI.openHero(G, 'gear');
    // « hit-stop » : le temps ralentit un instant à l'impact
    let gdt = dt;
    if (G.hitstop > 0) { G.hitstop -= dt; gdt = dt * 0.06; }
    G.time += gdt;
    G.target = G.target && !G.target.dead && Math.hypot(G.target.x - P.x, G.target.z - P.z) < 16 ? G.target : pickTarget(12);
    updateFlow(gdt); updatePlayer(gdt); updateEnemies(gdt); updateDots(gdt); updateHazards(gdt); updateProjs(gdt); updateDrops(gdt); updateTele(gdt); updateParts(gdt); updateTrail(gdt); FX.update(gdt);
    G.world.update(gdt, P.x, P.z);
    updateCamera(dt);
    renderer.render(scene3, camera);
    UI.updateHUD(G, P, camera);
    adaptRes(dt);
  } else if (G.state === 'dead') {
    P.ch.update(dt); updateParts(dt); updateEnemies(dt * 0.3); FX.update(dt); G.world.update(dt, P.x, P.z); updateCamera(dt);
    renderer.render(scene3, camera); UI.clearOverlay();
  } else if (G.state === 'hero') {
    UI.renderPreview(renderer, dt);
  } else if (G.state === 'title' && G.world) {
    // écran titre : la caméra tourne lentement dans la première salle
    G.camYaw += dt * 0.08; P.ch.update(dt); G.world.update(dt, P.x, P.z); updateCamera(dt); renderer.render(scene3, camera);
  } else if (G.state === 'pause' && G.world) renderer.render(scene3, camera);
}

// ---------------------------------------------------------------
// MENUS
// ---------------------------------------------------------------
function openPause() { G.state = 'pause'; UI.show('pause'); }
export function startPlay() {
  unlock(); applyVolumes();
  UI.show(null); $('hud').classList.remove('hidden');
  G.state = 'play';
  refreshHeroLooks();
  last = performance.now();
}
export function backToTitle() {
  G.state = 'title'; UI.show('title'); $('hud').classList.add('hidden'); UI.clearOverlay(); UI.refreshTitle(G);
}
export function respawn() {
  enterFloor(G.save.floor);
  buildHero();
  startPlay();
}
export function onHeroClosed(from) {
  refreshHeroLooks();
  if (from === 'play') startPlay();
  else if (from === 'dead') { G.state = 'dead'; UI.showDeath(G); }
  else backToTitle();
}

async function boot() {
  resize();
  setupInput(() => unlock());
  UI.setup(G, { startPlay, backToTitle, respawn, onHeroClosed, saveGame, refreshHeroLooks, heroStats, xpNeed, fullCd, buildHeroPreview: () => P });
  $('versionLabel').textContent = 'v' + APP_VERSION;
  requestAnimationFrame(frame);
  try {
    await Promise.all([loadAll((p) => UI.loading(p * 0.9)), preloadStone()]);
  } catch (e) { UI.loadError(); console.error(e); return; }
  UI.loading(0.95);
  await UI.loadIcons();
  // premier étage (déjà prêt derrière l'écran titre)
  buildHero();
  enterFloor(G.save.floor || 1, true);
  UI.loading(1);
  backToTitle();
  checkUpdate(); setInterval(checkUpdate, 5 * 60 * 1000);
  // on revérifie aussi à chaque retour dans l'app (iPhone : l'app reste souvent en arrière-plan)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
// ---------------------------------------------------------------
// MISES À JOUR : un bandeau propose de recharger quand une nouvelle version est en ligne
// ---------------------------------------------------------------
async function checkUpdate() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const v = await r.json();
    if (v.version && v.version !== APP_VERSION) $('updateBar').classList.remove('hidden');
  } catch { /* hors ligne */ }
}
$('updateBtn').onclick = async () => {
  try { const regs = await navigator.serviceWorker.getRegistrations(); for (const r of regs) await r.update(); const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); } catch { /* rien */ }
  location.reload();
};
// simulation sans affichage (tests automatiques) : fait avancer le jeu de n pas de dt secondes
function sim(n, dt = 1 / 60) {
  for (let i = 0; i < n; i++) {
    G.time += dt; if (G.hitstop > 0) G.hitstop -= dt;
    G.target = G.target && !G.target.dead && Math.hypot(G.target.x - P.x, G.target.z - P.z) < 16 ? G.target : pickTarget(12);
    updateFlow(dt); updatePlayer(dt); updateEnemies(dt); updateDots(dt); updateHazards(dt); updateProjs(dt); updateDrops(dt); updateTele(dt); updateTrail(dt); FX.update(dt); G.world.update(dt, P.x, P.z); updateCamera(dt);
  }
}
window.__rw = { G, P, scene3, camera, renderer, enterFloor, heroStats, hitEnemy, burst, input, sim, spawnEnemy, refreshHeroLooks, FX };
boot();
