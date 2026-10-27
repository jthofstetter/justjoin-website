import { finePointer, reducedMotion, lerp } from '../core/env.js';

/* Buttons lean slightly towards the mouse pointer. */
export function initMagnetic() {
  if (!finePointer || reducedMotion) return;
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    const loop = () => {
      x = lerp(x, tx, 0.18);
      y = lerp(y, ty, 0.18);
      el.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
      if (Math.abs(x - tx) > 0.05 || Math.abs(y - ty) > 0.05) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      tx = (e.clientX - (r.left + r.width / 2)) * 0.25;
      ty = (e.clientY - (r.top + r.height / 2)) * 0.35;
      kick();
    });
    el.addEventListener('pointerleave', () => {
      tx = 0;
      ty = 0;
      kick();
    });
  });
}
