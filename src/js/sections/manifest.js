import { reducedMotion, clamp } from '../core/env.js';
import { splitWords } from '../core/split.js';
import { track } from '../core/scroll.js';

/*
  Manifest: as you read, the words light up one after another, like
  lights in the city. Whoever scrolls sets the pace.
*/
export function initManifest() {
  const text = document.querySelector('[data-manifest]');
  if (!text || reducedMotion) return;
  const words = splitWords(text, 'w');
  const n = words.length;
  const state = new Float32Array(n).fill(-1);
  track(text, {
    start: 'top 82%',
    end: 'bottom 48%',
    onUpdate: (p) => {
      const head = p * (n + 6);
      for (let i = 0; i < n; i++) {
        const v = clamp((head - i) / 6);
        if (Math.abs(v - state[i]) < 0.01) continue;
        state[i] = v;
        words[i].style.opacity = (0.16 + 0.84 * v).toFixed(3);
      }
    },
  });
}
