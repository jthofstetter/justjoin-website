/*
  Hex grid as in QuickJoin: flat-topped hexagons (points on the left and
  right), addressed with axial coordinates q and r.
*/

export const SQRT3 = Math.sqrt(3);

export function axialToXY(q, r, size = 1) {
  return [size * 1.5 * q, size * SQRT3 * (r + q / 2)];
}

export function hexDistance(q, r) {
  return (Math.abs(q) + Math.abs(r) + Math.abs(-q - r)) / 2;
}

export function hexCorners(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
  }
  return pts;
}

export function hexRange(R) {
  const out = [];
  for (let q = -R; q <= R; q++) {
    const r1 = Math.max(-R, -q - R);
    const r2 = Math.min(R, -q + R);
    for (let r = r1; r <= r2; r++) out.push([q, r]);
  }
  return out;
}

export function axialRound(q, r) {
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

export function xyToAxial(x, y, size = 1) {
  const q = ((2 / 3) * x) / size;
  const r = ((-1 / 3) * x + (SQRT3 / 3) * y) / size;
  return axialRound(q, r);
}

export const key = (q, r) => `${q},${r}`;
