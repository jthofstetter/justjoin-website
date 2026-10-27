import { reducedMotion } from '../core/env.js';
import { animate, animateAll, curve, tween } from '../core/anim.js';
import { track, inView } from '../core/scroll.js';

/*
  "How it works": the section stays put (position: sticky) while you
  scroll through four steps. The phone shows the matching app screen
  for each step and plays a short scene, e.g. joining.
*/

// small timeline that can be cancelled completely when the screen changes
function scheduler() {
  const timers = [];
  const tweens = [];
  return {
    at(ms, fn) { timers.push(setTimeout(fn, reducedMotion ? 0 : ms)); },
    tween(o) { const t = tween(o); tweens.push(t); return t; },
    cancel() {
      timers.forEach(clearTimeout);
      tweens.forEach((t) => t.kill());
    },
  };
}

const players = [
  // 1 Discover: the radius is set, cards come in
  (el) => {
    const s = scheduler();
    const knob = el.querySelector('[data-range-knob]');
    const fill = el.querySelector('[data-range-fill]');
    const km = el.querySelector('[data-range-km]');
    const rise = el.querySelectorAll('[data-rise]');
    const setRange = (v) => {
      const pct = 8 + (v / 25) * 92;
      knob.style.left = `${pct}%`;
      fill.style.width = `${pct}%`;
      km.textContent = String(Math.round(v));
    };
    setRange(2);
    animateAll(rise, [{ opacity: 0, transform: 'translateY(14%)' }, { opacity: 1, transform: 'none' }], { duration: 1100, delay: 150 }, 110);
    s.tween({ from: 2, to: 10, duration: 1400, delay: 350, onUpdate: setRange });
    return s.cancel;
  },
  // 2 Join: tap on "Join Activity", the counter jumps, the group chat opens up
  (el) => {
    const s = scheduler();
    const join = el.querySelector('[data-det-join]');
    const count = el.querySelector('[data-det-count]');
    const toast = el.querySelector('[data-det-toast]');
    const ripple = el.querySelector('[data-det-ripple]');
    join.classList.remove('is-joined');
    toast.classList.remove('is-on');
    count.textContent = '5';
    animateAll(el.querySelectorAll('.det-tile, .det-org'), [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 120 }, 60);
    s.at(1500, () => {
      animate(join, [{ transform: 'scale(1)' }, { transform: 'scale(0.95)' }, { transform: 'scale(1)' }], { duration: 420, easing: curve.inOutCubic, commit: false });
      animate(ripple, [{ transform: 'translate(-50%, -50%) scale(0)', opacity: 0.5 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 }], { duration: 750, easing: curve.outQuart, commit: false });
    });
    s.at(1750, () => {
      join.classList.add('is-joined');
      count.textContent = '6';
      animate(count.parentElement, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 500, easing: curve.outBack, commit: false });
      toast.classList.add('is-on');
    });
    s.at(4200, () => toast.classList.remove('is-on'));
    return s.cancel;
  },
  // 3 Coordinate: messages arrive one by one, with a typing indicator
  (el) => {
    const s = scheduler();
    const msgs = [...el.querySelectorAll('[data-msg]')];
    const typing = el.querySelector('[data-chat-typing]');
    msgs.forEach((m) => m.classList.remove('is-on'));
    typing.classList.remove('is-on');
    const timeline = [0, 500, 1500, 2500, 3400, 4300];
    msgs.forEach((m, i) => {
      const t = timeline[i] ?? i * 900;
      if (i > 1) s.at(t - 650, () => typing.classList.toggle('is-on', !m.classList.contains('msg--me')));
      s.at(t, () => {
        typing.classList.remove('is-on');
        m.classList.add('is-on');
      });
    });
    return s.cancel;
  },
  // 4 Start your own: the name is typed, visibility chosen, location confirmed
  (el) => {
    const s = scheduler();
    const name = el.querySelector('[data-cr-name]');
    const caret = el.querySelector('[data-cr-caret]');
    const seg = el.querySelector('[data-cr-seg]');
    const loc = el.querySelector('[data-cr-loc]');
    const next = el.querySelector('[data-cr-next]');
    const text = 'Sunset at Kahlenberg';
    name.textContent = '';
    seg.classList.add('is-private');
    loc.classList.remove('is-on');
    next.classList.remove('is-ready');
    caret.classList.add('is-on');
    for (let i = 1; i <= text.length; i++) s.at(400 + i * 55, () => { name.textContent = text.slice(0, i); });
    const typed = 400 + text.length * 55;
    s.at(typed + 300, () => caret.classList.remove('is-on'));
    s.at(typed + 500, () => seg.classList.remove('is-private'));
    s.at(typed + 1200, () => loc.classList.add('is-on'));
    s.at(typed + 1800, () => next.classList.add('is-ready'));
    if (reducedMotion) {
      name.textContent = text;
      caret.classList.remove('is-on');
    }
    return s.cancel;
  },
];

export function initTour() {
  const section = document.querySelector('[data-tour]');
  if (!section) return;
  const steps = [...section.querySelectorAll('[data-step]')];
  const btns = steps.map((st) => st.querySelector('[data-step-btn]'));
  const screens = [...section.querySelectorAll('[data-screen]')];
  const bar = section.querySelector('[data-tour-progress]');
  const n = steps.length;
  let current = -1;
  let cancel = null;
  let visible = false;
  let played = -1;

  // only play a scene while the section is visible
  const play = (i) => {
    cancel?.();
    cancel = players[i]?.(screens[i]);
    played = i;
  };
  inView(section, (on) => {
    visible = on;
    if (on && played !== current && current >= 0) play(current);
    if (!on) played = -1;
  }, { rootMargin: '-15% 0px -15% 0px' });

  // clear old transitions on a screen, otherwise a finished "leave" keeps it dimmed and shrunk
  const reset = (sc) => sc.getAnimations().forEach((an) => an.cancel());

  const show = (i) => {
    if (i === current) return;
    const prev = current;
    current = i;
    steps.forEach((st, k) => st.classList.toggle('is-active', k === i));
    btns.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    if (bar) bar.style.transform = `scaleX(${(i + 1) / n})`;
    screens.forEach((sc, k) => {
      sc.classList.toggle('is-active', k === i);
      if (k !== i && k !== prev) {
        sc.classList.remove('is-leaving');
        reset(sc);
      }
    });
    if (prev >= 0 && !reducedMotion) {
      const a = screens[prev];
      const b = screens[i];
      const dir = i > prev ? 1 : -1;
      reset(a);
      reset(b);
      a.classList.add('is-leaving');
      const enter = animate(b, [
        { clipPath: dir > 0 ? 'inset(100% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)' },
      ], { duration: 950, easing: curve.inOutExpo, commit: false });
      animate(a, [
        { transform: 'scale(1) translateY(0)', filter: 'brightness(1)' },
        { transform: `scale(0.92) translateY(${-5 * dir}%)`, filter: 'brightness(0.3)' },
      ], { duration: 950, easing: curve.inOutExpo, commit: false });
      enter?.finished.then(() => {
        if (current !== i) return;
        a.classList.remove('is-leaving');
        reset(a);
        reset(b);
      }).catch(() => {});
    }
    if (visible) play(i);
  };

  if (reducedMotion) {
    section.classList.add('is-static');
    show(0);
    btns.forEach((b, i) => b.addEventListener('click', () => show(i)));
    return;
  }

  const t = track(section, {
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (p) => show(Math.min(n - 1, Math.floor(p * n * 0.9999))),
  });

  btns.forEach((b, i) => {
    b.addEventListener('click', () => {
      const [s0, s1] = t.range();
      window.scrollTo({ top: s0 + ((i + 0.5) / n) * (s1 - s0), behavior: 'smooth' });
    });
  });
}
