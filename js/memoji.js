// «ميموجي مدار»: your face as a soft 3D floating head in Apple's Memoji style, built from a few choices (skin, hair,
// brows, eyes, nose, mouth, ears, facial hair, glasses, headwear - with the Omani kumma and massar). One light-free
// sculpted, painted and lit surface gives Apple's soft clay look.
import * as THREE from 'three';

export const KEY = 'madar.memoji.v1';
export const DEFAULT = {
  skin: '#a86d4b', shade: 0.5, freckles: false, blush: 0.6,
  hair: 'buzz', hairColor: '#1b130e',
  brows: 'thick', browColor: '#1b130e',
  eyes: '#5a3a1e', lashes: false,
  nose: 'medium', mouth: 'soft', ears: 'medium', earring: 'none',
  facial: 'goatee_mustache', facialColor: '#160f0a',
  eyewear: 'none', frame: '#2a2a2e', lens: '#f2a33a', lensOp: 0,
  head: 'cap_back', headColor: '#232a46',
};
export function load() { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v?.cfg ? { cfg: { ...DEFAULT, ...v.cfg }, png: v.png || '' } : { cfg: { ...DEFAULT }, png: '' }; } catch { return { cfg: { ...DEFAULT }, png: '' }; } }
export function save(cfg, png) { try { localStorage.setItem(KEY, JSON.stringify({ cfg, png, at: Date.now() })); } catch {} }

// the choices (Arabic names, in the editor's order)
export const OPTIONS = {
  skinColors: ['#f6d7c3', '#e8b796', '#d39b74', '#c48a63', '#a86d4b', '#8d5634', '#6b3d22', '#4a2816'],
  hairColors: ['#0f0b09', '#1b130e', '#3b2516', '#5e3a1f', '#8a5a2b', '#b9874d', '#d8b57a', '#8c8c8c', '#e8e4dc', '#9b2f2a'],
  eyeColors: ['#3a2212', '#5a3a1e', '#7a5530', '#3f5f2a', '#2f5e7a', '#58708a', '#2b2b2b'],
  hatColors: ['#232a46', '#111111', '#f4f1ea', '#8a1c1c', '#1f5a3a', '#c9a35a', '#3a6fb0', '#6b4a2b'],
  frameColors: ['#2a2a2e', '#a66a2e', '#c9a35a', '#d0d0d0', '#a8322a', '#2f5e7a'],
  lensColors: ['#222222', '#f2a33a', '#d9452f', '#3f7fd9', '#4fa35a', '#c77ad9', '#88aacc'],
  hair: [['bald', 'بدون'], ['buzz', 'قصير جداً'], ['short', 'قصير'], ['wavy', 'مموّج'], ['side', 'جانبي'], ['curly', 'مجعّد'], ['long', 'طويل'], ['locs', 'ضفائر']],
  brows: [['thin', 'رفيعة'], ['medium', 'متوسطة'], ['thick', 'كثيفة'], ['arched', 'مقوّسة'], ['straight', 'مستقيمة']],
  nose: [['small', 'صغير'], ['medium', 'متوسط'], ['wide', 'عريض'], ['long', 'طويل']],
  mouth: [['soft', 'ابتسامة خفيفة'], ['smile', 'ابتسامة'], ['grin', 'ضحكة'], ['neutral', 'هادئ']],
  ears: [['small', 'صغيرتان'], ['medium', 'متوسطتان'], ['large', 'كبيرتان']],
  earring: [['none', 'بدون'], ['airpods', 'AirPods'], ['hoops', 'حلق'], ['studs', 'أقراط صغيرة']],
  facial: [['none', 'بدون'], ['stubble', 'خفيفة'], ['mustache', 'شنب'], ['goatee', 'سكسوكة'], ['goatee_mustache', 'سكسوكة وشنب'], ['beard', 'لحية'], ['full', 'لحية كاملة']],
  eyewear: [['none', 'بدون'], ['round', 'دائرية'], ['square', 'مربعة'], ['aviator', 'طيار'], ['sport', 'رياضية']],
  head: [['none', 'بدون'], ['cap_back', 'كاب مقلوب'], ['cap', 'كاب'], ['beanie', 'طاقية صوف'], ['kumma', 'كمة'], ['massar', 'مصر'], ['headphones', 'سماعات']],
};


// ---------------------------------------------------------------- v2: a sculpted face under real light
// The head is ONE smooth surface: eye sockets, brow ridge, cheeks, the nose (bridge, tip, wings), the lips and the
// smile are pushed in and out of it (no balls stuck on), shadows are painted into the skin where light can't reach
// (inner eye corners, nostrils, the mouth, under the lip and the jaw), and it is lit like Apple's: a soft room
// reflection, a warm key light, a rim light, and a velvet «sheen» on the skin.
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const g2 = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) ** 2) / (2 * sx * sx) + ((y - cy) ** 2) / (2 * sy * sy)));
const shadeOf = (hex, v) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, (v - 0.5) * 0.22); return '#' + c.getHexString(); };
const darker = (hex, k = 0.25) => { const c = new THREE.Color(hex); c.multiplyScalar(1 - k); return '#' + c.getHexString(); };

// the light: one prefiltered room per renderer (soft reflections) - shared by every head drawn with it
const envs = new WeakMap();
export function envFor(renderer) {
  if (!renderer) return null;
  if (!envs.has(renderer)) { const pm = new THREE.PMREMGenerator(renderer); envs.set(renderer, pm.fromScene(new RoomEnvironment(), 0.04).texture); pm.dispose(); }
  return envs.get(renderer);
}
export function lights() {
  // soft studio light: mostly a big even fill, a gentle key from the front-top, a faint warm rim
  const L = new THREE.Group();
  L.add(new THREE.HemisphereLight(0xfffaf4, 0xa0786a, 1.7));
  const key = new THREE.DirectionalLight(0xfff4ea, 1.15); key.position.set(-0.6, 1.0, 3); L.add(key);
  const fill = new THREE.DirectionalLight(0xfff0e8, 0.7); fill.position.set(1.6, -0.4, 2.4); L.add(fill);
  const rim = new THREE.DirectionalLight(0xffe8d8, 0.5); rim.position.set(1.2, 1.5, -2.5); L.add(rim);
  return L;
}

// ---- textures: hair strands, beard stubble, the iris
const texCache = new Map();
function strands(kind = 'hair') {
  if (texCache.has(kind)) return texCache.get(kind);
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, 512, 512);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  if (kind === 'hair') {
    for (let i = 0; i < 2600; i++) {
      const sx = rnd() * 512, sy = rnd() * 512, len = 40 + rnd() * 120, l = 90 + rnd() * 165;
      x.strokeStyle = `rgba(${l},${l},${l},${0.35 + rnd() * 0.4})`; x.lineWidth = 0.8 + rnd() * 1.6;
      x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + (rnd() - 0.5) * 18, sy + len / 2, sx + (rnd() - 0.5) * 10, sy + len); x.stroke();
    }
  } else {   // stubble / brows: fine dots
    for (let i = 0; i < 9000; i++) { const l = 110 + rnd() * 90; x.fillStyle = `rgba(${l},${l},${l},${0.5 + rnd() * 0.5})`; x.fillRect(rnd() * 512, rnd() * 512, 1.6 + rnd() * 1.6, 1.6 + rnd() * 2.6); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(kind === 'hair' ? 6 : 10, kind === 'hair' ? 2 : 10); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(kind, t); return t;
}
let HAIR_N = null;
function hairNormal() {
  if (HAIR_N) return HAIR_N;
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, N, N);
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 1800; i++) {   // strands as raised lines (a height map)
    const sx = rnd() * N, sy = rnd() * N, len = 30 + rnd() * 90, l = 140 + rnd() * 115;
    x.strokeStyle = `rgba(${l},${l},${l},0.55)`; x.lineWidth = 1.5 + rnd() * 2.5;
    x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + (rnd() - 0.5) * 14, sy + len / 2, sx + (rnd() - 0.5) * 8, sy + len); x.stroke();
  }
  for (let i = 0; i < 260; i++) { const l = 60 + rnd() * 40; x.fillStyle = `rgba(${l},${l},${l},0.35)`; x.beginPath(); x.ellipse(rnd() * N, rnd() * N, 3 + rnd() * 6, 18 + rnd() * 40, 0, 0, 7); x.fill(); }   // clumps' gaps
  const src = x.getImageData(0, 0, N, N).data, out = x.createImageData(N, N), H = (i, j) => src[(((j + N) % N) * N + ((i + N) % N)) * 4] / 255;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const dx = (H(i + 1, j) - H(i - 1, j)) * 3, dy = (H(i, j + 1) - H(i, j - 1)) * 3, l = Math.hypot(dx, dy, 1), k = (j * N + i) * 4; out.data[k] = (-dx / l * 0.5 + 0.5) * 255; out.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; out.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[k + 3] = 255; }
  x.putImageData(out, 0, 0);
  HAIR_N = new THREE.CanvasTexture(c); HAIR_N.wrapS = HAIR_N.wrapT = THREE.RepeatWrapping; HAIR_N.repeat.set(7, 2.5); HAIR_N.anisotropy = 4;
  return HAIR_N;
}
function irisTex(hex) {
  const k = 'iris' + hex; if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), m = 128;
  const base = new THREE.Color(hex), lite = base.clone().offsetHSL(0, 0.05, 0.16), dark = base.clone().multiplyScalar(0.45);
  let g = x.createRadialGradient(m, m, 10, m, m, 128); g.addColorStop(0, '#' + lite.getHexString()); g.addColorStop(0.55, '#' + base.getHexString()); g.addColorStop(0.86, '#' + dark.getHexString()); g.addColorStop(1, '#120a06');
  x.fillStyle = g; x.beginPath(); x.arc(m, m, 128, 0, 7); x.fill();
  for (let i = 0; i < 140; i++) { const a = i / 140 * Math.PI * 2 + Math.sin(i) * 0.05; x.strokeStyle = `rgba(255,235,200,${0.06 + (i % 5) * 0.025})`; x.lineWidth = 1.2; x.beginPath(); x.moveTo(m + Math.cos(a) * 36, m + Math.sin(a) * 36); x.lineTo(m + Math.cos(a) * 112, m + Math.sin(a) * 112); x.stroke(); }
  x.fillStyle = '#060302'; x.beginPath(); x.arc(m, m, 62, 0, 7); x.fill();   // a big pupil
  g = x.createRadialGradient(m, m, 60, m, m, 70); g.addColorStop(0, 'rgba(6,3,2,1)'); g.addColorStop(1, 'rgba(6,3,2,0)'); x.fillStyle = g; x.beginPath(); x.arc(m, m, 70, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; texCache.set(k, t); return t;
}

// ---- materials
// the skin's fine texture: a tileable noise turned into a normal map (pores, the soft unevenness of skin) and a
// roughness map (some places a little glossier) - subtle, like Apple's
let SKIN_TEX = null;
function skinTex() {
  if (SKIN_TEX) return SKIN_TEX;
  const N = 256, h = new Float32Array(N * N);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const oct = (cells, amp) => {   // tileable value noise
    const g = Array.from({ length: cells * cells }, rnd), at = (i, j) => g[((j + cells) % cells) * cells + ((i + cells) % cells)];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / N * cells, fy = y / N * cells, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      h[y * N + x] += amp * ((at(i, j) * (1 - sx) + at(i + 1, j) * sx) * (1 - sy) + (at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx) * sy);
    }
  };
  oct(8, 0.5); oct(32, 0.3); oct(96, 0.2); oct(160, 0.12);
  const nc = document.createElement('canvas'); nc.width = nc.height = N; const nx = nc.getContext('2d'), nd = nx.createImageData(N, N);
  const rc = document.createElement('canvas'); rc.width = rc.height = N; const rx = rc.getContext('2d'), rd = rx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const H = (i, j) => h[((j + N) % N) * N + ((i + N) % N)];
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2, l = Math.hypot(dx, dy, 1), k = (y * N + x) * 4;
    nd.data[k] = (-dx / l * 0.5 + 0.5) * 255; nd.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; nd.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; nd.data[k + 3] = 255;
    const r = 200 + (H(x, y) - 0.55) * 40; rd.data[k] = rd.data[k + 1] = rd.data[k + 2] = Math.max(170, Math.min(230, r)); rd.data[k + 3] = 255;
  }
  nx.putImageData(nd, 0, 0); rx.putImageData(rd, 0, 0);
  const mk = c => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 3); t.anisotropy = 4; return t; };
  SKIN_TEX = { normal: mk(nc), rough: mk(rc) };
  return SKIN_TEX;
}
function skinMat(hex, env) {
  const T = skinTex();
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), vertexColors: true, roughness: 0.82, roughnessMap: T.rough, normalMap: T.normal, normalScale: new THREE.Vector2(0.05, 0.05), metalness: 0, sheen: 0.6, sheenColor: new THREE.Color('#ff9a7e'), sheenRoughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.55, envMap: env, envMapIntensity: 0.6, side: THREE.DoubleSide });
}
function hairMat(hex, env, kind = 'hair', o = {}) {
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), map: strands(kind), roughness: 0.48, metalness: 0, sheen: 0.8, sheenColor: new THREE.Color(hex).offsetHSL(0, 0, 0.25), sheenRoughness: 0.4, envMap: env, envMapIntensity: 0.6, ...o });
}
function plain(hex, env, o = {}) { return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), roughness: 0.45, metalness: 0, envMap: env, envMapIntensity: 0.8, ...o }); }

// ---------------------------------------------------------------- the sculpt (v3: Apple's proportions)
// A Memoji head is not a ball: a rounded box (flat-ish face, tall skull), widest at the full cheeks, a soft round
// chin. Final coordinates: eyes at y -0.02, nose tip -0.24, mouth -0.5, chin -0.92, top of the skull 1.0.
function faceParams(cfg) {
  const open = cfg.mouth === 'grin' ? 0.11 : 0;
  return {
    curve: { smile: 1.6, grin: 1.3, soft: 0.9, neutral: 0.2 }[cfg.mouth] ?? 0.9,
    mw: cfg.mouth === 'grin' ? 0.22 : cfg.mouth === 'smile' ? 0.15 : 0.13, open,
    nose: { small: [0.8, 0.85], medium: [1, 1], wide: [1, 1.3], long: [1.25, 0.95] }[cfg.nose] || [1, 1],
    blush: cfg.blush ?? 0.6,
  };
}
const EYE = { x: 0.31, y: -0.04, w: 0.17, up: 0.082, low: 0.056 };
const eyeUp = (t) => EYE.y + EYE.up * Math.pow(Math.max(0, 1 - t * t), 0.7) * (1 - 0.12 * t);
const eyeLow = (t) => EYE.y - EYE.low * Math.pow(Math.max(0, 1 - t * t), 0.85);
// inside the almond of an eye? (> 0 inside, in face units)
const inEyeD = (x, y) => { const t = (Math.abs(x) - EYE.x) / EYE.w; if (Math.abs(t) >= 1) return -1; return Math.min(eyeUp(t) - y, y - eyeLow(t)); };   // t > 0 = the outer corner
const mouthY = (P, x) => -0.6 + P.curve * x * x;
const mouthLow = (P, x, talk = 0) => mouthY(P, x) - (P.open + talk * 0.07) * Math.max(0, 1 - (x / P.mw) ** 2);
// how far the face moves in (-) or out (+) at (x, y) - only on the front of the head
function face(P, x, y, talk = 0, blink = 0) {
  let d = 0;
  // the eye openings: the skin curls in around the almond (the lids' rim); a blink fills them again
  if (!P.noEyes) { const e = inEyeD(x, y); if (e > -0.03) d -= (0.14 * (1 - blink)) * ss(-0.006, 0.022, e) - blink * 0.012 * ss(-0.02, 0.02, e); }
  for (const s of [-1, 1]) {
    d -= 0.02 * g2(x, y, s * EYE.x, EYE.y, 0.14, 0.1);        // a shallow socket (the eye sits ON the face)
    d += 0.015 * g2(x, y, s * EYE.x, 0.21, 0.16, 0.05);       // brow
    d += 0.04 * g2(x, y, s * 0.42, -0.32, 0.15, 0.13);        // cheeks
    d += 0.03 * P.nose[1] * g2(x, y, s * 0.07 * P.nose[1], -0.33, 0.04, 0.035);   // nostril wings
    if (!P.noEyes) {
      const t = (Math.abs(x) - EYE.x) / EYE.w, tc = Math.max(-1.2, Math.min(1.2, t)), inside = 1 - ss(0.9, 1.25, Math.abs(t));
      const yu = eyeUp(Math.max(-1, Math.min(1, tc))), yl = eyeLow(Math.max(-1, Math.min(1, tc)));
      d += 0.016 * inside * g2(0, y, 0, yu + 0.024, 1, 0.02);     // the upper lid's skin over the eye
      d -= 0.008 * inside * g2(0, y, 0, yu + 0.062, 1, 0.022);    // the fold (crease) above it
      d += 0.006 * inside * g2(0, y, 0, yl - 0.016, 1, 0.014);    // the lower lid's soft rim
    }
  }
  // a small button nose: almost no bridge, a round tip
  d += 0.024 * Math.exp(-(x * x) / (2 * 0.05 * 0.05)) * ss(0.05, -0.22, y) * ss(-0.38, -0.27, y);
  d += 0.095 * P.nose[0] * g2(x, y, 0, -0.29, 0.082 * P.nose[1], 0.07 * P.nose[0]);
  d -= 0.012 * g2(x, y, 0, -0.37, 0.06, 0.02);              // under the nose
  // soft lips
  const ym = mouthY(P, x), yl = mouthLow(P, x, talk), inX = Math.max(0, 1 - (x / (P.mw * 1.3)) ** 2);
  // the upper lip with its cupid's bow (two little peaks), a fuller lower lip, a groove above the bow (philtrum)
  const bow = 0.012 * (g2(x, 0, -0.035, 0, 0.022, 1) + g2(x, 0, 0.035, 0, 0.022, 1)) - 0.006 * g2(x, 0, 0, 0, 0.015, 1);
  d += 0.016 * g2(0, y, 0, ym + 0.022 + bow * 0.6, 1, 0.017 + bow * 0.5) * inX;     // upper lip
  d += 0.03 * g2(0, y, 0, yl - 0.03, 1, 0.026) * Math.max(0, 1 - (x / (P.mw * 1.1)) ** 2);   // lower lip
  d -= 0.008 * g2(x, y, 0, ym + 0.085, 0.022, 0.04);       // philtrum
  if (P.open > 0.001) d -= 0.01 * ss(0, 0.04, P.mw - Math.abs(x)) * g2(0, y, 0, (ym + yl) / 2, 1, 0.05);
  else d -= 0.012 * g2(0, y, 0, ym, 1, 0.007) * ss(0, 0.03, P.mw * 1.1 - Math.abs(x));
  d += 0.022 * g2(x, y, 0, -0.98, 0.16, 0.09);              // chin
  return d;
}
// a point of the unit sphere → the head's surface
function sculpt(u, P, out, talk = 0, blink = 0) {
  // a rounded box (superellipsoid), then the Memoji silhouette: tall skull, widest at the cheeks, round chin
  // flat-ish sides (a higher power across), rounder top and bottom
  const ax = Math.abs(u.x) ** 3, ay = Math.abs(u.y) ** 2.4, az = Math.abs(u.z) ** 2.6, rr = 1 / Math.pow(ax + ay + az, 1 / 2.7);
  let x = u.x * rr, y = u.y * rr * 1.08, z = u.z * rr;
  // widest at the cheekbones, the sides falling almost straight, a broad round (U) chin - no V
  const jaw = ss(-0.2, -1.08, y);
  x *= 0.8 * (1 - 0.2 * Math.pow(jaw, 1.3)) * (1 + 0.03 * Math.exp(-(((y + 0.12) / 0.35) ** 2))) * (1 - 0.06 * ss(0.4, 1.08, y));
  z *= (z > 0 ? 0.78 : 0.9) * (1 - 0.1 * jaw * jaw);
  if (z > 0) z += 0.03 * Math.exp(-(((y + 0.4) / 0.35) ** 2)) * ss(0.2, 0.7, u.z);   // the cheeks come forward a little
  out.set(x, y, z);
  if (talk && u.z > 0) { const below = ss(-0.02, 0.04, mouthY(P, x) - y) * ss(-1.2, -0.75, y) * ss(0.0, 0.5, u.z) * ss(0.85, 0.45, Math.abs(x)); out.y -= talk * 0.06 * below; }
  const front = ss(0.1, 0.5, u.z);
  if (front > 0) { const d = face(P, x, y, 0, blink) * front; out.addScaledVector(out.clone().normalize(), d); }
  return out;
}
// the colours painted into the skin: rosy cheeks, soft lips, a hint of shadow in the creases (very soft, like Apple)
function paint(P, x, y, uz, lipC) {
  const f = ss(0.1, 0.5, uz);
  let k = 1, r = 1, gC = 1, b = 1;
  for (const s of [-1, 1]) {
    const bl = f * P.blush * g2(x, y, s * 0.43, -0.37, 0.12, 0.1); r *= 1 + 0.32 * bl; gC *= 1 - 0.1 * bl; b *= 1 - 0.02 * bl;   // blush
    k -= f * 0.08 * g2(x, y, s * EYE.x, EYE.y + EYE.up + 0.04, 0.12, 0.02);   // the lid crease
    k -= f * 0.6 * g2(x, y, s * 0.048, -0.345, 0.024, 0.013);               // nostrils
  }
  k -= f * 0.07 * g2(x, y, 0, -0.37, 0.07, 0.02);
  { const warm = f * 0.5 * g2(x, y, 0, -0.29, 0.07, 0.06); r *= 1 + 0.12 * warm; gC *= 1 - 0.03 * warm; }   // the nose tip
  { const lift = f * (0.06 * g2(x, y, 0, 0.42, 0.3, 0.2) + 0.04 * g2(Math.abs(x), y, 0.36, -0.2, 0.1, 0.06)); k += lift; }   // forehead, cheekbones
  k -= 0.08 * (1 - ss(0.0, 0.6, uz));                                // the sides and back a touch darker
  const ym = mouthY(P, x), yl = mouthLow(P, x), inX = Math.max(0, 1 - (x / (P.mw * 1.3)) ** 2);
  const upper = g2(0, y, 0, ym + 0.022, 1, 0.019), lower = g2(0, y, 0, yl - 0.03, 1, 0.028);
  const lip = f * inX * Math.max(upper, lower); k -= f * inX * upper * 0.08;
  const mix = (a, c) => a * (1 - lip * 0.88) + c * lip * 0.88;
  r = mix(r, lipC.r); gC = mix(gC, lipC.g); b = mix(b, lipC.b);
  if (P.open > 0) { const inside = f * ss(-0.01, 0.01, ym - y) * ss(-0.01, 0.01, y - yl) * ss(0, 0.03, P.mw - Math.abs(x)); r = r * (1 - inside) + 0.22 * inside; gC = gC * (1 - inside) + 0.04 * inside; b = b * (1 - inside) + 0.05 * inside; }
  else k -= f * 0.38 * g2(0, y, 0, ym, 1, 0.007) * inX;          // the line between the lips
  k -= 0.18 * ss(-0.95, -1.18, y);                                  // under the jaw
  for (const s of [-1, 1]) {
    const t = (s * x - EYE.x) / EYE.w, inside = 1 - ss(0.85, 1.3, Math.abs(t)), tc = Math.max(-1, Math.min(1, t));
    k -= f * inside * 0.1 * g2(0, y, 0, eyeUp(tc) + 0.062, 1, 0.022);       // the fold's shadow
    k -= f * inside * 0.08 * g2(0, y, 0, eyeUp(tc) + 0.012, 1, 0.012);      // the lid's edge
    k -= f * inside * 0.035 * g2(0, y, 0, eyeLow(tc) - 0.06, 1, 0.03);      // under the eye
    k -= f * 0.12 * g2(x, y, s * 0.075, -0.22, 0.03, 0.1);                  // the sides of the nose
    k -= f * 0.14 * g2(x, y, s * 0.105, -0.33, 0.025, 0.04);                // around the nostril wings
    k -= f * 0.14 * g2(x, y, s * P.mw * 1.12, mouthY(P, P.mw), 0.025, 0.025); // the mouth corners
  }
  k += f * 0.1 * g2(x, y, 0, -0.28, 0.03, 0.025);                    // the light on the nose tip
  k -= f * 0.16 * g2(x, y, 0, -0.39, 0.05, 0.014);                   // the shadow under the nose
  { const yl0 = mouthLow(P, 0); k += f * 0.07 * g2(x, y, 0, yl0 - 0.03, 0.06, 0.01); k -= f * 0.15 * g2(0, y, 0, yl0 - 0.075, 1, 0.016) * inX; }   // lower lip shine, its shadow
  if (P.hairFront != null) k -= f * 0.16 * g2(0, y, 0, P.hairFront - 0.04, 1, 0.045) * (1 - ss(0.5, 0.75, Math.abs(x)));   // the hair's shadow on the forehead
  // skin is not grey in shadow: light passes under it and comes back warm (subsurface) - darken red less
  const sh = 1 - Math.min(1, k);
  return [Math.max(0, r * (1 - sh * 0.62)), Math.max(0, gC * (1 - sh * 1.08)), Math.max(0, b * (1 - sh * 1.18))];
}
// a smooth sphere turned into the head (or into a layer over it: hair, beard, hat) - dist > 0 where the layer is
function surface(P, { seg = [176, 144], grow = 0, dist = null, lumps = null, talk = false, paintC = null, hole = null, edge = 0.016 } = {}) {
  const g = new THREE.SphereGeometry(1, Math.round(seg[0] * (P.q || 1)), Math.round(seg[1] * (P.q || 1))), p = g.attributes.position, u = new THREE.Vector3(), o = new THREE.Vector3(), n = new THREE.Vector3();
  const cols = paintC ? new Float32Array(p.count * 3) : null, keep = dist ? new Uint8Array(p.count) : null, talkPos = talk ? new Float32Array(p.count * 3) : null, blinkPos = talk ? new Float32Array(p.count * 3) : null, cut = hole ? new Uint8Array(p.count) : null;
  for (let i = 0; i < p.count; i++) {
    u.fromBufferAttribute(p, i); u.z += 0.7; u.normalize();   // more vertices on the face, fewer behind the head
    sculpt(u, P, o); n.copy(o).normalize();
    let off = grow;
    if (dist) { const d = dist(o.x, o.y, u.z, u); const e = ss(-edge, edge, d); off = -0.025 + (grow + 0.025) * e; keep[i] = d > -0.07 ? 1 : 0; if (lumps && e > 0) off += lumps(o.x, o.y, u.z, u) * e; }
    p.setXYZ(i, o.x + n.x * off, o.y + n.y * off, o.z + n.z * off);
    if (cols) { const c = paint(P, o.x, o.y, u.z, paintC); cols.set(c, i * 3); }
    if (cut) cut[i] = hole(o.x, o.y, u.z) ? 1 : 0;
    if (talkPos) { sculpt(u, P, o, 1); talkPos.set([o.x, o.y, o.z], i * 3); sculpt(u, P, o, 0, 1); blinkPos.set([o.x, o.y, o.z], i * 3); }
  }
  if (cols) g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  if (talkPos) { g.morphAttributes.position = [new THREE.BufferAttribute(talkPos, 3), new THREE.BufferAttribute(blinkPos, 3)]; g.morphTargetsRelative = false; }
  if (keep || cut) { const ix = g.index.array, idx = []; for (let i = 0; i < ix.length; i += 3) { const a = ix[i], b = ix[i + 1], c = ix[i + 2]; if (keep && !(keep[a] || keep[b] || keep[c])) continue; if (cut && cut[a] + cut[b] + cut[c] >= 2) continue; idx.push(a, b, c); } g.setIndex(idx); }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- build
export function build(cfg = DEFAULT, { env = null, lite = false } = {}) {
  cfg = { ...DEFAULT, ...cfg };
  const G = new THREE.Group(), P = { ...faceParams(cfg), q: lite ? 0.5 : 1 }, skin = shadeOf(cfg.skin, cfg.shade);
  const lipC = new THREE.Color(skin).lerp(new THREE.Color('#9a4a44'), 0.5); lipC.r /= new THREE.Color(skin).r || 1; lipC.g /= new THREE.Color(skin).g || 1; lipC.b /= new THREE.Color(skin).b || 1;
  P.hairFront = ['cap_back', 'cap', 'beanie'].includes(cfg.head) ? 0.5 : ['kumma', 'massar'].includes(cfg.head) ? 0.6 : cfg.hair === 'bald' ? null : cfg.hair === 'buzz' ? 0.55 : 0.44;
  const SK = skinMat(skin, env);
  const inMouth = (x, y, uz) => P.open > 0 && uz > 0.4 && Math.abs(x) < P.mw * 0.97 && y < mouthY(P, x) - 0.004 && y > mouthLow(P, x) + 0.004;
  // the eyes are almond openings in the skin with the eyeballs behind (that is how the lids frame them)
  const head = new THREE.Mesh(surface(P, { seg: [210, 180], paintC: lipC, talk: true, hole: inMouth }), SK);
  head.morphTargetInfluences = [0, 0];
  G.add(head); G.userData.head = head;
  const ray = new THREE.Raycaster();
  // where things sit on the face: found on a plain copy of the head (no mouth opening for the rays to fall through)
  const probe = new THREE.Mesh(surface({ ...P, noEyes: true }, { seg: [140, 120] }));
  const on = (x, y) => { ray.set(new THREE.Vector3(x, y, 4), new THREE.Vector3(0, 0, -1)); const h = ray.intersectObject(probe)[0]; return h ? { p: h.point.clone(), n: h.face.normal.clone() } : { p: new THREE.Vector3(x, y, 0.6), n: new THREE.Vector3(0, 0, 1) }; };
  const add = (geo, m, pos, scl, rot) => { const o = new THREE.Mesh(geo, m); if (pos) o.position.copy(pos); if (scl) o.scale.set(...scl); if (rot) o.rotation.set(...rot); G.add(o); return o; };
  const layer = (dist, m, grow, lumps, seg) => add(surface(P, { dist, grow, lumps, seg }), m);

  // ears
  const es = { small: 0.85, medium: 1, large: 1.2 }[cfg.ears] || 1;
  for (const s of [-1, 1]) {
    const earG = new THREE.SphereGeometry(0.2, 40, 28);
    add(earG, SK, new THREE.Vector3(s * 0.82, -0.2, -0.05), [0.6 * es, 1.25 * es, 0.85 * es], [0, s * 0.35, s * -0.08]).geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(earG.attributes.position.count * 3).fill(0.93), 3));
    const inner = new THREE.SphereGeometry(0.11, 28, 20); inner.setAttribute('color', new THREE.BufferAttribute(new Float32Array(inner.attributes.position.count * 3).fill(0.62), 3));
    add(inner, SK, new THREE.Vector3(s * 0.9, -0.21, 0.01), [0.35 * es, 0.95 * es, 0.55 * es], [0, s * 0.35, 0]);
    if (cfg.earring === 'airpods') { add(new THREE.SphereGeometry(0.06, 24, 16), plain('#f4f4f4', env, { roughness: 0.25, clearcoat: 1 }), new THREE.Vector3(s * 0.94, -0.18, 0.06)); add(new THREE.CapsuleGeometry(0.024, 0.15, 6, 12), plain('#f4f4f4', env, { roughness: 0.25, clearcoat: 1 }), new THREE.Vector3(s * 0.95, -0.31, 0.07)); }
    if (cfg.earring === 'hoops') add(new THREE.TorusGeometry(0.09, 0.012, 10, 40), plain('#d8d8d8', env, { metalness: 1, roughness: 0.2 }), new THREE.Vector3(s * 0.92, -0.34, 0), null, [0, Math.PI / 2, 0]);
    if (cfg.earring === 'studs') add(new THREE.SphereGeometry(0.03, 16, 12), plain('#eef', env, { metalness: 0.6, roughness: 0.1 }), new THREE.Vector3(s * 0.93, -0.25, 0.04));
  }

  // eyes: behind each almond opening a white ball (wide, so it fills the corners), a big textured iris, a glint,
  // and the dark line of lashes along the top edge; a blink closes the opening with the lid's own skin
  const eyes = new THREE.Group(); G.add(eyes); G.userData.lids = [];
  const white = plain('#ece6de', env, { roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15, vertexColors: true });
  const cornea = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.05, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0, envMap: env, envMapIntensity: 0.9, depthWrite: false });
  const irisM = new THREE.MeshPhysicalMaterial({ map: irisTex(cfg.eyes), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMap: env, envMapIntensity: 0.5 });
  const lashM = plain(cfg.lashes ? '#0e0907' : '#24170f', env, { roughness: 0.7 });
  for (const s of [-1, 1]) {
    const c = on(s * EYE.x, EYE.y), eg = new THREE.Group();
    eg.position.copy(c.p).add(c.n.clone().multiplyScalar(-0.162)); eg.lookAt(eg.position.clone().add(new THREE.Vector3(s * 0.06, 0, 1))); eyes.add(eg);
    // the white: shaded by the upper lid at the top, a little pink in the corners
    const wg = new THREE.SphereGeometry(0.15, 48, 32), wp = wg.attributes.position, wc = new Float32Array(wp.count * 3);
    for (let i = 0; i < wp.count; i++) { const yy = wp.getY(i) / 0.15, xx = Math.abs(wp.getX(i) / 0.15); const sh = 1 - 0.38 * ss(0.05, 0.75, yy) - 0.12 * ss(0.5, 0.95, xx); wc.set([sh * (1 + 0.06 * ss(0.6, 0.95, xx)), sh * (1 - 0.05 * ss(0.6, 0.95, xx)), sh * (1 - 0.06 * ss(0.6, 0.95, xx))], i * 3); }
    wg.setAttribute('color', new THREE.BufferAttribute(wc, 3));
    const w = new THREE.Mesh(wg, white); w.scale.set(1.38, 1.0, 1); eg.add(w);
    const ir = new THREE.Mesh(new THREE.CircleGeometry(0.1, 48), irisM); ir.position.set(0, -0.004, 0.149); eg.add(ir);
    // the cornea: a clear dome over the iris that catches the room (the eye's wet shine)
    const co = new THREE.Mesh(new THREE.SphereGeometry(0.11, 40, 24, 0, Math.PI * 2, 0, 0.75), cornea); co.rotation.x = Math.PI / 2; co.position.set(0, -0.004, 0.073); eg.add(co);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.017, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })); gl.position.set(-0.03, 0.03, 0.158); eg.add(gl);
    const gl2 = new THREE.Mesh(new THREE.SphereGeometry(0.007, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })); gl2.position.set(0.035, -0.035, 0.156); eg.add(gl2);
    // the lash line: along the upper edge of the almond, a touch thicker and lifted at the outer corner
    const pts = []; for (let i = 0; i <= 16; i++) { const t = -1.02 + 2.08 * i / 16, x = s * (EYE.x + t * EYE.w), y = eyeUp(Math.min(1, t)) + (t > 0.85 ? (t - 0.85) * 0.15 : 0), h = on(x, y); pts.push(h.p.add(h.n.multiplyScalar(0.006))); }
    const lash = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, cfg.lashes ? 0.014 : 0.0095, 8, false), lashM); G.add(lash);
  }
  G.userData.eyes = eyes;

  // teeth: a white band just inside the top of the open smile
  const mouth = new THREE.Group(); G.add(mouth); G.userData.mouth = mouth;
  if (P.open > 0) {
    // behind the opening: the dark inside of the mouth, and the upper teeth just inside the top lip
    const strip = (yTop, yBot, back, n = 28, wk = 1) => {
      const pos = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const x = (-1 + 2 * i / n) * P.mw * wk;
        for (const yy of [yTop(x), yBot(x)]) { const h = on(x, yy); pos.push(h.p.x * 0.985, h.p.y, h.p.z - back); }
        if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setIndex(idx); gg.computeVertexNormals(); return gg;
    };
    mouth.add(new THREE.Mesh(strip(x => mouthY(P, x) + 0.02, x => mouthLow(P, x, 1) - 0.03, 0.06, 28, 1.05), new THREE.MeshBasicMaterial({ color: 0x2a0b0c, side: THREE.DoubleSide })));
    mouth.add(new THREE.Mesh(strip(x => mouthY(P, x) + 0.006, x => mouthY(P, x) - Math.min(0.035, (mouthY(P, x) - mouthLow(P, x)) * 0.62), 0.022, 28, 0.88), plain('#fbf9f3', env, { roughness: 0.25, clearcoat: 0.6, side: THREE.DoubleSide })));
  }

  // brows: hair grown on the brow line, thick at the inside, thin at the end
  const bw = { thin: 0.022, medium: 0.032, thick: 0.045, arched: 0.032, straight: 0.04 }[cfg.brows] || 0.032;
  const arch = cfg.brows === 'arched' ? 0.07 : cfg.brows === 'straight' ? 0.005 : 0.035;
  layer((x, y, uz) => {
    const ax = Math.abs(x); if (uz < 0.3) return -1;
    const t = (ax - 0.13) / 0.33, yb = 0.22 + arch * Math.sin(Math.PI * Math.min(1, Math.max(0, t)) * 0.9) - 0.03 * t;
    const half = bw * (1.15 - 0.6 * Math.min(1, Math.max(0, t)));
    return Math.min(half - Math.abs(y - yb), t + 0.02, 1.02 - t);
  }, hairMat(cfg.browColor, env, 'dots'), 0.016, null, [176, 144]);

  // facial hair
  const fc = cfg.facialColor, fm = hairMat(fc, env, 'dots');
  const mouthOval = (x, y) => 1 - ((x / (P.mw * 1.25)) ** 2 + ((y - (mouthY(P, x) - P.open / 2)) / 0.075) ** 2);
  if (cfg.facial === 'beard' || cfg.facial === 'full' || cfg.facial === 'stubble') {
    const full = cfg.facial === 'full';
    layer((x, y, uz) => {
      const ax = Math.abs(x), top = full ? -0.25 + 0.36 * ss(0.38, 0.76, ax) : -0.7 + 0.66 * ss(0.28, 0.74, ax);
      let d = Math.min(uz + 0.35, top - y);
      d = Math.min(d, -mouthOval(x, y) * 0.15);
      if (uz > 0.4) d = Math.min(d, -(1 - ((x / 0.22) ** 2 + ((y + 0.39) / 0.06) ** 2)) * 0.15);   // under the nose
      return d;
    }, cfg.facial === 'stubble' ? hairMat(fc, env, 'dots', { transparent: true, opacity: 0.45, depthWrite: false }) : fm, full ? 0.06 : 0.03, full ? (x, y) => 0.03 * ss(-0.5, -1.1, y) : null);
  }
  if (cfg.facial === 'goatee' || cfg.facial === 'goatee_mustache') {
    layer((x, y, uz) => { if (uz < 0.2) return -1; const w = 0.1 + 0.06 * ss(-0.76, -0.98, y); return Math.min(w - Math.abs(x), mouthLow(P, x) - 0.06 - y, y + 1.08); }, fm, 0.03, (x, y) => 0.02 * ss(-0.75, -1.05, y));
  }
  if (cfg.facial === 'mustache' || cfg.facial === 'goatee_mustache' || cfg.facial === 'full') {
    layer((x, y, uz) => { if (uz < 0.3) return -1; const yc = mouthY(P, x) + 0.062 - 0.05 * Math.abs(x); return Math.min(0.026 * (1.2 - Math.abs(x) * 2) - Math.abs(y - yc), P.mw * 1.25 - Math.abs(x)); }, fm, 0.03);
  }

  // hair: grown from a hairline (high at the forehead, above the ears, low behind), with volume for the longer styles
  const hm = hairMat(cfg.hairColor, env, ['buzz', 'short', 'wavy', 'side'].includes(cfg.hair) ? 'dots' : 'hair', { roughness: 0.8, sheen: 1, sheenRoughness: 0.35, normalMap: hairNormal(), normalScale: new THREE.Vector2(cfg.hair === 'buzz' ? 0.35 : 0.8, cfg.hair === 'buzz' ? 0.35 : 0.8) });
  const hairline = (x, y, uz, front = 0.44) => {
    const f = ss(0.25, 0.75, uz), ear = ss(0.62, 0.8, Math.abs(x)) * ss(-0.35, 0.05, uz) * (1 - ss(0.3, 0.6, uz));
    const line = front * f + -0.5 * (1 - f);
    return y - Math.max(line, ear * 0.14 + (1 - ear) * line) - (Math.abs(x) > 0.55 && uz > 0.2 ? 0.08 * ss(0.55, 0.75, Math.abs(x)) : 0);
  };
  const noise = (u, a) => a * (Math.sin(u.x * 9 + u.y * 4) * 0.5 + Math.sin(u.z * 11 - u.x * 6) * 0.3 + Math.sin(u.y * 13) * 0.2);
  if (cfg.hair === 'buzz') layer((x, y, uz) => hairline(x, y, uz, 0.55), hm, 0.012);
  else if (cfg.hair === 'short' || cfg.hair === 'wavy' || cfg.hair === 'side') {
    // one sculpted mass: lifted into a swoop over the forehead, with deep grooves between the chunks
    const kind = cfg.hair, big = kind === 'wavy' ? 1 : kind === 'side' ? 0.85 : 0.45;
    layer((x, y, uz) => hairline(x, y, uz, 0.44) + (kind === 'side' ? 0.04 * Math.sin(x * 4) : (kind === 'short' ? 0.008 : 0.03) * Math.cos(x * 9) * ss(0.5, 0.9, uz) + 0.012 * Math.sin(x * 37 + Math.sin(x * 11) * 2) * ss(0.4, 0.8, uz)), hm, 0.08, (x, y, uz, u) => {
      const az = Math.atan2(u.x, u.z), top = ss(0.3, 1.0, y), front = ss(-0.1, 0.7, uz);
      const swoop = 0.2 * big * top * front * (kind === 'side' ? 0.6 + 0.4 * ss(-0.6, 0.6, x) : 1);
      const groove = (kind === 'short' ? 0.012 : 0.035) * big * Math.pow(Math.abs(Math.sin(az * (kind === 'side' ? 5 : 6) + y * (kind === 'side' ? 6 : 2.5))), 0.6) * top;
      // a full, wide mass (wider than the face at the temples), flat-ish on top like a fresh cut
      const sides = 0.05 * ss(0.4, 0.8, Math.abs(x)) * ss(-0.2, 0.5, y);
      return swoop + groove + noise(u, 0.016) + 0.05 * top + sides;
    }, [220, 180]);
  } else if (cfg.hair === 'curly') {
    layer((x, y, uz) => hairline(x, y, uz, 0.4), hm, 0.05);
    const n = 170, inst = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 14), hairMat(cfg.hairColor, env, 'hair'), n), M = new THREE.Matrix4(), q = new THREE.Quaternion(), u = new THREE.Vector3(), o = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i < n * 2 && k < n; i++) {
      const t = Math.acos(1 - (i + 0.5) / (n * 2) * 1.25), ph = i * 2.399963;
      u.set(Math.sin(t) * Math.cos(ph), Math.cos(t), Math.sin(t) * Math.sin(ph));
      sculpt(u, P, o); if (hairline(o.x, o.y, u.z, 0.4) < 0.04) continue;
      o.addScaledVector(o.clone().normalize(), 0.1 + (i % 3) * 0.03);
      const s = 0.15 + (i % 5) * 0.012; M.compose(o, q, new THREE.Vector3(s, s, s)); inst.setMatrixAt(k++, M);
    }
    inst.count = k; G.add(inst);
  } else if (cfg.hair === 'long') {
    layer((x, y, uz) => Math.max(hairline(x, y, uz, 0.44), Math.min(-uz - 0.1, y + 1.2), Math.min(Math.abs(x) - 0.62, y + 0.9, 0.4 - uz)), hm, 0.07, (x, y, uz, u) => noise(u, 0.015) + 0.05 * ss(-0.2, -1, y));
  } else if (cfg.hair === 'locs') {
    layer((x, y, uz) => hairline(x, y, uz, 0.44), hm, 0.05);
    for (let i = 0; i < 20; i++) {
      const a = Math.PI * (0.62 + 0.76 * i / 19), x = Math.cos(a) * 0.92, z = Math.sin(a) * 0.95;
      const pts = [new THREE.Vector3(x * 0.9, 0.7, z * 0.9), new THREE.Vector3(x * 1.08, 0.0, z * 1.05), new THREE.Vector3(x * 1.06, -0.8, z * 1.0), new THREE.Vector3(x * 1.0, -1.55, z * 0.95)];
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.075, 12, false), hairMat(cfg.hairColor, env, 'hair'));
    }
  }

  // headwear
  const hw = cfg.headColor, hwm = plain(hw, env, { roughness: 0.75, sheen: 0.6, sheenColor: new THREE.Color(hw).offsetHSL(0, 0, 0.3), sheenRoughness: 0.6 });
  const crown = (line, grow, slope, lumps) => layer((x, y, uz) => y - (line + slope * uz), hwm, grow, lumps);
  if (cfg.head === 'cap_back' || cfg.head === 'cap') {
    crown(0.38, 0.09, 0.14, (x, y) => 0.03 * ss(0.4, 1.1, y));
    add(new THREE.SphereGeometry(0.055, 16, 12), hwm, new THREE.Vector3(0, 1.2, 0.0));
    const front = cfg.head === 'cap';
    add(new THREE.SphereGeometry(0.6, 48, 24), plain(darker(hw, 0.08), env, { roughness: 0.7 }), new THREE.Vector3(0, front ? 0.55 : 0.58, front ? 0.86 : -0.86), [1.0, 0.08, 0.78], [front ? 0.35 : -0.3, 0, 0]);
    if (!front) { const a = on(0, 0.52); add(new THREE.TorusGeometry(0.17, 0.028, 10, 32, Math.PI), plain(darker(hw, 0.3), env), a.p.clone().add(a.n.clone().multiplyScalar(0.07)), [1, 0.5, 1], [0, 0, 0]); }
  } else if (cfg.head === 'beanie') {
    crown(0.26, 0.1, 0.1, (x, y, uz, u) => 0.04 * ss(0.3, 1.1, y) + 0.008 * Math.sin(Math.atan2(u.x, u.z) * 40));
    add(new THREE.TorusGeometry(0.98, 0.1, 18, 96), hwm, new THREE.Vector3(0, 0.36, 0.02), [0.98, 1, 1], [Math.PI / 2 - 0.12, 0, 0]);
    add(new THREE.SphereGeometry(0.17, 24, 18), hairMat(hw, env, 'hair'), new THREE.Vector3(0, 1.36, -0.05));
  } else if (cfg.head === 'kumma' || cfg.head === 'massar') {
    const tex = kummaTexture(hw, cfg.head === 'massar');
    const km = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.75, sheen: 0.5, sheenColor: new THREE.Color('#ffffff'), envMap: env, envMapIntensity: 0.6, side: THREE.DoubleSide });
    if (cfg.head === 'kumma') {
      add(new THREE.CylinderGeometry(0.97, 1.0, 0.6, 72, 1, true), km, new THREE.Vector3(0, 0.82, -0.02), null, [-0.12, 0, 0]);
      add(new THREE.SphereGeometry(0.97, 72, 16, 0, Math.PI * 2, 0, 0.5), plain(hw, env, { roughness: 0.75 }), new THREE.Vector3(0, 0.66, -0.06), [1, 0.85, 1], [-0.12, 0, 0]);
    } else {
      for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.95 - i * 0.11, 0.16, 20, 96), km, new THREE.Vector3(0, 0.66 + i * 0.15, -0.04 - i * 0.03), null, [Math.PI / 2 - 0.2, 0, i * 0.5]);
      add(new THREE.SphereGeometry(0.6, 48, 24), km, new THREE.Vector3(0, 1.18, -0.1), [1.05, 0.5, 1.05]);
    }
  } else if (cfg.head === 'headphones') {
    const m = plain(hw, env, { roughness: 0.35, clearcoat: 0.5 });
    add(new THREE.TorusGeometry(1.06, 0.05, 12, 64, Math.PI), m, new THREE.Vector3(0, 0.08, 0), null, [0, Math.PI / 2, 0]);
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 36), m, new THREE.Vector3(s * 0.97, -0.03, -0.05), null, [0, 0, Math.PI / 2]);
  }

  // glasses
  if (cfg.eyewear !== 'none') {
    const fm2 = plain(cfg.frame, env, { roughness: 0.25, metalness: cfg.eyewear === 'aviator' ? 0.9 : 0.1, clearcoat: 0.6 });
    const lensM = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(cfg.lens), transparent: true, opacity: Math.max(0.1, cfg.lensOp), roughness: 0.05, clearcoat: 1, envMap: env, envMapIntensity: 1.2, depthWrite: false });
    for (const s of [-1, 1]) {
      const c = on(s * 0.3, 0.0), at = c.p.clone().add(new THREE.Vector3(0, 0, 0.13));
      const rx = cfg.eyewear === 'aviator' ? 1.12 : cfg.eyewear === 'sport' ? 1.3 : cfg.eyewear === 'square' ? 1.08 : 1, ry = cfg.eyewear === 'aviator' ? 0.95 : cfg.eyewear === 'sport' ? 0.72 : cfg.eyewear === 'square' ? 0.82 : 1;
      add(new THREE.TorusGeometry(0.17, cfg.eyewear === 'sport' ? 0.026 : 0.016, 12, cfg.eyewear === 'square' ? 4 : 56), fm2, at, [rx * (cfg.eyewear === 'square' ? 1.35 : 1), ry * (cfg.eyewear === 'square' ? 1.35 : 1), 1], [0, 0, cfg.eyewear === 'square' ? Math.PI / 4 : 0]);
      add(new THREE.CircleGeometry(0.17, cfg.eyewear === 'square' ? 4 : 48), lensM, at, [rx * (cfg.eyewear === 'square' ? 1.35 : 1), ry * (cfg.eyewear === 'square' ? 1.35 : 1), 1], [0, 0, cfg.eyewear === 'square' ? Math.PI / 4 : 0]);
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([at.clone().add(new THREE.Vector3(s * 0.18, 0.03, 0)), new THREE.Vector3(s * 0.74, 0.06, 0.3), new THREE.Vector3(s * 0.86, 0.04, -0.1)]), 24, 0.015, 8, false), fm2);
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.13, 0.05, on(-0.13, 0.05).p.z + 0.12), new THREE.Vector3(0, 0.08, on(0, 0.08).p.z + 0.08), new THREE.Vector3(0.13, 0.05, on(0.13, 0.05).p.z + 0.12)]), 16, 0.015, 8, false), fm2);
  }
  probe.geometry.dispose();
  G.userData.cfg = cfg;
  return G;
}
function kummaTexture(base, turban) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 512, 128);
  const ink = new THREE.Color(base).getHSL({}).l > 0.6 ? '#7a5a2a' : '#e9d9b0';
  x.strokeStyle = ink; x.fillStyle = ink; x.lineWidth = 3;
  if (turban) { for (let i = 0; i < 16; i++) { x.globalAlpha = 0.55; x.fillRect(0, i * 8, 512, 2); } x.globalAlpha = 0.8; for (let i = 0; i < 32; i++) { x.beginPath(); x.arc(i * 16 + 8, 64, 5, 0, 7); x.fill(); } }
  else { for (let i = 0; i < 24; i++) { const cx = i * 21.3 + 10; x.beginPath(); x.moveTo(cx, 20); x.lineTo(cx + 9, 40); x.lineTo(cx, 60); x.lineTo(cx - 9, 40); x.closePath(); x.stroke(); x.beginPath(); x.arc(cx, 90, 6, 0, 7); x.stroke(); } x.fillRect(0, 112, 512, 4); x.fillRect(0, 8, 512, 3); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.x = 3; t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- a still picture (for the welcome card, thumbnails)

// ---------------------------------------------------------------- a still picture (for the welcome card, thumbnails)
let snapR = null, snapEnv = null;
export function snapshot(cfg, size = 512, bg = null) {
  if (!snapR) { snapR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); snapR.outputColorSpace = THREE.SRGBColorSpace; snapEnv = envFor(snapR); }
  snapR.setSize(size, size, false); snapR.setPixelRatio(1);
  const sc = new THREE.Scene(); if (bg) sc.background = new THREE.Color(bg);
  sc.add(lights());
  const h = build(cfg, { env: snapEnv, lite: size <= 256 }); h.rotation.y = cfg._yaw ?? -0.16; sc.add(h);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50); cam.position.set(0, 0.1, 7); cam.lookAt(0, 0.04, 0);
  snapR.render(sc, cam);
  const url = snapR.domElement.toDataURL('image/png');
  dispose(h); return url;
}
export function dispose(g) { g.traverse(o => { o.geometry?.dispose?.(); if (o.material && !o.material.map?.isCanvasTexture) o.material.dispose?.(); }); }

// ---------------------------------------------------------------- alive: floats, looks at you, blinks, talks
export class Floating {
  // env: the renderer's room light (envFor(renderer)); the head brings its own lights
  constructor(cfg, env = null) { this.cfg = cfg; this.env = env; this.group = new THREE.Group(); this.rig = lights(); this.group.add(this.rig); this.head = build(cfg, { env }); this.group.add(this.head); this.blinkAt = 0; this.t0 = performance.now(); }
  rebuild(cfg) { this.cfg = cfg; this.group.remove(this.head); dispose(this.head); this.head = build(cfg, { env: this.env }); this.group.add(this.head); }
  update(now, lookAt, talking = false) {
    const t = (now - this.t0) / 1000, H = this.head;
    H.position.y = Math.sin(t * 1.4) * 0.06;
    if (lookAt) { const q = this.group.quaternion.clone(); this.group.lookAt(lookAt); const goal = this.group.quaternion.clone(); this.group.quaternion.copy(q).slerp(goal, 0.08); }
    H.rotation.z = Math.sin(t * 0.9) * 0.04; H.rotation.x = Math.sin(t * 0.7) * 0.03;
    // blink (the skin fills the eye openings for a moment) and talk (the jaw drops) - both morphs of the face
    if (now > this.blinkAt) this.blinkAt = now + 2600 + Math.random() * 3200;
    const close = this.blinkAt - now < 160 ? Math.sin((this.blinkAt - now) / 160 * Math.PI) : 0;
    const head = H.userData.head;
    if (head?.morphTargetInfluences) {
      const goal = talking ? 0.25 + Math.abs(Math.sin(t * 11)) * 0.6 : 0;
      head.morphTargetInfluences[0] += (goal - head.morphTargetInfluences[0]) * 0.35;
      head.morphTargetInfluences[1] = close;
    }
  }
}
