// Commandes tactiles : joystick à gauche, caméra en glissant à droite, boutons d'action.
// (Au clavier pour tester sur ordinateur : ZQSD/WASD, souris, J, K, L, I, Espace, H.)
import { $ } from './util.js';

export const input = { mx: 0, my: 0, camDX: 0, camDY: 0, held: {}, pressed: new Set(), stickActive: false };
export function consume(name) { const had = input.pressed.has(name); input.pressed.delete(name); return had; }

export function setupInput(onAnyTouch) {
  const stickZone = $('stickZone'), base = $('stickBase'), knob = $('stickKnob'), camZone = $('camZone');
  let sid = null, sx = 0, sy = 0;
  const R = 56;
  stickZone.addEventListener('pointerdown', (e) => {
    onAnyTouch && onAnyTouch();
    if (sid !== null) return;
    sid = e.pointerId; sx = e.clientX; sy = e.clientY;
    base.style.left = sx + 'px'; base.style.top = sy + 'px'; base.classList.add('on');
    knob.style.transform = 'translate(-50%,-50%)';
    stickZone.setPointerCapture(e.pointerId); input.stickActive = true; e.preventDefault();
  });
  stickZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== sid) return;
    let dx = e.clientX - sx, dy = e.clientY - sy;
    const l = Math.hypot(dx, dy);
    // le joystick suit le doigt s'il dépasse le bord
    if (l > R) { sx += dx * (1 - R / l); sy += dy * (1 - R / l); base.style.left = sx + 'px'; base.style.top = sy + 'px'; dx = e.clientX - sx; dy = e.clientY - sy; }
    input.mx = dx / R; input.my = -dy / R;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
  const stickEnd = (e) => { if (e.pointerId !== sid) return; sid = null; input.mx = input.my = 0; base.classList.remove('on'); input.stickActive = false; };
  stickZone.addEventListener('pointerup', stickEnd); stickZone.addEventListener('pointercancel', stickEnd);

  // caméra : glisser n'importe où sur la droite (hors boutons)
  let cid = null, cx = 0, cy = 0;
  camZone.addEventListener('pointerdown', (e) => { onAnyTouch && onAnyTouch(); if (cid !== null) return; cid = e.pointerId; cx = e.clientX; cy = e.clientY; camZone.setPointerCapture(e.pointerId); e.preventDefault(); });
  camZone.addEventListener('pointermove', (e) => { if (e.pointerId !== cid) return; input.camDX += e.clientX - cx; input.camDY += e.clientY - cy; cx = e.clientX; cy = e.clientY; });
  const camEnd = (e) => { if (e.pointerId === cid) cid = null; };
  camZone.addEventListener('pointerup', camEnd); camZone.addEventListener('pointercancel', camEnd);

  // boutons : un appui = une action ; garder appuyé est aussi connu (attaque en continu)
  document.querySelectorAll('[data-act]').forEach((b) => {
    const name = b.dataset.act;
    b.addEventListener('pointerdown', (e) => { onAnyTouch && onAnyTouch(); input.pressed.add(name); input.held[name] = true; b.classList.add('pressed'); b.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation(); });
    const up = () => { input.held[name] = false; b.classList.remove('pressed'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  });

  // clavier / souris (tests sur ordinateur)
  const keys = new Set();
  const map = { KeyJ: 'attack', KeyK: 'skill1', KeyL: 'skill2', KeyI: 'skill3', Space: 'roll', KeyH: 'potion' };
  addEventListener('keydown', (e) => {
    if (e.repeat) return; keys.add(e.code);
    if (map[e.code]) { input.pressed.add(map[e.code]); input.held[map[e.code]] = true; }
    if (e.code === 'Escape') input.pressed.add('pause');
    if (e.code === 'Tab' || e.code === 'KeyB') { input.pressed.add('bag'); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => { keys.delete(e.code); if (map[e.code]) input.held[map[e.code]] = false; });
  let kbOn = false;
  const kb = () => {
    if (input.stickActive) return;
    const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') || keys.has('KeyQ') ? 1 : 0);
    const y = (keys.has('KeyW') || keys.has('KeyZ') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    if (x || y) { const l = Math.hypot(x, y); input.mx = x / l; input.my = y / l; kbOn = true; }
    else if (kbOn) { input.mx = input.my = 0; kbOn = false; }
  };
  setInterval(kb, 16);
  let md = false, lx = 0, ly = 0;
  addEventListener('mousedown', (e) => { if (e.target.closest('[data-act], button, .screen')) return; md = true; lx = e.clientX; ly = e.clientY; });
  addEventListener('mouseup', () => { md = false; });
  addEventListener('mousemove', (e) => { if (!md) return; input.camDX += e.clientX - lx; input.camDY += e.clientY - ly; lx = e.clientX; ly = e.clientY; });
}
