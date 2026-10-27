import { reducedMotion } from '../core/env.js';
import { animate, curve } from '../core/anim.js';

/*
  Questions and answers: <details> with a smoothly animated height.
  Each animation is removed when it ends, so the answer keeps its natural
  height (e.g. after the window is resized). Clicking again mid-animation
  reverses from wherever it currently is.
*/
export function initFaq() {
  document.querySelectorAll('[data-faq] details').forEach((d) => {
    const summary = d.querySelector('summary');
    const body = d.querySelector('.qa__a');
    let anim = null;
    let closing = false;

    const run = (frames, duration, easing, done) => {
      anim?.cancel();
      const a = animate(body, frames, { duration, easing, commit: false });
      anim = a;
      if (!a) return done?.();
      a.finished.then(() => {
        if (anim !== a) return;
        done?.();
        a.cancel();
        anim = null;
      }).catch(() => {});
    };

    summary.addEventListener('click', (e) => {
      if (reducedMotion) return;
      e.preventDefault();
      const now = d.open ? body.getBoundingClientRect().height : 0;
      const fade = d.open ? getComputedStyle(body).opacity : '0';
      if (!d.open || closing) {
        closing = false;
        d.open = true;
        run([{ height: `${now}px`, opacity: fade }, { height: `${body.scrollHeight}px`, opacity: 1 }], 650, curve.outExpo);
      } else {
        closing = true;
        run([{ height: `${now}px`, opacity: fade }, { height: '0px', opacity: 0 }], 420, curve.inOutCubic, () => {
          d.open = false;
          closing = false;
        });
      }
    });
  });
}
