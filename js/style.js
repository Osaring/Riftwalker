// =====================================================================
// STYLE GRAPHIQUE « ANIMÉ JAPONAIS »
// - cel-shading : la lumière n'est pas un dégradé doux mais 3 aplats nets (ombre / mi-teinte / lumière),
//   comme un dessin colorié à la main ;
// - contours : un fin trait sombre autour des personnages (technique de la « coque inversée ») ;
// - couleurs plus vives (on évite l'effet « film » qui ternit les teintes).
// Le joueur peut revenir au style classique depuis l'écran titre.
// =====================================================================
import * as THREE from 'three';
import { store } from './util.js';

export const STYLE = store.get('rw_style', 'anime');
export const ANIME = STYLE === 'anime';
export function setStyle(s) { store.set('rw_style', s); location.reload(); }

// rampe de lumière en 3 marches (filtre « au plus proche » = marches nettes, sans dégradé)
let ramp = null;
function gradient() {
  if (ramp) return ramp;
  const d = new Uint8Array([105, 105, 105, 255, 185, 185, 185, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
  return ramp;
}

// transforme un matériau « réaliste » en matériau dessin animé (garde texture, couleur, lueur…)
export function toon(m) {
  if (!ANIME || !m || !m.isMeshStandardMaterial) return m;
  const t = new THREE.MeshToonMaterial({
    map: m.map, color: m.color.clone(), emissive: m.emissive.clone(), emissiveIntensity: m.emissiveIntensity, emissiveMap: m.emissiveMap,
    vertexColors: m.vertexColors, side: m.side, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest,
    depthWrite: m.depthWrite, gradientMap: gradient(),
  });
  t.name = m.name;
  // les couleurs « animé » sont un peu plus saturées
  const hsl = {}; t.color.getHSL(hsl); t.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.12), hsl.l);
  return t;
}

// trait de contour : on redessine la pièce en sombre, côté intérieur, légèrement gonflée vers l'écran.
// L'épaisseur est calculée « à l'écran », donc le trait garde la même finesse de près comme de loin.
let outlineMat = null;
export function outlineMaterial() {
  if (outlineMat) return outlineMat;
  outlineMat = new THREE.MeshBasicMaterial({ color: 0x1c1226, side: THREE.BackSide });
  outlineMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float olW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifndef USE_SKINNING
          vec3 objectNormal = vec3(normal);
        #endif
        vec3 olN = normalize(normalMatrix * objectNormal);
        gl_Position.xy += normalize(olN.xy + 1e-5) * olW * gl_Position.w;`);
    sh.uniforms.olW = { value: 0.0042 };
  };
  outlineMat.customProgramCacheKey = () => 'outline';
  return outlineMat;
}
// ajoute le contour d'une pièce de personnage ; renvoie l'objet créé (pour pouvoir le retirer)
export function addOutline(mesh) {
  if (!ANIME) return null;
  let o;
  if (mesh.isSkinnedMesh) {
    o = new THREE.SkinnedMesh(mesh.geometry, outlineMaterial());
    o.bind(mesh.skeleton, mesh.bindMatrix);
    mesh.parent.add(o);
  } else {
    o = new THREE.Mesh(mesh.geometry, outlineMaterial());
    mesh.add(o);
  }
  o.frustumCulled = false; o.userData.outline = true;
  return o;
}
