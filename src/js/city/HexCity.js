import { clamp, lerp, rng, reducedMotion } from '../core/env.js';
import { ease, tween } from '../core/anim.js';
import { axialToXY, hexDistance, hexRange } from './hexgrid.js';
import { mat4, perspective, lookAt, multiply, project } from './mat.js';

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

export class HexCity {
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
