// Hair simulation worker: runs physics + tools off the main thread and
// streams ready-to-draw vertex data back.
import { Hair, S, MAXP, NG, SEG } from './hair3d.js';
import { loadSDF, raySDF } from './sdf.js';

export const STRIDE = 15;
const hair = new Hair();
let ready = false;
let ptr = null;          // latest pointer/tool state from main thread
let prev = null;         // previous applied pointer (screen px)
let pool = [];           // vertex buffers returned by main thread
let changed = true;
let lastIdx = null;

const ROOT = new URL('../', import.meta.url);

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'load') {
    await loadSDF(new URL('models/head.sdf', ROOT).href);
    for (let i = 0; i < 3; i++) pool.push(new Float32Array(S * MAXP * STRIDE));
    self.postMessage({ type: 'loaded' });
  } else if (m.type === 'client') {
    ready = false;
    // A stroke belongs to the client it started on. Never let the last
    // pointer sample bridge into the freshly initialized hair.
    ptr = null;
    prev = null;
    hair.init(m.client);
    ready = true; changed = true; hair.dirty = true;
    self.postMessage({ type: 'client' });
  } else if (m.type === 'ptr') {
    ptr = m;
    if (!m.down) prev = null;
  } else if (m.type === 'buf') {
    pool.push(new Float32Array(m.buf));
  }
};

// ---------------- tools ----------------
function applyTool(dt, time) {
  const p = ptr;
  const c = p.camPos, r = p.rayDir, f = p.forward;
  let headW = Infinity;
  const t = raySDF(c[0], c[1], c[2], r[0], r[1], r[2]);
  if (t < Infinity) headW = t * (r[0] * f[0] + r[1] * f[1] + r[2] * f[2]);
  hair.project(p.m, p.W, p.H);
  const R = p.radius;
  const px = prev ? prev.sx : p.sx, py = prev ? prev.sy : p.sy;
  const dx = p.sx - px, dy = p.sy - py;
  switch (p.tool) {
    case 'shears': case 'thin': case 'texture':
      if (prev && dx * dx + dy * dy > 1) {
        const n = hair.cut(px, py, p.sx, p.sy, headW, p.tool);
        if (n) self.postMessage({ type: 'snip', n });
      }
      break;
    case 'clippers':
      hair.clip(p.sx, p.sy, R * 0.6, { x: c[0], y: c[1], z: c[2] });
      break;
    case 'comb':
      if (prev && (dx || dy) && hair.gather(p.sx, p.sy, R, headW, 6)) {
        const k = hair.selMinW * p.k;
        const u = p.right, v = p.up;
        hair.comb((u[0] * dx - v[0] * dy) * k, (u[1] * dx - v[1] * dy) * k, (u[2] * dx - v[2] * dy) * k);
      }
      break;
    case 'dryer':
      if (hair.gather(p.sx, p.sy, R * 1.5, headW + 3, 25)) hair.dryer(r[0], r[1], r[2], time);
      break;
    case 'dye': case 'highlight':
      if (hair.gather(p.sx, p.sy, R, headW, 4)) hair.dye(p.color, p.tool === 'highlight');
      break;
    case 'grow':
      if (hair.gather(p.sx, p.sy, R, headW, 6)) hair.grow(dt);
      break;
    default:
      if (hair.gather(p.sx, p.sy, R, headW, 5)) hair.product(p.tool);
  }
  prev = { sx: p.sx, sy: p.sy };
  changed = true;
}

// ---------------- vertex data ----------------
function fill(d) {
  const { X, Y, Z, CR, CG, CB, WET, D } = hair;
  for (let s = 0; s < S; s++) {
    if (!hair.active[s]) continue;
    const b = s * MAXP, n = hair.n[s], len = hair.len[s], free = hair.free[s];
    const shade = free ? 0.9 : 0.8 + hair.depth[s] * 0.25;
    let bx = hair.mx[s], by = hair.my[s], bz = hair.mz[s];
    if (free) { bx = 1; by = 0; bz = 0; }
    for (let i = 0; i < n; i++) {
      const j = b + i, o = j * STRIDE;
      let tx, ty, tz;
      if (i < n - 1) { tx = X[j + 1] - X[j]; ty = Y[j + 1] - Y[j]; tz = Z[j + 1] - Z[j]; }
      else { tx = X[j] - X[j - 1]; ty = Y[j] - Y[j - 1]; tz = Z[j] - Z[j - 1]; }
      const l = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      tx /= l; ty /= l; tz /= l;
      // parallel-transport the lock frame along the strand
      const dp = bx * tx + by * ty + bz * tz;
      bx -= tx * dp; by -= ty * dp; bz -= tz * dp;
      let bl = Math.sqrt(bx * bx + by * by + bz * bz);
      if (bl < 1e-3) { bx = ty; by = -tx; bz = 0; bl = Math.sqrt(bx * bx + by * by) || 1; if (bl < 1e-3) { bx = 1; by = 0; bz = 0; bl = 1; } }
      bx /= bl; by /= bl; bz /= bl;
      const dd = D[j];
      const ao = dd >= 3 ? 1 : 0.5 + 0.5 * smooth(0.05, 2.6, dd);
      const wf = shade * ao * (1 - 0.45 * WET[j]);
      const dist = free ? 0 : i < n - 1 ? i * SEG : len;
      d[o] = X[j]; d[o + 1] = Y[j]; d[o + 2] = Z[j];
      d[o + 3] = tx; d[o + 4] = ty; d[o + 5] = tz;
      d[o + 6] = bx; d[o + 7] = by; d[o + 8] = bz;
      d[o + 9] = CR[j] * wf; d[o + 10] = CG[j] * wf; d[o + 11] = CB[j] * wf;
      d[o + 12] = dist; d[o + 13] = free ? 0 : dist / len; d[o + 14] = s;
    }
  }
}
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function buildIndex() {
  const idx = new Uint32Array(S * MAXP * 2);
  let k = 0;
  for (let s = 0; s < S; s++) {
    if (!hair.active[s]) continue;
    const b = s * MAXP, n = hair.n[s];
    for (let i = 0; i < n - 1; i++) { idx[k++] = b + i; idx[k++] = b + i + 1; }
  }
  hair.dirty = false;
  return { idx, count: k };
}

// ---------------- loop ----------------
const DT = 1 / 60;
let last = performance.now(), acc = 0;
function tick() {
  const now = performance.now();
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  if (ready) {
    let steps = 0;
    while (acc >= DT && steps < 2) {
      if (ptr && ptr.down) applyTool(DT, now / 1000);
      if (!hair.sleeping) { hair.step(); changed = true; }
      acc -= DT; steps++;
    }
    if (acc > DT * 3) acc = 0;
    if ((changed || hair.dirty) && pool.length) {
      const buf = pool.pop();
      fill(buf);
      const msg = { type: 'frame', buf: buf.buffer };
      const tr = [buf.buffer];
      if (hair.dirty) {
        const { idx, count } = buildIndex();
        msg.idx = idx.buffer; msg.count = count; tr.push(idx.buffer);
      }
      self.postMessage(msg, tr);
      changed = false;
    }
  } else acc = 0;
  const spent = performance.now() - now;
  setTimeout(tick, Math.max(0, DT * 1000 - spent));
}
tick();
