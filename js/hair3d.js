// 3D strand hair simulation (cm units). Verlet + follow-the-leader inextensibility,
// helical curl rest shape, SDF body collision.
import { sdf, sdfGrad, sdfG, SG } from './sdf.js';

export const SEG = 0.9;
export const MAXP = 48;
export const MAXL = (MAXP - 1) * SEG;
export const NG = 1400;  // guide strands on the scalp
export const NC = 320;   // falling clippings
export const S = NG + NC;
export const CC = [0, 9.5, 0.5];      // cranium center
export const CRAD = [8.75, 10.5, 10.75];

const THR = [[-1, -0.75], [-0.5, -0.5], [-0.2, -0.05], [0, 0.12], [0.5, 0.35], [1, 0.55]];
export function hairThr(c) {
  for (let i = 1; i < THR.length; i++) {
    if (c <= THR[i][0]) {
      const [c0, t0] = THR[i - 1], [c1, t1] = THR[i];
      return t0 + ((c - c0) / (c1 - c0)) * (t1 - t0);
    }
  }
  return THR[THR.length - 1][1];
}

const DT = 1 / 60;
const MARGIN = new Float64Array(1);
const TW = Math.cos(0.4), TWS = Math.sin(0.4);
const ROOTK = Array.from({ length: 9 }, (_, i) => (i ? 0.7 * Math.exp(-(i - 1) * 0.38) : 0));
const G = 520 * DT * DT; // cm per step^2 (slightly under real g: strands are coarser than real hair)

export class Hair {
  constructor() {
    const N = S * MAXP;
    const F = () => new Float32Array(N);
    this.X = F(); this.Y = F(); this.Z = F();
    this.PX = F(); this.PY = F(); this.PZ = F();
    this.CR = F(); this.CG = F(); this.CB = F();
    this.CURL = F(); this.STIFF = F(); this.HOLD = F(); this.WET = F(); this.D = F();
    this.SX = F(); this.SY = F(); this.SW = F();
    const f = () => new Float32Array(S);
    this.len = f(); this.lastRest = f(); this.n = new Int32Array(S);
    this.active = new Uint8Array(S); this.free = new Uint8Array(S);
    this.rx = f(); this.ry = f(); this.rz = f();       // root
    this.nx = f(); this.ny = f(); this.nz = f();       // scalp normal
    this.dx = f(); this.dy = f(); this.dz = f();       // root direction
    this.mx = f(); this.my = f(); this.mz = f();       // curl frame
    this.natR = f(); this.natG = f(); this.natB = f(); this.natCurl = f();
    this.depth = f(); this.age = f(); this.side = f(); this.hl = new Uint8Array(S);
    this.clipNext = 0;
    this.dirty = true;
    this.quiet = 0;
    this.selJ = new Int32Array(N); this.selW = new Float32Array(N); this.selN = 0;
  }

  get sleeping() { return this.quiet > 50; }
  wake() { this.quiet = 0; }

  init(cl) {
    this.active.fill(0); this.free.fill(0);
    this.HOLD.fill(0); this.STIFF.fill(0); this.WET.fill(0);
    const [hr, hg, hb] = cl.hair;
    const { X, Y, Z, PX, PY, PZ } = this;
    for (let s = 0; s < NG; s++) {
      // sample a root on the scalp by sphere-tracing towards the cranium center
      let px, py, pz, n;
      for (;;) {
        let ux = gauss(), uy = gauss(), uz = gauss();
        const l = Math.hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l;
        const c = uz / Math.max(1e-3, Math.hypot(ux, uz));
        if (uy < hairThr(c)) continue;
        const sx = CC[0] + ux * CRAD[0] * 1.6, sy = CC[1] + uy * CRAD[1] * 1.6, sz = CC[2] + uz * CRAD[2] * 1.6;
        let rx = CC[0] - sx, ry = CC[1] - sy, rz = CC[2] - sz;
        const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
        let t = 0, hit = false;
        for (let k = 0; k < 100 && t < rl; k++) {
          const d = sdf(sx + rx * t, sy + ry * t, sz + rz * t);
          if (d < 0.02) { hit = true; break; }
          t += Math.max(d * 0.9, 0.03);
        }
        if (!hit) continue;
        px = sx + rx * t; py = sy + ry * t; pz = sz + rz * t;
        n = sdfGrad(px, py, pz).slice();
        break;
      }
      px += n[0] * 0.05; py += n[1] * 0.05; pz += n[2] * 0.05;
      // flow direction: away from the part, down and back
      const side = px - cl.part >= 0 ? 1 : -1;
      this.side[s] = side;
      const front = Math.max(0, Math.min(1, (pz - 2) / 6));
      let fx = side * (1 - 0.25 * front), fy = -0.45 + 1.1 * front, fz = -0.55 - 0.45 * front;
      const fd = fx * n[0] + fy * n[1] + fz * n[2];
      fx -= n[0] * fd; fy -= n[1] * fd; fz -= n[2] * fd;
      const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      let dx = n[0] * 0.55 + fx * 0.85, dy = n[1] * 0.55 + fy * 0.85, dz = n[2] * 0.55 + fz * 0.85;
      const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      // curl frame vector perpendicular to root dir
      let ax = gauss(), ay = gauss(), az = gauss();
      let mx = dy * az - dz * ay, my = dz * ax - dx * az, mz = dx * ay - dy * ax;
      const ml = Math.hypot(mx, my, mz) || 1;
      this.mx[s] = mx / ml; this.my[s] = my / ml; this.mz[s] = mz / ml;

      this.rx[s] = px; this.ry[s] = py; this.rz[s] = pz;
      this.nx[s] = n[0]; this.ny[s] = n[1]; this.nz[s] = n[2];
      this.dx[s] = dx; this.dy[s] = dy; this.dz[s] = dz;
      this.depth[s] = Math.random();
      const f = 0.86 + Math.random() * 0.26;
      this.natR[s] = hr * f * (0.95 + Math.random() * 0.1);
      this.natG[s] = hg * f * (0.95 + Math.random() * 0.1);
      this.natB[s] = hb * f * (0.95 + Math.random() * 0.1);
      this.natCurl[s] = cl.curl * (0.8 + Math.random() * 0.4);
      this.hl[s] = Math.random() < 0.24 ? 1 : 0;
      this.active[s] = 1;

      const L = Math.min(MAXL, cl.len * (0.9 + Math.random() * 0.14));
      const nSeg = Math.max(1, Math.ceil(L / SEG - 1e-4));
      this.n[s] = nSeg + 1; this.len[s] = L; this.lastRest[s] = L - (nSeg - 1) * SEG;
      const b = s * MAXP;
      let ux = dx, uy = dy, uz = dz, qx = px, qy = py, qz = pz;
      for (let i = 0; i < MAXP; i++) {
        const j = b + i;
        if (i > 0) {
          if (i > 2) { ux *= 0.8; uy = uy * 0.8 - 0.2; uz = uz * 0.8 - 0.12; const l = Math.hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l; }
          qx += ux * SEG; qy += uy * SEG; qz += uz * SEG;
          const d = sdf(qx, qy, qz), m = 0.3 + this.depth[s];
          if (d < m) { const gr = sdfGrad(qx, qy, qz); qx += gr[0] * (m - d); qy += gr[1] * (m - d); qz += gr[2] * (m - d); }
        }
        X[j] = PX[j] = qx; Y[j] = PY[j] = qy; Z[j] = PZ[j] = qz;
        this.CR[j] = this.natR[s]; this.CG[j] = this.natG[s]; this.CB[j] = this.natB[s];
        this.CURL[j] = this.natCurl[s];
        this.D[j] = 3;
      }
    }
    this.dirty = true;
    for (let k = 0; k < 180; k++) this.step();
    this.wake();
  }

  setLen(s, L) {
    L = Math.max(0.3, Math.min(MAXL, L));
    const nSeg = Math.max(1, Math.ceil(L / SEG - 1e-4));
    const newN = nSeg + 1, n = this.n[s], b = s * MAXP;
    const { X, Y, Z, PX, PY, PZ } = this;
    for (let i = n; i < newN; i++) {
      const j = b + i;
      let ux = X[j - 1] - X[j - 2], uy = Y[j - 1] - Y[j - 2], uz = Z[j - 1] - Z[j - 2];
      const l = Math.hypot(ux, uy, uz) || 1;
      X[j] = PX[j] = X[j - 1] + (ux / l) * SEG;
      Y[j] = PY[j] = Y[j - 1] + (uy / l) * SEG;
      Z[j] = PZ[j] = Z[j - 1] + (uz / l) * SEG;
      this.CR[j] = this.CR[j - 1]; this.CG[j] = this.CG[j - 1]; this.CB[j] = this.CB[j - 1];
      this.CURL[j] = this.CURL[j - 1]; this.STIFF[j] = this.STIFF[j - 1];
      this.HOLD[j] = this.HOLD[j - 1]; this.WET[j] = this.WET[j - 1]; this.D[j] = this.D[j - 1];
    }
    this.n[s] = newN; this.len[s] = L; this.lastRest[s] = L - (nSeg - 1) * SEG;
    if (newN !== n) this.dirty = true;
  }

  posAt(s, d, out) {
    const n = this.n[s], b = s * MAXP;
    let k = Math.min(Math.floor(d / SEG), n - 2);
    if (k < 0) k = 0;
    const r = k < n - 2 ? SEG : this.lastRest[s];
    const t = Math.max(0, Math.min(1, (d - k * SEG) / r));
    const j = b + k;
    out[0] = this.X[j] + (this.X[j + 1] - this.X[j]) * t;
    out[1] = this.Y[j] + (this.Y[j + 1] - this.Y[j]) * t;
    out[2] = this.Z[j] + (this.Z[j + 1] - this.Z[j]) * t;
    out[3] = t < 0.5 ? j : j + 1;
    return out;
  }

  // ---------------- simulation ----------------
  step() {
    this.tick = (this.tick || 0) + 1;
    this.movers = 0;
    for (let s = 0; s < S; s++) {
      if (!this.active[s]) continue;
      if (this.free[s]) this.stepFree(s); else this.stepStrand(s);
    }
    // sleep once (almost) nothing visibly moves
    if (this.movers < 6) this.quiet++; else this.quiet = 0;
    // slow natural drying
    if (this.tick % 10 === 0) {
      const WET = this.WET;
      for (let s = 0; s < NG; s++) {
        const b = s * MAXP, n = this.n[s];
        for (let i = 0; i < n; i++) if (WET[b + i] > 0) WET[b + i] = Math.max(0, WET[b + i] - 0.004);
      }
    }
  }

  stepFree(s) {
    const { X, Y, Z, PX, PY, PZ } = this;
    const n = this.n[s], b = s * MAXP;
    this.age[s] += DT;
    if (Y[b] < -90 || this.age[s] > 14) { this.active[s] = 0; this.dirty = true; return; }
    for (let i = 0; i < n; i++) {
      const j = b + i;
      let vx = (X[j] - PX[j]) * 0.99, vy = (Y[j] - PY[j]) * 0.99, vz = (Z[j] - PZ[j]) * 0.99;
      const v2 = vx * vx + vy * vy + vz * vz;
      if (v2 > 2.25) { const k = 1.5 / Math.sqrt(v2); vx *= k; vy *= k; vz *= k; }
      if (v2 > 1e-3) this.movers++;
      PX[j] = X[j]; PY[j] = Y[j]; PZ[j] = Z[j];
      X[j] += vx; Y[j] += vy - G; Z[j] += vz;
    }
    MARGIN[0] = 0.12; this.collide(b);
    const lr = this.lastRest[s];
    for (let i = 1; i < n; i++) {
      const j = b + i;
      const ex = X[j] - X[j - 1], ey = Y[j] - Y[j - 1], ez = Z[j] - Z[j - 1];
      const L = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-6;
      const k = (i - 1 < n - 2 ? SEG : lr) / L;
      const nx = X[j - 1] + ex * k, ny = Y[j - 1] + ey * k, nz = Z[j - 1] + ez * k;
      PX[j - 1] += 0.9 * (nx - X[j]); PY[j - 1] += 0.9 * (ny - Y[j]); PZ[j - 1] += 0.9 * (nz - Z[j]);
      X[j] = nx; Y[j] = ny; Z[j] = nz;
      MARGIN[0] = 0.12; this.collide(j);
    }
  }

  stepStrand(s) {
    const { X, Y, Z, PX, PY, PZ, CURL, STIFF, HOLD, WET } = this;
    const n = this.n[s], b = s * MAXP;
    X[b] = PX[b] = this.rx[s]; Y[b] = PY[b] = this.ry[s]; Z[b] = PZ[b] = this.rz[s];
    for (let i = 1; i < n; i++) {
      const j = b + i, h = HOLD[j];
      const damp = 0.982 * (1 - 0.93 * h);
      let vx = (X[j] - PX[j]) * damp, vy = (Y[j] - PY[j]) * damp, vz = (Z[j] - PZ[j]) * damp;
      const v2 = vx * vx + vy * vy + vz * vz;
      if (v2 > 2.25) { const k = 1.5 / Math.sqrt(v2); vx *= k; vy *= k; vz *= k; }
      if (v2 > 1e-3) this.movers++;
      PX[j] = X[j]; PY[j] = Y[j]; PZ[j] = Z[j];
      X[j] += vx; Z[j] += vz;
      Y[j] += vy - G * (1 - h) * (1 - 0.85 * STIFF[j]) * (1 + 0.7 * WET[j]);
    }
    const lr = this.lastRest[s];
    this.bend(s, n, b, lr);
    const mL = 0.18 + this.depth[s] * 1.1;
    const side = this.side[s];
    for (let i = 1; i < n; i++) {
      const j = b + i;
      const ex = X[j] - X[j - 1], ey = Y[j] - Y[j - 1], ez = Z[j] - Z[j - 1];
      const L = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-6;
      const k = (i - 1 < n - 2 ? SEG : lr) / L;
      const nx = X[j - 1] + ex * k, ny = Y[j - 1] + ey * k, nz = Z[j - 1] + ez * k;
      if (i > 1) { PX[j - 1] += 0.9 * (nx - X[j]); PY[j - 1] += 0.9 * (ny - Y[j]); PZ[j - 1] += 0.9 * (nz - Z[j]); }
      X[j] = nx; Y[j] = ny; Z[j] = nz;
      // long hair parts around the face (stands in for hair-hair friction at the part)
      if (i > 8 && nz > 2 && ny > -7 && ny < 17) {
        const ax = nx < 0 ? -nx : nx;
        if (ax < 7.5) X[j] += (ax > 1.5 ? (nx > 0 ? 1 : -1) : side) * 0.06 * (1 - ax / 7.5);
      }
      const m = 0.1 + i * 0.2;
      MARGIN[0] = m < mL ? m : mL; this.collide(j);
    }
  }

  // bending + helical curl rest shape
  bend(s, n, b, lr) {
    const { X, Y, Z, CURL, STIFF, HOLD, WET } = this;
    const tw = TW, tws = TWS;
    let ux = this.dx[s], uy = this.dy[s], uz = this.dz[s];
    let mx = this.mx[s], my = this.my[s], mz = this.mz[s];
    for (let i = 1; i < n; i++) {
      const j = b + i;
      if (i >= 2) {
        ux = X[j - 1] - X[j - 2]; uy = Y[j - 1] - Y[j - 2]; uz = Z[j - 1] - Z[j - 2];
        const l = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1; ux /= l; uy /= l; uz /= l;
      }
      const c = CURL[j] * (1 - 0.6 * WET[j]) * 0.55;
      let tx = ux, ty = uy, tz = uz;
      if (c > 0.004) {
        const dm = mx * ux + my * uy + mz * uz;
        mx -= ux * dm; my -= uy * dm; mz -= uz * dm;
        let ml = Math.sqrt(mx * mx + my * my + mz * mz);
        if (ml < 1e-4) { mx = uy; my = -ux; mz = 0; ml = Math.sqrt(mx * mx + my * my) || 1; }
        mx /= ml; my /= ml; mz /= ml;
        const cx = uy * mz - uz * my, cy = uz * mx - ux * mz, cz = ux * my - uy * mx;
        mx = mx * tw + cx * tws; my = my * tw + cy * tws; mz = mz * tw + cz * tws;
        const c2 = c * c, cc = 1 - c2 * 0.5 + c2 * c2 / 24, sc = c - c2 * c / 6;
        tx = ux * cc + mx * sc; ty = uy * cc + my * sc; tz = uz * cc + mz * sc;
      }
      let k = 0.025 + (i < 9 ? ROOTK[i] : 0) + c * 1.1 + STIFF[j] * 0.7 + HOLD[j] * 0.3;
      if (k > 0.95) k = 0.95;
      const r = i - 1 < n - 2 ? SEG : lr;
      X[j] += (X[j - 1] + tx * r - X[j]) * k;
      Y[j] += (Y[j - 1] + ty * r - Y[j]) * k;
      Z[j] += (Z[j - 1] + tz * r - Z[j]) * k;
    }
  }

  collide(j) {
    const m = MARGIN[0];
    const X = this.X, Y = this.Y, Z = this.Z;
    // Far from the body, skip alternate lookups only when the last step's
    // movement still leaves a generous clearance. The old fixed cache decay
    // could overestimate clearance on tightly curled strands, whose bend and
    // length corrections can move a point more than the velocity clamp.
    const dj = this.D[j];
    if ((j + this.tick) & 1) {
      const dx = X[j] - this.PX[j], dy = Y[j] - this.PY[j], dz = Z[j] - this.PZ[j];
      const moved = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const clearance = dj - moved;
      if (clearance > m + 3) { this.D[j] = clearance; return; }
    }
    sdfG(X, Y, Z, j);
    const d = SG[0];
    this.D[j] = d;
    if (d >= m) return;
    const p = (m - d) * 0.6;
    X[j] += SG[1] * p; Y[j] += SG[2] * p; Z[j] += SG[3] * p;
    // friction: kinetic damping, and static friction when nearly at rest
    const vx = X[j] - this.PX[j], vy = Y[j] - this.PY[j], vz = Z[j] - this.PZ[j];
    const f = vx * vx + vy * vy + vz * vz < 0.01 ? 1 : 0.7;
    this.PX[j] += vx * f; this.PY[j] += vy * f; this.PZ[j] += vz * f;
  }

  // ---------------- screen-space picking ----------------
  project(m, W, H) {
    const { X, Y, Z, SX, SY, SW } = this;
    for (let s = 0; s < S; s++) {
      if (!this.active[s]) continue;
      const b = s * MAXP, n = this.n[s];
      for (let i = 0; i < n; i++) {
        const j = b + i, x = X[j], y = Y[j], z = Z[j];
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
        SW[j] = w;
        SX[j] = (cx / w * 0.5 + 0.5) * W;
        SY[j] = (0.5 - cy / w * 0.5) * H;
      }
    }
  }

  // select near-side points under a screen-space brush
  gather(px, py, R, headW, band) {
    const { SX, SY, SW, selJ, selW } = this;
    const R2 = R * R;
    let minW = Infinity, cnt = 0;
    for (let s = 0; s < NG; s++) {
      if (!this.active[s]) continue;
      const b = s * MAXP, n = this.n[s];
      for (let i = 0; i < n; i++) {
        const j = b + i, dx = SX[j] - px, dy = SY[j] - py;
        if (dx * dx + dy * dy < R2 && SW[j] < minW) minW = SW[j];
      }
    }
    const limit = Math.min(minW + band, headW + 1.2);
    for (let s = 0; s < NG; s++) {
      if (!this.active[s]) continue;
      const b = s * MAXP, n = this.n[s];
      for (let i = 0; i < n; i++) {
        const j = b + i, dx = SX[j] - px, dy = SY[j] - py, d2 = dx * dx + dy * dy;
        if (d2 < R2 && SW[j] <= limit) { selJ[cnt] = j; selW[cnt] = 1 - Math.sqrt(d2) / R; cnt++; }
      }
    }
    this.selN = cnt;
    this.selMinW = minW;
    return cnt;
  }

  // ---------------- cutting ----------------
  spawnClip(s, from) {
    const len = this.len[s], Lc = len - from;
    if (Lc < 0.4) return;
    const slot = NG + (this.clipNext++ % NC);
    const nSeg = Math.max(1, Math.ceil(Lc / SEG - 1e-4));
    const n = Math.min(MAXP, nSeg + 1);
    const b = slot * MAXP, tmp = [0, 0, 0, 0];
    for (let m = 0; m < n; m++) {
      const d = m < nSeg ? from + m * SEG : len;
      this.posAt(s, d, tmp);
      const j = b + m, src = tmp[3];
      this.X[j] = tmp[0]; this.Y[j] = tmp[1]; this.Z[j] = tmp[2];
      this.PX[j] = this.X[j] + (this.PX[src] - this.X[src]) + (Math.random() - 0.5) * 0.02;
      this.PY[j] = this.Y[j] + (this.PY[src] - this.Y[src]);
      this.PZ[j] = this.Z[j] + (this.PZ[src] - this.Z[src]) + (Math.random() - 0.5) * 0.02;
      this.CR[j] = this.CR[src]; this.CG[j] = this.CG[src]; this.CB[j] = this.CB[src];
      this.WET[j] = this.WET[src]; this.HOLD[j] = 0; this.STIFF[j] = 0; this.CURL[j] = 0; this.D[j] = 3;
    }
    this.n[slot] = n; this.len[slot] = Lc; this.lastRest[slot] = Lc - (nSeg - 1) * SEG;
    this.free[slot] = 1; this.active[slot] = 1; this.age[slot] = 0; this.depth[slot] = 0.8;
    this.dirty = true;
  }

  cutTo(s, L) {
    if (L >= this.len[s] - 0.1) return false;
    const tmp = this.posAt(s, L, [0, 0, 0, 0]);
    this.spawnClip(s, L);
    this.setLen(s, L);
    const j = s * MAXP + this.n[s] - 1;
    this.X[j] = this.PX[j] = tmp[0]; this.Y[j] = this.PY[j] = tmp[1]; this.Z[j] = this.PZ[j] = tmp[2];
    return true;
  }

  // scissor stroke in screen space (requires project())
  cut(ax, ay, bx, by, headW, mode) {
    const { SX, SY, SW } = this;
    const ex = bx - ax, ey = by - ay;
    let count = 0;
    for (let s = 0; s < NG; s++) {
      if (!this.active[s]) continue;
      if (mode === 'thin' && Math.random() > 0.32) continue;
      const b = s * MAXP, n = this.n[s];
      for (let i = 0; i < n - 1; i++) {
        const j = b + i;
        const px = SX[j], py = SY[j], qx = SX[j + 1] - px, qy = SY[j + 1] - py;
        const den = qx * ey - qy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const wx = ax - px, wy = ay - py;
        const t = (wx * ey - wy * ex) / den;
        const u = (wx * qy - wy * qx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const w = SW[j] + (SW[j + 1] - SW[j]) * t;
        if (w > headW + 0.6) continue;
        const r = i < n - 2 ? SEG : this.lastRest[s];
        let L = i * SEG + t * r;
        if (mode === 'thin') L -= Math.random() * 4;
        else if (mode === 'texture') L -= Math.random() * 2.2;
        L = Math.max(0.35, L);
        if (this.cutTo(s, L)) count++;
        break;
      }
    }
    if (count) this.wake();
    return count;
  }

  clip(px, py, R, cam) {
    const { SX, SY } = this, R2 = R * R;
    let count = 0;
    for (let s = 0; s < NG; s++) {
      if (!this.active[s] || this.len[s] <= 0.5) continue;
      const j = s * MAXP, dx = SX[j] - px, dy = SY[j] - py;
      if (dx * dx + dy * dy > R2) continue;
      const vx = cam.x - this.rx[s], vy = cam.y - this.ry[s], vz = cam.z - this.rz[s];
      if (vx * this.nx[s] + vy * this.ny[s] + vz * this.nz[s] < 0) continue;
      if (this.cutTo(s, 0.35 + Math.random() * 0.1)) count++;
    }
    if (count) this.wake();
    return count;
  }

  // ---------------- brush tools (operate on the gathered selection) ----------------
  comb(wx, wy, wz) {
    const { X, Y, Z, PX, PY, PZ, CURL, selJ, selW } = this;
    for (let k = 0; k < this.selN; k++) {
      const j = selJ[k], f = Math.min(1, selW[k] * 1.5) * 0.8;
      if (j % MAXP === 0) continue;
      X[j] += wx * f; Y[j] += wy * f; Z[j] += wz * f;
      PX[j] += wx * f * 0.85; PY[j] += wy * f * 0.85; PZ[j] += wz * f * 0.85;
      CURL[j] *= 1 - 0.003 * selW[k];
    }
    this.wake();
  }

  // blow-dryer: air flows along (dx,dy,dz); hair relaxes toward the air velocity
  dryer(dx, dy, dz, t) {
    const { X, Y, Z, PX, PY, PZ, WET, selJ, selW } = this;
    for (let k = 0; k < this.selN; k++) {
      const j = selJ[k], w = selW[k];
      if (j % MAXP === 0) continue;
      const x = X[j], y = Y[j], z = Z[j];
      // smooth, spatially coherent turbulence
      const nx = Math.sin(y * 0.35 + t * 2.1) + Math.sin(z * 0.27 - t * 1.3);
      const ny = Math.sin(z * 0.31 + t * 1.7) + Math.sin(x * 0.23 + t * 2.3);
      const nz = Math.sin(x * 0.33 - t * 1.9) + Math.sin(y * 0.29 + t * 1.1);
      const sp = 0.32 * w;
      const tx = (dx + nx * 0.28) * sp, ty = (dy + ny * 0.28 + 0.15) * sp, tz = (dz + nz * 0.28) * sp;
      const vx = x - PX[j], vy = y - PY[j], vz = z - PZ[j];
      const a = 0.1 * w;
      X[j] += (tx - vx) * a; Y[j] += (ty - vy) * a; Z[j] += (tz - vz) * a;
      WET[j] = Math.max(0, WET[j] - 0.03 * w);
    }
    this.wake();
  }

  dye(col, onlyHL) {
    const { CR, CG, CB, selJ, selW } = this;
    for (let k = 0; k < this.selN; k++) {
      const j = selJ[k];
      if (onlyHL && !this.hl[(j / MAXP) | 0]) continue;
      const a = Math.min(1, selW[k] * 0.09);
      CR[j] += (col[0] - CR[j]) * a; CG[j] += (col[1] - CG[j]) * a; CB[j] += (col[2] - CB[j]) * a;
    }
  }

  product(kind) {
    const { CURL, STIFF, HOLD, WET, selJ, selW } = this;
    for (let k = 0; k < this.selN; k++) {
      const j = selJ[k], a = Math.min(1, selW[k] * 0.06);
      switch (kind) {
        case 'curler': CURL[j] += (1 - CURL[j]) * a; WET[j] *= 1 - a; HOLD[j] *= 1 - a; break;
        case 'flat': CURL[j] -= CURL[j] * a * 1.5; WET[j] *= 1 - a; HOLD[j] *= 1 - a; break;
        case 'gel': STIFF[j] = Math.min(1, STIFF[j] + a * 1.2); WET[j] = Math.min(0.45, WET[j] + a * 0.3); break;
        case 'spray': HOLD[j] = Math.min(1, HOLD[j] + a * 1.4); break;
        case 'water': WET[j] = Math.min(1, WET[j] + a * 2); STIFF[j] *= 1 - a; HOLD[j] *= 1 - a; break;
      }
    }
    this.wake();
  }

  grow(dt) {
    const { CR, CG, CB, CURL, STIFF, HOLD, WET, D, selJ, selW } = this;
    const hit = new Float32Array(NG);
    for (let k = 0; k < this.selN; k++) {
      const s = (selJ[k] / MAXP) | 0;
      if (selW[k] > hit[s]) hit[s] = selW[k];
    }
    for (let s = 0; s < NG; s++) {
      if (!hit[s] || this.len[s] >= MAXL) continue;
      const oldN = this.n[s];
      this.setLen(s, this.len[s] + 9 * dt * (0.3 + 0.7 * hit[s]));
      const k = this.n[s] - oldN;
      if (k > 0) {
        // hair grows from the root: styling & dye move outward, natural color regrows
        const b = s * MAXP, n = this.n[s];
        for (let i = n - 1; i >= 1 + k; i--) {
          const j = b + i, q = j - k;
          CR[j] = CR[q]; CG[j] = CG[q]; CB[j] = CB[q];
          CURL[j] = CURL[q]; STIFF[j] = STIFF[q]; HOLD[j] = HOLD[q]; WET[j] = WET[q]; D[j] = D[q];
        }
        for (let i = 1; i <= k && i < n; i++) {
          const j = b + i;
          CR[j] = this.natR[s]; CG[j] = this.natG[s]; CB[j] = this.natB[s];
          CURL[j] = this.natCurl[s]; STIFF[j] = 0; HOLD[j] = 0; WET[j] = 0;
        }
      }
    }
    this.wake();
  }
}

function gauss() {
  return Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(Math.PI * 2 * Math.random());
}
