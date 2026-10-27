import { reducedMotion, isMobile, smoothstep, lerp } from '../core/env.js';
import { track } from '../core/scroll.js';

/*
  When a hex gets busy, it splits: zooming in breaks the hexagon into
  seven shards, as in the app – a centre and six fields around it. Each
  shard has its own people and its own chat. Scrolling drives the sequence.
*/

const SVG_NS = 'http://www.w3.org/2000/svg';
const C = 300;
const R = 212;
const INNER = 0.365; // same ratio as the geometry in the app
const COUNTS = [3, 2, 4, 3, 1, 3, 2]; // centre, then six fields: 18 in total
const MINE = 2; // this shard gets highlighted

function el(tag, attrs, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  parent?.appendChild(e);
  return e;
}

const corner = (i, r) => {
  const a = (Math.PI / 3) * i;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};

export function initShards() {
  const root = document.querySelector('[data-shards]');
  if (!root) return;
  const svg = root.querySelector('[data-shards-svg]');
  const caption = root.querySelector('[data-shards-caption]');

  // shapes: centre (inner hexagon) and six trapezoids out to the edge
  const polys = [];
  polys.push([0, 1, 2, 3, 4, 5].map((i) => corner(i, R * INNER)));
  for (let i = 0; i < 6; i++) {
    polys.push([corner(i, R), corner(i + 1, R), corner(i + 1, R * INNER), corner(i, R * INNER)]);
  }
  const shards = polys.map((pts, i) => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const g = el('g', { class: `sh${i === MINE ? ' sh--mine' : ''}` }, svg);
    const poly = el('polygon', { points: pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ') }, g);
    const t = el('text', { x: cx.toFixed(1), y: (cy + 1).toFixed(1), class: 'sh-n' }, g);
    t.textContent = String(COUNTS[i]);
    const len = Math.hypot(cx - C, cy - C) || 1;
    return { g, poly, t, dx: (cx - C) / len, dy: (cy - C) / len, center: i === 0 };
  });

  // outline of the whole hex and the big number
  const outline = el('polygon', { points: [0, 1, 2, 3, 4, 5].map((i) => corner(i, R).map((v) => v.toFixed(1)).join(',')).join(' '), class: 'sh-outline' }, svg);
  const big = el('g', { class: 'sh-big' }, svg);
  const bigN = el('text', { x: C, y: C - 22, class: 'sh-big__n' }, big);
  bigN.textContent = '18';
  const bigL = el('text', { x: C, y: C + 66, class: 'sh-big__l' }, big);
  bigL.textContent = 'people in this hex';

  // speech bubble next to your own shard
  const mine = shards[MINE];
  const bx = C + mine.dx * (R + 46);
  const by = C + mine.dy * (R + 46);
  const bubble = el('g', { class: 'sh-bubble', transform: `translate(${bx.toFixed(1)} ${by.toFixed(1)})` }, svg);
  el('rect', { x: -38, y: -21, width: 76, height: 42, rx: 21 }, bubble);
  [-15, 0, 15].forEach((x) => el('circle', { cx: x, cy: 0, r: 4.2 }, bubble));

  const apply = (p) => {
    const split = smoothstep(0.2, 0.55, p);
    const focus = smoothstep(0.62, 0.86, p);
    outline.style.opacity = String(1 - split);
    big.style.opacity = String(1 - smoothstep(0.08, 0.22, p));
    shards.forEach((s, i) => {
      const d = s.center ? 0 : split * 24;
      s.g.setAttribute('transform', `translate(${(s.dx * d).toFixed(2)} ${(s.dy * d).toFixed(2)})`);
      const base = 0.85 - split * 0.55 + (COUNTS[i] / 4) * 0.22 * split;
      const fill = i === MINE ? lerp(base, 1, focus) : lerp(base, base * 0.38, focus);
      s.poly.style.fillOpacity = fill.toFixed(3);
      s.poly.style.strokeOpacity = (split * 0.9).toFixed(3);
      s.t.style.opacity = String(smoothstep(0.32, 0.52, p) * (i === MINE ? 1 : 1 - focus * 0.45));
    });
    bubble.style.opacity = String(focus);
    bubble.style.transform = '';
    if (caption) caption.classList.toggle('is-on', focus > 0.5);
  };

  if (reducedMotion) {
    apply(1);
    return;
  }
  const sticky = !isMobile();
  root.classList.toggle('is-sticky', sticky);
  track(root, sticky
    ? { start: 'top top', end: 'bottom bottom', onUpdate: apply }
    : { start: 'top 78%', end: 'bottom 70%', onUpdate: apply });
}
