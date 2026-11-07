// =====================================================================
// CONSTRUCTION DU DÉCOR 3D à partir des données du niveau (level.js)
// - sol, murs et plafond suivent les contours « lissés » des salles (marching squares),
// - les grottes ont des parois bosselées,
// - le décor (piliers, torches, rochers, plantes…) est dupliqué en « instances » par morceaux
//   de carte, pour que la carte graphique ne dessine que ce qui est devant la caméra.
// =====================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene as piece, A } from './assets.js';
import { fbm, noise2 } from './util.js';

const CHUNK = 16;
let baked = null; // textures photographiées une fois (sol et mur du château)

// photographie une pièce 3D (vue de dessus ou de face) pour en faire une texture
function bake(renderer, src, size, front) {
  const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: 4 });
  const sc = new THREE.Scene(), obj = src.clone(true); sc.add(obj);
  sc.add(new THREE.HemisphereLight(0xffffff, 0xc0b0a0, 3.2));
  const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(-0.6, 1, front ? 1 : -0.4); sc.add(dl);
  obj.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(obj), c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
  let cam;
  if (front) { cam = new THREE.OrthographicCamera(-s.x / 2, s.x / 2, s.y / 2, -s.y / 2, 0.01, 50); cam.position.set(c.x, c.y, bb.max.z + 5); cam.lookAt(c.x, c.y, c.z); }
  else { cam = new THREE.OrthographicCamera(-s.x / 2, s.x / 2, s.z / 2, -s.z / 2, 0.01, 50); cam.up.set(0, 0, -1); cam.position.set(c.x, bb.max.y + 5, c.z); cam.lookAt(c.x, c.y, c.z); }
  const old = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(), tm = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(sc, cam); renderer.setRenderTarget(old);
  renderer.setClearColor(cc, ca); renderer.toneMapping = tm;
  return rt.texture;
}
function textures(renderer) {
  if (baked) return baked;
  const rockMap = (() => { let m = null; piece('nature', 'Rock_Medium_1').traverse((o) => { if (o.isMesh && o.material.map && !m) m = o.material.map; }); return m; })();
  const rock = rockMap.clone(); rock.wrapS = rock.wrapT = THREE.RepeatWrapping; rock.needsUpdate = true;
  baked = { floor: bake(renderer, piece('hall', 'floor'), 512, false), wall: bake(renderer, piece('hall', 'wall'), 512, true), rock };
  return baked;
}

// matériaux par ambiance : couleurs franches façon jeu moderne (pas réaliste terne)
function materials(theme, T) {
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, side: THREE.DoubleSide, ...o });
  if (theme === 'cave') return {
    floor: M({ map: T.rock, color: 0x8a7a96 }),
    wall: M({ map: T.rock, color: 0x7a6e94 }),
    ceil: M({ map: T.rock, color: 0x4a4060 }),
  };
  if (theme === 'ruins') return {
    floor: M({ map: T.floor, color: 0xa8b090 }),
    wall: M({ map: T.wall, color: 0xb0b498 }),
    ceil: M({ map: T.floor, color: 0x5a5a48 }),
  };
  return {
    floor: M({ map: T.floor, color: 0xc8b8b0 }),
    wall: M({ map: T.wall, color: 0xc0b0b8 }),
    ceil: M({ map: T.floor, color: 0x6a5a62 }),
  };
}

// ---------------------------------------------------------------
// Sol / plafond / murs par « marching squares »
// ---------------------------------------------------------------
function buildShell(L, group, mats) {
  const { W, H, grid, height, ceil, theme } = L;
  const cave = theme === 'cave';
  const bins = new Map();
  const bin = (x, z, kind) => {
    const key = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK) + ',' + kind;
    let b = bins.get(key); if (!b) { b = { kind, pos: [], uv: [] }; bins.set(key, b); } return b;
  };
  const inside = (i, j) => i >= 0 && j >= 0 && i < W && j < H && grid[j * W + i] === 1;
  const hOf = (i, j) => height[j * W + i], cOf = (i, j) => ceil[j * W + i];
  // déformation des parois de grotte (même valeur pour un même point : pas de fissure entre morceaux)
  const caveOff = (x, y, z) => cave ? [(fbm(x * 0.35 + y * 0.2, z * 0.35, 21) - 0.5) * 1.3, (fbm(x * 0.35, z * 0.35 - y * 0.2, 37) - 0.5) * 1.3] : [0, 0];
  const ceilOff = (x, z) => cave ? (fbm(x * 0.3, z * 0.3, 41) - 0.5) * 2.2 : 0;
  const pushTri = (b, a, c, d, uvs) => { b.pos.push(...a, ...c, ...d); b.uv.push(...uvs); };
  const fuv = cave ? 0.25 : 0.5;

  for (let j = -1; j < H; j++) for (let i = -1; i < W; i++) {
    const a = inside(i, j), b = inside(i + 1, j), c = inside(i + 1, j + 1), d = inside(i, j + 1);
    const n = a + b + c + d;
    if (n === 0) continue;
    // coins (centres des cases) et milieux des arêtes
    const P = {
      a: [i + 0.5, j + 0.5, a ? [i, j] : null], b: [i + 1.5, j + 0.5, b ? [i + 1, j] : null],
      c: [i + 1.5, j + 1.5, c ? [i + 1, j + 1] : null], d: [i + 0.5, j + 1.5, d ? [i, j + 1] : null],
    };
    const mid = (p, q) => [(P[p][0] + P[q][0]) / 2, (P[p][1] + P[q][1]) / 2, P[p][2] || P[q][2]];
    const order = [['a'], ['a', 'b'], ['b'], ['b', 'c'], ['c'], ['c', 'd'], ['d'], ['d', 'a']];
    const poly = [];
    for (const o of order) {
      if (o.length === 1) { if (P[o[0]][2]) poly.push(P[o[0]]); }
      else if (!!P[o[0]][2] !== !!P[o[1]][2]) poly.push(mid(o[0], o[1]));
    }
    // sol et plafond (éventail de triangles)
    const cx = i + 1, cz = j + 1;
    const fb = bin(cx, cz, 'floor'), cb = bin(cx, cz, 'ceil');
    const fy = (p) => hOf(...p[2]), cy = (p) => cOf(...p[2]) + ceilOff(p[0], p[1]);
    for (let k = 1; k < poly.length - 1; k++) {
      const p0 = poly[0], p1 = poly[k], p2 = poly[k + 1];
      pushTri(fb, [p0[0], fy(p0), p0[1]], [p2[0], fy(p2), p2[1]], [p1[0], fy(p1), p1[1]], [p0[0] * fuv, p0[1] * fuv, p2[0] * fuv, p2[1] * fuv, p1[0] * fuv, p1[1] * fuv]);
      pushTri(cb, [p0[0], cy(p0), p0[1]], [p1[0], cy(p1), p1[1]], [p2[0], cy(p2), p2[1]], [p0[0] * fuv, p0[1] * fuv, p1[0] * fuv, p1[1] * fuv, p2[0] * fuv, p2[1] * fuv]);
    }
    if (n === 4) continue;
    // murs : segments entre les milieux d'arêtes traversées
    const E = { t: ['a', 'b'], r: ['b', 'c'], btm: ['c', 'd'], l: ['d', 'a'] };
    const cross = (e) => !!P[E[e][0]][2] !== !!P[E[e][1]][2];
    let segs = [];
    const xs = ['t', 'r', 'btm', 'l'].filter(cross);
    if (xs.length === 2) segs = [xs];
    else if (xs.length === 4) segs = a && c ? [['t', 'r'], ['btm', 'l']] : [['l', 't'], ['r', 'btm']];
    for (const [e1, e2] of segs) {
      const m1 = mid(...E[e1]), m2 = mid(...E[e2]);
      // le mur doit faire face à l'intérieur : on oriente le segment
      const inPt = [a, b, c, d].map((v, q) => (v ? ['a', 'b', 'c', 'd'][q] : null)).filter(Boolean).map((q) => P[q]);
      const ix = inPt.reduce((s, p) => s + p[0], 0) / inPt.length, iz = inPt.reduce((s, p) => s + p[1], 0) / inPt.length;
      let p1 = m1, p2 = m2;
      const dx = p2[0] - p1[0], dz = p2[1] - p1[1];
      if ((ix - p1[0]) * dz - (iz - p1[1]) * dx > 0) { p1 = m2; p2 = m1; }
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const ux = (p2[0] - p1[0]) / len, uz = (p2[1] - p1[1]) / len;
      const u1 = (p1[0] * ux + p1[1] * uz) * 0.5, u2 = u1 + len * 0.5;
      const b1 = hOf(...p1[2]) - 0.6, b2 = hOf(...p2[2]) - 0.6, t1 = cOf(...p1[2]) + ceilOff(p1[0], p1[1]) + 0.3, t2 = cOf(...p2[2]) + ceilOff(p2[0], p2[1]) + 0.3;
      const wb = bin(cx, cz, 'wall');
      const rows = cave ? 6 : 1;
      for (let r = 0; r < rows; r++) {
        const ta = r / rows, tb = (r + 1) / rows;
        const ya1 = b1 + (t1 - b1) * ta, yb1 = b1 + (t1 - b1) * tb, ya2 = b2 + (t2 - b2) * ta, yb2 = b2 + (t2 - b2) * tb;
        const V = (x, y, z) => { const o = caveOff(x, y, z); return [x + o[0], y, z + o[1]]; };
        const A1 = V(p1[0], ya1, p1[1]), B1 = V(p1[0], yb1, p1[1]), A2 = V(p2[0], ya2, p2[1]), B2 = V(p2[0], yb2, p2[1]);
        const vs = cave ? 0.25 : 0.5;
        pushTri(wb, A1, B1, A2, [u1, ya1 * vs, u1, yb1 * vs, u2, ya2 * vs]);
        pushTri(wb, A2, B1, B2, [u2, ya2 * vs, u1, yb1 * vs, u2, yb2 * vs]);
      }
    }
  }
  for (const b of bins.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mats[b.kind]);
    group.add(m);
  }
}

// ---------------------------------------------------------------
// Décor : chaque type d'objet est « instancié » par morceau de carte
// ---------------------------------------------------------------
function crystalGeo() {
  const parts = [];
  const g0 = new THREE.OctahedronGeometry(0.5, 0); g0.scale(0.35, 1.6, 0.35); g0.translate(0, 0.7, 0);
  for (const [x, z, s, rx, rz] of [[0, 0, 1, 0, 0], [0.25, 0.1, 0.6, 0, -0.5], [-0.2, 0.15, 0.7, 0.3, 0.45], [0.05, -0.25, 0.5, -0.5, 0.1]]) {
    const g = g0.clone(); g.scale(s, s, s); g.rotateX(rx); g.rotateZ(rz); g.translate(x, 0, z); parts.push(g);
  }
  return mergeGeometries(parts);
}
function rockSpike(down) {
  const g = new THREE.ConeGeometry(0.45, 2.2, 7, 4); g.translate(0, 1.1, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + (noise2(x * 3 + y, z * 3, 5) - 0.5) * 0.6; p.setXYZ(i, x * k, y, z * k); }
  if (down) g.rotateX(Math.PI);
  g.computeVertexNormals(); return g;
}

export function buildWorld(renderer, scene3, L) {
  const group = new THREE.Group();
  const T = textures(renderer);
  const mats = materials(L.theme, T);
  buildShell(L, group, mats);

  // --- regroupement des objets par type et par morceau ---
  const byKind = new Map();
  const add = (kind, M, extra) => { let a = byKind.get(kind); if (!a) { a = []; byKind.set(kind, a); } a.push({ M, ...extra }); };
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const mat = (x, y, z, ry, s, sy = s) => new THREE.Matrix4().compose(v.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), sc.set(s, sy, s));
  const flames = [];
  const R2 = (n) => ((Math.sin(n * 91.7) * 43758.5) % 1 + 1) % 1;
  for (const p of L.props) {
    const k = p.kind;
    const h = R2(p.x * 13 + p.z * 7);
    switch (k) {
      case 'torch': add('torch', mat(p.x, p.y - 0.4, p.z, p.rot + Math.PI, 0.9)); flames.push([p.x, p.y + 0.42, p.z, 1]); break;
      case 'pillar': add('column', mat(p.x, p.y - 0.3, p.z, 0, 0.62, (p.top - p.y + 0.6) / 4.07)); break;
      case 'brazier': add('fire', mat(p.x, p.y, p.z, p.rot, 0.8)); add('stones', mat(p.x, p.y, p.z, p.rot, 1)); flames.push([p.x, p.y + 0.45, p.z, 2.6]); break;
      case 'crate': add('crate', mat(p.x, p.y, p.z, p.rot, 0.55 * p.s)); break;
      case 'barrel': add('barrel', mat(p.x, p.y, p.z, p.rot, 0.6)); break;
      case 'vase': add('vase', mat(p.x, p.y, p.z, p.rot, 0.55 * p.s)); break;
      case 'banner': add('banner', mat(p.x, p.y, p.z, p.rot + Math.PI, 0.75)); break;
      case 'cobweb': add('cobweb', mat(p.x, p.y, p.z, p.rot + Math.PI * 0.75, 1.3)); break;
      case 'statue': add('statue', mat(p.x, p.y, p.z, p.rot, 0.42)); add('pedestal', mat(p.x, p.y - 1.6, p.z, 0, 0.8)); break;
      case 'table': add('table', mat(p.x, p.y, p.z, p.rot, 0.75)); break;
      case 'chair': add('chair', mat(p.x, p.y, p.z, p.rot, 0.75)); break;
      case 'rubble': case 'bricks': add('bricks', mat(p.x, p.y, p.z, p.rot, 0.7 * p.s)); break;
      case 'rock': add('rock' + (1 + Math.floor(h * 3)), mat(p.x, p.y - 0.2, p.z, p.rot, 0.55 * p.s)); break;
      case 'pebble': add(h < 0.5 ? 'pebble1' : 'pebble2', mat(p.x, p.y, p.z, p.rot, 0.6 * p.s)); break;
      case 'mushroom': add(p.glow ? 'mushglow' : 'mush', mat(p.x, p.y, p.z, p.rot, 0.6 * p.s)); break;
      case 'fern': add('fern', mat(p.x, p.y, p.z, p.rot, 0.7 * p.s)); break;
      case 'bush': add('bush', mat(p.x, p.y, p.z, p.rot, 0.45 * p.s)); break;
      case 'grass': add('grass', mat(p.x, p.y, p.z, p.rot, 0.8 * p.s)); break;
      case 'plant': add('plant', mat(p.x, p.y, p.z, p.rot, 0.7 * p.s)); break;
      case 'flowers': add('flowers', mat(p.x, p.y, p.z, p.rot, 0.8 * p.s)); break;
      case 'clover': add('clover', mat(p.x, p.y, p.z, p.rot, 0.8 * p.s)); break;
      case 'deadtree': add('deadtree', mat(p.x, p.y - 0.2, p.z, p.rot, 0.45 * p.s)); break;
      case 'crystal': add('crystal', mat(p.x, p.y - 0.1, p.z, p.rot, 0.9 * p.s), { col: p.col }); break;
      case 'stalagmite': add('stalagmite', mat(p.x, p.y - 0.2, p.z, p.rot, 0.9 * p.s, 1.2 * p.s)); break;
      case 'stalactite': add('stalactite', mat(p.x, p.y + 0.3, p.z, p.rot, 0.7 * p.s, p.s)); break;
      case 'chest': break; // les coffres sont des objets interactifs (game.js)
    }
  }
  const SRC = {
    torch: () => piece('hall', 'torch'), column: () => piece('hall', 'column'), fire: () => piece('hall', 'fire'), crate: () => piece('hall', 'crate'), barrel: () => piece('hall', 'barrel'),
    vase: () => piece('hall', 'vase'), banner: () => piece('hall', 'banner'), cobweb: () => piece('hall', 'cobweb'), statue: () => piece('hall', 'statue'), pedestal: () => piece('hall', 'pedestal'),
    table: () => piece('hall', 'table'), chair: () => piece('hall', 'chair'), bricks: () => piece('hall', 'bricks'), stones: () => piece('nature', 'RockPath_Round_Small_1') || piece('nature', 'Pebble_Round_3'),
    rock1: () => piece('nature', 'Rock_Medium_1'), rock2: () => piece('nature', 'Rock_Medium_2'), rock3: () => piece('nature', 'Rock_Medium_3'),
    pebble1: () => piece('nature', 'Pebble_Round_1'), pebble2: () => piece('nature', 'Pebble_Square_2'),
    mush: () => piece('nature', 'Mushroom_Common'), mushglow: () => piece('nature', 'Mushroom_Common'),
    fern: () => piece('nature', 'Fern_1'), bush: () => piece('nature', 'Bush_Common'), grass: () => piece('nature', 'Grass_Wispy_Tall'), plant: () => piece('nature', 'Plant_7_Big'),
    flowers: () => piece('nature', 'Flower_3_Group'), clover: () => piece('nature', 'Clover_1'), deadtree: () => piece('nature', 'DeadTree_1'),
  };
  const procedural = { crystal: crystalGeo(), stalagmite: rockSpike(false), stalactite: rockSpike(true) };
  for (const [kind, items] of byKind) {
    // regroupement par morceau de carte
    const chunks = new Map();
    for (const it of items) { v.setFromMatrixPosition(it.M); const key = Math.floor(v.x / CHUNK) + ',' + Math.floor(v.z / CHUNK); (chunks.get(key) || chunks.set(key, []).get(key)).push(it); }
    let meshes = [];
    if (procedural[kind]) {
      const m = kind === 'crystal'
        ? new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.88 })
        : new THREE.MeshStandardMaterial({ map: T.rock, color: L.theme === 'cave' ? 0x7a6e94 : 0x8a8a7a, roughness: 0.95 });
      meshes = [[procedural[kind], m, new THREE.Matrix4()]];
    } else {
      const src = SRC[kind] && SRC[kind](); if (!src) continue;
      src.updateMatrixWorld(true);
      src.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material.clone();
        if (kind === 'mushglow') { m.emissive = new THREE.Color(0xb060ff); m.emissiveIntensity = 0.9; }
        if (kind === 'fire') { m.emissive = new THREE.Color(0xff6a1a); m.emissiveIntensity = 0.5; }
        if (L.theme === 'ruins' && /column|bricks|statue|pedestal/.test(kind)) m.color.multiply(new THREE.Color(0xc8d0b0));
        meshes.push([o.geometry, m, o.matrixWorld.clone()]);
      });
    }
    for (const part of chunks.values()) {
      for (const [geo, m, local] of meshes) {
        const im = new THREE.InstancedMesh(geo, m, part.length);
        part.forEach((it, i) => { im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(it.M, local)); if (it.col !== undefined) im.setColorAt(i, new THREE.Color(it.col)); });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        group.add(im);
      }
    }
  }

  // --- flammes (petits halos lumineux qui dansent) ---
  const flameTex = glowTexture('#ffd27a', '#ff5a10');
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(flames.flatMap((f) => [f[0], f[1], f[2]]), 3));
  fg.setAttribute('size', new THREE.Float32BufferAttribute(flames.map((f) => f[3]), 1));
  const flameMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: flameTex }, t: { value: 0 }, scale: { value: 300 } },
    vertexShader: `attribute float size; uniform float t; uniform float scale; varying float vf;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); float f = 0.85 + 0.15 * sin(t * 13.0 + position.x * 7.0) * sin(t * 7.3 + position.z * 5.0);
        vf = f; gl_PointSize = size * 0.55 * f * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying float vf; void main() { vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(c.rgb * (0.8 + 0.4 * vf), c.a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const flamePts = new THREE.Points(fg, flameMat); flamePts.frustumCulled = false; group.add(flamePts);

  // --- portail vers l'étage suivant ---
  let portal = null;
  if (L.portal) {
    portal = new THREE.Group();
    portal.position.set(L.portal.x, L.portal.y, L.portal.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.16, 12, 48), new THREE.MeshStandardMaterial({ color: 0x6a5a7a, roughness: 0.6, metalness: 0.4 }));
    ring.position.y = 1.9; portal.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 } }, transparent: true, side: THREE.DoubleSide, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float t;
        void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
          float s = sin(a * 5.0 + r * 9.0 - t * 3.0) * 0.5 + 0.5; float core = 1.0 - smoothstep(0.0, 1.0, r);
          vec3 c = mix(vec3(0.35, 0.1, 0.8), vec3(0.75, 0.5, 1.0), s) + core * vec3(0.6, 0.5, 1.0) * 0.8;
          gl_FragColor = vec4(c, (1.0 - smoothstep(0.85, 1.0, r)) * 0.92); }`,
    }));
    disc.position.y = 1.9; portal.add(disc);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.3, 24), new THREE.MeshStandardMaterial({ color: 0x5a4a5a, roughness: 0.9 }));
    base.position.y = 0.05; portal.add(base);
    // le portail se tourne vers le centre de la salle d'où l'on vient (vers le début du donjon)
    portal.rotation.y = Math.atan2(L.spawn.x - L.portal.x, L.spawn.z - L.portal.z);
    portal.userData = { disc, ring };
    group.add(portal);
  }

  scene3.add(group);

  // --- réserve de lumières : les 10 sources les plus proches du joueur s'allument ---
  const pool = [];
  for (let i = 0; i < 10; i++) { const l = new THREE.PointLight(0xffaa66, 0, 16, 1.3); scene3.add(l); pool.push(l); }
  let time = 0, sortT = 0, near = [];
  function update(dt, px, pz) {
    time += dt;
    flameMat.uniforms.t.value = time;
    if (portal) { portal.userData.disc.material.uniforms.t.value = time; }
    sortT -= dt;
    if (sortT <= 0) {
      sortT = 0.25;
      near = L.lights.map((l) => [l, (l.x - px) ** 2 + (l.z - pz) ** 2]).filter((a) => a[1] < 30 * 30).sort((a, b) => a[1] - b[1]).slice(0, pool.length).map((a) => a[0]);
    }
    pool.forEach((pl, i) => {
      const l = near[i];
      if (!l) { pl.intensity = 0; return; }
      pl.position.set(l.x, l.y, l.z); pl.color.setHex(l.col);
      const flick = l.kind === 'torch' || l.kind === 'fire' ? 0.85 + 0.15 * Math.sin(time * 11 + l.x * 3) * Math.sin(time * 7.7 + l.z) : l.kind === 'portal' ? 0.8 + 0.2 * Math.sin(time * 2) : 1;
      pl.intensity = l.i * 4.5 * flick; pl.distance = l.kind === 'portal' ? 18 : 15;
    });
  }
  function dispose() {
    scene3.remove(group); pool.forEach((l) => scene3.remove(l));
    group.traverse((o) => { if (o.isMesh || o.isPoints) { if (!o.isInstancedMesh || procedural) o.geometry && o.geometry.dispose && o.isMesh && !o.isInstancedMesh && o.geometry.dispose(); } });
  }
  return { group, update, dispose, portal };
}

export function glowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, inner); g.addColorStop(0.6, outer + '88'); g.addColorStop(1, outer + '00');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
