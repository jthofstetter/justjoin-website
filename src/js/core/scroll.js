import { clamp } from './env.js';

/*
  One central scroll clock: the position is read once per frame and
  handed to every section. Positions are only re-measured when sizes
  change, not on every scroll step.
*/

export const scrollState = { y: 0, vh: 0, vw: 0, dir: 0, velocity: 0 };

const subscribers = new Set();
const measurers = new Set();
let queued = false;
let lastY = 0;
let lastT = 0;

function frame(now) {
  queued = false;
  const y = window.scrollY;
  const dt = Math.max(1, now - lastT);
  scrollState.velocity = (y - lastY) / dt * 1000;
  if (y !== lastY) scrollState.dir = y > lastY ? 1 : -1;
  scrollState.y = y;
  lastY = y;
  lastT = now;
  subscribers.forEach((fn) => fn(scrollState));
}

export function requestUpdate() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(frame);
}

export function measureAll() {
  scrollState.vh = window.innerHeight;
  scrollState.vw = window.innerWidth;
  measurers.forEach((fn) => fn());
  requestUpdate();
}

export function initScroll() {
  scrollState.y = lastY = window.scrollY;
  scrollState.vh = window.innerHeight;
  scrollState.vw = window.innerWidth;
  window.addEventListener('scroll', requestUpdate, { passive: true });
  let t;
  const onResize = () => {
    clearTimeout(t);
    t = setTimeout(measureAll, 120);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('load', measureAll);
  if (document.fonts?.ready) document.fonts.ready.then(measureAll);
  if ('ResizeObserver' in window) {
    let first = true;
    new ResizeObserver(() => {
      if (first) { first = false; return; }
      onResize();
    }).observe(document.body);
  }
}

export function onScroll(fn) {
  subscribers.add(fn);
  fn(scrollState);
  return () => subscribers.delete(fn);
}

const EDGES = { top: 0, center: 0.5, bottom: 1 };
const parse = (s) => s.split(' ').map((p) => (p in EDGES ? EDGES[p] : parseFloat(p) / 100));

/*
  Fortschritt eines Elements zwischen zwei Momenten, z. B.
  start: 'top bottom' = the element's top edge reaches the bottom of the viewport,
  end:   'bottom top' = its bottom edge reaches the top of the viewport.
*/
export function track(el, { start = 'top bottom', end = 'bottom top', onUpdate }) {
  if (!el) return { measure() {}, kill() {} };
  const [sa, sb] = parse(start);
  const [ea, eb] = parse(end);
  let s0 = 0;
  let s1 = 1;
  const measure = () => {
    const r = el.getBoundingClientRect();
    const top = r.top + window.scrollY;
    const h = r.height;
    const vh = window.innerHeight;
    s0 = top + sa * h - sb * vh;
    s1 = top + ea * h - eb * vh;
  };
  const sub = (st) => {
    const span = s1 - s0 || 1;
    onUpdate(clamp((st.y - s0) / span), st);
  };
  measure();
  measurers.add(measure);
  subscribers.add(sub);
  sub(scrollState);
  return {
    measure,
    range: () => [s0, s1],
    kill() {
      measurers.delete(measure);
      subscribers.delete(sub);
    },
  };
}

/* Simple visibility via IntersectionObserver. */
export function inView(el, cb, { rootMargin = '0px', threshold = 0, once = false } = {}) {
  if (!el) return null;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      cb(e.isIntersecting, e);
      if (once && e.isIntersecting) io.disconnect();
    });
  }, { rootMargin, threshold });
  io.observe(el);
  return io;
}

/* Scroll smoothly to a target (reduced motion is respected via CSS). */
export function scrollToY(y) {
  window.scrollTo({ top: y, behavior: 'smooth' });
}
