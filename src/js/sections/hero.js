import { reducedMotion, isMobile } from '../core/env.js';
import { animate, animateAll, curve } from '../core/anim.js';
import { track } from '../core/scroll.js';

/*
  Hero: the two words "Just" and "join." come in from the left and right
  and meet, like the two halves of the mark. Behind them, the city of
  hexes builds up.
*/

// labels on busy hexes (preferred position on screen, -1 … 1)
const LABELS = [
  { text: 'having coffee', count: 3, x: -0.18, y: 0.62 },
  { text: 'playing football', count: 6, x: 0.5, y: 0.5 },
  { text: 'studying together', count: 4, x: -0.62, y: 0.3 },
  { text: 'out for a walk', count: 2, x: 0.22, y: 0.18 },
];

export function initHero({ city }) {
  const section = document.querySelector('[data-hero]');
  const a = section.querySelector('[data-mast-a]');
  const b = section.querySelector('[data-mast-b]');
  const mast = section.querySelector('.mast');
  const foot = section.querySelector('.hero__foot');
  const lede = section.querySelector('[data-hero-lede]');
  const actions = section.querySelectorAll('[data-hero-actions] > *');
  const cue = section.querySelector('[data-hero-cue]');
  const nav = document.querySelector('[data-nav]');

  city?.setupLabels(LABELS);

  if (reducedMotion) {
    if (city) city.state.intro = 1;
    return { intro: () => city?.renderOnce() };
  }

  // initial state before the intro
  [lede, cue, ...actions].forEach((el) => { el.style.opacity = '0'; });
  a.style.opacity = '0';
  b.style.opacity = '0';
  // separate "translate" property, so the later show/hide (transform) stays free
  nav.style.translate = '0 -110%';

  const intro = () => {
    city?.intro(2800);
    const dist = isMobile() ? 60 : 42;
    animate(a, [
      { opacity: 0, transform: `translateX(${-dist}vw) skewX(14deg)` },
      { opacity: 1, offset: 0.25 },
      { opacity: 1, transform: 'translateX(0) skewX(0deg)' },
    ], { duration: 1700, easing: curve.outExpo, delay: 120 });
    animate(b, [
      { opacity: 0, transform: `translateX(${dist}vw) skewX(14deg)` },
      { opacity: 1, offset: 0.25 },
      { opacity: 1, transform: 'translateX(0) skewX(0deg)' },
    ], { duration: 1700, easing: curve.outExpo, delay: 120 });
    animate(lede, [{ opacity: 0, transform: 'translateY(28px)' }, { opacity: 1, transform: 'none' }], { duration: 1300, delay: 900 });
    animateAll(actions, [{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'none' }], { duration: 1200, delay: 1050 }, 90);
    animate(nav, [{ translate: '0 -110%' }, { translate: '0 0' }], { duration: 1300, delay: 1000 });
    animate(cue, [{ opacity: 0 }, { opacity: 1 }], { duration: 1200, delay: 1800, easing: 'linear' });
  };

  // on scroll: the type drifts away more slowly and the camera tilts up
  track(section, {
    start: 'top top',
    end: 'bottom top',
    onUpdate: (p) => {
      mast.style.transform = `translate3d(0, ${(-p * 18).toFixed(2)}%, 0)`;
      mast.style.opacity = String(1 - p * 0.9);
      foot.style.transform = `translate3d(0, ${(-p * 60).toFixed(1)}px, 0)`;
      foot.style.opacity = String(Math.max(0, 1 - p * 1.6));
      cue.style.visibility = p > 0.1 ? 'hidden' : '';
      if (city) city.state.scroll = p;
    },
  });

  return { intro };
}
