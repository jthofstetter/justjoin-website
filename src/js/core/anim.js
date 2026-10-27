import { reducedMotion } from './env.js';

// curves for number tweens (WebGL state, counters)
export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutExpo: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

// the same curves as CSS for the Web Animations API
export const curve = {
  outExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
  inOutExpo: 'cubic-bezier(0.87, 0, 0.13, 1)',
  outQuart: 'cubic-bezier(0.25, 1, 0.5, 1)',
  inQuart: 'cubic-bezier(0.5, 0, 0.75, 0)',
  outBack: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  inOutCubic: 'cubic-bezier(0.65, 0, 0.35, 1)',
};

/* Number tween on requestAnimationFrame. */
export function tween({ from = 0, to = 1, duration = 1000, delay = 0, ease: fn = ease.outExpo, onUpdate, onComplete } = {}) {
  let raf = 0;
  let done = false;
  let resolve;
  const finished = new Promise((r) => { resolve = r; });
  const finish = () => {
    if (done) return;
    done = true;
    onComplete?.();
    resolve();
  };
  if (reducedMotion || duration <= 0) {
    onUpdate?.(to, 1);
    finish();
    return { kill() {}, finished };
  }
  const t0 = performance.now() + delay;
  const step = (now) => {
    if (done) return;
    if (now < t0) {
      raf = requestAnimationFrame(step);
      return;
    }
    const t = Math.min(1, (now - t0) / duration);
    onUpdate?.(from + (to - from) * fn(t), t);
    if (t < 1) raf = requestAnimationFrame(step);
    else finish();
  };
  raf = requestAnimationFrame(step);
  return {
    kill() {
      done = true;
      cancelAnimationFrame(raf);
      resolve();
    },
    finished,
  };
}

/*
  Web Animations API with defaults. When it ends, the final state is
  committed as an inline style and the animation is removed, so later
  style changes are not masked by a "stuck" animation.
*/
export function animate(el, keyframes, opts = {}) {
  if (!el || !el.animate) return null;
  const { commit = true, ...rest } = opts;
  const o = { duration: 900, easing: curve.outExpo, fill: 'both', ...rest };
  if (reducedMotion) {
    o.duration = 0;
    o.delay = 0;
  }
  const a = el.animate(keyframes, o);
  if (commit && o.iterations !== Infinity) {
    a.finished.then(() => {
      try { a.commitStyles(); } catch (e) { /* element not visible */ }
      a.cancel();
    }).catch(() => {});
  }
  return a;
}

export function animateAll(els, keyframes, opts = {}, stagger = 0) {
  return [...els].map((el, i) => animate(el, keyframes, { ...opts, delay: (opts.delay || 0) + i * stagger }));
}
