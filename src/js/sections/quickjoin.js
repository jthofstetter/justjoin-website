import { isMobile, reducedMotion, rng } from '../core/env.js';
import { animate, curve } from '../core/anim.js';
import { axialToXY, hexCorners, hexDistance, hexRange, key } from '../city/hexgrid.js';

/*
  QuickJoin to try out: a map of hexes, as in the app. Glowing hexes have
  people who are up to something. Tapping one shows who is there. You can
  only join hexes near you, and only one at a time.
*/

const SVG_NS = 'http://www.w3.org/2000/svg';
const S = 40;        // hex radius in map units
const WORLD = 9;     // number of rings around you
const REACH = 3;     // range for joining (in hexes)

// same intents and names as in the app
const INTENTS = {
  coffee: 'Coffee',
  walk: 'Walk',
  food: 'Food',
  sport: 'Sport',
  study: 'Study',
  chill: 'Chill',
};

const CHAT = {
  coffee: ['We’re sitting outside by the fountain.', 'Is anyone bringing cookies?'],
  sport: ['Two more and we can play four on four.', 'We’ve got a ball.'],
  study: ['Second floor, table by the window.', 'Anyone good at statistics?'],
  chill: ['We’re on the lawn by the pavilion.', 'Someone brought a speaker.'],
  food: ['Grabbing something at the market in a sec.', 'Meeting in front of the entrance.'],
  walk: ['Heading off along the canal in ten minutes.', 'Nice and easy, no rush.'],
};

const NAMES = ['Lena', 'Jonas', 'Mia', 'Elias', 'Sara', 'Noah', 'Emma', 'Paul', 'Lea', 'Ben', 'Hanna', 'Luca', 'Amira', 'David', 'Zoe', 'Felix', 'Ida', 'Tom', 'Nora', 'Leon'];

const CELLS = [
  { q: 1, r: -1, intent: 'coffee', n: 3 },
  { q: -2, r: 1, intent: 'sport', n: 6 },
  { q: 2, r: 0, intent: 'study', n: 4 },
  { q: -1, r: -1, intent: 'chill', n: 2 },
  { q: 0, r: 2, intent: 'food', n: 5 },
  { q: 2, r: -3, intent: 'walk', n: 2 },
  { q: -3, r: 3, intent: 'coffee', n: 3 },
  { q: -1, r: 3, intent: 'chill', n: 4 },
  { q: -5, r: 2, intent: 'sport', n: 8 },
  { q: 4, r: -5, intent: 'food', n: 3 },
  { q: 5, r: 0, intent: 'study', n: 5 },
  { q: 1, r: 4, intent: 'walk', n: 2 },
  { q: -4, r: -1, intent: 'coffee', n: 2 },
  { q: 3, r: 2, intent: 'chill', n: 3 },
];

const YOU = 'You';

const plural = (n, one, many) => (n === 1 ? one : many);

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  parent?.appendChild(e);
  return e;
}

// base map: canal, ring road, streets, parks – only hinted at
function drawBase(g) {
  const rand = rng(11);
  const clipR = (WORLD + 1) * S * 1.6;
  el('circle', { cx: 0, cy: 0, r: clipR, class: 'mb-ground' }, g);
  [[-230, -150, 120, 70, -18], [250, 170, 90, 120, 25], [-60, 260, 140, 60, 8]].forEach(([cx, cy, rx, ry, rot]) => {
    el('ellipse', { cx, cy, rx, ry, transform: `rotate(${rot} ${cx} ${cy})`, class: 'mb-park' }, g);
  });
  const minor = el('g', { class: 'mb-minor' }, g);
  for (let k = -12; k <= 12; k++) {
    const o = k * 62 + (rand() - 0.5) * 14;
    el('line', { x1: -760, y1: o, x2: 760, y2: o + 120, transform: 'rotate(-9)' }, minor);
    el('line', { x1: o, y1: -760, x2: o - 90, y2: 760, transform: 'rotate(-9)' }, minor);
  }
  const major = el('g', { class: 'mb-major' }, g);
  el('ellipse', { cx: -30, cy: 10, rx: 330, ry: 240, transform: 'rotate(-10 -30 10)' }, major);
  [15, 75, 140, 200, 255, 320].forEach((a) => {
    const r = (a * Math.PI) / 180;
    el('line', { x1: Math.cos(r) * 250, y1: Math.sin(r) * 190, x2: Math.cos(r) * 800, y2: Math.sin(r) * 800 }, major);
  });
  el('path', { d: 'M-760 -300 C-430 -150 -200 -330 40 -70 S380 250 760 330', class: 'mb-water' }, g);
  el('path', { d: 'M-760 -300 C-430 -150 -200 -330 40 -70 S380 250 760 330', class: 'mb-water-line' }, g);
}

export function initQuickJoin() {
  const root = document.querySelector('[data-qj]');
  if (!root) return;
  const map = root.querySelector('[data-qj-map]');
  const svg = root.querySelector('[data-qj-svg]');
  const sheet = root.querySelector('[data-qj-sheet]');
  const chips = [...root.querySelectorAll('[data-intent]')];

  const base = el('g', { class: 'map-base' }, svg);
  drawBase(base);
  const gridG = el('g', { class: 'map-grid' }, svg);
  const reachG = el('g', { class: 'map-reach' }, svg);
  const youG = el('g', { class: 'map-you', 'aria-hidden': 'true' }, svg);

  // data
  const cells = new Map();
  hexRange(WORLD).forEach(([q, r]) => {
    cells.set(key(q, r), { q, r, d: hexDistance(q, r), n: 0, intent: null, people: [] });
  });
  let nameIdx = 0;
  CELLS.forEach((c) => {
    const cell = cells.get(key(c.q, c.r));
    cell.n = c.n;
    cell.intent = c.intent;
    cell.people = Array.from({ length: c.n }, () => NAMES[nameIdx++ % NAMES.length]);
  });

  // draw the hexes
  cells.forEach((cell) => {
    const [x, y] = axialToXY(cell.q, cell.r, S);
    const pts = hexCorners(x, y, S * 0.94).map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
    const g = el('g', { class: 'hx', 'data-k': key(cell.q, cell.r) }, gridG);
    el('polygon', { points: pts }, g);
    cell.g = g;
    cell.x = x;
    cell.y = y;
  });

  // range and "you"
  el('circle', { cx: 0, cy: 0, r: (REACH + 0.62) * S * 1.5 * 1.04, class: 'reach' }, reachG);
  el('circle', { cx: 0, cy: 0, r: 26, class: 'you-pulse' }, youG);
  el('circle', { cx: 0, cy: 0, r: 7.5, class: 'you-dot' }, youG);

  let filter = 'all';
  let selected = null;
  let joined = null;
  let chatTimer = 0;

  const label = (cell) => {
    if (cell.q === 0 && cell.r === 0 && !cell.n) return 'Your hex, still empty';
    if (!cell.n) return 'Empty hex';
    return `${INTENTS[cell.intent] || 'Your group'}, ${cell.n} ${plural(cell.n, 'person', 'people')}`;
  };

  const paint = (cell) => {
    const g = cell.g;
    const active = cell.n > 0;
    const far = cell.d > REACH;
    const muted = active && filter !== 'all' && cell.intent !== filter;
    g.classList.toggle('is-active', active);
    g.classList.toggle('is-far', far);
    g.classList.toggle('is-muted', muted);
    g.classList.toggle('is-joined', joined === cell);
    g.classList.toggle('is-selected', selected === cell);
    const fill = active ? 0.16 + Math.min(cell.n, 8) * 0.075 : 0;
    g.style.setProperty('--fill', fill.toFixed(3));
    g.classList.toggle('is-bright', fill > 0.5 && !far && !muted);
    let t = g.querySelector('text');
    if (active) {
      if (!t) t = el('text', { x: cell.x.toFixed(1), y: (cell.y + 1).toFixed(1), class: 'hx-n' }, g);
      t.textContent = String(cell.n);
    } else if (t) t.remove();
    const focusable = (active && !far) || (cell.q === 0 && cell.r === 0);
    if (focusable) {
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', label(cell));
    } else {
      g.removeAttribute('tabindex');
      g.removeAttribute('role');
      g.removeAttribute('aria-label');
    }
  };
  const paintAll = () => cells.forEach(paint);

  const initials = (people) => people.slice(0, 4).map((p, i) => `<span class="av av--${i % 4}">${p[0]}</span>`).join('')
    + (people.length > 4 ? `<span class="av av--more">+${people.length - 4}</span>` : '');

  const nearby = () => [...cells.values()].filter((c) => c.n && c.d <= REACH && c !== joined).length;

  const render = () => {
    clearTimeout(chatTimer);
    const c = selected;
    let html = '';
    if (!c) {
      const n = nearby();
      html = `<p class="qs-kicker">Around you</p>
        <p class="qs-title">${n} ${plural(n, 'hex', 'hexes')} with people near you</p>
        <p class="qs-text">Tap a glowing hex to see who’s there and what they’re up to.</p>`;
    } else if (c.d > REACH) {
      html = `<p class="qs-kicker">${c.n ? INTENTS[c.intent] : 'Empty hex'}</p>
        <p class="qs-title">Too far away</p>
        <p class="qs-text">You can only join hexes near you. This one is out of range.</p>`;
    } else if (c === joined) {
      const others = c.n - 1;
      html = `<p class="qs-kicker">${INTENTS[c.intent] || 'Your group'}</p>
        <p class="qs-title"><svg class="qs-check" aria-hidden="true"><use href="#i-check"/></svg>Joined</p>
        <p class="qs-text">${others > 0 ? `You and ${others} ${plural(others, 'other person', 'other people')} in this hex.` : 'You started the group. People nearby can see it on the map now.'}</p>
        <div class="qs-chat" data-qs-chat aria-label="Live chat"></div>
        <div class="qs-actions"><button class="qs-btn" type="button" data-qs="chat">Open chat</button><button class="qs-link" type="button" data-qs="leave">Leave hex</button></div>`;
    } else if (c.n) {
      const busy = joined && joined !== c;
      html = `<p class="qs-kicker">${INTENTS[c.intent] || 'Group'}</p>
        <p class="qs-title">${c.n} ${plural(c.n, 'person', 'people')} nearby</p>
        <div class="qs-people">${initials(c.people)}</div>
        ${busy ? '<p class="qs-text">You’re already in another hex. Switching takes you out of your old group.</p>' : ''}
        <div class="qs-actions"><button class="qs-btn" type="button" data-qs="${busy ? 'switch' : 'join'}">${busy ? 'Switch' : 'Join group'}</button></div>`;
    } else {
      const own = c.q === 0 && c.r === 0;
      html = `<p class="qs-kicker">${own ? 'Your hex' : 'Empty hex'}</p>
        <p class="qs-title">Nobody here yet</p>
        <p class="qs-text">Start a group in this hex. People nearby will see it right away.</p>
        <div class="qs-actions"><button class="qs-btn" type="button" data-qs="start">Start here</button></div>`;
    }
    sheet.innerHTML = html;
    if (!reducedMotion) {
      animate(sheet, [{ opacity: 0.4, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 500, commit: false });
    }
    if (c && c === joined) runChat(c);
  };

  const runChat = (c) => {
    const box = sheet.querySelector('[data-qs-chat]');
    if (!box) return;
    const lines = c.intent ? CHAT[c.intent] : ['On my way!'];
    const who = c.people.filter((p) => p !== YOU);
    let i = 0;
    const next = () => {
      if (i >= lines.length || !who.length) return;
      const m = document.createElement('p');
      m.className = 'qs-msg';
      m.innerHTML = `<b>${who[i % who.length]}</b> ${lines[i]}`;
      box.appendChild(m);
      animate(m, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 500 });
      i++;
      chatTimer = setTimeout(next, 1300);
    };
    chatTimer = setTimeout(next, reducedMotion ? 0 : 600);
  };

  const select = (cell) => {
    selected = cell;
    paintAll();
    render();
  };

  const join = (cell) => {
    if (joined && joined !== cell) leave(joined, false);
    cell.people = [YOU, ...cell.people];
    cell.n += 1;
    joined = cell;
    if (!reducedMotion) animate(cell.g, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 650, easing: curve.outBack, commit: false });
  };

  const leave = (cell, rerender = true) => {
    cell.people = cell.people.filter((p) => p !== YOU);
    cell.n = Math.max(0, cell.n - 1);
    if (!cell.n) cell.intent = null;
    joined = null;
    if (rerender) select(cell);
  };

  sheet.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qs]');
    if (!b || !selected) return;
    const a = b.dataset.qs;
    if (a === 'join' || a === 'switch') join(selected);
    if (a === 'start') {
      selected.intent = filter !== 'all' ? filter : selected.intent;
      join(selected);
    }
    if (a === 'leave') return leave(selected);
    if (a === 'chat') {
      b.textContent = 'Opens in the app';
      b.disabled = true;
      return;
    }
    select(selected);
  });

  const pick = (g) => {
    const cell = cells.get(g.dataset.k);
    if (cell) select(cell === selected ? null : cell);
  };
  gridG.addEventListener('click', (e) => {
    const g = e.target.closest('.hx');
    if (g) pick(g);
  });
  gridG.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const g = e.target.closest('.hx');
    if (!g) return;
    e.preventDefault();
    pick(g);
  });

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filter = chip.dataset.intent;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      paintAll();
    });
  });

  // pick the visible area so hexes are easy to tap on any screen
  const fit = () => {
    const w = map.clientWidth || 800;
    const h = map.clientHeight || 500;
    const px = isMobile() ? 30 : 42;
    const scale = px / S;
    const vw = w / scale;
    const vh = h / scale;
    const ox = isMobile() ? 0.5 : 0.36;
    svg.setAttribute('viewBox', `${(-vw * ox).toFixed(1)} ${(-vh * 0.5).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`);
  };
  fit();
  let t;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(fit, 100);
  });

  paintAll();
  render();
}
