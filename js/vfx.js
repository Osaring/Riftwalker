// =====================================================================
// EFFETS VISUELS DE COMBAT
// - ondes de choc (anneaux qui s'élargissent au sol) ;
// - taches de sang au sol qui s'estompent ;
// - flaques de feu ;
// - éclair de lumière des sorts (une seule lumière réutilisée : en ajouter/retirer
//   obligerait l'iPhone à tout recalculer, d'où des saccades) ;
// - indicateurs de visée (flèche, cône, cercle) quand on vise une compétence.
// =====================================================================
import * as THREE from 'three';

const canvasTex = (size, draw) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
// tache de sang : une grosse goutte + éclaboussures
const bloodTex = canvasTex(128, (x, n) => {
  x.fillStyle = '#fff';
  const blob = (cx, cy, r) => { x.beginPath(); for (let a = 0; a <= 6.3; a += 0.3) { const rr = r * (0.75 + Math.random() * 0.4); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.fill(); };
  blob(64, 64, 26);
  for (let i = 0; i < 14; i++) { const a = Math.random() * 6.3, d = 28 + Math.random() * 30; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + Math.random() * 6); }
});
// anneau d'onde de choc : bord net et lumineux, intérieur qui s'efface
const ringTex = canvasTex(128, (x, n) => {
  const g = x.createRadialGradient(64, 64, 20, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.15)'); g.addColorStop(0.9, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, n, n);
});
// lueur ronde (feu au sol, zone d'impact)
const glowTex = canvasTex(64, (x, n) => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, n, n);
});
// flèche de visée : bande dégradée avec pointe
const arrowTex = canvasTex(128, (x, n) => {
  const g = x.createLinearGradient(0, n, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0.55)');
  x.fillStyle = g; x.beginPath(); x.moveTo(40, n); x.lineTo(40, 34); x.lineTo(16, 34); x.lineTo(64, 0); x.lineTo(112, 34); x.lineTo(88, 34); x.lineTo(88, n); x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 3; x.stroke();
});

const flat = (geo) => { geo.rotateX(-Math.PI / 2); return geo; };
const addMat = (tex, color, opacity = 1) => new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });

export function initVFX(scene) {
  const fx = { rings: [], blood: [], fires: [] };
  // --- lumière d'effet (toujours présente, éteinte par défaut) ---
  const light = new THREE.PointLight(0xffaa55, 0, 10, 1.5); scene.add(light);
  let lightT = 0, lightT0 = 1, lightI = 0;
  fx.flash = (x, y, z, color, intensity = 30, dur = 0.35) => { light.position.set(x, y + 1.5, z); light.color.setHex(color); lightI = intensity; lightT = lightT0 = dur; };

  // --- ondes de choc ---
  const ringGeo = flat(new THREE.PlaneGeometry(2, 2));
  for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(ringGeo, addMat(ringTex, 0xffffff)); m.visible = false; m.renderOrder = 3; scene.add(m); fx.rings.push({ m, t: 0, dur: 1 }); }
  fx.shockwave = (x, y, z, radius, color = 0xffc070, dur = 0.45) => {
    const r = fx.rings.find((q) => !q.m.visible) || fx.rings[0];
    r.m.visible = true; r.m.position.set(x, y + 0.08, z); r.m.material.color.setHex(color); r.t = 0; r.dur = dur; r.rad = radius;
  };

  // --- sang au sol ---
  const bloodGeo = flat(new THREE.PlaneGeometry(1, 1));
  for (let i = 0; i < 36; i++) {
    const m = new THREE.Mesh(bloodGeo, new THREE.MeshBasicMaterial({ map: bloodTex, color: 0x5a0606, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    m.visible = false; m.renderOrder = 1; scene.add(m); fx.blood.push({ m, t: 0 });
  }
  let bi = 0;
  fx.bloodDecal = (x, y, z, size = 1, color = 0x5a0606) => {
    const b = fx.blood[bi++ % fx.blood.length];
    b.m.visible = true; b.m.position.set(x + (Math.random() - 0.5) * 0.4, y + 0.03, z + (Math.random() - 0.5) * 0.4);
    b.m.rotation.y = Math.random() * 6.3; b.m.scale.setScalar(size * (0.7 + Math.random() * 0.6)); b.m.material.color.setHex(color); b.t = 0;
  };

  // --- flaques de feu (le jeu gère les dégâts, ici seulement l'apparence) ---
  const fireGeo = flat(new THREE.PlaneGeometry(2, 2));
  fx.firePatch = (x, y, z, r, dur, color = 0xff6a1a) => {
    const m = new THREE.Mesh(fireGeo, addMat(glowTex, color, 0.9)); m.position.set(x, y + 0.06, z); m.scale.setScalar(r); m.renderOrder = 2; scene.add(m);
    const f = { m, x, y, z, r, t: 0, dur, color }; fx.fires.push(f); return f;
  };

  // --- indicateurs de visée ---
  const aim = new THREE.Group(); aim.visible = false; scene.add(aim);
  const rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.35, depthWrite: false }));
  const arrow = new THREE.Mesh(flat(new THREE.PlaneGeometry(1, 1)).rotateY(Math.PI).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ map: arrowTex, color: 0x9ad0ff, transparent: true, depthWrite: false }));
  const spot = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.28, depthWrite: false }));
  const spotEdge = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.85, depthWrite: false }));
  spot.add(spotEdge);
  const cone = new THREE.Mesh(new THREE.CircleGeometry(1, 24, -0.6, 1.2).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.3, depthWrite: false }));
  for (const o of [rangeRing, arrow, spot, cone]) { o.renderOrder = 4; aim.add(o); }
  // type : 'dir' (flèche), 'cone', 'point' (cercle à l'endroit visé) ; cancel = rouge (relâcher annule)
  fx.showAim = (type, x, y, z, ang, dist, range, rad, cancel) => {
    aim.visible = true; aim.position.set(x, y + 0.1, z);
    const col = cancel ? 0xff5a4a : 0x9ad0ff;
    for (const o of [rangeRing, arrow, spot, cone]) o.material.color.setHex(col);
    rangeRing.scale.setScalar(range);
    arrow.visible = type === 'dir'; cone.visible = type === 'cone'; spot.visible = type === 'point';
    arrow.rotation.y = ang; arrow.scale.set(1.1, 1, dist);
    cone.rotation.y = ang; cone.scale.setScalar(range);
    spot.position.set(Math.sin(ang) * dist, 0.02, Math.cos(ang) * dist); spot.scale.setScalar(rad || 2);
  };
  fx.hideAim = () => { aim.visible = false; };

  fx.update = (dt) => {
    if (lightT > 0) { lightT -= dt; light.intensity = lightI * Math.max(0, lightT / lightT0); } else light.intensity = 0;
    for (const r of fx.rings) if (r.m.visible) {
      r.t += dt; const k = r.t / r.dur;
      if (k >= 1) { r.m.visible = false; continue; }
      const e = 1 - Math.pow(1 - k, 3);
      r.m.scale.setScalar(0.2 + r.rad * e); r.m.material.opacity = 1 - k;
    }
    for (const b of fx.blood) if (b.m.visible) {
      b.t += dt;
      b.m.material.opacity = b.t < 0.15 ? b.t / 0.15 * 0.9 : b.t > 9 ? Math.max(0, 0.9 - (b.t - 9) / 2) : 0.9;
      if (b.t > 11) b.m.visible = false;
    }
    for (let i = fx.fires.length - 1; i >= 0; i--) {
      const f = fx.fires[i]; f.t += dt;
      const fl = 0.75 + 0.25 * Math.sin(f.t * 13 + f.x) * Math.sin(f.t * 7.3);
      f.m.material.opacity = Math.min(1, f.t * 4, (f.dur - f.t) * 1.5) * 0.85 * fl;
      if (f.t >= f.dur) { scene.remove(f.m); f.m.material.dispose(); fx.fires.splice(i, 1); }
    }
  };
  fx.clear = () => {
    for (const f of fx.fires) { scene.remove(f.m); f.m.material.dispose(); }
    fx.fires.length = 0;
    for (const b of fx.blood) b.m.visible = false;
    for (const r of fx.rings) r.m.visible = false;
    light.intensity = 0; lightT = 0; aim.visible = false;
  };
  return fx;
}
