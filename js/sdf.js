// Signed distance field of the head/bust scan (cm), baked offline from the mesh.
const O = [-25, -23, -16], CELL = 0.6, NX = 84, NY = 77, NZ = 54;
const FAR = 3.17;
let data = null;

let F4 = null; // per cell: distance + smoothed normal
export function setSDF(buf) {
  data = new Int8Array(buf);
  F4 = new Float32Array(data.length * 4);
  const sy = NX, sz = NX * NY;
  for (let z = 0; z < NZ; z++) for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const i = x + NX * (y + NY * z);
    const gx = data[x < NX - 1 ? i + 1 : i] - data[x > 0 ? i - 1 : i];
    const gy = data[y < NY - 1 ? i + sy : i] - data[y > 0 ? i - sy : i];
    const gz = data[z < NZ - 1 ? i + sz : i] - data[z > 0 ? i - sz : i];
    const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    F4[i * 4] = data[i] / 40; F4[i * 4 + 1] = gx / l; F4[i * 4 + 2] = gy / l; F4[i * 4 + 3] = gz / l;
  }
}
export async function loadSDF(url) { setSDF(await (await fetch(url)).arrayBuffer()); }

// cape skirt below the bust (elliptic cylinder)
const SK = { cz: -3.9, rx: 21.6, rz: 8.9, top: -16 };

function grid(x, y, z) {
  const fx = (x - O[0]) / CELL, fy = (y - O[1]) / CELL, fz = (z - O[2]) / CELL;
  if (fx < 0 || fy < 0 || fz < 0 || fx >= NX - 1 || fy >= NY - 1 || fz >= NZ - 1) return FAR;
  const ix = fx | 0, iy = fy | 0, iz = fz | 0;
  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const i = ix + NX * (iy + NY * iz);
  const sy = NX, sz = NX * NY;
  const d = data;
  const c00 = d[i] + (d[i + 1] - d[i]) * tx;
  const c10 = d[i + sy] + (d[i + sy + 1] - d[i + sy]) * tx;
  const c01 = d[i + sz] + (d[i + sz + 1] - d[i + sz]) * tx;
  const c11 = d[i + sy + sz] + (d[i + sy + sz + 1] - d[i + sy + sz]) * tx;
  const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty;
  return (c0 + (c1 - c0) * tz) / 40;
}

function skirt(x, y, z) {
  const ex = x / SK.rx, ez = (z - SK.cz) / SK.rz;
  const r = Math.sqrt(ex * ex + ez * ez) || 1e-6;
  const ds = (r - 1) * SK.rz, dt = y - SK.top;
  return ds > dt ? ds : dt;
}

export function sdf(x, y, z) {
  let d = y > SK.top - 3 ? grid(x, y, z) : FAR;
  if (y < SK.top + 3) { const ds = skirt(x, y, z); if (ds < d) d = ds; }
  return d;
}

// distance + analytic gradient of the trilinear field in one lookup
export const SG = new Float64Array(4);
// distance + normal for point j of the given coordinate arrays (int arg: no double boxing)
export function sdfG(PX_, PY_, PZ_, j) {
  const x = PX_[j], y = PY_[j], z = PZ_[j];
  let d = FAR, gx = 0, gy = 0, gz = 0;
  const fx = (x - O[0]) / CELL, fy = (y - O[1]) / CELL, fz = (z - O[2]) / CELL;
  if (y > SK.top - 3 && fx >= 0 && fy >= 0 && fz >= 0 && fx < NX - 1 && fy < NY - 1 && fz < NZ - 1) {
    const ix = fx | 0, iy = fy | 0, iz = fz | 0;
    const tx = fx - ix, ty = fy - iy, tz = fz - iz;
    const i = (ix + NX * (iy + NY * iz)) * 4, sy = NX * 4, sz = NX * NY * 4, a = F4;
    const w000 = (1 - tx) * (1 - ty) * (1 - tz), w100 = tx * (1 - ty) * (1 - tz);
    const w010 = (1 - tx) * ty * (1 - tz), w110 = tx * ty * (1 - tz);
    const w001 = (1 - tx) * (1 - ty) * tz, w101 = tx * (1 - ty) * tz;
    const w011 = (1 - tx) * ty * tz, w111 = tx * ty * tz;
    const i1 = i + 4, i2 = i + sy, i3 = i + sy + 4, i4 = i + sz, i5 = i + sz + 4, i6 = i + sy + sz, i7 = i + sy + sz + 4;
    d = a[i] * w000 + a[i1] * w100 + a[i2] * w010 + a[i3] * w110 + a[i4] * w001 + a[i5] * w101 + a[i6] * w011 + a[i7] * w111;
    if (d > 3.1 && y >= SK.top + 3) { SG[0] = d; return; }
    gx = a[i + 1] * w000 + a[i1 + 1] * w100 + a[i2 + 1] * w010 + a[i3 + 1] * w110 + a[i4 + 1] * w001 + a[i5 + 1] * w101 + a[i6 + 1] * w011 + a[i7 + 1] * w111;
    gy = a[i + 2] * w000 + a[i1 + 2] * w100 + a[i2 + 2] * w010 + a[i3 + 2] * w110 + a[i4 + 2] * w001 + a[i5 + 2] * w101 + a[i6 + 2] * w011 + a[i7 + 2] * w111;
    gz = a[i + 3] * w000 + a[i1 + 3] * w100 + a[i2 + 3] * w010 + a[i3 + 3] * w110 + a[i4 + 3] * w001 + a[i5 + 3] * w101 + a[i6 + 3] * w011 + a[i7 + 3] * w111;
  }
  if (y < SK.top + 3) {
    const ex = x / SK.rx, ez = (z - SK.cz) / SK.rz;
    const r = Math.sqrt(ex * ex + ez * ez) || 1e-6;
    const ds = (r - 1) * SK.rz, dt = y - SK.top;
    if (ds >= dt) { if (ds < d) { d = ds; gx = ex / SK.rx / r; gy = 0; gz = ez / SK.rz / r; } }
    else if (dt < d) { d = dt; gx = 0; gy = 1; gz = 0; }
  }
  let l = Math.sqrt(gx * gx + gy * gy + gz * gz);
  if (l < 1e-6) { gx = x; gy = y - 6; gz = z; l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1; }
  SG[0] = d; SG[1] = gx / l; SG[2] = gy / l; SG[3] = gz / l;
}

const g = [0, 0, 0];
export function sdfGrad(x, y, z) {
  const h = 0.55;
  let gx = sdf(x + h, y, z) - sdf(x - h, y, z);
  let gy = sdf(x, y + h, z) - sdf(x, y - h, z);
  let gz = sdf(x, y, z + h) - sdf(x, y, z - h);
  let l = Math.sqrt(gx * gx + gy * gy + gz * gz);
  if (l < 1e-6) { gx = x; gy = y - 6; gz = z; l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1; }
  g[0] = gx / l; g[1] = gy / l; g[2] = gz / l;
  return g;
}

// sphere-trace a ray against the body; returns distance or Infinity
export function raySDF(ox, oy, oz, dx, dy, dz, maxT = 400) {
  let t = 0;
  for (let k = 0; k < 160 && t < maxT; k++) {
    const d = sdf(ox + dx * t, oy + dy * t, oz + dz * t);
    if (d < 0.05) return t;
    t += Math.max(0.08, d * 0.9);
  }
  return Infinity;
}
