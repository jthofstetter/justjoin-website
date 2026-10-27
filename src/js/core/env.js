// environment and device capabilities in one place

const mq = (q) => window.matchMedia(q);

export const reducedMotion = mq('(prefers-reduced-motion: reduce)').matches;
export const finePointer = mq('(hover: hover) and (pointer: fine)').matches;
export const isMobile = () => mq('(max-width: 900px)').matches;

export function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) {
    return false;
  }
}

// rough guess of how much graphics work the device can handle
export function cityQuality() {
  const cores = navigator.hardwareConcurrency || 8;
  const mem = navigator.deviceMemory || 8;
  if (isMobile() || cores <= 4 || mem <= 4) return 'low';
  return 'high';
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const mapRange = (v, a, b, c = 0, d = 1) => c + (d - c) * clamp((v - a) / (b - a));
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// small, repeatable randomness (same result on every load)
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
