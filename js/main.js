import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { S, MAXP, CC, CRAD } from './hair3d.js';

const STRIDE = 15;
const CHILDREN = 12;

// ---------------- tools & palette ----------------
const I = {
  shears: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 7.8 20 17M8.5 16.2 20 7"/>',
  thin: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 7.8 20 17M8.5 16.2 20 7M12 13.4l1 1.3M14.6 11.3l1 1.3M17.2 9.2l1 1.3"/>',
  texture: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 7.8 20 17M8.5 16.2l2.4-.6.4-2.2 2.4-.6.4-2.2 2.4-.6.4-2.2 2.4-.6"/>',
  clippers: '<rect x="7" y="8" width="10" height="14" rx="3"/><path d="M6 5h12v3H6zM8 2.5V5M10 2.5V5M12 2.5V5M14 2.5V5M16 2.5V5M10 13h4"/>',
  comb: '<rect x="3" y="5" width="18" height="5" rx="1.5"/><path d="M5.5 10v9M8.5 10v9M11.5 10v9M14.5 10v9M17.5 10v9"/>',
  dryer: '<path d="M4 4h9a5 5 0 0 1 0 10H9.5L8 21H5l1-7H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><circle cx="12" cy="9" r="2"/><path d="M20 6.5h2M20 9h2.5M20 11.5h2"/>',
  curler: '<rect x="10" y="2" width="4" height="13" rx="2"/><path d="M12 15v7M7.5 5.5c3 0 6 1.5 9 3M7.5 9.5c3 0 6 1.5 9 3"/>',
  flat: '<path d="M7 2.5 9.5 16M17 2.5 14.5 16M9.5 16l2.5 5.5 2.5-5.5"/>',
  dye: '<path d="M14 3l7 7-7.5 7.5-7-7z"/><path d="M6.5 10.5 3 21l10.5-3.5"/>',
  highlight: '<path d="M5 3h3l2 18H7zM11 3h3l2 18h-3zM17 3h2.5l1.5 13"/>',
  gel: '<rect x="5" y="10" width="14" height="11" rx="2.5"/><rect x="6" y="5.5" width="12" height="4.5" rx="1.2"/><path d="M9 15h6"/>',
  spray: '<rect x="6" y="9" width="8" height="13" rx="2"/><path d="M8 9V5.5h4V9M12 6h2.5M18 3.5l2.5-1M18 6h3M18 8.5l2.5 1"/>',
  water: '<path d="M7 10h7l1 11.5H6z"/><path d="M8.5 10V6.5h4V10M12.5 6.5 16.5 5v3"/><path d="M20 12.5c-1 1.8-1.8 2.8-1.8 3.8a1.8 1.8 0 0 0 3.6 0c0-1-.8-2-1.8-3.8z"/>',
  grow: '<path d="M12 21V10"/><path d="M12 10c0-4 3-7 8-7 0 4.5-3 7-8 7zM12 14c0-3-2.5-5.5-7-5.5 0 3.5 2.5 5.5 7 5.5z"/>',
  client: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.2 4-6.3 8-6.3s7 2.1 8 6.3"/>',
};
const TOOLS = [
  ['shears', 'Shears'], ['thin', 'Thinning'], ['texture', 'Texturizer'], ['clippers', 'Clippers'], '|',
  ['comb', 'Comb'], ['dryer', 'Dryer'], ['curler', 'Curler'], ['flat', 'Flat Iron'], '|',
  ['dye', 'Dye'], ['highlight', 'Highlights'], '|',
  ['gel', 'Gel'], ['spray', 'Hairspray'], ['water', 'Water'], ['grow', 'Grow Serum'], '|',
  ['client', 'New Client'],
];
const BRUSH = new Set(['clippers', 'comb', 'dryer', 'curler', 'flat', 'dye', 'highlight', 'gel', 'spray', 'water', 'grow']);
const CUTS = new Set(['shears', 'thin', 'texture']);
const COLORS = [
  '#16110e', '#3a2418', '#63392a', '#8a3b20', '#b3562a', '#c8924f', '#e2bd78', '#f1e7d0', '#bcc1c6',
  '#e889ab', '#dc2f86', '#aa8ae0', '#6a2fb0', '#2d6fd6', '#18a39a', '#7fdcb2', '#b0122c', '#f2782a',
];
const lin = (v) => Math.pow(v, 2.2);
const hexLin = (h) => [1, 3, 5].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ---------------- clients ----------------
const HAIRS = ['#1b1512', '#3b271c', '#5e3d27', '#7b3a1d', '#a57c4e', '#d5b27c', '#96502a', '#2a1c16'];
const SKINS = [[1, 1, 1], [1.02, 0.93, 0.86], [0.86, 0.7, 0.58], [0.66, 0.5, 0.38], [0.46, 0.33, 0.25], [0.32, 0.22, 0.17]];
const CAPES = ['#23262e', '#1d1d20', '#3b2433', '#173338', '#3a2a22'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function newClient() {
  const r = Math.random();
  return {
    hair: hexLin(pick(HAIRS)),
    skin: pick(SKINS),
    cape: hexLin(pick(CAPES)),
    len: 9 + Math.random() * 30,
    curl: r < 0.45 ? Math.random() * 0.1 : r < 0.75 ? 0.25 + Math.random() * 0.3 : 0.6 + Math.random() * 0.4,
    part: (Math.random() - 0.5) * 6,
  };
}

// ---------------- three.js scene ----------------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(30, 1, 5, 1000);
const LIGHTS = [
  { pos: [35, 45, 60], color: 0xfff3e8, i: 2.1 },
  { pos: [-55, 12, 35], color: 0xd4e2ff, i: 0.7 },
  { pos: [-10, 35, -60], color: 0xffe6cc, i: 1.5 },
];
for (const l of LIGHTS) {
  const d = new THREE.DirectionalLight(l.color, l.i);
  d.position.set(...l.pos);
  scene.add(d);
}
scene.add(new THREE.HemisphereLight(0xfff6ee, 0x3b302c, 0.45));

// head
const headU = {
  uHair: { value: new THREE.Color() },
  uSkin: { value: new THREE.Color(1, 1, 1) },
  uCape: { value: new THREE.Color() },
};
const texLoader = new THREE.TextureLoader();
const colMap = texLoader.load('models/Map-COL.jpg');
colMap.colorSpace = THREE.SRGBColorSpace;
colMap.anisotropy = 8;
const nrmMap = texLoader.load('models/Infinite-Level_02_Tangent_SmoothUV.jpg');
const headMat = new THREE.MeshStandardMaterial({
  map: colMap, normalMap: nrmMap, normalScale: new THREE.Vector2(0.75, 0.75),
  roughness: 0.62, metalness: 0, envMapIntensity: 0.35,
});
const f3 = (a) => `vec3(${a.map((v) => v.toFixed(3)).join(',')})`;
headMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, headU);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec3 vObj; uniform vec3 uHair; uniform vec3 uSkin; uniform vec3 uCape;
      float hairThr(float c){
        if (c < -0.5) return mix(-0.75, -0.5, (c + 1.0) / 0.5);
        if (c < -0.2) return mix(-0.5, -0.05, (c + 0.5) / 0.3);
        if (c < 0.0) return mix(-0.05, 0.12, (c + 0.2) / 0.2);
        if (c < 0.5) return mix(0.12, 0.35, c / 0.5);
        return mix(0.35, 0.55, (c - 0.5) / 0.5);
      }`)
    .replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb *= uSkin;
      vec3 hq = normalize((vObj - ${f3(CC)}) / ${f3(CRAD)});
      float hthr = hairThr(hq.z / max(length(hq.xz), 1e-3));
      float scalpM = smoothstep(hthr - 0.02, hthr + 0.07, hq.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55 + uHair * 0.45, scalpM * 0.85);
      float capeM = smoothstep(-10.2, -11.4, vObj.y + 0.07 * abs(vObj.x));
      diffuseColor.rgb = mix(diffuseColor.rgb, uCape, capeM);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.85, capeM);`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal = normalize(mix(normal, nonPerturbedNormal, capeM * 0.85));`);
};
const capeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.85, envMapIntensity: 0.35 });
{
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.12, 1, 64, 1, true), capeMat);
  skirt.scale.set(21.6, 70, 8.9);
  skirt.position.set(0, -15.5 - 35, -3.9);
  scene.add(skirt);
}

// hair
const vbuf = new THREE.InterleavedBuffer(new Float32Array(S * MAXP * STRIDE), STRIDE);
vbuf.setUsage(THREE.DynamicDrawUsage);
const hairGeo = new THREE.InstancedBufferGeometry();
hairGeo.setAttribute('position', new THREE.InterleavedBufferAttribute(vbuf, 3, 0));
hairGeo.setAttribute('aTan', new THREE.InterleavedBufferAttribute(vbuf, 3, 3));
hairGeo.setAttribute('aB', new THREE.InterleavedBufferAttribute(vbuf, 3, 6));
hairGeo.setAttribute('aCol', new THREE.InterleavedBufferAttribute(vbuf, 3, 9));
hairGeo.setAttribute('aMisc', new THREE.InterleavedBufferAttribute(vbuf, 3, 12));
{
  const ch = new Float32Array(CHILDREN * 3);
  for (let i = 0; i < CHILDREN; i++) {
    const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : Math.sqrt(Math.random());
    ch[i * 3] = Math.cos(a) * r; ch[i * 3 + 1] = Math.sin(a) * r; ch[i * 3 + 2] = Math.random() * 100;
  }
  hairGeo.setAttribute('aChild', new THREE.InstancedBufferAttribute(ch, 3));
}
const idxAttr = new THREE.BufferAttribute(new Uint32Array(S * MAXP * 2), 1);
idxAttr.setUsage(THREE.DynamicDrawUsage);
hairGeo.setIndex(idxAttr);
hairGeo.setDrawRange(0, 0);
hairGeo.instanceCount = CHILDREN;

const hairMat = new THREE.ShaderMaterial({
  uniforms: {
    uSpread: { value: 0.75 },
    uL: { value: LIGHTS.map((l) => new THREE.Vector3(...l.pos).normalize()) },
    uLC: { value: LIGHTS.map((l) => new THREE.Color(l.color).multiplyScalar(l.i * 0.62)) },
    uAmb: { value: new THREE.Color(0.2, 0.19, 0.18) },
  },
  vertexShader: `
    attribute vec3 aTan; attribute vec3 aB; attribute vec3 aCol; attribute vec3 aMisc; attribute vec3 aChild;
    uniform float uSpread;
    varying vec3 vCol; varying vec3 vTan; varying vec3 vWorld; varying float vT; varying float vCut; varying float vDist;
    float hash(float n){ return fract(sin(n) * 43758.5453123); }
    void main(){
      vec3 t = normalize(aTan);
      vec3 b1 = normalize(aB);
      vec3 b2 = cross(t, b1);
      float h = hash(aMisc.z * 12.9898 + aChild.z * 78.233);
      float grow = clamp(aMisc.x / 2.5, 0.0, 1.0);
      float sp = uSpread * (0.3 + 0.7 * grow);
      vec3 p = position + (b1 * aChild.x + b2 * aChild.y) * sp
             + (b1 * sin(aMisc.x * (0.5 + aChild.x * 0.3) + h * 6.283)
                + b2 * cos(aMisc.x * (0.6 + aChild.y * 0.3) + h * 3.1)) * 0.1 * grow;
      vec4 wp = modelMatrix * vec4(p, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
      vCol = aCol * (0.78 + 0.36 * hash(h * 7.13 + 1.0));
      vTan = t; vT = aMisc.y; vCut = 1.0 - hash(h * 3.7 + 2.0) * 0.06; vDist = aMisc.x;
    }`,
  fragmentShader: `
    uniform vec3 uL[3]; uniform vec3 uLC[3]; uniform vec3 uAmb;
    varying vec3 vCol; varying vec3 vTan; varying vec3 vWorld; varying float vT; varying float vCut; varying float vDist;
    void main(){
      if (vT > vCut && vDist > 4.0) discard;
      vec3 T = normalize(vTan);
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 Np = normalize(vWorld - vec3(0.0, 7.0, 0.0));
      vec3 base = vCol * (0.55 + 0.45 * smoothstep(0.0, 2.5, vDist));
      vec3 col = base * uAmb;
      for (int i = 0; i < 3; i++) {
        vec3 L = uL[i];
        float TL = dot(T, L);
        float sinTL = sqrt(max(0.0, 1.0 - TL * TL));
        float wrap = clamp(dot(Np, L) * 0.6 + 0.4, 0.0, 1.0);
        vec3 H = normalize(L + V);
        float TH = dot(T, H);
        float s1 = pow(sqrt(max(0.0, 1.0 - (TH - 0.1) * (TH - 0.1))), 90.0);
        float s2 = pow(sqrt(max(0.0, 1.0 - (TH + 0.15) * (TH + 0.15))), 32.0);
        col += uLC[i] * wrap * (base * (0.25 + 0.75 * sinTL) + vec3(0.14) * s1 * wrap + base * s2 * 0.5);
      }
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const hairMesh = new THREE.LineSegments(hairGeo, hairMat);
hairMesh.frustumCulled = false;
scene.add(hairMesh);

// ---------------- worker ----------------
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let workerReady = false, headReady = false;
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'loaded') { workerReady = true; maybeStart(); }
  else if (m.type === 'frame') {
    const old = vbuf.array;
    vbuf.array = new Float32Array(m.buf);
    vbuf.needsUpdate = true;
    worker.postMessage({ type: 'buf', buf: old.buffer }, [old.buffer]);
    if (m.idx) {
      idxAttr.array = new Uint32Array(m.idx);
      idxAttr.needsUpdate = true;
      hairGeo.setDrawRange(0, m.count);
    }
  } else if (m.type === 'snip') snip();
  else if (m.type === 'client') document.getElementById('loading').classList.add('done');
};
worker.postMessage({ type: 'load' });

new GLTFLoader().load('models/LeePerrySmith.glb', (gltf) => {
  let geo;
  gltf.scene.traverse((o) => { if (o.isMesh) geo = o.geometry; });
  geo.scale(5, 5, 5);
  scene.add(new THREE.Mesh(geo, headMat));
  headReady = true; maybeStart();
});

let started = false;
function maybeStart() {
  if (started || !workerReady || !headReady) return;
  started = true;
  loadClient();
}
function loadClient() {
  const cl = newClient();
  headU.uHair.value.setRGB(...cl.hair);
  headU.uSkin.value.setRGB(...cl.skin);
  headU.uCape.value.setRGB(...cl.cape);
  capeMat.color.setRGB(...cl.cape);
  worker.postMessage({ type: 'client', client: cl });
}

// ---------------- sounds ----------------
const snipAudio = new Audio('sfx/snip.wav');
const loops = {
  clippers: new Audio('sfx/clippers.wav'), dryer: new Audio('sfx/dryer.wav'),
  spray: new Audio('sfx/spray.wav'), sizzle: new Audio('sfx/sizzle.wav'),
};
for (const a of Object.values(loops)) a.loop = true;
const LOOP_FOR = { clippers: 'clippers', dryer: 'dryer', spray: 'spray', water: 'spray', gel: 'spray', curler: 'sizzle', flat: 'sizzle' };
let currentLoop = null;
function startLoop(t) {
  const k = LOOP_FOR[t];
  if (!k) return;
  currentLoop = loops[k];
  currentLoop.volume = t === 'gel' || t === 'water' ? 0.18 : k === 'spray' ? 0.35 : 0.45;
  currentLoop.currentTime = 0;
  currentLoop.play().catch(() => {});
}
function stopLoop() { if (currentLoop) { currentLoop.pause(); currentLoop = null; } }
let lastSnip = 0;
function snip() {
  const now = performance.now();
  if (now - lastSnip < 110) return;
  lastSnip = now;
  const a = snipAudio.cloneNode();
  a.volume = 0.6; a.playbackRate = 0.9 + Math.random() * 0.25;
  a.play().catch(() => {});
}

// ---------------- UI ----------------
let tool = 'shears', dyeColor = COLORS[6], hlColor = COLORS[7];
const toolsEl = document.getElementById('tools');
const swEl = document.getElementById('swatches');
const ctxEl = document.getElementById('context');
const sizeWrap = document.getElementById('sizeWrap');
const sizeEl = document.getElementById('size');
for (const t of TOOLS) {
  if (t === '|') { const d = document.createElement('div'); d.className = 'sep'; toolsEl.appendChild(d); continue; }
  const [id, name] = t;
  const b = document.createElement('button');
  b.className = 'tool' + (id === 'client' ? ' client' : '');
  b.dataset.id = id;
  b.innerHTML = `<svg viewBox="0 0 24 24">${I[id]}</svg><span>${name}</span>`;
  b.onclick = () => { if (id === 'client') { if (started) loadClient(); return; } tool = id; refreshUI(); };
  toolsEl.appendChild(b);
}
for (const c of COLORS) {
  const b = document.createElement('button');
  b.className = 'sw'; b.style.background = c; b.dataset.c = c;
  b.onclick = () => { if (tool === 'highlight') hlColor = c; else dyeColor = c; refreshUI(); };
  swEl.appendChild(b);
}
function refreshUI() {
  for (const b of toolsEl.querySelectorAll('.tool')) b.classList.toggle('active', b.dataset.id === tool);
  const colorTool = tool === 'dye' || tool === 'highlight';
  const cur = tool === 'highlight' ? hlColor : dyeColor;
  for (const b of swEl.children) b.classList.toggle('active', b.dataset.c === cur);
  swEl.classList.toggle('hidden', !colorTool);
  sizeWrap.classList.toggle('hidden', !BRUSH.has(tool));
  ctxEl.classList.toggle('hidden', !colorTool && !BRUSH.has(tool));
}
refreshUI();

// ---------------- camera / view ----------------
const VIEWS = ['Front', 'Left', 'Back', 'Right'];
const cam = { yaw: 0, yawT: 0, pitch: 0.08, pitchT: 0.08, zoom: 1, zoomT: 1, target: new THREE.Vector3(0, 1, 0) };
const viewName = document.getElementById('viewName');
function snapView(dir) {
  cam.yawT = Math.round(cam.yawT / (Math.PI / 2)) * (Math.PI / 2) + dir * (Math.PI / 2);
  cam.pitchT = 0.08;
}
document.getElementById('rotL').onclick = () => snapView(-1);
document.getElementById('rotR').onclick = () => snapView(1);
viewName.onclick = () => { cam.yawT = Math.round(cam.yawT / (Math.PI * 2)) * Math.PI * 2; cam.pitchT = 0.08; cam.zoomT = 1; };
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') snapView(-1);
  if (e.key === 'ArrowRight') snapView(1);
});

let W = 0, H = 0, dockH = 0;
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');
function resize() {
  W = innerWidth; H = innerHeight;
  dockH = document.getElementById('dock').offsetHeight + 12;
  renderer.setSize(W, H, false);
  const dpr = Math.min(2, devicePixelRatio || 1);
  overlay.width = W * dpr; overlay.height = H * dpr;
  camera.aspect = W / H;
  camera.setViewOffset(W, H, 0, dockH * 0.45, W, H);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function updateCamera(dt) {
  const k = 1 - Math.exp(-dt * 8);
  cam.yaw += (cam.yawT - cam.yaw) * k;
  cam.pitch += (cam.pitchT - cam.pitch) * k;
  cam.zoom += (cam.zoomT - cam.zoom) * k;
  const t = Math.tan(THREE.MathUtils.degToRad(15));
  const avail = (H - dockH) / H;
  const dist = Math.max(31 / (t * avail), 27 / (t * camera.aspect)) * cam.zoom;
  camera.position.set(
    cam.target.x + dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
    cam.target.y + dist * Math.sin(cam.pitch),
    cam.target.z + dist * Math.cos(cam.pitch) * Math.cos(cam.yaw),
  );
  camera.lookAt(cam.target);
  camera.updateMatrixWorld();
  const q = ((Math.round(cam.yawT / (Math.PI / 2)) % 4) + 4) % 4;
  if (viewName.textContent !== VIEWS[q]) viewName.textContent = VIEWS[q];
}

// ---------------- input ----------------
const ptr = { down: false, sx: 0, sy: 0, inside: false };
const orbit = { on: false, x: 0, y: 0 };
const touches = new Map();
const trail = [];
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  ptr.sx = e.clientX; ptr.sy = e.clientY; ptr.inside = true;
  if (e.button === 2 || e.button === 1 || e.altKey || touches.size >= 2) {
    if (ptr.down) { ptr.down = false; stopLoop(); sendPtr(); }
    orbit.on = true; orbit.x = e.clientX; orbit.y = e.clientY;
    return;
  }
  ptr.down = true;
  trail.length = 0;
  startLoop(tool);
  sendPtr();
});
canvas.addEventListener('pointermove', (e) => {
  ptr.sx = e.clientX; ptr.sy = e.clientY; ptr.inside = true;
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (orbit.on) {
    const dx = e.clientX - orbit.x, dy = e.clientY - orbit.y;
    orbit.x = e.clientX; orbit.y = e.clientY;
    const f = touches.size >= 2 ? 0.5 : 1;
    cam.yawT -= dx * 0.008 * f;
    cam.pitchT = Math.max(-0.35, Math.min(1.1, cam.pitchT + dy * 0.006 * f));
    return;
  }
  if (ptr.down) {
    if (CUTS.has(tool)) trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    sendPtr();
  }
});
const up = (e) => {
  touches.delete(e.pointerId);
  if (touches.size === 0) orbit.on = false;
  if (ptr.down) { ptr.down = false; stopLoop(); sendPtr(); }
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('pointerleave', () => { ptr.inside = false; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.zoomT = Math.max(0.35, Math.min(1.4, cam.zoomT * Math.exp(e.deltaY * 0.001)));
}, { passive: false });

const raycaster = new THREE.Raycaster();
const pm = new THREE.Matrix4();
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), upv = new THREE.Vector3();
function sendPtr() {
  pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  raycaster.setFromCamera(new THREE.Vector2((ptr.sx / W) * 2 - 1, -(ptr.sy / H) * 2 + 1), camera);
  camera.getWorldDirection(fwd);
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  upv.setFromMatrixColumn(camera.matrixWorld, 1);
  const col = tool === 'highlight' ? hlColor : dyeColor;
  worker.postMessage({
    type: 'ptr', down: ptr.down, tool, sx: ptr.sx, sy: ptr.sy, W, H,
    radius: +sizeEl.value, color: hexLin(col),
    m: Array.from(pm.elements),
    camPos: camera.position.toArray(), rayDir: raycaster.ray.direction.toArray(),
    forward: fwd.toArray(), right: right.toArray(), up: upv.toArray(),
    k: (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / H,
  });
}

// ---------------- overlay ----------------
const particles = [];
function drawOverlay(now) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, W, H);
  while (trail.length && now - trail[0].t > 250) trail.shift();
  octx.lineCap = 'round';
  for (let i = 1; i < trail.length; i++) {
    octx.strokeStyle = `rgba(255,255,255,${(1 - (now - trail[i].t) / 250) * 0.8})`;
    octx.lineWidth = 2;
    octx.beginPath(); octx.moveTo(trail[i - 1].x, trail[i - 1].y); octx.lineTo(trail[i].x, trail[i].y); octx.stroke();
  }
  const R = +sizeEl.value;
  if (ptr.down && ['spray', 'water', 'gel', 'dye', 'highlight', 'grow'].includes(tool)) {
    const rgb = tool === 'water' ? [170, 215, 255] : tool === 'spray' ? [255, 255, 255] : tool === 'gel' ? [150, 230, 210]
      : tool === 'grow' ? [170, 255, 150] : hexRGB(tool === 'dye' ? dyeColor : hlColor);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R;
      particles.push({ x: ptr.sx + Math.cos(a) * d, y: ptr.sy + Math.sin(a) * d, life: 1, rgb, vy: tool === 'grow' ? -0.6 : 0.2 });
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= 0.05; p.y += p.vy;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    octx.fillStyle = `rgba(${p.rgb.join(',')},${p.life * 0.6})`;
    octx.beginPath(); octx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); octx.fill();
  }
  if (!ptr.inside || orbit.on) return;
  const { sx, sy } = ptr;
  if (BRUSH.has(tool)) {
    const r = R * (tool === 'clippers' ? 0.6 : tool === 'dryer' ? 1.5 : 1);
    octx.lineWidth = 3; octx.strokeStyle = 'rgba(0,0,0,0.25)';
    octx.beginPath(); octx.arc(sx, sy, r, 0, Math.PI * 2); octx.stroke();
    octx.lineWidth = 1.2; octx.strokeStyle = 'rgba(255,255,255,0.85)';
    octx.beginPath(); octx.arc(sx, sy, r, 0, Math.PI * 2); octx.stroke();
    if (tool === 'dryer' && ptr.down) {
      octx.strokeStyle = 'rgba(255,255,255,0.35)'; octx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + now * 0.002, d0 = r * 0.25 + ((now * 0.12 + i * 17) % (r * 0.7));
        octx.beginPath();
        octx.moveTo(sx + Math.cos(a) * d0, sy + Math.sin(a) * d0);
        octx.lineTo(sx + Math.cos(a) * (d0 + 8), sy + Math.sin(a) * (d0 + 8)); octx.stroke();
      }
    }
  }
  octx.strokeStyle = 'rgba(0,0,0,0.4)'; octx.lineWidth = 3;
  octx.beginPath(); octx.moveTo(sx - 7, sy); octx.lineTo(sx + 7, sy); octx.moveTo(sx, sy - 7); octx.lineTo(sx, sy + 7); octx.stroke();
  octx.strokeStyle = '#fff'; octx.lineWidth = 1.3; octx.stroke();
}

// ---------------- loop ----------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updateCamera(dt);
  if (ptr.down) sendPtr(); // keep camera-dependent picking fresh while held
  renderer.render(scene, camera);
  drawOverlay(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
