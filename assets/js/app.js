/*! JustJoin website – built from src/js (do not edit by hand, run npm run build instead) */
(() => {
'use strict';

// src/js/core/env.js
const $m1 = (() => {
// environment and device capabilities in one place

const mq = (q) => window.matchMedia(q);

const reducedMotion = mq('(prefers-reduced-motion: reduce)').matches;
const finePointer = mq('(hover: hover) and (pointer: fine)').matches;
const isMobile = () => mq('(max-width: 900px)').matches;

function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) {
    return false;
  }
}

// rough guess of how much graphics work the device can handle
function cityQuality() {
  const cores = navigator.hardwareConcurrency || 8;
  const mem = navigator.deviceMemory || 8;
  if (isMobile() || cores <= 4 || mem <= 4) return 'low';
  return 'high';
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mapRange = (v, a, b, c = 0, d = 1) => c + (d - c) * clamp((v - a) / (b - a));
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// small, repeatable randomness (same result on every load)
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
return { reducedMotion, finePointer, isMobile, hasWebGL2, cityQuality, wait, clamp, lerp, mapRange, smoothstep, rng };
})();

// src/js/core/scroll.js
const $m2 = (() => {
const { clamp } = $m1;
/*
  One central scroll clock: the position is read once per frame and
  handed to every section. Positions are only re-measured when sizes
  change, not on every scroll step.
*/

const scrollState = { y: 0, vh: 0, vw: 0, dir: 0, velocity: 0 };

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

function requestUpdate() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(frame);
}

function measureAll() {
  scrollState.vh = window.innerHeight;
  scrollState.vw = window.innerWidth;
  measurers.forEach((fn) => fn());
  requestUpdate();
}

function initScroll() {
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

function onScroll(fn) {
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
function track(el, { start = 'top bottom', end = 'bottom top', onUpdate }) {
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
function inView(el, cb, { rootMargin = '0px', threshold = 0, once = false } = {}) {
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
function scrollToY(y) {
  window.scrollTo({ top: y, behavior: 'smooth' });
}
return { scrollState, requestUpdate, measureAll, initScroll, onScroll, track, inView, scrollToY };
})();

// src/js/core/anim.js
const $m4 = (() => {
const { reducedMotion } = $m1;
// curves for number tweens (WebGL state, counters)
const ease = {
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
const curve = {
  outExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
  inOutExpo: 'cubic-bezier(0.87, 0, 0.13, 1)',
  outQuart: 'cubic-bezier(0.25, 1, 0.5, 1)',
  inQuart: 'cubic-bezier(0.5, 0, 0.75, 0)',
  outBack: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  inOutCubic: 'cubic-bezier(0.65, 0, 0.35, 1)',
};

/* Number tween on requestAnimationFrame. */
function tween({ from = 0, to = 1, duration = 1000, delay = 0, ease: fn = ease.outExpo, onUpdate, onComplete } = {}) {
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
function animate(el, keyframes, opts = {}) {
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

function animateAll(els, keyframes, opts = {}, stagger = 0) {
  return [...els].map((el, i) => animate(el, keyframes, { ...opts, delay: (opts.delay || 0) + i * stagger }));
}
return { ease, curve, tween, animate, animateAll };
})();

// src/js/city/hexgrid.js
const $m5 = (() => {
/*
  Hex grid as in QuickJoin: flat-topped hexagons (points on the left and
  right), addressed with axial coordinates q and r.
*/

const SQRT3 = Math.sqrt(3);

function axialToXY(q, r, size = 1) {
  return [size * 1.5 * q, size * SQRT3 * (r + q / 2)];
}

function hexDistance(q, r) {
  return (Math.abs(q) + Math.abs(r) + Math.abs(-q - r)) / 2;
}

function hexCorners(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
  }
  return pts;
}

function hexRange(R) {
  const out = [];
  for (let q = -R; q <= R; q++) {
    const r1 = Math.max(-R, -q - R);
    const r2 = Math.min(R, -q + R);
    for (let r = r1; r <= r2; r++) out.push([q, r]);
  }
  return out;
}

function axialRound(q, r) {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq, rr];
}

function xyToAxial(x, y, size = 1) {
  const q = ((2 / 3) * x) / size;
  const r = ((-1 / 3) * x + (SQRT3 / 3) * y) / size;
  return axialRound(q, r);
}

const key = (q, r) => `${q},${r}`;
return { SQRT3, axialToXY, hexDistance, hexCorners, hexRange, axialRound, xyToAxial, key };
})();

// src/js/city/mat.js
const $m6 = (() => {
// minimal 4×4 matrices (column-major, as WebGL expects)

const mat4 = () => new Float32Array(16);

function perspective(out, fovy, aspect, near, far, shiftX = 0, shiftY = 0) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  // shifted image centre (lens shift), so the scene sits next to the text
  out[8] = -shiftX;
  out[9] = -shiftY;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

function lookAt(out, eye, center, up) {
  let zx = eye[0] - center[0];
  let zy = eye[1] - center[1];
  let zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

function multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4];
    const b1 = b[c * 4 + 1];
    const b2 = b[c * 4 + 2];
    const b3 = b[c * 4 + 3];
    out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

// world point → normalized screen coordinates (-1 … 1) plus w
function project(m, x, y, z) {
  const X = m[0] * x + m[4] * y + m[8] * z + m[12];
  const Y = m[1] * x + m[5] * y + m[9] * z + m[13];
  const W = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [X / W, Y / W, W];
}
return { mat4, perspective, lookAt, multiply, project };
})();

// src/js/city/HexCity.js
const $m3 = (() => {
const { clamp, lerp, rng, reducedMotion } = $m1;
const { ease, tween } = $m4;
const { axialToXY, hexDistance, hexRange } = $m5;
const { mat4, perspective, lookAt, multiply, project } = $m6;
/*
  The city at night as a hex map, the way QuickJoin sees it:
  every hex is a flat hexagonal prism. Where people are up to something,
  the hex glows and lights up its neighbourhood. Small points of light
  are people on their way to a group – when they arrive, the hex pulses.

  Plain WebGL2, no library. Three passes:
  1. hexes (instanced, with pools of light and an outline)
  2. halos above busy hexes (additive)
  3. people as points of light (additive)
*/

const MAX_LIGHTS = 24;
const BG = [19 / 255, 19 / 255, 19 / 255]; // #131313, the app background

const VS_HEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in float a_edge;
layout(location=3) in vec4 a_inst;
layout(location=4) in float a_glow;
uniform mat4 u_vp;
uniform float u_size;
uniform float u_intro;
uniform float u_reach;
out vec3 v_world;
out vec3 v_nrm;
out float v_edge;
out float v_glow;
out float v_top;
out float v_y;
void main() {
  float d = length(a_inst.xy);
  float t = clamp(u_intro * 1.7 - d / u_reach, 0.0, 1.0);
  float rise = 1.0 - pow(1.0 - t, 3.0);
  float h = max(0.004, a_inst.z * rise);
  vec3 p = vec3(a_inst.x + a_pos.x * u_size, a_pos.y * h, a_inst.y + a_pos.z * u_size);
  v_world = p;
  v_nrm = a_nrm;
  v_edge = a_edge;
  v_glow = a_glow * smoothstep(0.45, 1.0, u_intro);
  v_top = step(0.5, a_nrm.y);
  v_y = a_pos.y;
  gl_Position = u_vp * vec4(p, 1.0);
}`;

const FS_HEX = `#version 300 es
precision highp float;
in vec3 v_world;
in vec3 v_nrm;
in float v_edge;
in float v_glow;
in float v_top;
in float v_y;
uniform vec3 u_cam;
uniform vec3 u_bg;
uniform vec2 u_fogR;
uniform vec2 u_focus;
uniform vec4 u_lights[${MAX_LIGHTS}];
uniform int u_nLights;
uniform float u_time;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 n = normalize(v_nrm);
  vec3 L = normalize(vec3(-0.45, 0.85, 0.3));
  float diff = max(dot(n, L), 0.0);
  bool top = v_top > 0.5;
  vec3 col = top ? vec3(0.094) * (0.78 + 0.32 * diff) : vec3(0.05) * (0.45 + 0.75 * diff);

  float pool = 0.0;
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= u_nLights) break;
    vec4 l = u_lights[i];
    vec2 d = v_world.xz - l.xy;
    pool += l.z * exp(-dot(d, d) / (l.w * l.w));
  }
  vec3 lightCol = vec3(0.86, 0.9, 1.0);
  col += lightCol * pool * (top ? 0.15 : 0.11);

  if (top) {
    float w = fwidth(v_edge);
    float line = smoothstep(1.0 - 2.4 * w, 1.0 - 0.7 * w, v_edge);
    col += vec3(0.085 + 0.28 * min(pool, 1.0)) * line;
    col = mix(col, vec3(1.0), clamp(v_glow, 0.0, 1.0) * (0.8 + 0.2 * (1.0 - v_edge)));
  } else {
    col += lightCol * v_glow * 0.6 * v_y * v_y;
  }

  float r = length(v_world.xz - u_focus);
  float fog = smoothstep(u_fogR.x, u_fogR.y, r);
  float dist = length(v_world - u_cam);
  fog = max(fog, 1.0 - exp(-pow(dist * 0.017, 2.0)));
  col = mix(col, u_bg, fog);
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;

const VS_HALO = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_inst;
layout(location=2) in float a_glow;
uniform mat4 u_vp;
uniform vec3 u_right;
uniform vec3 u_up;
uniform float u_intro;
out vec2 v_uv;
out float v_a;
out vec3 v_world;
void main() {
  float s = a_inst.w * (0.65 + 0.35 * clamp(a_glow, 0.0, 1.4));
  vec3 p = a_inst.xyz + (u_right * a_corner.x + u_up * a_corner.y) * s;
  v_uv = a_corner;
  v_a = a_glow * smoothstep(0.55, 1.0, u_intro);
  v_world = a_inst.xyz;
  gl_Position = u_vp * vec4(p, 1.0);
}`;

const FS_HALO = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_a;
in vec3 v_world;
uniform vec2 u_fogR;
uniform vec2 u_focus;
out vec4 o;
void main() {
  float r2 = dot(v_uv, v_uv);
  float a = exp(-r2 * 4.2) * 0.36 + exp(-r2 * 26.0) * 0.32;
  float fog = smoothstep(u_fogR.x, u_fogR.y, length(v_world.xz - u_focus));
  a *= v_a * (1.0 - fog);
  o = vec4(vec3(0.9, 0.94, 1.0) * a, a);
}`;

const VS_DOT = `#version 300 es
precision highp float;
layout(location=0) in vec4 a_p;
uniform mat4 u_vp;
uniform float u_ps;
out float v_a;
out vec3 v_world;
void main() {
  vec4 c = u_vp * vec4(a_p.xyz, 1.0);
  gl_Position = c;
  gl_PointSize = u_ps * (14.0 / max(c.w, 0.5));
  v_a = a_p.w;
  v_world = a_p.xyz;
}`;

const FS_DOT = `#version 300 es
precision highp float;
in float v_a;
in vec3 v_world;
uniform vec2 u_fogR;
uniform vec2 u_focus;
out vec4 o;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, r);
  a *= a;
  float fog = smoothstep(u_fogR.x, u_fogR.y, length(v_world.xz - u_focus));
  a *= v_a * (1.0 - fog);
  o = vec4(vec3(1.0) * a, a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`Shader: ${log}`);
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program: ${gl.getProgramInfoLog(p)}`);
  const uniforms = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    uniforms[name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u: uniforms };
}

// unit prism: top as a fan (with an inset for the outline) + six sides
function prismGeometry() {
  const pos = [];
  const nrm = [];
  const edge = [];
  const idx = [];
  const corner = (i) => {
    const a = (Math.PI / 3) * i;
    return [Math.cos(a), Math.sin(a)];
  };
  // top
  pos.push(0, 1, 0); nrm.push(0, 1, 0); edge.push(0);
  for (let i = 0; i < 6; i++) {
    const [x, z] = corner(i);
    pos.push(x, 1, z); nrm.push(0, 1, 0); edge.push(1);
  }
  for (let i = 0; i < 6; i++) idx.push(0, 1 + i, 1 + ((i + 1) % 6));
  // sides
  for (let i = 0; i < 6; i++) {
    const [x0, z0] = corner(i);
    const [x1, z1] = corner(i + 1);
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const nx = Math.cos(a);
    const nz = Math.sin(a);
    const b = pos.length / 3;
    pos.push(x0, 0, z0, x1, 0, z1, x1, 1, z1, x0, 1, z0);
    for (let k = 0; k < 4; k++) { nrm.push(nx, 0, nz); edge.push(0); }
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), edge: new Float32Array(edge), idx: new Uint16Array(idx) };
}

// camera per stage. shift moves the image centre (in half screens).
const VIEWS = {
  hero: {
    desktop: { target: [0.6, 0, -1.2], dist: 31, el: 0.84, az: 0.62, fov: 0.56, shift: [0.0, 0.14] },
    mobile: { target: [0.2, 0, -0.8], dist: 30, el: 0.95, az: 0.62, fov: 0.8, shift: [0, 0.42] },
  },
  wait: {
    desktop: { target: [4.5, 0, 0.87], dist: 14, el: 0.6, az: -0.35, fov: 0.6, shift: [0.42, 0.04] },
    mobile: { target: [4.5, 0, 0.87], dist: 15.5, el: 0.74, az: -0.35, fov: 0.74, shift: [0, 0.44] },
  },
};

class HexCity {
  constructor(canvas, { quality = 'high', labelsEl = null, mobile = false } = {}) {
    this.canvas = canvas;
    this.labelsEl = labelsEl;
    this.quality = quality;
    this.mobile = mobile;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;
    this.running = false;
    this.raf = 0;
    this.time = 0;
    this.last = 0;
    this.dprCap = quality === 'high' ? 1.75 : 1.5;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.frameTimes = [];
    this.state = { intro: 0, scroll: 0 };
    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    this.viewName = 'hero';
    this.view = { ...this.viewFor('hero') };
    this.viewTarget = this.viewFor('hero');
    this.vp = mat4();
    this.viewM = mat4();
    this.proj = mat4();
    this.eye = [0, 0, 0];
    this.onArrive = null;

    this.buildScene();
    this.initGL();
    this.resize();
    this.bindEvents();
  }

  viewFor(name) {
    const v = VIEWS[name][this.mobile ? 'mobile' : 'desktop'];
    return { target: [...v.target], dist: v.dist, el: v.el, az: v.az, fov: v.fov, shift: [...v.shift] };
  }

  /* ---------- Scene ---------- */

  buildScene() {
    const rand = rng(2026);
    const R = this.quality === 'high' ? 15 : 11;
    this.R = R;
    const cells = [];
    hexRange(R).forEach(([q, r]) => {
      const [x, z] = axialToXY(q, r, 1);
      const d = hexDistance(q, r);
      const relief = 0.5 + 0.5 * Math.sin(x * 0.37 + 1.3) * Math.cos(z * 0.29 - 0.7);
      const h = 0.05 + 0.11 * relief + 0.05 * rand();
      cells.push({ q, r, x, z, d, h, base: h, lit: 0, boost: 0, seed: rand(), label: null, glow: 0 });
    });
    this.cells = cells;
    this.byKey = new Map(cells.map((c, i) => [`${c.q},${c.r}`, i]));

    // busy hexes: denser in the middle, sparser towards the edge
    const lit = [];
    const want = this.quality === 'high' ? 23 : 15;
    let guard = 0;
    while (lit.length < want && guard++ < 20000) {
      const i = Math.floor(rand() * cells.length);
      const c = cells[i];
      if (c.lit || c.d < 1 || c.d > 11) continue;
      if (rand() > Math.exp(-c.d / 5.2)) continue;
      // not right next to each other
      if (lit.some((j) => hexDistance(cells[j].q - c.q, cells[j].r - c.r) < 2)) continue;
      c.lit = 0.74 + 0.26 * rand();
      c.h = 0.18 + 0.28 * (c.lit - 0.5);
      lit.push(i);
    }
    this.litIdx = lit;

    // a few faintly lit hexes: one person is here right now
    const faint = [];
    guard = 0;
    while (faint.length < (this.quality === 'high' ? 46 : 24) && guard++ < 6000) {
      const i = Math.floor(rand() * cells.length);
      const c = cells[i];
      if (c.lit || c.faint || c.d > 13) continue;
      c.faint = 0.1 + 0.16 * rand();
      faint.push(i);
    }
    this.faintIdx = faint;

    // hex for the waitlist: lights up when you sign up
    const userKey = this.byKey.get('3,-1') ?? this.byKey.get('2,0');
    this.userIdx = userKey;
    const uc = cells[userKey];
    if (uc.lit) {
      uc.lit = 0;
      uc.h = uc.base;
      this.litIdx = this.litIdx.filter((i) => i !== userKey);
    }
    this.userLit = 0;

    // bring the waitlist hex’s neighbourhood to life so it doesn’t glow alone
    const near = (a, b) => hexDistance(a.q - b.q, a.r - b.r);
    let added = 0;
    [[5, -3], [4, 1], [6, -1], [1, 0], [3, -3], [5, 0], [2, 2]].forEach(([q, r]) => {
      if (added >= 4 || this.litIdx.length >= MAX_LIGHTS) return;
      const i = this.byKey.get(`${q},${r}`);
      if (i === undefined || i === userKey) return;
      const c = cells[i];
      if (c.lit || this.litIdx.some((j) => near(cells[j], c) < 2) || near(c, uc) < 2) return;
      c.lit = 0.74 + 0.26 * rand();
      c.h = 0.18 + 0.28 * (c.lit - 0.5);
      c.faint = 0;
      this.litIdx.push(i);
      added++;
    });
  }

  /*
    Labels on busy hexes that are clearly visible in the hero.
    They must not overlap and have to sit fully on screen.
  */
  setupLabels(defs) {
    if (!this.labelsEl) return;
    this.labelsEl.innerHTML = '';
    this.computeCamera(0);
    const W = this.width;
    const H = this.height;
    const top = 96;
    const bottom = H * (this.mobile ? 0.36 : 0.52);
    const candidates = this.litIdx
      .map((i) => {
        const c = this.cells[i];
        const [nx, ny] = project(this.vp, c.x, c.h + 0.42, c.z);
        return { i, nx, ny, x: (nx * 0.5 + 0.5) * W, y: (1 - (ny * 0.5 + 0.5)) * H };
      })
      .filter((p) => p.y - 58 > top && p.y < bottom);
    const boxes = [];
    const picked = [];
    defs.slice(0, this.mobile ? 3 : defs.length).forEach((def) => {
      const w = 70 + def.text.length * 7.8;
      let best = null;
      let bestScore = -Infinity;
      candidates.forEach((p) => {
        if (picked.some((q) => q.i === p.i)) return;
        const box = { x0: p.x - w / 2 - 12, x1: p.x + w / 2 + 12, y0: p.y - 22 - 36 - 14, y1: p.y - 22 + 14 };
        if (box.x0 < 8 || box.x1 > W - 8) return;
        if (boxes.some((b) => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1))) return;
        const score = -Math.hypot(p.nx - def.x, p.ny - def.y);
        if (score > bestScore) { bestScore = score; best = { p, box }; }
      });
      if (!best) return;
      boxes.push(best.box);
      picked.push(best.p);
      best = best.p;
      const c = this.cells[best.i];
      const el = document.createElement('div');
      el.className = 'city__label';
      el.innerHTML = '<i class="city__dot"></i><span class="city__count"></span> <span class="city__text"></span>';
      el.querySelector('.city__text').textContent = def.text;
      const count = el.querySelector('.city__count');
      count.textContent = String(def.count);
      this.labelsEl.appendChild(el);
      c.label = { el, count, n: def.count, base: def.count, text: def.text };
    });
    this.labelled = picked.map((p) => p.i);
  }

  setUserLabel(text) {
    if (!this.labelsEl) return;
    const c = this.cells[this.userIdx];
    if (c.label) return;
    const el = document.createElement('div');
    el.className = 'city__label city__label--you';
    el.innerHTML = '<i class="city__dot"></i><span class="city__text"></span>';
    el.querySelector('.city__text').textContent = text;
    this.labelsEl.appendChild(el);
    c.label = { el, count: null, n: 0, base: 0, text, you: true };
  }

  /* ---------- WebGL ---------- */

  initGL() {
    const gl = this.gl;
    this.pHex = program(gl, VS_HEX, FS_HEX);
    this.pHalo = program(gl, VS_HALO, FS_HALO);
    this.pDot = program(gl, VS_DOT, FS_DOT);

    // hexes
    const geo = prismGeometry();
    this.hexCount = this.cells.length;
    this.indexCount = geo.idx.length;
    this.vaoHex = gl.createVertexArray();
    gl.bindVertexArray(this.vaoHex);
    const buf = (data, loc, size, divisor = 0, usage = gl.STATIC_DRAW) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, usage);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      if (divisor) gl.vertexAttribDivisor(loc, divisor);
      return b;
    };
    buf(geo.pos, 0, 3);
    buf(geo.nrm, 1, 3);
    buf(geo.edge, 2, 1);
    this.instData = new Float32Array(this.hexCount * 4);
    this.cells.forEach((c, i) => {
      this.instData.set([c.x, c.z, c.h, c.seed], i * 4);
    });
    this.bInst = buf(this.instData, 3, 4, 1, gl.DYNAMIC_DRAW);
    this.glowData = new Float32Array(this.hexCount);
    this.bGlow = buf(this.glowData, 4, 1, 1, gl.DYNAMIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    // halos
    this.haloMax = MAX_LIGHTS;
    this.vaoHalo = gl.createVertexArray();
    gl.bindVertexArray(this.vaoHalo);
    buf(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 0, 2);
    this.haloData = new Float32Array(this.haloMax * 4);
    this.bHalo = buf(this.haloData, 1, 4, 1, gl.DYNAMIC_DRAW);
    this.haloGlow = new Float32Array(this.haloMax);
    this.bHaloGlow = buf(this.haloGlow, 2, 1, 1, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);

    // people as points of light
    this.dotCount = reducedMotion ? 0 : this.quality === 'high' ? 110 : 54;
    this.dots = [];
    this.dotData = new Float32Array(Math.max(1, this.dotCount) * 4);
    this.vaoDot = gl.createVertexArray();
    gl.bindVertexArray(this.vaoDot);
    this.bDot = buf(this.dotData, 0, 4, 0, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    const rand = rng(77);
    for (let i = 0; i < this.dotCount; i++) {
      const d = {};
      this.spawnDot(d, rand, true);
      this.dots.push(d);
    }
    this.rand = rand;

    this.lights = new Float32Array(MAX_LIGHTS * 4);
  }

  spawnDot(d, rand = this.rand, initial = false) {
    const lit = this.litIdx;
    if (!lit.length) return;
    const target = lit[Math.floor(rand() * lit.length)];
    const t = this.cells[target];
    const ang = rand() * Math.PI * 2;
    const dist = 3 + rand() * 6;
    d.fx = t.x + Math.cos(ang) * dist;
    d.fz = t.z + Math.sin(ang) * dist;
    d.tx = t.x + (rand() - 0.5) * 0.5;
    d.tz = t.z + (rand() - 0.5) * 0.5;
    d.target = target;
    d.dur = 5 + rand() * 7;
    d.t = initial ? rand() : 0;
    d.wait = initial ? 0 : rand() * 2.5;
    d.lift = 0.38 + rand() * 0.22;
  }

  /* ---------- Camera ---------- */

  setView(name, { instant = false } = {}) {
    this.viewName = name;
    this.viewTarget = this.viewFor(name);
    if (instant) this.view = this.viewFor(name);
    if (this.labelsEl) this.labelsEl.classList.toggle('is-wait', name === 'wait');
    if (!this.running) this.renderOnce();
  }

  computeCamera(dt) {
    const v = this.view;
    const t = this.viewTarget;
    const k = dt > 0 ? 1 - Math.exp(-dt * 2.4) : 0;
    if (k) {
      v.dist = lerp(v.dist, t.dist, k);
      v.el = lerp(v.el, t.el, k);
      v.az = lerp(v.az, t.az, k);
      v.fov = lerp(v.fov, t.fov, k);
      for (let i = 0; i < 3; i++) v.target[i] = lerp(v.target[i], t.target[i], k);
      for (let i = 0; i < 2; i++) v.shift[i] = lerp(v.shift[i], t.shift[i], k);
    }
    const p = this.pointer;
    const s = this.viewName === 'hero' ? this.state.scroll : 0;
    const sway = reducedMotion ? 0 : Math.sin(this.time * 0.07) * 0.1;
    const az = v.az + sway + p.x * 0.09;
    const el = clamp(v.el + p.y * 0.045 + s * 0.28, 0.2, 1.45);
    const dist = v.dist * (1 - s * 0.12);
    const tg = v.target;
    this.eye[0] = tg[0] + dist * Math.cos(el) * Math.sin(az);
    this.eye[1] = tg[1] + dist * Math.sin(el);
    this.eye[2] = tg[2] + dist * Math.cos(el) * Math.cos(az);
    lookAt(this.viewM, this.eye, tg, [0, 1, 0]);
    const aspect = this.width / Math.max(1, this.height) || 1.6;
    perspective(this.proj, v.fov, aspect, 0.1, 200, v.shift[0], v.shift[1] - s * 0.1);
    multiply(this.vp, this.proj, this.viewM);
  }

  /* ---------- Animation ---------- */

  update(dt) {
    this.time += dt;
    const p = this.pointer;
    const kp = 1 - Math.exp(-dt * 3);
    p.x = lerp(p.x, p.tx, kp);
    p.y = lerp(p.y, p.ty, kp);

    // people move towards the groups
    for (const d of this.dots) {
      if (d.wait > 0) {
        d.wait -= dt;
        continue;
      }
      d.t += dt / d.dur;
      if (d.t >= 1) {
        this.arrive(d.target);
        this.spawnDot(d);
      }
    }

    // pulse and decay
    for (const i of this.litIdx) {
      const c = this.cells[i];
      c.boost *= Math.exp(-dt * 1.4);
      c.glow = c.lit * (0.86 + 0.14 * Math.sin(this.time * 1.2 + c.seed * 6.283)) + c.boost;
    }
    const u = this.cells[this.userIdx];
    u.boost *= Math.exp(-dt * 1.2);
    u.glow = this.userLit * (0.9 + 0.1 * Math.sin(this.time * 2)) + u.boost;

    // label counters stay a little alive: now and then someone leaves
    this.leaveT = (this.leaveT ?? 3) - dt;
    if (this.leaveT <= 0 && this.labelled?.length) {
      this.leaveT = 2.5 + Math.random() * 4;
      const i = this.labelled[Math.floor(Math.random() * this.labelled.length)];
      const lb = this.cells[i].label;
      if (lb && lb.n > lb.base - 1 && lb.n > 2) this.setCount(lb, lb.n - 1);
    }
  }

  arrive(i) {
    const c = this.cells[i];
    c.boost = Math.min(0.6, c.boost + 0.42);
    const lb = c.label;
    if (lb && lb.count && lb.n < lb.base + 2 && Math.random() < 0.6) this.setCount(lb, lb.n + 1);
  }

  setCount(lb, n) {
    lb.n = n;
    lb.count.textContent = String(n);
    lb.el.classList.remove('is-tick');
    void lb.el.offsetWidth;
    lb.el.classList.add('is-tick');
  }

  render() {
    const gl = this.gl;
    const intro = this.state.intro;

    // glow values and light uniforms
    this.glowData.fill(0);
    let n = 0;
    const lights = this.lights;
    const addLight = (c, g) => {
      if (n >= MAX_LIGHTS) return;
      lights[n * 4] = c.x;
      lights[n * 4 + 1] = c.z;
      lights[n * 4 + 2] = g * 0.95;
      lights[n * 4 + 3] = 2.3;
      this.haloData[n * 4] = c.x;
      this.haloData[n * 4 + 1] = c.h + 0.04;
      this.haloData[n * 4 + 2] = c.z;
      this.haloData[n * 4 + 3] = 1.9;
      this.haloGlow[n] = g;
      n++;
    };
    for (const i of this.faintIdx) this.glowData[i] = this.cells[i].faint;
    for (const i of this.litIdx) {
      const c = this.cells[i];
      this.glowData[i] = c.glow;
      addLight(c, c.glow);
    }
    const u = this.cells[this.userIdx];
    if (u.glow > 0.01) {
      this.glowData[this.userIdx] = u.glow;
      addLight(u, u.glow);
    }
    const lightIntro = clamp((intro - 0.45) / 0.55);
    for (let i = 0; i < n; i++) lights[i * 4 + 2] *= lightIntro;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(BG[0], BG[1], BG[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    const focus = this.viewName === 'wait' ? [this.view.target[0], this.view.target[2]] : [0, -0.5];
    const fogR = this.viewName === 'wait' ? [7, 17] : [this.mobile ? 10 : 12, this.mobile ? 19 : 23.5];

    // 1. hexes
    const ph = this.pHex;
    gl.useProgram(ph.p);
    gl.uniformMatrix4fv(ph.u.u_vp, false, this.vp);
    gl.uniform1f(ph.u.u_size, 0.93);
    gl.uniform1f(ph.u.u_intro, intro);
    gl.uniform1f(ph.u.u_reach, this.R * 1.5);
    gl.uniform3fv(ph.u.u_cam, this.eye);
    gl.uniform3fv(ph.u.u_bg, BG);
    gl.uniform2fv(ph.u.u_fogR, fogR);
    gl.uniform2fv(ph.u.u_focus, focus);
    gl.uniform4fv(ph.u.u_lights, lights);
    gl.uniform1i(ph.u.u_nLights, n);
    gl.uniform1f(ph.u.u_time, this.time);
    gl.bindVertexArray(this.vaoHex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bGlow);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.glowData);
    gl.drawElementsInstanced(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0, this.hexCount);

    // 2. halos and 3. people: additive, without writing depth
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);

    const pl = this.pHalo;
    gl.useProgram(pl.p);
    gl.uniformMatrix4fv(pl.u.u_vp, false, this.vp);
    const m = this.viewM;
    gl.uniform3f(pl.u.u_right, m[0], m[4], m[8]);
    gl.uniform3f(pl.u.u_up, m[1], m[5], m[9]);
    gl.uniform1f(pl.u.u_intro, intro);
    gl.uniform2fv(pl.u.u_fogR, fogR);
    gl.uniform2fv(pl.u.u_focus, focus);
    gl.bindVertexArray(this.vaoHalo);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bHalo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.haloData);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bHaloGlow);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.haloGlow);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);

    if (this.dotCount && intro > 0.6) {
      const dots = this.dotData;
      const fade = clamp((intro - 0.6) / 0.4);
      this.dots.forEach((d, i) => {
        const t = clamp(d.t);
        const e = ease.inOutCubic(t);
        dots[i * 4] = lerp(d.fx, d.tx, e);
        dots[i * 4 + 2] = lerp(d.fz, d.tz, e);
        dots[i * 4 + 1] = d.lift + Math.sin(Math.PI * t) * 0.22;
        const a = d.wait > 0 ? 0 : clamp(t / 0.12) * clamp((1 - t) / 0.12);
        dots[i * 4 + 3] = a * 0.95 * fade;
      });
      const pd = this.pDot;
      gl.useProgram(pd.p);
      gl.uniformMatrix4fv(pd.u.u_vp, false, this.vp);
      gl.uniform1f(pd.u.u_ps, 2.6 * this.dpr);
      gl.uniform2fv(pd.u.u_fogR, fogR);
      gl.uniform2fv(pd.u.u_focus, focus);
      gl.bindVertexArray(this.vaoDot);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bDot);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, dots);
      gl.drawArrays(gl.POINTS, 0, this.dotCount);
    }
    gl.depthMask(true);
    gl.bindVertexArray(null);

    this.placeLabels(focus, fogR);
  }

  placeLabels(focus, fogR) {
    if (!this.labelsEl) return;
    const W = this.width;
    const H = this.height;
    const show = this.state.intro > 0.92;
    this.cells.forEach((c) => {
      if (!c.label) return;
      const [nx, ny, w] = project(this.vp, c.x, c.h + 0.42, c.z);
      const r = Math.hypot(c.x - focus[0], c.z - focus[1]);
      const fogged = r > fogR[0] + (fogR[1] - fogR[0]) * 0.35;
      const visible = show && w > 0 && Math.abs(nx) < 1.05 && Math.abs(ny) < 1.05 && !fogged
        && (c.label.you ? this.viewName === 'wait' : this.viewName === 'hero');
      const x = (nx * 0.5 + 0.5) * W;
      const y = (1 - (ny * 0.5 + 0.5)) * H;
      c.label.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      c.label.el.classList.toggle('is-on', visible);
    });
  }

  /* ---------- Controls ---------- */

  frame = (now) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    this.update(dt);
    this.computeCamera(dt);
    this.render();
    this.adapt(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  // lower the resolution on weak graphics
  adapt(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 0.028 && this.dpr > 1) {
      this.dpr = Math.max(1, this.dpr - 0.25);
      this.resize();
    }
  }

  start() {
    if (this.running || reducedMotion) {
      if (reducedMotion) this.renderOnce();
      return;
    }
    this.running = true;
    this.last = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  renderOnce() {
    this.computeCamera(0);
    for (const i of this.litIdx) {
      const c = this.cells[i];
      c.glow = c.lit + c.boost;
    }
    const u = this.cells[this.userIdx];
    u.glow = this.userLit;
    this.render();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    if (!this.running) this.renderOnce();
  }

  setMobile(m) {
    if (m === this.mobile) return;
    this.mobile = m;
    this.viewTarget = this.viewFor(this.viewName);
    this.view = this.viewFor(this.viewName);
  }

  bindEvents() {
    this.onPointer = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      this.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.stop();
      this.onLost?.();
    });
  }

  intro(duration = 2600) {
    return tween({
      from: 0,
      to: 1,
      duration,
      ease: ease.outCubic,
      onUpdate: (v) => {
        this.state.intro = v;
        if (!this.running) this.renderOnce();
      },
    }).finished;
  }

  // after signing up for the waitlist: your hex lights up
  lightUserCell(text = 'You’re in') {
    const i = this.userIdx;
    const c = this.cells[i];
    this.setUserLabel(text);
    return tween({
      from: 0,
      to: 1,
      duration: 1600,
      ease: ease.outExpo,
      onUpdate: (v) => {
        this.userLit = v;
        c.h = c.base + (0.46 - c.base) * v;
        this.instData[i * 4 + 2] = c.h;
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bInst);
        gl.bufferSubData(gl.ARRAY_BUFFER, i * 16, this.instData.subarray(i * 4, i * 4 + 4));
        c.boost = 0.5 * (1 - v);
        if (!this.running) this.renderOnce();
      },
    }).finished;
  }
}
return { HexCity };
})();

// src/js/sections/loader.js
const $m7 = (() => {
const { reducedMotion, wait } = $m1;
const { animate, curve } = $m4;
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

function createLoader() {
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
return { createLoader };
})();

// src/js/sections/hero.js
const $m8 = (() => {
const { reducedMotion, isMobile } = $m1;
const { animate, animateAll, curve } = $m4;
const { track } = $m2;
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

function initHero({ city }) {
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
return { initHero };
})();

// src/js/core/split.js
const $m10 = (() => {
/*
  Split text into words. The original text stays as a hidden copy for
  screen readers; the word spans are aria-hidden.
*/
function splitWords(el, cls = 'w') {
  if (!el) return [];
  const text = el.textContent.replace(/\s+/g, ' ').trim();
  el.textContent = '';
  const sr = document.createElement('span');
  sr.className = 'visually-hidden';
  sr.textContent = text;
  el.appendChild(sr);
  const wrap = document.createElement('span');
  wrap.setAttribute('aria-hidden', 'true');
  const words = [];
  text.split(' ').forEach((w, i, arr) => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = w;
    wrap.appendChild(s);
    words.push(s);
    if (i < arr.length - 1) wrap.appendChild(document.createTextNode(' '));
  });
  el.appendChild(wrap);
  return words;
}
return { splitWords };
})();

// src/js/sections/manifest.js
const $m9 = (() => {
const { reducedMotion, clamp } = $m1;
const { splitWords } = $m10;
const { track } = $m2;
/*
  Manifest: as you read, the words light up one after another, like
  lights in the city. Whoever scrolls sets the pace.
*/
function initManifest() {
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
return { initManifest };
})();

// src/js/sections/tour.js
const $m11 = (() => {
const { reducedMotion } = $m1;
const { animate, animateAll, curve, tween } = $m4;
const { track, inView } = $m2;
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

function initTour() {
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
return { initTour };
})();

// src/js/sections/quickjoin.js
const $m12 = (() => {
const { isMobile, reducedMotion, rng } = $m1;
const { animate, curve } = $m4;
const { axialToXY, hexCorners, hexDistance, hexRange, key } = $m5;
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

function initQuickJoin() {
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
return { initQuickJoin };
})();

// src/js/sections/shards.js
const $m13 = (() => {
const { reducedMotion, isMobile, smoothstep, lerp } = $m1;
const { track } = $m2;
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

function initShards() {
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
return { initShards };
})();

// src/js/sections/faq.js
const $m14 = (() => {
const { reducedMotion } = $m1;
const { animate, curve } = $m4;
/*
  Questions and answers: <details> with a smoothly animated height.
  Each animation is removed when it ends, so the answer keeps its natural
  height (e.g. after the window is resized). Clicking again mid-animation
  reverses from wherever it currently is.
*/
function initFaq() {
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
return { initFaq };
})();

// src/js/sections/waitlist.js
const $m15 = (() => {
const { reducedMotion, wait } = $m1;
const { animate, animateAll } = $m4;
/*
  Waitlist: the city comes back. After signing up, a new hex lights
  up – yours.

  Connecting the form: add a data-endpoint="https://…" attribute to
  <form data-form> (e.g. Formspree, Getform, Brevo or your own backend).
  Without an endpoint nothing is saved and the page only shows the
  confirmation (fine for previews, not for production).
*/

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function initWaitlist({ city }) {
  const section = document.querySelector('[data-wait]');
  if (!section) return;
  const form = section.querySelector('[data-form]');
  const done = section.querySelector('[data-form-done]');
  const error = section.querySelector('[data-form-error]');
  const emailField = form.querySelector('#email').closest('.field');
  const button = form.querySelector('button[type="submit"]');

  const setError = (msg) => {
    error.textContent = msg;
    emailField.classList.toggle('is-invalid', !!msg);
    form.email.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };

  form.addEventListener('input', () => { if (error.textContent) setError(''); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!EMAIL.test(email)) {
      setError('Please enter a valid email address, for example you@example.com.');
      form.email.focus();
      if (!reducedMotion) animate(emailField, [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 420, easing: 'linear', commit: false });
      return;
    }
    setError('');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      const endpoint = form.dataset.endpoint;
      if (endpoint) {
        const res = await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(form) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        await wait(600);
        console.info('[JustJoin] No data-endpoint on the form – the sign-up was not saved.');
      }
      celebrate();
    } catch (err) {
      setError('Your sign-up wasn’t saved. Check your connection and try again.');
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });

  async function celebrate() {
    if (!reducedMotion) await animate(form, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-16px)' }], { duration: 450, commit: false })?.finished;
    done.style.minHeight = `${form.offsetHeight}px`;
    form.hidden = true;
    done.hidden = false;
    animateAll(done.children, [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 1100 }, 100);
    done.setAttribute('tabindex', '-1');
    done.focus({ preventScroll: true });
    city?.lightUserCell('You’re in');
  }
}
return { initWaitlist };
})();

// src/js/ui/nav.js
const $m16 = (() => {
const { onScroll, inView } = $m2;
/*
  Navigation: transparent over the city, then with a glass background.
  It slides away when you scroll down and comes back when you scroll up.
*/
function initNav({ menuState }) {
  const nav = document.querySelector('[data-nav]');
  if (!nav) return;
  let hidden = false;
  const setHidden = (h) => {
    if (h === hidden) return;
    hidden = h;
    nav.classList.toggle('is-hidden', h);
  };

  onScroll((st) => {
    const y = st.y;
    const vh = st.vh || window.innerHeight;
    nav.classList.toggle('is-solid', y > vh * 0.8);
    if (menuState.open || y < vh * 0.8) return setHidden(false);
    if (st.dir === 1 && st.velocity > 300) setHidden(true);
    else if (st.dir === -1) setHidden(false);
  });

  // focus inside the navigation brings it back
  nav.addEventListener('focusin', () => setHidden(false));

  // current section
  const links = [...nav.querySelectorAll('.nav__links a')];
  links.forEach((a) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    inView(target, (on) => {
      a.classList.toggle('is-current', on);
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }, { rootMargin: '-50% 0px -50% 0px' });
  });
}
return { initNav };
})();

// src/js/ui/menu.js
const $m17 = (() => {
const { reducedMotion } = $m1;
const { animate, animateAll, curve } = $m4;
/* Fullscreen menu for small screens. Esc closes it, focus stays inside. */
function initMenu({ menuState }) {
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-menu]');
  const nav = document.querySelector('[data-nav]');
  if (!toggle || !menu) return;
  const label = toggle.querySelector('[data-menu-label]');
  const links = [...menu.querySelectorAll('a')];
  const items = menu.querySelectorAll('.menu__list li');

  const open = () => {
    menuState.open = true;
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    label.textContent = 'Close';
    nav.classList.add('is-menu');
    document.documentElement.classList.add('menu-open');
    if (!reducedMotion) {
      animate(menu, [{ clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)' }], { duration: 800, easing: curve.inOutExpo, commit: false });
      animateAll(items, [{ opacity: 0, transform: 'translateY(40%)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 280 }, 55);
    }
    links[0]?.focus({ preventScroll: true });
  };

  const close = (after) => {
    menuState.open = false;
    toggle.setAttribute('aria-expanded', 'false');
    label.textContent = 'Menu';
    const finish = () => {
      menu.hidden = true;
      nav.classList.remove('is-menu');
      document.documentElement.classList.remove('menu-open');
      after?.();
    };
    if (reducedMotion) return finish();
    const a = animate(menu, [{ clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(100% 0% 0% 0%)' }], { duration: 650, easing: curve.inOutExpo, commit: false });
    a ? a.finished.then(finish).catch(finish) : finish();
  };

  toggle.addEventListener('click', () => (menuState.open ? close(() => toggle.focus()) : open()));

  links.forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (!href || !href.startsWith('#')) return;
      e.preventDefault();
      const target = document.querySelector(href);
      close(() => target?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' }));
    });
  });

  document.addEventListener('keydown', (e) => {
    if (!menuState.open) return;
    if (e.key === 'Escape') close(() => toggle.focus());
    if (e.key === 'Tab') {
      const focusables = [toggle, ...links];
      const i = focusables.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        focusables[focusables.length - 1].focus();
      } else if (!e.shiftKey && i === focusables.length - 1) {
        e.preventDefault();
        focusables[0].focus();
      }
    }
  });
}
return { initMenu };
})();

// src/js/ui/magnetic.js
const $m18 = (() => {
const { finePointer, reducedMotion, lerp } = $m1;
/* Buttons lean slightly towards the mouse pointer. */
function initMagnetic() {
  if (!finePointer || reducedMotion) return;
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    const loop = () => {
      x = lerp(x, tx, 0.18);
      y = lerp(y, ty, 0.18);
      el.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
      if (Math.abs(x - tx) > 0.05 || Math.abs(y - ty) > 0.05) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      tx = (e.clientX - (r.left + r.width / 2)) * 0.25;
      ty = (e.clientY - (r.top + r.height / 2)) * 0.35;
      kick();
    });
    el.addEventListener('pointerleave', () => {
      tx = 0;
      ty = 0;
      kick();
    });
  });
}
return { initMagnetic };
})();

// src/js/main.js
const $m0 = (() => {
const { reducedMotion, hasWebGL2, cityQuality, isMobile, wait } = $m1;
const { initScroll, inView, measureAll } = $m2;
const { HexCity } = $m3;
const { createLoader } = $m7;
const { initHero } = $m8;
const { initManifest } = $m9;
const { initTour } = $m11;
const { initQuickJoin } = $m12;
const { initShards } = $m13;
const { initFaq } = $m14;
const { initWaitlist } = $m15;
const { initNav } = $m16;
const { initMenu } = $m17;
const { initMagnetic } = $m18;
/*
  JustJoin – website
  Entry point: city of hexes, sections, intro.
  No external libraries – everything lives here in src/js.
*/















function createCity() {
  const canvas = document.querySelector('[data-city-canvas]');
  if (!canvas || !hasWebGL2()) {
    document.documentElement.classList.add('no-webgl');
    return null;
  }
  try {
    const city = new HexCity(canvas, {
      quality: cityQuality(),
      labelsEl: document.querySelector('[data-city-labels]'),
      mobile: isMobile(),
    });
    city.onLost = () => document.documentElement.classList.add('no-webgl');
    return city;
  } catch (err) {
    console.warn('[JustJoin] WebGL not available:', err);
    document.documentElement.classList.add('no-webgl');
    return null;
  }
}

/* One city, two stages: hero and waitlist. In between it rests. */
function directCity(city) {
  const hero = document.querySelector('[data-hero]');
  const waitSec = document.querySelector('[data-wait]');
  const stage = document.querySelector('[data-city]');
  let heroOn = true;
  let waitOn = false;
  let mode = null;
  const apply = () => {
    const next = heroOn ? 'hero' : waitOn ? 'wait' : null;
    stage.classList.toggle('is-off', !next);
    if (!next) {
      city.stop();
      mode = null;
      return;
    }
    if (next !== mode) city.setView(next, { instant: true });
    mode = next;
    if (!document.hidden) city.start();
  };
  inView(hero, (v) => { heroOn = v; apply(); });
  inView(waitSec, (v) => { waitOn = v; apply(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) city.stop();
    else if (mode) city.start();
  });
  let t;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      city.setMobile(isMobile());
      city.resize();
    }, 150);
  });
  apply();
}

async function boot() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  const root = document.documentElement;
  root.classList.add('is-loading');
  initScroll();

  const loader = createLoader();
  const city = createCity();
  loader.setProgress(0.4);

  await Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), wait(2500)]);
  loader.setProgress(0.75);
  await wait(reducedMotion ? 50 : 650);

  const menuState = { open: false };
  // each section on its own: an error in one does not take down the whole page
  const safe = (name, fn) => {
    try {
      return fn();
    } catch (err) {
      console.error(`[JustJoin] ${name}:`, err);
      return null;
    }
  };
  const hero = safe('Hero', () => initHero({ city })) || { intro() {} };
  safe('Manifest', initManifest);
  safe('Tour', initTour);
  safe('QuickJoin', initQuickJoin);
  safe('Shards', initShards);
  safe('FAQ', initFaq);
  safe('Waitlist', () => initWaitlist({ city }));
  safe('Navigation', () => initNav({ menuState }));
  safe('Menu', () => initMenu({ menuState }));
  safe('Magnetic', initMagnetic);
  if (city) safe('City', () => directCity(city));
  measureAll();
  loader.setProgress(1);

  const done = loader.finish();
  await wait(reducedMotion ? 0 : 1000);
  root.classList.remove('is-loading');
  hero.intro();
  await done;
  measureAll();

  // placeholder links (social, legal notice …) do not jump to the top
  document.querySelectorAll('a[data-todo]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      console.info(`[JustJoin] The link "${a.dataset.todo}" has not been set up yet.`);
    });
  });

  window.__jj = { city };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
return {  };
})();
})();
