// RIFTWALKER — rendus 3D (Three.js) : « cel-shading » et « HD 2.5D » (pixel art dans une scène 3D)
// Le jeu (règles, collisions, combats) reste dans game.js : ce fichier ne fait que DESSINER l'état du jeu en 3D.
// Modèles : Kay Lousberg (KayKit, CC0) et Quaternius (CC0).
import * as THREE from 'three';
import { GLTFLoader } from './vendor/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from './vendor/jsm/utils/SkeletonUtils.js';

const T = 16; // 1 case du jeu = 16 unités 2D = 1 unité 3D
const W2 = (v) => v / T;

export async function create(canvas, api) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x07050b, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07050b, 10, 30);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 120);

  // --- ombrage « dessin animé » : 3 tons francs ---
  const grad = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  const toon = (src, opts = {}) => new THREE.MeshToonMaterial({
    map: src && src.map ? src.map : null, color: src && src.color ? src.color.clone() : new THREE.Color(0xffffff), gradientMap: grad, ...opts,
  });
  // contour noir (technique de la « coque inversée »)
  const outlineMat = (w) => {
    const m = new THREE.MeshBasicMaterial({ color: 0x0b0610, side: THREE.BackSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.outlineW = { value: w };
      sh.vertexShader = 'uniform float outlineW;\n' + sh.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n transformed += normalize( normal ) * outlineW;');
    };
    return m;
  };
  const OUTLINE_CHAR = outlineMat(0.035), OUTLINE_PROP = outlineMat(0.025);

  // --- lumières ---
  scene.add(new THREE.HemisphereLight(0x7a6aaa, 0x2a1a18, 0.85));
  const moon = new THREE.DirectionalLight(0x8a90ff, 0.35); moon.position.set(-4, 10, 6); scene.add(moon);
  const playerLight = new THREE.PointLight(0xffc488, 11, 10, 1.3); scene.add(playerLight);
  const torchLights = Array.from({ length: 4 }, () => { const l = new THREE.PointLight(0xff8a3a, 0, 6, 1.6); scene.add(l); return l; });
  const fxLights = Array.from({ length: 2 }, () => { const l = new THREE.PointLight(0xff8a3a, 0, 5, 1.6); scene.add(l); return l; });
  const lavaLights = Array.from({ length: 2 }, () => { const l = new THREE.PointLight(0xff6a2a, 0, 6, 1.4); scene.add(l); return l; });

  // =============================================================
  // STYLE « HD 2.5D » : images pixel art debout dans la scène (« billboards »)
  // =============================================================
  let style = api.getStyle();
  const PIX = () => style === 'pixel';
  const texBase = new Map();
  function baseTex(img) {
    let t = texBase.get(img);
    if (!t) {
      t = img.isTexture ? img : new THREE.Texture(img);
      t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
      texBase.set(img, t);
    }
    return t;
  }
  const PLANE = new THREE.PlaneGeometry(1, 1);
  const BLOB_GEO = new THREE.CircleGeometry(1, 16);
  const BLOB_MAT = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.38, depthWrite: false });
  function makeBill(img, shadow = 0.3) {
    const tex = baseTex(img).clone(); tex.needsUpdate = true;
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(PLANE, mat);
    const g = new THREE.Group(), inner = new THREE.Group();
    inner.add(mesh); g.add(inner);
    if (shadow) { const b = new THREE.Mesh(BLOB_GEO, BLOB_MAT); b.rotation.x = -Math.PI / 2; b.position.y = 0.02; b.scale.set(shadow, shadow * 0.7, 1); g.add(b); }
    scene.add(g);
    return { g, inner, mesh, mat, tex, img, key: '' };
  }
  // r = [x, y, largeur, hauteur, décalage x depuis les pieds, décalage y depuis les pieds] en pixels HD (32 px = 1 case)
  function setFrame(b, r, sc = 1) {
    const W = b.img.width, H = b.img.height, k = sc / 32;
    b.tex.repeat.set(r[2] / W, r[3] / H);
    b.tex.offset.set(r[0] / W, 1 - (r[1] + r[3]) / H);
    b.mesh.scale.set(r[2] * k, r[3] * k, 1);
    b.mesh.position.set((r[4] + r[2] / 2) * k, -(r[5] + r[3] / 2) * k, 0);
  }
  function frameHD(b, key, sc = 1) { const r = api.HDS[key]; if (!r) return false; if (b.key !== key + sc) { setFrame(b, r, sc); b.key = key + sc; } return true; }
  function frameSpr(b, name, sc = 1) { const r0 = api.SPR[name]; if (!r0) return; const k = name + sc; if (b.key === k) return; setFrame(b, [r0[0] * 2, r0[1] * 2, r0[2] * 2, r0[3] * 2, -r0[2], -r0[3] * 2], sc); b.key = k; }
  function frameEnv(b, name, sc = 1) { const r0 = api.ENV[name]; if (!r0) return; const k = name + sc; if (b.key === k) return; setFrame(b, [r0[0], r0[1], r0[2], r0[3], -r0[2] / 2, -r0[3]], sc); b.key = k; }
  const face = (b) => b.inner.quaternion.copy(camera.quaternion);
  const removeBill = (b) => { scene.remove(b.g); b.mat.dispose(); };

  // --- chargement des modèles ---
  const loader = new GLTFLoader();
  const load = (f) => new Promise((res, rej) => loader.load('assets/3d/' + f, res, undefined, rej));
  const [dungeon, props, knight, mage, skel, ...anims] = await Promise.all(['dungeon.glb', 'props.glb', 'knight.glb', 'mage.glb', 'skeleton.glb',
    'anim_general.glb', 'anim_movementbasic.glb', 'anim_combatmelee.glb', 'anim_combatranged.glb', 'anim_special.glb'].map(load));
  const CLIPS = {};
  for (const g of anims) for (const c of g.animations) CLIPS[c.name] = c;
  const piece = (gltf, name) => gltf.scenes.find((s) => s.name === name);

  // matériaux cel-shading pour tout un modèle
  function toonify(root, { outline = null, tint = null } = {}) {
    const outlines = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mat = toon(o.material);
      if (tint) mat.color.multiply(new THREE.Color(tint));
      o.material = mat;
      if (outline) {
        let ol;
        if (o.isSkinnedMesh) { ol = new THREE.SkinnedMesh(o.geometry, outline); ol.bind(o.skeleton, o.bindMatrix); }
        else ol = new THREE.Mesh(o.geometry, outline);
        ol.position.copy(o.position); ol.quaternion.copy(o.quaternion); ol.scale.copy(o.scale);
        outlines.push([o.parent, ol]);
      }
    });
    for (const [p, ol] of outlines) p.add(ol);
    return root;
  }
  // mise à l'échelle automatique d'après la taille du modèle
  const heightOf = (obj) => new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()).y;

  // =============================================================
  // DÉCOR : un niveau = sols, murs, piliers, torches (en « instances »)
  // =============================================================
  let level = null, levelKey = '';
  function instanced(srcScene, mats, group, opts = {}) {
    if (!mats.length) return;
    srcScene.updateMatrixWorld(true);
    srcScene.traverse((o) => {
      if (!o.isMesh) return;
      const mat = toon(o.material, opts.color ? { color: new THREE.Color(opts.color) } : {});
      const im = new THREE.InstancedMesh(o.geometry, mat, mats.length);
      const local = o.matrixWorld;
      const m = new THREE.Matrix4();
      mats.forEach((M, i) => { m.multiplyMatrices(M, local); im.setMatrixAt(i, m); });
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      group.add(im);
    });
  }
  const mat4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

  function buildLevel(G) {
    if (level) { scene.remove(level.group); level.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); if (o.isMesh && o.material && o.material.map && o.material.map.isCanvasTexture) o.material.map.dispose(); }); }
    if (PIX()) return buildPixelLevel(G);
    const D = G.D, MW = G.MW, MH = G.MH;
    const isF = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && D.tiles[y * MW + x] === 1;
    const group = new THREE.Group();
    const K = 0.25; // pièces KayKit : 4 unités = 1 case
    const floors = [], floorsB = [], floorsD = [], walls = [], wallsC = [], wallsLow = [], pillars = [], torches = [], rubble = [];
    let rnd = D.seed >>> 0;
    const R = () => ((rnd = (rnd * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (!isF(x, y)) continue;
      const r = R();
      const M = mat4(x + 0.5, 0, y + 0.5, Math.floor(R() * 4) * Math.PI / 2, K, K, K);
      (r < 0.88 ? floors : r < 0.95 ? floorsB : floorsD).push(M);
      // murs autour de la case
      if (!isF(x, y - 1)) (R() < 0.15 ? wallsC : walls).push(mat4(x + 0.5, 0, y - 0.06, 0, K * 1.02, K * 0.95, K));
      if (!isF(x - 1, y)) walls.push(mat4(x - 0.06, 0, y + 0.5, Math.PI / 2, K * 1.02, K * 0.95, K));
      if (!isF(x + 1, y)) walls.push(mat4(x + 1.06, 0, y + 0.5, -Math.PI / 2, K * 1.02, K * 0.95, K));
      if (!isF(x, y + 1)) wallsLow.push(mat4(x + 0.5, 0, y + 1.06, Math.PI, K * 1.02, K * 0.18, K));
    }
    // piliers aux angles des murs
    for (let y = 0; y <= MH; y++) for (let x = 0; x <= MW; x++) {
      const a = isF(x - 1, y - 1), b = isF(x, y - 1), c = isF(x - 1, y), d = isF(x, y);
      const n = a + b + c + d;
      if (n > 0 && n < 4 && !((a && d && !b && !c) || (b && c && !a && !d)) && (n !== 2 || (a !== b && a !== c) || (a === b && c === d) || (a === c && b === d))) {
        const low = !(c || d) || (!c && !d) ? false : false;
        const southOnly = (a || b) && !c && !d;
        pillars.push(mat4(x, 0, y, 0, K * 0.55, southOnly ? K * 0.18 : K * 0.95, K * 0.55));
      }
    }
    for (const t of D.torches) torches.push(mat4(W2(t.x), 0.55, Math.floor(W2(t.y)) + 1.0, 0, 0.7, 0.7, 0.7));
    instanced(piece(dungeon, 'floor_tile_large'), floors, group);
    instanced(piece(dungeon, 'floor_tile_large'), floorsB, group, { color: 0xf0e8e0 });
    instanced(piece(dungeon, 'floor_tile_large'), floorsD, group, { color: 0xe2d6cc });
    instanced(piece(dungeon, 'wall'), walls, group);
    instanced(piece(dungeon, 'wall_cracked'), wallsC, group);
    instanced(piece(dungeon, 'wall'), wallsLow, group, { color: 0x9a8f9a });
    instanced(piece(dungeon, 'pillar'), pillars, group);
    instanced(piece(dungeon, 'torch_mounted'), torches, group);
    // crânes et tonneaux
    const skulls = [], barrels = [];
    for (const pr of D.props) (pr.s === 'skull' ? skulls : barrels).push(mat4(pr.x + 0.5, 0, pr.y + 0.5, R() * 6.28, pr.s === 'skull' ? 0.6 : 0.42, pr.s === 'skull' ? 0.6 : 0.42, pr.s === 'skull' ? 0.6 : 0.42));
    instanced(piece(props, 'skull'), skulls, group);
    buildCelOutside(G, group, isF, R);
    instanced(piece(props, 'barrel'), barrels, group);
    scene.add(group);
    level = { group, torches: D.torches.map((t) => new THREE.Vector3(W2(t.x), 0.95, Math.floor(W2(t.y)) + 1.15)), doors: new Map(), lava: (D.glows || []).map((g) => new THREE.Vector3(W2(g.x), -0.3, W2(g.y))) };
    // herses (piques) et portes scellées sur chaque passage de salle
    for (const room of D.rooms) for (const d of room.doors) {
      const key = d.x + ',' + d.y;
      if (level.doors.has(key)) continue;
      const vertical = isF(d.x, d.y - 1) && isF(d.x, d.y + 1);
      const sp = toonify(piece(props, 'spikes').clone(), { outline: OUTLINE_PROP });
      sp.scale.setScalar(0.55); sp.position.set(d.x + 0.5, -0.7, d.y + 0.5); group.add(sp);
      const gate = toonify(piece(dungeon, 'wall_gated').clone(), { tint: 0xffd36a });
      gate.scale.set(K, K * 0.95, K * 0.6); gate.position.set(d.x + 0.5, 0, d.y + 0.5); gate.rotation.y = vertical ? 0 : Math.PI / 2; gate.visible = false; group.add(gate);
      level.doors.set(key, { x: d.x, y: d.y, sp, gate, h: -0.7 });
    }
    levelKey = D.seed + ':' + G.floorN + ':' + style;
  }

  // Décor extérieur en cel-shading : sol en contrebas, lave, gouffres, roches, colonnes brisées
  function buildCelOutside(G, group, isF, R) {
    const D = G.D, MW = G.MW, MH = G.MH, K = 0.25;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(MW + 40, MH + 40), toon(null, { color: new THREE.Color(0x3a2a26) }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(MW / 2, -0.75, MH / 2); group.add(ground);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const lists = { cliff: [], lava: [], pit: [], rock: [] };
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = y * MW + x;
      if (D.tiles[i]) continue;
      const d = D.distF[i], t = D.decor[i];
      if (d === 1) lists.cliff.push(mat4(x + 0.5, -0.38, y + 0.5, 0, 1, 0.75, 1));
      else if (t === 1) lists.lava.push(mat4(x + 0.5, -0.72, y + 0.5, 0, 1, 0.04, 1));
      else if (t === 2) lists.pit.push(mat4(x + 0.5, -0.72, y + 0.5, 0, 1, 0.04, 1));
      else if (t === 3) lists.rock.push(mat4(x + 0.5, -0.75 + 0.15, y + 0.5, R() * 3, 0.9, 0.3 + R() * 0.5, 0.9));
    }
    const add = (arr, mat) => { if (!arr.length) return; const im = new THREE.InstancedMesh(box, mat, arr.length); arr.forEach((M, i) => im.setMatrixAt(i, M)); im.frustumCulled = false; group.add(im); };
    add(lists.cliff, toon(null, { color: new THREE.Color(0x4a3a40) }));
    add(lists.lava, new THREE.MeshBasicMaterial({ color: 0xff5a1a }));
    add(lists.pit, new THREE.MeshBasicMaterial({ color: 0x050308 }));
    add(lists.rock, toon(null, { color: new THREE.Color(0x2e2a36) }));
    // débris et colonnes brisées dispersés
    const rub = [], col = [], pil = [];
    for (const sc of D.scatter) {
      const M = mat4(sc.x + 0.5, -0.75, sc.y + 0.5, R() * 6.28, K, K * (0.4 + R() * 0.8), K);
      (sc.s === 'bigrock' ? col : sc.s === 'boulder' ? pil : rub).push(M);
    }
    instanced(piece(dungeon, 'rubble_half'), rub, group);
    instanced(piece(dungeon, 'column'), col, group, { color: 0x9a8f9a });
    instanced(piece(dungeon, 'pillar'), pil, group, { color: 0x8a7f8a });
  }

  // Niveau « HD 2.5D » : sol peint en pixel art HD, murs en blocs texturés, extérieur en contrebas
  function buildPixelLevel(G) {
    const D = G.D, MW = G.MW, MH = G.MH;
    const isF = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && D.tiles[y * MW + x] === 1;
    const group = new THREE.Group();
    const canvasTex = (cv) => { const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t; };
    const plane = (cv, y, alpha) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), new THREE.MeshLambertMaterial({ map: canvasTex(cv), alphaTest: alpha ? 0.5 : 0 }));
      m.rotation.x = -Math.PI / 2; m.position.set(MW / 2, y, MH / 2); group.add(m);
    };
    plane(api.groundCanvas('outside'), -0.75, false);
    plane(api.groundCanvas('floor'), 0, true);
    // textures des murs (pierre du château)
    const crop = (name, dark) => {
      const r = api.ENV[name], c = document.createElement('canvas'); c.width = 32; c.height = 32;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(api.envImg, r[0], r[1], 32, 32, 0, 0, 32, 32);
      if (dark) { x.fillStyle = `rgba(10,6,16,${dark})`; x.fillRect(0, 0, 32, 32); }
      return canvasTex(c);
    };
    const side = new THREE.MeshLambertMaterial({ map: crop('wface_1') });
    const front = new THREE.MeshLambertMaterial({ map: crop('wbase_1') });
    const top = new THREE.MeshLambertMaterial({ map: crop('floor_1_1', 0.55) });
    const mats = [side, side, top, top, front, side]; // +x, -x, +y, -y, +z (vers la caméra), -z
    const tall = [], low = [];
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = y * MW + x;
      if (D.tiles[i] || D.distF[i] !== 1) continue;
      const southWall = isF(x, y - 1) || isF(x - 1, y - 1) && isF(x + 1, y - 1);
      const h = southWall ? 0.3 : 1.15;
      (southWall ? low : tall).push(mat4(x + 0.5, (h - 0.75) / 2, y + 0.5, 0, 1, h + 0.75, 1));
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (const arr of [tall, low]) {
      if (!arr.length) continue;
      const im = new THREE.InstancedMesh(geo, mats, arr.length);
      arr.forEach((M, i) => im.setMatrixAt(i, M)); im.frustumCulled = false; group.add(im);
    }
    scene.add(group);
    // torches murales
    const torches = [];
    for (const t of D.torches) {
      const b = makeBill(api.envImg, 0); frameEnv(b, 'torch', 0.75);
      b.g.position.set(W2(t.x), 0.2, Math.floor(W2(t.y)) + 1.06); group.add(b.g); torches.push(b);
    }
    level = { group, torches: D.torches.map((t) => new THREE.Vector3(W2(t.x), 1.0, Math.floor(W2(t.y)) + 1.3)), torchBills: torches, doors: new Map(), lava: (D.glows || []).map((g) => new THREE.Vector3(W2(g.x), -0.3, W2(g.y))) };
    // herses : piques au sol quand la salle est verrouillée ; portes scellées dorées
    for (const room of D.rooms) for (const d of room.doors) {
      const key = d.x + ',' + d.y;
      if (level.doors.has(key)) continue;
      const vertical = isF(d.x, d.y - 1) && isF(d.x, d.y + 1);
      const b = makeBill(api.atlas2x, 0); frameSpr(b, 'floor_spikes_anim_f3', 1);
      b.g.position.set(d.x + 0.5, 0, d.y + 1); b.g.visible = false; group.add(b.g);
      const gate = toonify(piece(dungeon, 'wall_gated').clone(), { tint: 0xffd36a });
      gate.scale.set(0.25, 0.25 * 0.95, 0.15); gate.position.set(d.x + 0.5, 0, d.y + 0.5); gate.rotation.y = vertical ? 0 : Math.PI / 2; gate.visible = false; group.add(gate);
      level.doors.set(key, { x: d.x, y: d.y, spBill: b, gate, h: -0.7 });
    }
    levelKey = D.seed + ':' + G.floorN + ':' + style;
  }

  // =============================================================
  // PERSONNAGES
  // =============================================================
  const PROTO = { knight: knight.scene, mage: mage.scene, skel: skel.scene };
  const ENEMY_LOOK = {
    tiny_zombie: [0xa6d88f, 0.85], goblin: [0x8fe07a, 0.8], skelet: [0xffffff, 1], orc_warrior: [0x7fbf6a, 1.1, 'sword'], masked_orc: [0xa0a6b8, 1.15, 'sword'],
    chort: [0xe08060, 1.0], imp: [0xc59aff, 0.8, 'staff'], orc_shaman: [0x6ad0c0, 1.0, 'staff'],
    big_zombie: [0xa6d88f, 1.9], ogre: [0xc49a74, 2.0, 'sword'], big_demon: [0xff6a5a, 2.15, 'sword'],
  };
  function attach(root, boneName, gltfScene, scale = 1) {
    let bone = null; root.traverse((o) => { if (o.name === boneName) bone = o; });
    if (!bone) return;
    const w = toonify(gltfScene.clone(), { outline: OUTLINE_PROP });
    w.scale.setScalar(scale); bone.add(w);
  }
  function makeChar(kind, cls) {
    let root, tint = null, size = 1.2, weapon = null, isSkel = false;
    if (kind === 'player') { root = SkeletonUtils.clone(cls === 'mage' ? PROTO.mage : PROTO.knight); size = 1.25; weapon = cls === 'mage' ? 'staff' : 'sword'; }
    else { const L = ENEMY_LOOK[kind] || [0xffffff, 1]; root = SkeletonUtils.clone(PROTO.skel); tint = L[0]; size = 1.15 * L[1]; weapon = L[2] || null; isSkel = true; }
    toonify(root, { outline: OUTLINE_CHAR, tint });
    if (weapon === 'sword') attach(root, 'handslot.r', piece(props, 'sword_1handed'));
    if (weapon === 'staff') attach(root, 'handslot.r', piece(props, 'staff'));
    if (kind === 'player' && cls !== 'mage') attach(root, 'handslot.l', piece(props, 'shield_badge_color'));
    const holder = new THREE.Group();
    const s = size / 2.55; root.scale.setScalar(s);
    holder.add(root);
    const mixer = new THREE.AnimationMixer(root);
    const mats = []; root.traverse((o) => { if (o.isMesh && o.material.isMeshToonMaterial) mats.push(o.material); });
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.32 * size / 1.2, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; holder.add(blob);
    scene.add(holder);
    return { holder, root, mixer, mats, actions: {}, cur: null, isSkel, baseColors: mats.map((m) => m.color.clone()), dying: 0 };
  }
  function action(c, name, loop = true) {
    let a = c.actions[name];
    if (!a) {
      const clip = CLIPS[name]; if (!clip) return null;
      a = c.mixer.clipAction(clip); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop;
      c.actions[name] = a;
    }
    return a;
  }
  // joue une animation en boucle (avec fondu)
  function play(c, name, speed = 1) {
    const a = action(c, name, true); if (!a) return;
    a.timeScale = speed; a.paused = false;
    if (c.cur === a) return;
    a.reset().play();
    if (c.cur) a.crossFadeFrom(c.cur, 0.15, false);
    c.cur = a;
  }
  // positionne une animation à un instant précis (0..1) : coups, sorts, mort
  function pose(c, name, k) {
    const a = action(c, name, false); if (!a) return;
    if (c.cur !== a) { a.reset().play(); if (c.cur) a.crossFadeFrom(c.cur, 0.08, false); c.cur = a; }
    a.paused = true; a.time = Math.max(0, Math.min(0.999, k)) * a.getClip().duration;
  }
  function setGlow(c, color, intensity) { for (const m of c.mats) { m.emissive.setHex(color); m.emissiveIntensity = intensity; } }

  const chars = new Map(); // entité du jeu -> personnage 3D
  const bills = new Map(); // entité du jeu -> image debout (style HD 2.5D)
  let playerBill = null;
  function pixelChars(G, t) {
    const p = G.p;
    if (!playerBill) playerBill = makeBill(api.hdImg, 0.32);
    const pb = playerBill;
    pb.g.position.set(W2(p.x), 0, W2(p.y));
    pb.g.visible = !(p.inv > 0 && p.hurtT <= 0 && p.charging <= 0 && Math.floor(t * 20) % 2);
    frameHD(pb, api.playerKey());
    face(pb);
    pb.mat.emissive.setHex(p.hurtT > 0.15 ? 0xff2020 : p.casting > 0 ? 0xff7a20 : 0);
    pb.mat.emissiveIntensity = p.hurtT > 0.15 ? 0.6 : p.casting > 0 ? 0.25 * (1 - p.casting / p.castT) : 0;
    const alive = new Set();
    for (const e of G.enemies) {
      if (e.kind === 'mimic' || e.dead) continue;
      let b = bills.get(e);
      if (!b) { b = makeBill(api.hdImg, e.d.elite ? 0.7 : 0.3); bills.set(e, b); }
      alive.add(e);
      const ox = e.state === 'windup' && !(e.frozen > 0) ? (Math.random() - 0.5) * 0.05 : 0;
      b.g.position.set(W2(e.x) + ox, 0, W2(e.y));
      frameHD(b, api.enemyKey(e), e.d.elite ? 2 : 1);
      face(b);
      let em = 0, ei = 0;
      if (e.flash > 0) { em = 0xffffff; ei = 0.8; }
      else if (e.frozen > 0) { em = 0x3ab0ff; ei = 0.6; }
      else if (e.state === 'windup' || e.state === 'slam') { em = 0xff1a0a; ei = 0.35 + 0.3 * Math.sin(t * 30); }
      else if (e.burn > 0) { em = 0xff6a1a; ei = 0.3; }
      b.mat.emissive.setHex(em); b.mat.emissiveIntensity = ei;
    }
    for (const [e, b] of bills) if (!alive.has(e)) { removeBill(b); bills.delete(e); }
  }
  function clearAll() {
    if (playerChar) { scene.remove(playerChar.holder); playerChar = null; }
    for (const c of chars.values()) scene.remove(c.holder); chars.clear();
    if (playerBill) { removeBill(playerBill); playerBill = null; }
    for (const b of bills.values()) removeBill(b); bills.clear();
    for (const m of Object.values(maps)) { for (const o of m.values()) scene.remove(o); m.clear(); }
    if (portal) { scene.remove(portal); portal = null; }
    levelKey = '';
  }
  function setStyle(st) {
    if (st === style) return;
    style = st; clearAll();
    resize();
  }
  let playerChar = null, playerCls = '';

  // =============================================================
  // OBJETS : coffres, pièces, potions, clés, armes, projectiles, faille
  // =============================================================
  const objs = new Map();
  const glowMat = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, depthWrite: o >= 1, fog: false });
  function makeObj(kind, data) {
    if (PIX() && (kind === 'chest' || kind === 'coin' || kind === 'potion' || kind === 'key' || kind === 'weapon')) {
      const b = makeBill(kind === 'chest' && !data.mimic ? api.envImg : api.atlas2x, kind === 'chest' ? 0.4 : 0.18);
      b.g.userData.bill = b; b.g.userData.pix = kind; b.g.userData.data = data;
      if (kind === 'chest' && data.big) { b.mat.emissive.setHex(0x8a6010); b.mat.emissiveIntensity = 0.5; }
      if (kind === 'weapon') {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.28, 24), glowMat(new THREE.Color(data.color), 0.7)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; b.g.add(ring);
      }
      return b.g;
    }
    const g = new THREE.Group();
    if (kind === 'chest') {
      const ch = toonify(piece(props, 'chest').clone(), { outline: OUTLINE_PROP, tint: data.big ? 0xffd36a : null });
      ch.scale.setScalar(0.55); g.add(ch);
      g.userData.lid = ch.getObjectByName('Chest_Top_Cylinder.007') || ch.children[1];
    } else if (kind === 'coin') {
      const c = toonify(piece(props, 'coins').clone()); c.scale.setScalar(2.2); g.add(c);
    } else if (kind === 'potion') {
      const m = toon(null, { color: new THREE.Color(0xff3a3a), emissive: new THREE.Color(0x801010) });
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), m); b.position.y = 0.2; g.add(b);
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.12, 8), toon(null, { color: new THREE.Color(0xd8c8b0) })); n.position.y = 0.36; g.add(n);
    } else if (kind === 'key') {
      const m = toon(null, { color: new THREE.Color(0xffcf4a), emissive: new THREE.Color(0x7a5000) });
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 16), m); r.position.y = 0.42; g.add(r);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), m); s.position.y = 0.2; g.add(s);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.05), m); t.position.set(0.05, 0.1, 0); g.add(t);
    } else if (kind === 'weapon') {
      const isStaff = /staff/.test(data.w.sprite);
      const w = toonify(piece(props, isStaff ? 'staff' : 'sword_1handed').clone(), { outline: OUTLINE_PROP });
      w.scale.setScalar(0.45); w.position.y = 0.35; w.rotation.z = 0.5; g.add(w);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.28, 24), glowMat(new THREE.Color(data.color), 0.7)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    } else if (kind === 'proj') {
      const s = new THREE.Mesh(new THREE.SphereGeometry(data.big ? 0.16 : 0.1, 12, 10), glowMat(data.big ? 0xffb03a : 0xff7a2a));
      const c = new THREE.Mesh(new THREE.SphereGeometry(data.big ? 0.09 : 0.05, 8, 8), glowMat(0xfff2b0)); g.add(s); g.add(c);
    } else if (kind === 'portal') {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 10, 32), glowMat(0xb37cff)); t.position.y = 0.7; g.add(t);
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), glowMat(0x5a2a9a, 0.85)); d.position.y = 0.7; g.add(d);
      g.userData.spin = [t, d];
    } else if (kind === 'tele') {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 40), glowMat(0xff4a3a, 0.9));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), glowMat(0xff2a1a, 0.35));
      ring.rotation.x = disc.rotation.x = -Math.PI / 2; ring.position.y = 0.04; disc.position.y = 0.035; g.add(ring); g.add(disc);
      g.userData.disc = disc;
    } else if (kind === 'ring') {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), glowMat(new THREE.Color(data.c), 0.9)); r.rotation.x = -Math.PI / 2; r.position.y = 0.06; g.add(r);
      g.userData.mat = r.material;
    } else if (kind === 'arc') {
      const a = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.05, 24, 1, -1.2, 2.4), glowMat(0xffffff, 0.85)); a.rotation.x = -Math.PI / 2; a.position.y = 0.55; g.add(a);
      g.userData.mat = a.material;
    }
    scene.add(g);
    return g;
  }
  function sync(map, list, kind, place, dataOf) {
    const seen = new Set();
    for (const it of list) {
      seen.add(it);
      let o = map.get(it);
      if (!o) { o = makeObj(kind, dataOf ? dataOf(it) : it); map.set(it, o); }
      place(o, it);
    }
    for (const [it, o] of map) if (!seen.has(it)) { scene.remove(o); map.delete(it); }
  }
  const maps = { chest: new Map(), pick: new Map(), proj: new Map(), fire: new Map(), tele: new Map(), fx: new Map() };
  let portal = null;

  // particules
  const PMAX = 500;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.06, vertexColors: true, transparent: true, depthWrite: false, fog: false }));
  points.frustumCulled = false; scene.add(points);
  const tmpC = new THREE.Color();

  // =============================================================
  // CAMÉRA & AFFICHAGE
  // =============================================================
  const camT = new THREE.Vector3();
  const PITCH_CEL = 50 * Math.PI / 180, PITCH_PIX = 44 * Math.PI / 180;
  let camDist = 14;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.aspect = w / h;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camDist = camera.aspect < 1 ? 3.9 / (tanH * camera.aspect) : 3.5 / tanH;
    scene.fog.near = camDist * 0.85; scene.fog.far = camDist * 1.55;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let enabled = false;
  const tmpV = new THREE.Vector3();
  const clock = { last: performance.now() };

  function render() {
    const G = api.getGame();
    if (!enabled || !G || !G.D) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - clock.last) / 1000); clock.last = now;
    const t = G.time;
    if (G.D.seed + ':' + G.floorN + ':' + style !== levelKey) buildLevel(G);

    const p = G.p;
    if (PIX()) pixelChars(G, t);
    else {
    // --- joueur ---
    if (!playerChar || playerCls !== p.cls) { if (playerChar) scene.remove(playerChar.holder); playerChar = makeChar('player', p.cls); playerCls = p.cls; }
    const pc = playerChar;
    pc.holder.position.set(W2(p.x), 0, W2(p.y));
    pc.holder.rotation.y = Math.atan2(p.fx, p.fy);
    pc.holder.visible = !(p.inv > 0 && p.hurtT <= 0 && p.charging <= 0 && Math.floor(t * 20) % 2);
    if (api.getState() === 'dead' || p.hp <= 0) pose(pc, 'Death_A', Math.min(1, (pc.dying += dt) / 1.2));
    else {
      pc.dying = 0;
      if (p.hurtT > 0) pose(pc, 'Hit_A', 1 - p.hurtT / 0.25);
      else if (p.cls === 'mage') {
        if (p.casting > 0) play(pc, 'Ranged_Magic_Spellcasting', 1.3);
        else if (p.castFx > 0) pose(pc, p.castFx > 0.22 ? 'Ranged_Magic_Raise' : 'Ranged_Magic_Shoot', 1 - p.castFx / 0.3);
        else if (p.moving) play(pc, 'Running_A', 1.1); else play(pc, 'Idle_A');
      } else {
        if (p.whirl > 0) play(pc, 'Melee_2H_Attack_Spinning', 1.8);
        else if (p.swing > 0) pose(pc, 'Melee_1H_Attack_Slice_Diagonal', 0.15 + (1 - p.swing / 0.2) * 0.7);
        else if (p.charging > 0) play(pc, 'Running_A', 2);
        else if (p.moving) play(pc, 'Running_A', 1.1); else play(pc, 'Idle_A');
      }
    }
    setGlow(pc, p.hurtT > 0.15 ? 0xff2a2a : p.casting > 0 ? 0xff8a2a : 0x000000, p.hurtT > 0.15 ? 0.6 : p.casting > 0 ? 0.25 * (1 - p.casting / p.castT) : 0);
    pc.mixer.update(dt);

    // --- ennemis ---
    const alive = new Set();
    for (const e of G.enemies) {
      if (e.kind === 'mimic') continue;
      let c = chars.get(e);
      if (e.dead && (!c || c.dying > 1.6)) { if (c) { scene.remove(c.holder); chars.delete(e); } continue; }
      if (!c) { c = makeChar(e.kind); chars.set(e, c); }
      alive.add(e);
      c.holder.position.set(W2(e.x), e.dead ? -Math.max(0, c.dying - 1) * 0.8 : 0, W2(e.y));
      if (!e.dead && e.active) c.holder.rotation.y = Math.atan2(p.x - e.x, p.y - e.y);
      if (e.dead) { c.dying += dt; pose(c, 'Skeletons_Death', Math.min(1, c.dying / 0.9)); }
      else if (e.frozen > 0) { if (c.cur) c.cur.paused = true; }
      else if (!e.active) play(c, 'Skeletons_Idle', 0.6);
      else if (e.state === 'windup' || e.state === 'slam') {
        const k = e.state === 'slam' ? 1 - e.t / 1.0 : 1 - e.t / e.d.windup;
        if (e.d.ranged) pose(c, 'Ranged_Magic_Spellcasting', k * 0.6);
        else pose(c, e.state === 'slam' ? 'Melee_2H_Attack_Chop' : 'Melee_1H_Attack_Chop', k * 0.38);
      } else if (e.state === 'recover') {
        if (e.d.ranged) pose(c, 'Ranged_Magic_Shoot', 0.5 + (1 - e.t / 0.3) * 0.5);
        else pose(c, 'Melee_1H_Attack_Chop', 0.38 + (1 - Math.min(1, e.t / 0.6)) * 0.6);
      } else if (e.stun > 0) pose(c, 'Hit_A', 0.4);
      else if (e.moving) play(c, 'Skeletons_Walking', 1.2 * (e.d.spd / 40)); else play(c, 'Skeletons_Idle');
      // couleurs : coup reçu, gel, préparation d'attaque, brûlure
      if (e.flash > 0) setGlow(c, 0xffffff, 0.8);
      else if (e.frozen > 0) { setGlow(c, 0x5ad0ff, 0.55); }
      else if (e.state === 'windup' || e.state === 'slam') setGlow(c, 0xff1a0a, 0.35 + 0.3 * Math.sin(t * 30));
      else if (e.burn > 0) setGlow(c, 0xff6a1a, 0.25 + 0.15 * Math.sin(t * 20));
      else setGlow(c, 0, 0);
      c.mixer.update(e.frozen > 0 ? 0 : dt);
    }
    for (const [e, c] of chars) if (!alive.has(e)) { scene.remove(c.holder); chars.delete(e); }
    }

    // --- coffres (et mimics) ---
    const chestList = G.chests.concat(G.enemies.filter((e) => e.kind === 'mimic' && !e.dead));
    sync(maps.chest, chestList, 'chest', (o, c) => {
      o.position.set(W2(c.x), 0, W2(c.y));
      if (o.userData.pix) {
        const b = o.userData.bill;
        if (c.kind === 'mimic') { frameSpr(b, 'chest_mimic_open_anim_f' + (Math.floor(t * 8) % 3), 1); b.mat.emissive.setHex(c.flash > 0 ? 0xffffff : 0x801010); b.mat.emissiveIntensity = c.flash > 0 ? 0.8 : 0.4; o.position.y = Math.abs(Math.sin(t * 9)) * 0.1; }
        else frameEnv(b, c.open && c.t > 0.1 ? 'chest_open' : 'chest_closed', 1);
        face(b);
        return;
      }
      const lid = o.userData.lid;
      if (c.kind === 'mimic') {
        o.position.y = Math.abs(Math.sin(t * 9)) * 0.12;
        o.rotation.y = Math.atan2(p.x - c.x, p.y - c.y);
        if (lid) lid.rotation.x = -0.35 - Math.abs(Math.sin(t * 9)) * 0.6;
        o.children[0].traverse((m) => { if (m.isMesh && m.material.emissive) { m.material.emissive.setHex(c.flash > 0 ? 0xffffff : 0xff2a1a); m.material.emissiveIntensity = c.flash > 0 ? 0.8 : 0.3; } });
      } else if (lid) lid.rotation.x = c.open ? -Math.min(1.9, c.t * 8) : 0;
    }, (c) => ({ big: c.big, mimic: c.kind === 'mimic' }));

    // --- objets au sol ---
    const RAR = ['#9d9d9d', '#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000'];
    sync(maps.pick, G.pickups, 'pick', (o, k) => {
      if (!o.userData.k) {
        scene.remove(o);
        const n = makeObj(k.type === 'coin' ? 'coin' : k.type, k.type === 'weapon' ? { w: k.w, color: RAR[k.w.rarity] } : {});
        if (n.userData.pix) n.userData.k = 1;
        maps.pick.set(k, n); n.userData.k = 1; o = n;
      }
      o.position.set(W2(k.x), Math.sin(t * 4 + k.x) * 0.04, W2(k.y));
      if (o.userData.pix) {
        const b = o.userData.bill;
        if (k.type === 'coin') frameSpr(b, 'coin_anim_f' + (Math.floor(t * 8 + k.x) % 4), 1);
        else if (k.type === 'potion') frameSpr(b, 'flask_big_red', 1);
        else if (k.type === 'key') frameSpr(b, 'key', 1);
        else if (k.type === 'weapon') frameSpr(b, k.w.sprite, 1);
        face(b);
        return;
      }
      o.rotation.y = t * 2 + k.x;
    });

    // --- projectiles ---
    sync(maps.proj, G.projs, 'proj', (o, pr) => o.position.set(W2(pr.x), 0.55, W2(pr.y) + 0.35), () => ({}));
    sync(maps.fire, G.fire, 'proj', (o, f) => o.position.set(W2(f.x), 0.65, W2(f.y) + 0.45), () => ({ big: true }));

    // --- télégraphes (attaques de zone du gardien) ---
    sync(maps.tele, G.tele, 'tele', (o, tl) => {
      const r = W2(tl.r); o.position.set(W2(tl.x), 0, W2(tl.y)); o.scale.set(r, 1, r * 0.75);
      const k = 1 - tl.t / tl.T; o.userData.disc.scale.setScalar(k);
    });

    // --- effets ---
    const fxList = G.fx.filter((f) => f.type === 'ring' || f.type === 'arc');
    sync(maps.fx, fxList, 'fx', (o, f) => {
      if (!o.userData.made) {
        scene.remove(o);
        const n = makeObj(f.type, f); n.userData.made = 1; maps.fx.set(f, n); o = n;
      }
      const k = f.t / f.T;
      if (f.type === 'ring') { const r = W2(f.r0 + (f.r1 - f.r0) * (1 - k)); o.position.set(W2(f.x), 0, W2(f.y)); o.scale.set(r, 1, r * 0.8); }
      else { o.position.set(W2(f.x), 0, W2(f.y) + 0.35); o.rotation.y = -f.ang + Math.PI / 2; o.scale.setScalar(1.05); }
      o.userData.mat.opacity = k * 0.9;
    });

    // --- faille ---
    if (G.portal) {
      if (!portal) portal = makeObj('portal');
      portal.position.set(W2(G.portal.x), 0, W2(G.portal.y) - 0.2);
      const k = Math.min(1, G.portal.t / 0.8); portal.scale.setScalar(k);
      portal.userData.spin[0].rotation.z = t * 2; portal.rotation.y = Math.sin(t) * 0.3;
    } else if (portal) { scene.remove(portal); portal = null; }

    // --- herses & portes scellées ---
    for (const d of level.doors.values()) {
      const b = G.barrier[d.y * G.MW + d.x];
      if (d.spBill) { d.spBill.g.visible = b === 1; face(d.spBill); d.gate.visible = b === 2; continue; }
      const target = b === 1 ? 0 : -0.75;
      d.h += (target - d.h) * Math.min(1, dt * 14);
      d.sp.position.y = d.h; d.sp.visible = d.h > -0.72;
      d.gate.visible = b === 2;
    }

    // --- particules ---
    const pos = pGeo.attributes.position.array, col = pGeo.attributes.color.array;
    let n = 0;
    for (const pt of G.parts) {
      if (n >= PMAX) break;
      pos[n * 3] = W2(pt.x); pos[n * 3 + 1] = 0.5 + Math.max(0, -pt.vy) * 0.002; pos[n * 3 + 2] = W2(pt.y) + 0.3;
      tmpC.set(pt.c.startsWith('rgba') ? '#a898c0' : pt.c);
      col[n * 3] = tmpC.r; col[n * 3 + 1] = tmpC.g; col[n * 3 + 2] = tmpC.b; n++;
    }
    pGeo.setDrawRange(0, n);
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;

    // --- lumières ---
    const fl = Math.sin(t * 13) * 0.4 + Math.sin(t * 7.3) * 0.3;
    playerLight.position.set(W2(p.x), 2.6, W2(p.y) + 1.2); playerLight.intensity = 10 + fl;
    playerLight.color.setHex(p.casting > 0 ? 0xffa060 : 0xffc488);
    const pv = new THREE.Vector3(W2(p.x), 0, W2(p.y));
    const near = level.torches.map((v) => [v, v.distanceToSquared(pv)]).sort((a, b) => a[1] - b[1]);
    torchLights.forEach((l, i) => {
      const it = near[i];
      if (it && it[1] < 200) { l.position.copy(it[0]); l.intensity = 5 + Math.sin(t * 11 + it[0].x * 3) * 0.8; } else l.intensity = 0;
    });
    const hot = [...G.fire.map((f) => [f.x, f.y, 0xff9a3a, 4]), ...G.fx.filter((f) => f.type === 'flash').map((f) => [f.x, f.y, 0xffd07a, 10 * f.t / f.T]),
      ...(G.portal ? [[G.portal.x, G.portal.y, 0xb37cff, 5]] : [])];
    if (level.torchBills) for (const tb of level.torchBills) face(tb);
    const nearLava = (level.lava || []).map((v) => [v, v.distanceToSquared(pv)]).sort((a, b) => a[1] - b[1]);
    lavaLights.forEach((l, i) => { const it = nearLava[i]; if (it && it[1] < 250) { l.position.copy(it[0]); l.intensity = 4 + Math.sin(t * 2 + i) * 0.8; } else l.intensity = 0; });
    fxLights.forEach((l, i) => { const h = hot[i]; if (h) { l.position.set(W2(h[0]), 0.9, W2(h[1])); l.color.setHex(h[2]); l.intensity = h[3]; } else l.intensity = 0; });

    // --- caméra ---
    camT.set(W2(G.cam.x), 0, W2(G.cam.y) + 0.4);
    const sh = G.shake * 0.012;
    const PITCH = PIX() ? PITCH_PIX : PITCH_CEL;
    camera.position.set(camT.x + (Math.random() - 0.5) * sh, camT.y + Math.sin(PITCH) * camDist, camT.z + Math.cos(PITCH) * camDist + (Math.random() - 0.5) * sh);
    camera.lookAt(camT);
    renderer.render(scene, camera);
  }

  // position à l'écran (pixels CSS) d'un point du jeu à une hauteur donnée (en cases)
  function project(x, y, h = 0) {
    tmpV.set(W2(x), h, W2(y)).project(camera);
    return [(tmpV.x + 1) / 2 * window.innerWidth, (1 - tmpV.y) / 2 * window.innerHeight, tmpV.z < 1];
  }
  function enable(on) {
    enabled = on;
    canvas.style.display = on ? 'block' : 'none';
    if (on) { resize(); clock.last = performance.now(); }
  }
  return { render, project, enable, setStyle, get enabled() { return enabled; } };
}
