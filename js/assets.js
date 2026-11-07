// Chargement des modèles 3D (tous gratuits et libres de droits : Quaternius, Kay Lousberg — CC0)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const A = { gear: null, anim: null, hall: null, nature: null, props: null, clips: {}, tex: {} };
const loader = new GLTFLoader();

export async function loadAll(onProgress) {
  const files = ['gear', 'anim', 'hall', 'nature', 'props'];
  let done = 0;
  const res = await Promise.all(files.map((f) => loader.loadAsync(`assets/3d/${f}.glb`).then((g) => { onProgress && onProgress(++done / files.length); return g; })));
  files.forEach((f, i) => { A[f] = res[i]; });
  // Le chargeur renomme les os qui portent le même nom dans plusieurs fichiers (« spine_01_3 »).
  // On leur rend leur vrai nom pour que tenues, cheveux et animations visent les mêmes os.
  const BONES = new Set();
  // référence : la pièce dont les os n'ont pas été renommés (celle qui possède un os appelé exactement « root »)
  const ref = A.gear.scenes.find((s) => { let ok = false; s.traverse((o) => { if (o.isBone && o.name === 'root') ok = true; }); return ok; });
  ref.traverse((o) => { if (o.isBone) BONES.add(o.name); });
  const canon = (n) => { if (BONES.has(n)) return n; const m = n.match(/^(.*)_\d+$/); return m && BONES.has(m[1]) ? m[1] : n; };
  A.gear.scenes.forEach((s) => s.traverse((o) => { if (o.isBone) o.name = canon(o.name); }));
  for (const c of A.anim.animations) {
    c.tracks.forEach((t) => { const i = t.name.lastIndexOf('.'); t.name = canon(t.name.slice(0, i)) + t.name.slice(i); });
    A.clips[c.name] = c;
  }
  // les objets du château qui ne sont pas centrés sur leur origine
  for (const n of ['vase', 'crate', 'barrel', 'statue', 'table', 'pedestal', 'chair']) {
    const s = scene('hall', n); if (!s) continue;
    s.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(s), c = bb.getCenter(new THREE.Vector3());
    for (const ch of s.children) { ch.position.x -= c.x; ch.position.z -= c.z; ch.position.y -= bb.min.y; }
  }
}

export function scene(pack, name) { return A[pack].scenes.find((s) => s.name === name); }

const texLoader = new THREE.TextureLoader();
// textures de couleur des tenues (variantes 2 et 3 du chevalier, du noble, du mage)
export function variantTex(name, like) {
  if (A.tex[name]) return A.tex[name];
  const t = texLoader.load(`assets/tex/${name}.jpg`);
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
  if (like) { t.wrapS = like.wrapS; t.wrapT = like.wrapT; }
  A.tex[name] = t; return t;
}
