// Personnages : une tête + des pièces d'équipement interchangeables, toutes accrochées au même squelette,
// et un « animateur » qui mélange les animations (jambes qui courent pendant que les bras frappent).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { A, scene, variantTex } from './assets.js';
import { toon, addOutline } from './style.js';

export const HERO_H = 1.8; // taille d'un humain, en mètres (1 unité = 1 mètre)
const NATIVE_H = 1.87;
// en vue du dessus, les personnages sont agrandis (comme les champions de LoL) pour rester lisibles
export const VIS = 1.35;

// pièces qui laissent voir les cheveux / qui les cachent
const HIDES_HAIR = /Hood|Armet|Horns/;

// os des jambes : utilisés pour séparer « haut du corps » et « bas du corps »
const LOWER = /^(root|pelvis|thigh|calf|foot|ball)/;
const partCache = new Map();
function partClip(name, part) {
  const key = name + '@' + part;
  if (partCache.has(key)) return partCache.get(key);
  const c = A.clips[name]; if (!c) return null;
  const keepLow = part === 'bas';
  const u = new THREE.AnimationClip(key, c.duration, c.tracks.filter((t) => LOWER.test(t.name.split('.')[0]) === keepLow));
  partCache.set(key, u); return u;
}

export class Character {
  constructor(opts = {}) {
    this.group = new THREE.Group();
    this.root = SkeletonUtils.clone(scene('gear', 'head'));
    this.bones = {};
    const heads = [];
    this.root.traverse((o) => { if (o.isBone) this.bones[o.name] = o; if (o.isMesh) { o.material = toon(o.material.clone()); o.frustumCulled = false; if (o.isSkinnedMesh && !/Eye/.test(o.material.name)) heads.push(o); } });
    for (const h of heads) addOutline(h); // contour du visage / de la tête
    this.host = null; this.root.traverse((o) => { if (o.isSkinnedMesh && !this.host) this.host = o; });
    this.vis = opts.vis || VIS;
    this.scale = (opts.height || HERO_H) / NATIVE_H * this.vis;
    this.root.scale.setScalar(this.scale);
    this.group.add(this.root);
    this.parts = {}; // emplacement -> objets ajoutés
    this.skinTint = opts.skin ? new THREE.Color(opts.skin) : null;
    if (this.skinTint) this.tintSkin(this.host.parent);
    this.hair = opts.hair || null;
    this.eyes = opts.eyes || null;
    // ombre ronde sous les pieds
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.42 * this.vis * (opts.height || HERO_H) / HERO_H, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.38, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.renderOrder = 1; this.group.add(blob); this.blob = blob;
    // contour lumineux (« rim light ») : détache le personnage du décor, comme dans LoL
    this.rimC = { value: new THREE.Color(opts.rim !== undefined ? opts.rim : 0xffe0a0) }; this.rimS = { value: opts.rimS !== undefined ? opts.rimS : 0.55 };
    this.root.traverse((o) => { if (o.isMesh) this.addRim(o.material); });
    this.anim = new Animator(this.root);
    this.flashT = 0; this.glowCol = new THREE.Color();
    this.mats = [];
    this.collectMats();
  }

  addRim(mat) {
    if (!mat || mat.userData.rim || !(mat.isMeshStandardMaterial || mat.isMeshToonMaterial)) return; mat.userData.rim = true;
    const C = this.rimC, S = this.rimS;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.rimC = C; sh.uniforms.rimS = S;
      sh.fragmentShader = 'uniform vec3 rimC; uniform float rimS;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0); totalEmissiveRadiance += rimC * pow(rimF, 2.5) * rimS;');
    };
    mat.customProgramCacheKey = () => 'rim';
  }
  tintSkin(obj) { obj.traverse((o) => { if (o.isMesh && /Superhero|Regular_Male/.test(o.material.name)) o.material.color.copy(this.skinTint); }); }

  // ajoute une pièce skinnée (tenue, cheveux) en la branchant sur nos os
  addSkinned(slot, partName, look = {}) {
    const src = scene('gear', partName); if (!src) return;
    const c = SkeletonUtils.clone(src);
    const meshes = []; c.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    const list = this.parts[slot] || (this.parts[slot] = []);
    for (const m of meshes) {
      m.bind(new THREE.Skeleton(m.skeleton.bones.map((b) => this.bones[b.name] || b), m.skeleton.boneInverses), m.bindMatrix);
      m.material = toon(m.material.clone()); m.frustumCulled = false;
      const outfit = !/Superhero|Regular_Male|Eyes|Hair/.test(m.material.name);
      if (outfit) {
        if (look.tex) m.material.map = variantTex(look.tex, m.material.map);
        if (look.tint) m.material.color.multiply(new THREE.Color(look.tint));
        if (look.glow) { m.material.emissive = new THREE.Color(look.glow); m.material.emissiveIntensity = 0.07; }
        m.material.roughness = look.metal ? 0.45 : 0.85; m.material.metalness = look.metal ? 0.35 : 0;
      } else if (this.skinTint) m.material.color.copy(this.skinTint);
      this.addRim(m.material);
      this.host.parent.add(m); list.push(m);
      if (!/^Eyebrows/.test(partName) && !/Eye/.test(m.material.name)) { const o = addOutline(m); if (o) list.push(o); }
    }
  }

  // objet tenu en main (arme, bouclier)
  addHeld(slot, partName, bone, look = {}) {
    const src = scene('gear', partName); if (!src || !this.bones[bone]) return;
    const w = src.clone(true);
    const wm = [];
    w.traverse((o) => { if (o.isMesh) { wm.push(o); o.material = toon(o.material.clone()); this.addRim(o.material); if (look.tint) o.material.color.multiply(new THREE.Color(look.tint)); if (look.glow) { o.material.emissive = new THREE.Color(look.glow); o.material.emissiveIntensity = 0.35; } } });
    for (const o of wm) addOutline(o);
    if (look.scale) w.scale.setScalar(look.scale);
    if (look.rot) w.rotation.set(...look.rot);
    if (look.pos) w.position.set(...look.pos);
    this.bones[bone].add(w);
    (this.parts[slot] || (this.parts[slot] = [])).push(w);
  }

  clearSlot(slot) {
    for (const o of this.parts[slot] || []) {
      o.parent && o.parent.remove(o);
      o.traverse && o.traverse((m) => { if (m.isMesh && !m.userData.outline) m.material.dispose(); });
    }
    this.parts[slot] = [];
  }

  // applique un « look » complet : { head, shoulders, chest, hands, legs, feet, mainhand, offhand }
  // chaque entrée : { part, tex?, tint?, glow?, metal? } ou null
  setLooks(L) {
    for (const s of ['head', 'shoulders', 'chest', 'hands', 'legs', 'feet', 'mainhand', 'offhand', 'hair']) this.clearSlot(s);
    const D = { chest: 'Peasant_Body', hands: 'Peasant_Arms', legs: 'Peasant_Legs', feet: 'Peasant_Feet' }; // vêtements de base si rien n'est porté
    for (const s of ['chest', 'hands', 'legs', 'feet']) { const l = L[s] || { part: D[s] }; this.addSkinned(s, l.part, l); }
    if (L.head) this.addSkinned('head', L.head.part, L.head);
    if (L.shoulders) this.addSkinned('shoulders', L.shoulders.part, L.shoulders);
    if (this.hair && !(L.head && HIDES_HAIR.test(L.head.part))) for (const h of this.hair) this.addSkinned('hair', h);
    if (L.mainhand) this.addHeld('mainhand', L.mainhand.part, 'hand_r', L.mainhand);
    if (L.offhand) this.addHeld('offhand', L.offhand.part, 'hand_l', L.offhand);
    if (this.eyes) this.root.traverse((o) => { if (o.isMesh && /Eye/.test(o.material.name)) { o.material.emissive = new THREE.Color(this.eyes); o.material.emissiveIntensity = 2; } });
    this.collectMats();
  }

  collectMats() {
    this.root.traverse((o) => { if (o.isMesh && !o.userData.outline) o.castShadow = true; });
    this.mats = [];
    this.root.traverse((o) => { if (o.isMesh && o.material.emissive && !/Eye/.test(o.material.name)) { this.mats.push(o.material); o.userData.e0 = o.material.emissive.clone(); o.userData.ei0 = o.material.emissiveIntensity; } });
    this.baseE = this.mats.map((m) => [m.emissive.clone(), m.emissiveIntensity]);
  }

  // éclat de couleur quand on est touché / gelé / invulnérable
  flash(col = 0xffffff, t = 0.12) { this.glowCol.set(col); this.flashT = t; this.flashT0 = t; }
  update(dt) {
    this.anim.update(dt);
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / this.flashT0);
      this.mats.forEach((m, i) => { m.emissive.copy(this.baseE[i][0]).lerp(this.glowCol, k); m.emissiveIntensity = this.baseE[i][1] + k * 1.2; });
      if (this.flashT <= 0) this.mats.forEach((m, i) => { m.emissive.copy(this.baseE[i][0]); m.emissiveIntensity = this.baseE[i][1]; });
    }
  }
  dispose() { this.group.parent && this.group.parent.remove(this.group); this.root.traverse((o) => { if (o.isMesh && !o.userData.outline) o.material.dispose(); }); }
}

// ---------------------------------------------------------------
// Animateur : une animation de « base » en boucle (repos, course…)
// + des actions ponctuelles (coup d'épée, roulade…) jouées par-dessus, éventuellement
// seulement sur le haut du corps quand le personnage se déplace.
// ---------------------------------------------------------------
export class Animator {
  // L'animation de fond (repos, course…) est jouée en deux moitiés : jambes et haut du corps.
  // Quand une action passe par-dessus (coup d'épée…), on baisse le fond d'autant que l'action monte :
  // le geste est joué à 100 % au lieu d'être mélangé à moitié avec la pose de repos.
  constructor(root) {
    this.mixer = new THREE.AnimationMixer(root);
    this.acts = {};
    this.baseL = null; this.baseU = null; this.baseName = ''; this.loops = new Set();
    this.one = null; this.oneName = ''; this.oneEnd = null;
    this.shots = new Set();
  }
  act(name, part = '') {
    const key = part ? name + '@' + part : name;
    if (this.acts[key]) return this.acts[key];
    const clip = part ? partClip(name, part) : A.clips[name];
    if (!clip) return null;
    const a = this.mixer.clipAction(clip);
    a.upperOnly = part === 'haut';
    this.acts[key] = a; return a;
  }
  // animation de fond en boucle
  loop(name, speed = 1, fade = 0.2) {
    const aL = this.act(name, 'bas'), aU = this.act(name, 'haut'); if (!aL || !aU) return;
    aL.timeScale = aU.timeScale = speed;
    if (this.baseName === name) return;
    for (const a of [aL, aU]) { a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.enabled = true; a.setEffectiveWeight(1); a.play(); this.loops.add(a); }
    if (this.baseL) { this.baseL.crossFadeTo(aL, fade, false); this.baseU.crossFadeTo(aU, fade, false); }
    this.baseL = aL; this.baseU = aU; this.baseName = name;
  }
  // action unique ; upper = ne bouge que le haut du corps
  play(name, { speed = 1, fade = 0.08, upper = false, from = 0, onEnd = null, hold = false } = {}) {
    const a = this.act(name, upper ? 'haut' : ''); if (!a) return 0;
    if (this.one && this.one !== a) this.one.fadeOut(fade);
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = speed;
    a.time = from * a.getClip().duration;
    a.setEffectiveWeight(1); a.fadeIn(fade); a.play();
    this.shots.add(a);
    this.one = a; this.oneName = name; this.oneEnd = onEnd; this.oneHold = hold;
    return (a.getClip().duration * (1 - from)) / speed;
  }
  stopOne(fade = 0.15) { if (this.one) { this.one.fadeOut(fade); this.one = null; this.oneName = ''; } }
  get busy() { return !!this.one; }
  update(dt) {
    // poids du fond = 1 - poids des actions en cours (haut du corps : toutes ; jambes : actions « corps entier »)
    let wU = 0, wL = 0;
    for (const a of this.shots) {
      const w = a.enabled ? a.getEffectiveWeight() : 0;
      if (w <= 0.001 && a !== this.one) { this.shots.delete(a); continue; }
      wU = Math.max(wU, w); if (!a.upperOnly) wL = Math.max(wL, w);
    }
    for (const a of this.loops) a.weight = a.upperOnly ? 1 - wU : 1 - wL;
    this.mixer.update(dt);
    if (this.one && !this.oneHold) {
      const a = this.one, d = a.getClip().duration;
      if (a.time >= d - 0.001 || !a.isRunning()) {
        const cb = this.oneEnd; this.one.fadeOut(0.18); this.one = null; this.oneName = '';
        cb && cb();
      }
    }
  }
}
