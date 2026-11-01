// «ميموجي مدار»: your face as a soft 3D floating head in Apple's Memoji style, built from a few choices (skin, hair,
// brows, eyes, nose, mouth, ears, facial hair, glasses, headwear - with the Omani kumma and massar). One light-free
// sculpted, painted and lit surface gives Apple's soft clay look.
import * as THREE from 'three';

export const KEY = 'madar.memoji.v1';
export const DEFAULT = {
  skin: '#a86d4b', shade: 0.5, freckles: false,
  hair: 'buzz', hairColor: '#1b130e',
  brows: 'thick', browColor: '#1b130e',
  eyes: '#5a3a1e', lashes: false,
  nose: 'medium', mouth: 'smile', ears: 'medium', earring: 'none',
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
  mouth: [['smile', 'ابتسامة'], ['grin', 'ضحكة'], ['soft', 'ابتسامة خفيفة'], ['neutral', 'هادئ']],
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
  const L = new THREE.Group();
  L.add(new THREE.HemisphereLight(0xfff4ea, 0x5a4a44, 1.1));
  const key = new THREE.DirectionalLight(0xfff1e4, 2.1); key.position.set(-1.6, 2.2, 3); L.add(key);
  const fill = new THREE.DirectionalLight(0xe8f0ff, 0.6); fill.position.set(2.2, 0.4, 2); L.add(fill);
  const rim = new THREE.DirectionalLight(0xffe6d0, 1.2); rim.position.set(1.5, 1.8, -2.5); L.add(rim);
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
    for (let i = 0; i < 9000; i++) { const l = 40 + rnd() * 200; x.fillStyle = `rgba(${l},${l},${l},${0.5 + rnd() * 0.5})`; x.fillRect(rnd() * 512, rnd() * 512, 1.6 + rnd() * 1.6, 1.6 + rnd() * 2.6); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(kind === 'hair' ? 6 : 10, kind === 'hair' ? 2 : 10); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(kind, t); return t;
}
function irisTex(hex) {
  const k = 'iris' + hex; if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), m = 128;
  const base = new THREE.Color(hex), lite = base.clone().offsetHSL(0, 0.05, 0.16), dark = base.clone().multiplyScalar(0.45);
  let g = x.createRadialGradient(m, m, 10, m, m, 128); g.addColorStop(0, '#' + lite.getHexString()); g.addColorStop(0.55, '#' + base.getHexString()); g.addColorStop(0.86, '#' + dark.getHexString()); g.addColorStop(1, '#120a06');
  x.fillStyle = g; x.beginPath(); x.arc(m, m, 128, 0, 7); x.fill();
  for (let i = 0; i < 140; i++) { const a = i / 140 * Math.PI * 2 + Math.sin(i) * 0.05; x.strokeStyle = `rgba(255,235,200,${0.06 + (i % 5) * 0.025})`; x.lineWidth = 1.2; x.beginPath(); x.moveTo(m + Math.cos(a) * 36, m + Math.sin(a) * 36); x.lineTo(m + Math.cos(a) * 112, m + Math.sin(a) * 112); x.stroke(); }
  x.fillStyle = '#070403'; x.beginPath(); x.arc(m, m, 46, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; texCache.set(k, t); return t;
}

// ---- materials
function skinMat(hex, env) {
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), vertexColors: true, roughness: 0.58, metalness: 0, sheen: 0.55, sheenColor: new THREE.Color('#ff9f84'), sheenRoughness: 0.65, clearcoat: 0.06, clearcoatRoughness: 0.5, envMap: env, envMapIntensity: 0.75 });
}
function hairMat(hex, env, kind = 'hair', o = {}) {
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), map: strands(kind), roughness: 0.48, metalness: 0, sheen: 0.8, sheenColor: new THREE.Color(hex).offsetHSL(0, 0, 0.25), sheenRoughness: 0.4, envMap: env, envMapIntensity: 0.6, ...o });
}
function plain(hex, env, o = {}) { return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), roughness: 0.45, metalness: 0, envMap: env, envMapIntensity: 0.8, ...o }); }

// ---------------------------------------------------------------- the sculpt
// final coordinates: the head spans y -1.16..1.16; eyes at y 0, nose tip -0.27, mouth -0.475, chin -0.92
function faceParams(cfg) {
  const open = cfg.mouth === 'smile' ? 0.1 : cfg.mouth === 'grin' ? 0.14 : 0;
  return {
    curve: { smile: 1.0, grin: 1.1, soft: 0.9, neutral: 0.25 }[cfg.mouth] ?? 1,
    mw: cfg.mouth === 'grin' ? 0.31 : cfg.mouth === 'smile' ? 0.29 : cfg.mouth === 'soft' ? 0.24 : 0.2, open,
    nose: { small: [0.8, 0.85], medium: [1, 1], wide: [1, 1.3], long: [1.25, 0.95] }[cfg.nose] || [1, 1],
  };
}
const mouthY = (P, x) => -0.49 + P.curve * x * x;
const mouthLow = (P, x, talk = 0) => mouthY(P, x) - (P.open + talk * 0.07) * Math.max(0, 1 - (x / P.mw) ** 2);
// how far the face moves in (-) or out (+) at (x, y) - only on the front of the head
function face(P, x, y, talk = 0) {
  let d = 0;
  for (const s of [-1, 1]) {
    d -= 0.06 * g2(x, y, s * 0.3, 0.0, 0.13, 0.1);         // eye sockets
    d += 0.032 * g2(x, y, s * 0.3, 0.18, 0.16, 0.05);       // brow ridge
    d += 0.06 * g2(x, y, s * 0.4, -0.26, 0.15, 0.12);       // cheeks (lifted by the smile)
    d += 0.05 * P.nose[1] * g2(x, y, s * 0.085 * P.nose[1], -0.31, 0.045, 0.04);   // nostril wings
    d -= 0.018 * g2(x, y, s * P.mw * 1.05, mouthY(P, P.mw), 0.03, 0.03);           // smile dimples
  }
  // the nose: a bridge that rises to a round tip
  const bridge = Math.exp(-(x * x) / (2 * 0.05 * 0.05)) * ss(0.12, -0.2, y) * ss(-0.36, -0.24, y);
  d += bridge * (0.03 + 0.08 * ss(0.05, -0.22, y)) * P.nose[0];
  d += 0.13 * P.nose[0] * g2(x, y, 0, -0.27, 0.075 * P.nose[1], 0.065 * P.nose[0]);
  d -= 0.02 * g2(x, y, 0, -0.355, 0.06, 0.02);              // under the nose
  d -= 0.008 * g2(x, y, 0, -0.41, 0.022, 0.03);             // philtrum
  // lips around the smile line, the opening pushed in
  const ym = mouthY(P, x), yl = mouthLow(P, x, talk), inX = Math.max(0, 1 - (x / (P.mw * 1.15)) ** 2);
  d += 0.014 * g2(0, y, 0, ym + 0.022, 1, 0.016) * inX;     // upper lip (thin)
  d += 0.034 * g2(0, y, 0, yl - 0.028, 1, 0.026) * inX;    // lower lip
  if (P.open > 0.001) d -= 0.012 * ss(0, 0.04, P.mw - Math.abs(x)) * g2(0, y, 0, (ym + yl) / 2, 1, 0.05);   // the lips roll in toward the opening
  else d -= 0.02 * g2(0, y, 0, ym, 1, 0.008) * ss(0, 0.03, P.mw - Math.abs(x));
  d += 0.03 * g2(x, y, 0, -0.88, 0.15, 0.08);               // chin
  return d;
}
// a point of the unit sphere → the head's surface
function sculpt(u, P, out, talk = 0) {
  const below = ss(0.05, -1, u.y);
  let x = u.x * 0.96 * (1 - 0.1 * below * below), y = u.y * 1.06, z = u.z * 0.97 * (1 - 0.05 * below);
  if (z > 0) z += 0.03 * below * below * z; else z *= 1.05;
  out.set(x, y, z);
  if (talk && u.z > 0) { const P0 = P; const below = ss(-0.02, 0.04, mouthY(P0, x) - y) * ss(-1.15, -0.7, y) * ss(0.0, 0.5, u.z) * ss(0.95, 0.5, Math.abs(x)); out.y -= talk * 0.075 * below; }
  const front = ss(0.15, 0.55, u.z);
  if (front > 0) { const d = face(P, x, y, 0) * front; out.addScaledVector(out.clone().normalize(), d); }
  return out;
}
// the shadows and colours painted into the skin (vertex colours, multiplied with the skin colour)
function paint(P, x, y, uz, lipC) {
  const f = ss(0.15, 0.55, uz);
  let k = 1, r = 1, gC = 1, b = 1;
  for (const s of [-1, 1]) {
    k -= f * 0.28 * g2(x, y, s * 0.17, -0.02, 0.045, 0.045);   // inner eye corners
    k -= f * 0.12 * g2(x, y, s * 0.3, 0.0, 0.13, 0.1);         // socket
    k -= f * 0.55 * g2(x, y, s * 0.048, -0.338, 0.022, 0.014);  // nostrils
    const blush = f * 0.18 * g2(x, y, s * 0.42, -0.24, 0.12, 0.09); r += blush * 0.25; gC -= blush * 0.25; b -= blush * 0.3;
  }
  k -= f * 0.16 * g2(x, y, 0, -0.355, 0.08, 0.018);             // under the nose
  const ym = mouthY(P, x), yl = mouthLow(P, x), inX = Math.max(0, 1 - (x / (P.mw * 1.15)) ** 2);
  const lip = f * inX * Math.max(g2(0, y, 0, ym + 0.03, 1, 0.024), g2(0, y, 0, yl - 0.03, 1, 0.03));
  const mix = (a, c) => a * (1 - lip * 0.75) + c * lip * 0.75;
  r = mix(r, lipC.r * 1.1); gC = mix(gC, lipC.g * 0.95); b = mix(b, lipC.b * 0.95);
  if (P.open > 0) { const inside = f * ss(-0.01, 0.01, ym - y) * ss(-0.01, 0.01, y - yl) * ss(0, 0.03, P.mw - Math.abs(x)); r = r * (1 - inside) + 0.22 * inside; gC = gC * (1 - inside) + 0.04 * inside; b = b * (1 - inside) + 0.05 * inside; }
  k -= f * 0.18 * g2(0, y, 0, yl - 0.07, 1, 0.022) * inX;       // under the lower lip
  k -= f * 0.12 * (g2(x, y, P.mw * 1.05, ym, 0.025, 0.025) + g2(x, y, -P.mw * 1.05, ym, 0.025, 0.025));
  k -= 0.3 * ss(-0.85, -1.12, y);                                // under the jaw
  return [Math.max(0, r * k), Math.max(0, gC * k), Math.max(0, b * k)];
}
// a smooth sphere turned into the head (or into a layer over it: hair, beard, hat) - dist > 0 where the layer is
function surface(P, { seg = [176, 144], grow = 0, dist = null, lumps = null, talk = false, paintC = null, hole = null } = {}) {
  const g = new THREE.SphereGeometry(1, Math.round(seg[0] * (P.q || 1)), Math.round(seg[1] * (P.q || 1))), p = g.attributes.position, u = new THREE.Vector3(), o = new THREE.Vector3(), n = new THREE.Vector3();
  const cols = paintC ? new Float32Array(p.count * 3) : null, keep = dist ? new Uint8Array(p.count) : null, talkPos = talk ? new Float32Array(p.count * 3) : null, cut = hole ? new Uint8Array(p.count) : null;
  for (let i = 0; i < p.count; i++) {
    u.fromBufferAttribute(p, i); u.z += 0.7; u.normalize();   // more vertices on the face, fewer behind the head
    sculpt(u, P, o); n.copy(o).normalize();
    let off = grow;
    if (dist) { const d = dist(o.x, o.y, u.z, u); const e = ss(-0.03, 0.03, d); off = -0.025 + (grow + 0.025) * e; keep[i] = d > -0.07 ? 1 : 0; if (lumps && e > 0) off += lumps(o.x, o.y, u.z, u) * e; }
    p.setXYZ(i, o.x + n.x * off, o.y + n.y * off, o.z + n.z * off);
    if (cols) { const c = paint(P, o.x, o.y, u.z, paintC); cols.set(c, i * 3); }
    if (cut) cut[i] = hole(o.x, o.y, u.z) ? 1 : 0;
    if (talkPos) { sculpt(u, P, o, 1); talkPos.set([o.x, o.y, o.z], i * 3); }
  }
  if (cols) g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  if (talkPos) { g.morphAttributes.position = [new THREE.BufferAttribute(talkPos, 3)]; g.morphTargetsRelative = false; }
  if (keep || cut) { const ix = g.index.array, idx = []; for (let i = 0; i < ix.length; i += 3) { const a = ix[i], b = ix[i + 1], c = ix[i + 2]; if (keep && !(keep[a] || keep[b] || keep[c])) continue; if (cut && cut[a] + cut[b] + cut[c] >= 2) continue; idx.push(a, b, c); } g.setIndex(idx); }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- build
export function build(cfg = DEFAULT, { env = null, lite = false } = {}) {
  cfg = { ...DEFAULT, ...cfg };
  const G = new THREE.Group(), P = { ...faceParams(cfg), q: lite ? 0.5 : 1 }, skin = shadeOf(cfg.skin, cfg.shade);
  const lipC = new THREE.Color(skin).lerp(new THREE.Color('#c4655c'), 0.45); lipC.r /= new THREE.Color(skin).r || 1; lipC.g /= new THREE.Color(skin).g || 1; lipC.b /= new THREE.Color(skin).b || 1;
  const SK = skinMat(skin, env);
  const inMouth = (x, y, uz) => P.open > 0 && uz > 0.4 && Math.abs(x) < P.mw * 0.97 && y < mouthY(P, x) - 0.004 && y > mouthLow(P, x) + 0.004;
  const head = new THREE.Mesh(surface(P, { seg: [200, 170], paintC: lipC, talk: P.open > 0 || cfg.mouth !== 'neutral', hole: inMouth }), SK);
  head.morphTargetInfluences = head.geometry.morphAttributes.position ? [0] : undefined;
  G.add(head); G.userData.head = head;
  const ray = new THREE.Raycaster();
  // where things sit on the face: found on a plain copy of the head (no mouth opening for the rays to fall through)
  const probe = new THREE.Mesh(surface(P, { seg: [120, 100] }));
  const on = (x, y) => { ray.set(new THREE.Vector3(x, y, 4), new THREE.Vector3(0, 0, -1)); const h = ray.intersectObject(probe)[0]; return h ? { p: h.point.clone(), n: h.face.normal.clone() } : { p: new THREE.Vector3(x, y, 0.6), n: new THREE.Vector3(0, 0, 1) }; };
  const add = (geo, m, pos, scl, rot) => { const o = new THREE.Mesh(geo, m); if (pos) o.position.copy(pos); if (scl) o.scale.set(...scl); if (rot) o.rotation.set(...rot); G.add(o); return o; };
  const layer = (dist, m, grow, lumps, seg) => add(surface(P, { dist, grow, lumps, seg }), m);

  // ears
  const es = { small: 0.85, medium: 1, large: 1.2 }[cfg.ears] || 1;
  for (const s of [-1, 1]) {
    const earG = new THREE.SphereGeometry(0.2, 40, 28);
    add(earG, SK, new THREE.Vector3(s * 0.86, -0.04, -0.06), [0.5 * es, 1.18 * es, 0.82 * es], [0, s * 0.35, s * -0.08]).geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(earG.attributes.position.count * 3).fill(0.93), 3));
    const inner = new THREE.SphereGeometry(0.11, 28, 20); inner.setAttribute('color', new THREE.BufferAttribute(new Float32Array(inner.attributes.position.count * 3).fill(0.62), 3));
    add(inner, SK, new THREE.Vector3(s * 0.93, -0.06, -0.01), [0.35 * es, 0.95 * es, 0.55 * es], [0, s * 0.35, 0]);
    if (cfg.earring === 'airpods') { add(new THREE.SphereGeometry(0.06, 24, 16), plain('#f4f4f4', env, { roughness: 0.25, clearcoat: 1 }), new THREE.Vector3(s * 0.95, -0.06, 0.05)); add(new THREE.CapsuleGeometry(0.024, 0.15, 6, 12), plain('#f4f4f4', env, { roughness: 0.25, clearcoat: 1 }), new THREE.Vector3(s * 0.96, -0.19, 0.06)); }
    if (cfg.earring === 'hoops') add(new THREE.TorusGeometry(0.09, 0.012, 10, 40), plain('#d8d8d8', env, { metalness: 1, roughness: 0.2 }), new THREE.Vector3(s * 0.92, -0.34, 0), null, [0, Math.PI / 2, 0]);
    if (cfg.earring === 'studs') add(new THREE.SphereGeometry(0.03, 16, 12), plain('#eef', env, { metalness: 0.6, roughness: 0.1 }), new THREE.Vector3(s * 0.93, -0.25, 0.04));
  }

  // eyes: a glossy white ball in the socket, a textured iris, a clear cornea, the upper lid with its lash line
  const eyes = new THREE.Group(); G.add(eyes); G.userData.lids = [];
  const white = plain('#fbf8f3', env, { roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
  const irisM = new THREE.MeshPhysicalMaterial({ map: irisTex(cfg.eyes), roughness: 0.35, envMap: env, envMapIntensity: 0.4 });
  const cornea = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0, envMap: env, envMapIntensity: 0.35, depthWrite: false });
  for (const s of [-1, 1]) {
    const c = on(s * 0.3, 0.0), eg = new THREE.Group();
    eg.position.copy(c.p).add(c.n.clone().multiplyScalar(-0.045)); eg.lookAt(eg.position.clone().add(new THREE.Vector3(s * 0.08, 0, 1))); eyes.add(eg);
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.16, 48, 32), white); w.scale.set(1.08, 1, 1); eg.add(w);
    const ir = new THREE.Mesh(new THREE.CircleGeometry(0.108, 48), irisM); ir.position.set(0, -0.01, 0.164); eg.add(ir);
    const co = new THREE.Mesh(new THREE.SphereGeometry(0.172, 48, 32), cornea); co.scale.set(1.08, 1, 1); eg.add(co);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })); gl.position.set(-0.04, 0.04, 0.17); eg.add(gl);
    // the upper lid: skin over the top of the ball, and the line of lashes on its edge
    const lidG = new THREE.SphereGeometry(0.168, 48, 24, 0, Math.PI * 2, 0, 1.05); lidG.setAttribute('color', new THREE.BufferAttribute(new Float32Array(lidG.attributes.position.count * 3).fill(0.96), 3));
    const lidPivot = new THREE.Group(); eg.add(lidPivot);
    const lid = new THREE.Mesh(lidG, SK); lid.scale.set(1.08, 1, 1); lid.rotation.x = 0.12; lidPivot.add(lid);
    // the lash line: a thin arc on the lid's front edge
    const lash = new THREE.Mesh(new THREE.TorusGeometry(0.168 * Math.sin(1.05), cfg.lashes ? 0.012 : 0.0065, 8, 48, Math.PI * 0.9), plain(cfg.lashes ? '#100a07' : darker(skin, 0.6), env, { roughness: 0.6 }));
    lash.rotation.set(Math.PI / 2, 0, 0.05 * Math.PI); lash.position.y = 0.168 * Math.cos(1.05); lid.add(lash);
    G.userData.lids.push(lid);
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
    const t = (ax - 0.13) / 0.33, yb = 0.185 + arch * Math.sin(Math.PI * Math.min(1, Math.max(0, t)) * 0.9) - 0.03 * t;
    const half = bw * (1.15 - 0.6 * Math.min(1, Math.max(0, t)));
    return Math.min(half - Math.abs(y - yb), t + 0.02, 1.02 - t);
  }, hairMat(cfg.browColor, env, 'dots'), 0.016, null, [176, 144]);

  // facial hair
  const fc = cfg.facialColor, fm = hairMat(fc, env, 'dots');
  const mouthOval = (x, y) => 1 - ((x / (P.mw * 1.25)) ** 2 + ((y - (mouthY(P, x) - P.open / 2)) / 0.075) ** 2);
  if (cfg.facial === 'beard' || cfg.facial === 'full' || cfg.facial === 'stubble') {
    const full = cfg.facial === 'full';
    layer((x, y, uz) => {
      const ax = Math.abs(x), top = full ? -0.2 + 0.36 * ss(0.4, 0.82, ax) : -0.6 + 0.62 * ss(0.3, 0.8, ax);
      let d = Math.min(uz + 0.35, top - y);
      d = Math.min(d, -mouthOval(x, y) * 0.15);
      if (uz > 0.4) d = Math.min(d, -(1 - ((x / 0.22) ** 2 + ((y + 0.33) / 0.06) ** 2)) * 0.15);   // under the nose
      return d;
    }, cfg.facial === 'stubble' ? hairMat(fc, env, 'dots', { transparent: true, opacity: 0.45, depthWrite: false }) : fm, full ? 0.06 : 0.03, full ? (x, y) => 0.03 * ss(-0.5, -1.1, y) : null);
  }
  if (cfg.facial === 'goatee' || cfg.facial === 'goatee_mustache') {
    layer((x, y, uz) => { if (uz < 0.2) return -1; const w = 0.1 + 0.06 * ss(-0.66, -0.88, y); return Math.min(w - Math.abs(x), mouthLow(P, x) - 0.06 - y, y + 0.97); }, fm, 0.03, (x, y) => 0.02 * ss(-0.65, -0.95, y));
  }
  if (cfg.facial === 'mustache' || cfg.facial === 'goatee_mustache' || cfg.facial === 'full') {
    layer((x, y, uz) => { if (uz < 0.3) return -1; const yc = mouthY(P, x) + 0.062 - 0.05 * Math.abs(x); return Math.min(0.026 * (1.2 - Math.abs(x) * 2) - Math.abs(y - yc), P.mw * 1.25 - Math.abs(x)); }, fm, 0.03);
  }

  // hair: grown from a hairline (high at the forehead, above the ears, low behind), with volume for the longer styles
  const hm = hairMat(cfg.hairColor, env, cfg.hair === 'buzz' ? 'dots' : 'hair');
  const hairline = (x, y, uz, front = 0.46) => {
    const f = ss(0.25, 0.75, uz), ear = ss(0.62, 0.8, Math.abs(x)) * ss(-0.35, 0.05, uz) * (1 - ss(0.3, 0.6, uz));
    const line = front * f + -0.5 * (1 - f);
    return y - Math.max(line, ear * 0.14 + (1 - ear) * line) - (Math.abs(x) > 0.55 && uz > 0.2 ? 0.08 * ss(0.55, 0.75, Math.abs(x)) : 0);
  };
  const noise = (u, a) => a * (Math.sin(u.x * 9 + u.y * 4) * 0.5 + Math.sin(u.z * 11 - u.x * 6) * 0.3 + Math.sin(u.y * 13) * 0.2);
  if (cfg.hair === 'buzz') layer((x, y, uz) => hairline(x, y, uz, 0.48), hm, 0.012);
  else if (cfg.hair === 'short' || cfg.hair === 'wavy' || cfg.hair === 'side') {
    // one sculpted mass: lifted into a swoop over the forehead, with deep grooves between the chunks
    const kind = cfg.hair, big = kind === 'wavy' ? 1 : kind === 'side' ? 0.85 : 0.45;
    layer((x, y, uz) => hairline(x, y, uz, 0.44) + (kind === 'side' ? 0.04 * Math.sin(x * 4) : 0.03 * Math.cos(x * 9) * ss(0.5, 0.9, uz)), hm, 0.05, (x, y, uz, u) => {
      const az = Math.atan2(u.x, u.z), top = ss(0.3, 1.0, y), front = ss(-0.1, 0.7, uz);
      const swoop = 0.2 * big * top * front * (kind === 'side' ? 0.6 + 0.4 * ss(-0.6, 0.6, x) : 1);
      const groove = 0.045 * big * Math.pow(Math.abs(Math.sin(az * (kind === 'side' ? 5 : 6) + y * (kind === 'side' ? 6 : 2.5))), 0.6) * top;
      return swoop + groove + noise(u, 0.01) + 0.03 * top;
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
    crown(0.36, 0.09, 0.14, (x, y) => 0.03 * ss(0.4, 1.1, y));
    add(new THREE.SphereGeometry(0.055, 16, 12), hwm, new THREE.Vector3(0, 1.3, 0.02));
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
  const h = build(cfg, { env: snapEnv, lite: size <= 256 }); h.rotation.y = -0.16; sc.add(h);
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
    // blink: the lids close over the eyes for a moment every few seconds
    if (now > this.blinkAt) this.blinkAt = now + 2600 + Math.random() * 3200;
    const close = this.blinkAt - now < 150 ? Math.sin((this.blinkAt - now) / 150 * Math.PI) : 0;
    (H.userData.lids || []).forEach(l => { l.rotation.x = 0.12 + close * 1.6; });
    // talking: the mouth opens and closes (a morph of the face) while Madar speaks
    const head = H.userData.head;
    if (head?.morphTargetInfluences) { const goal = talking ? 0.25 + Math.abs(Math.sin(t * 11)) * 0.6 : 0; head.morphTargetInfluences[0] += (goal - head.morphTargetInfluences[0]) * 0.35; }
  }
}
