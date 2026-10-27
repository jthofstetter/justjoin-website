import { reducedMotion, wait } from '../core/env.js';
import { animate, curve } from '../core/anim.js';

/*
  Loading screen: the two halves of the JJ mark come together while
  the fonts and the city load. Then the curtain lifts.
*/

// ease an element to a new value without leaving old animations behind
function glide(el, transform, duration) {
  if (el._a) {
    try { el._a.commitStyles(); } catch (e) { /* not rendered yet */ }
    el._a.cancel();
  }
  el._a = el.animate([{ transform }], { duration, easing: curve.outExpo, fill: 'forwards' });
}

export function createLoader() {
  const el = document.querySelector('[data-loader]');
  if (!el) return { setProgress() {}, finish: async () => {} };
  const left = el.querySelector('[data-loader-left]');
  const right = el.querySelector('[data-loader-right]');
  const bar = el.querySelector('[data-loader-bar]');
  const label = el.querySelector('[data-loader-label]');

  if (reducedMotion) {
    el.classList.add('is-joined');
    return {
      setProgress() {},
      async finish() {
        el.classList.add('is-done');
        await wait(300);
        el.hidden = true;
      },
    };
  }

  let progress = 0;
  const place = (p, dur = 700) => {
    const gap = 46 * (1 - p);
    glide(left, `translateX(${-gap}%)`, dur);
    glide(right, `translateX(${gap}%)`, dur);
    glide(bar, `scaleX(${p})`, dur);
  };
  left.style.transform = 'translateX(-46%)';
  right.style.transform = 'translateX(46%)';
  bar.style.transform = 'scaleX(0)';
  animate(el.querySelector('.loader__mark'), [{ opacity: 0, filter: 'blur(10px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 1000 });
  requestAnimationFrame(() => place(0.14, 1000));

  return {
    setProgress(p) {
      progress = Math.max(progress, p);
      place(progress);
    },
    async finish() {
      place(1, 600);
      await wait(480);
      label.textContent = 'Ready';
      el.classList.add('is-joined');
      await wait(380);
      animate(el.querySelector('.loader__center'), [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-36px)', opacity: 0 }], { duration: 600, easing: curve.inQuart, commit: false });
      const a = animate(el, [{ clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 100% 0%)' }], { duration: 1050, easing: curve.inOutExpo, delay: 250, commit: false });
      await a?.finished;
      el.hidden = true;
    },
  };
}
