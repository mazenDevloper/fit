// «ميموجي مدار»: your face as a soft 3D floating head in Apple's Memoji style, built from a few choices (skin, hair,
// brows, eyes, nose, mouth, ears, facial hair, glasses, headwear - with the Omani kumma and massar). One light-free
// «matcap» material gives the glossy clay look on the iPhone without lights or reflections to compute.
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

// ---------------------------------------------------------------- the clay look
let MATCAP = null;
function matcap() {
  if (MATCAP) return MATCAP;
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  let g = x.createRadialGradient(s * 0.4, s * 0.34, s * 0.04, s * 0.5, s * 0.5, s * 0.5);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#f3f1ef'); g.addColorStop(0.8, '#d2ccc8'); g.addColorStop(1, '#a39a95');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  // a soft rim from below (the room's bounce light) and the bright spot that makes it look glossy
  g = x.createRadialGradient(s * 0.6, s * 0.95, 0, s * 0.6, s * 0.95, s * 0.45); g.addColorStop(0, 'rgba(255,240,230,0.35)'); g.addColorStop(1, 'rgba(255,240,230,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  g = x.createRadialGradient(s * 0.36, s * 0.28, 0, s * 0.36, s * 0.28, s * 0.12); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  MATCAP = new THREE.CanvasTexture(c); MATCAP.colorSpace = THREE.SRGBColorSpace;
  return MATCAP;
}
const mats = new Map();
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshMatcapMaterial({ color: new THREE.Color(color), matcap: matcap(), ...o }));
  return mats.get(k);
}
const shadeOf = (hex, v) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, (v - 0.5) * 0.22); return '#' + c.getHexString(); };
const darker = (hex, k = 0.25) => { const c = new THREE.Color(hex); c.multiplyScalar(1 - k); return '#' + c.getHexString(); };

// ---------------------------------------------------------------- the head's shape (a Memoji skull: round top, soft jaw)
function deform(geo, grow = 1) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let { x, y, z } = v;
    y *= 1.08;
    if (y < 0) { const t = Math.min(1, -y / 1.08); x *= 1 - 0.13 * Math.pow(t, 2); z *= 1 - 0.05 * t; }
    x *= 1.04;
    if (y > 0.35) z *= 0.97;
    const front = Math.max(0, z);
    z += 0.06 * Math.exp(-((y + 0.28) ** 2) / 0.05) * front * (1 - Math.min(1, Math.abs(x) * 0.6));   // cheeks
    if (y < -0.8) z += 0.04 * front;                                                                     // chin
    p.setXYZ(i, x * grow, y * grow, z * grow);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------- build
export function build(cfg = DEFAULT) {
  cfg = { ...DEFAULT, ...cfg };
  const G = new THREE.Group(), skin = shadeOf(cfg.skin, cfg.shade);
  const head = new THREE.Mesh(deform(new THREE.SphereGeometry(1, 96, 72)), mat(skin));
  G.add(head);
  const ray = new THREE.Raycaster();
  // a point on the face (and its outward normal) seen from the front at (x, y)
  const on = (x, y, from = new THREE.Vector3(0, 0, 4)) => {
    ray.set(new THREE.Vector3(x, y, from.z), new THREE.Vector3(0, 0, -1));
    const h = ray.intersectObject(head)[0];
    if (!h) return { p: new THREE.Vector3(x, y, 0.5), n: new THREE.Vector3(0, 0, 1) };
    return { p: h.point.clone(), n: h.face.normal.clone() };
  };
  const ball = (r, color, at, s = [1, 1, 1], o) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 28), mat(color, o)); m.position.copy(at); m.scale.set(...s); G.add(m); return m; };
  const tube = (pts, r, color, o) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, r, 12, false), mat(color, o)); G.add(m); return m; };
  const along = (xs, yf, lift = 0.01) => xs.map(x => { const s = on(x, yf(x)); return s.p.add(s.n.multiplyScalar(lift)); });

  // ears
  const es = { small: 0.85, medium: 1, large: 1.2 }[cfg.ears] || 1;
  for (const sx of [-1, 1]) {
    const e = ball(0.22, skin, new THREE.Vector3(sx * 1.02, -0.04, -0.04), [0.62 * es, 1.3 * es, 0.95 * es]);
    ball(0.12, darker(skin, 0.18), new THREE.Vector3(sx * 1.08, -0.05, 0.02), [0.45 * es, 1.05 * es, 0.6 * es]);
    if (cfg.earring === 'airpods') { ball(0.07, '#f7f7f7', new THREE.Vector3(sx * 1.02, -0.05, 0.08), [0.9, 1, 0.9]); const stem = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.16, 6, 12), mat('#f7f7f7')); stem.position.set(sx * 1.02, -0.18, 0.08); G.add(stem); }
    if (cfg.earring === 'hoops') { const h = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 10, 40), mat('#d9d9d9')); h.position.set(sx * 1.0, -0.36, 0.0); h.rotation.y = Math.PI / 2; G.add(h); }
    if (cfg.earring === 'studs') ball(0.035, '#e9e9f2', new THREE.Vector3(sx * 1.02, -0.27, 0.04));
    e.userData.ear = true;
  }

  // eyes (white, iris, pupil, the glint) - grouped so they can blink
  const eyes = new THREE.Group(); G.add(eyes); G.userData.eyes = eyes;
  // Memoji eyes: big whites set low and wide, a large iris with two glints, and the skin's own upper lid with a soft
  // lash line over the top of each eye (what makes them look like Apple's)
  for (const sx of [-1, 1]) {
    const s = on(sx * 0.34, -0.02), g = new THREE.Group();
    g.position.copy(s.p).add(s.n.clone().multiplyScalar(-0.06)); g.lookAt(g.position.clone().add(s.n)); eyes.add(g);
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.19, 48, 32), mat('#fdfaf6')); w.scale.set(1, 0.92, 0.62); g.add(w);
    const ir = new THREE.Mesh(new THREE.SphereGeometry(0.125, 40, 28), mat(darker(cfg.eyes, 0.25))); ir.scale.set(1, 1, 0.42); ir.position.set(0, -0.012, 0.088); g.add(ir);
    const ir2 = new THREE.Mesh(new THREE.SphereGeometry(0.105, 40, 28), mat(cfg.eyes)); ir2.scale.set(1, 1, 0.42); ir2.position.set(0, -0.012, 0.093); g.add(ir2);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.056, 28, 18), mat('#0a0604')); pu.scale.set(1, 1, 0.42); pu.position.set(0, -0.012, 0.115); g.add(pu);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })); gl.position.set(sx * 0.035, 0.03, 0.128); g.add(gl);
    const gl2 = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); gl2.position.set(-sx * 0.03, -0.05, 0.126); g.add(gl2);
    // the upper lid (skin) and its lash line
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.2, 48, 24, 0, Math.PI * 2, 0, 0.82), mat(skin)); lid.scale.set(1.03, 0.95, 0.66); lid.rotation.x = 0.42; g.add(lid);
    const lash = new THREE.Mesh(new THREE.TorusGeometry(0.188, cfg.lashes ? 0.016 : 0.009, 8, 40, Math.PI * 0.86), mat(cfg.lashes ? '#120c09' : darker(skin, 0.55)));
    lash.rotation.z = Math.PI * 0.07; lash.scale.set(1.02, 0.62, 1); lash.position.set(0, 0.1, 0.03); lash.rotation.x = -0.5; g.add(lash);
    g.userData.home = g.scale.clone();
  }

  // brows
  const bw = { thin: 0.022, medium: 0.035, thick: 0.05, arched: 0.035, straight: 0.04 }[cfg.brows] || 0.035;
  for (const sx of [-1, 1]) {
    const arch = cfg.brows === 'arched' ? 0.07 : cfg.brows === 'straight' ? 0.0 : 0.035;
    const xs = [0.18, 0.28, 0.38, 0.5].map(x => x * sx);
    tube(along(xs, x => 0.3 + arch * Math.sin(Math.PI * (Math.abs(x) - 0.18) / 0.32) - (Math.abs(x) > 0.45 ? 0.02 : 0), 0.015), bw, cfg.browColor);
  }

  // nose
  const nz = { small: [0.1, 0.85], medium: [0.125, 1], wide: [0.14, 1.25], long: [0.12, 0.95] }[cfg.nose] || [0.125, 1];
  // a soft Memoji nose: a round tip and two small wings, no hard bridge
  const ns = on(0, -0.2);
  ball(nz[0] * 0.95, skin, ns.p.clone().add(ns.n.clone().multiplyScalar(0.025)), [nz[1] * 1.1, cfg.nose === 'long' ? 1.05 : 0.86, 0.78]);
  for (const sx of [-1, 1]) { const w = on(sx * 0.095 * nz[1], -0.235); ball(0.062, skin, w.p.add(w.n.multiplyScalar(-0.004)), [1, 0.78, 0.7]); }
  const bridge = on(0, -0.08); ball(0.06, skin, bridge.p.add(bridge.n.multiplyScalar(-0.03)), [0.75, 1.5, 0.5]);

  // mouth
  const mouth = new THREE.Group(); G.add(mouth); G.userData.mouth = mouth;
  const curve = { smile: 0.7, grin: 0.9, soft: 0.45, neutral: 0.12 }[cfg.mouth] ?? 0.6;
  const mw = cfg.mouth === 'grin' ? 0.27 : 0.23, my = -0.47;
  const xs = [-1, -0.6, -0.25, 0, 0.25, 0.6, 1].map(k => k * mw);
  const lip = darker(skin, 0.32);
  if (cfg.mouth === 'smile' || cfg.mouth === 'grin') {
    const top = along(xs, x => my + curve * x * x * 1.6, 0.012), bot = along(xs.slice(1, -1), x => my - 0.06 - (cfg.mouth === 'grin' ? 0.03 : 0) + curve * x * x * 1.1, 0.012);
    const m1 = tube(top, 0.022, '#6e2a26'); const m2 = tube([top[0], ...bot, top[top.length - 1]], 0.022, '#6e2a26');
    const teeth = tube(along(xs.slice(1, -1).map(x => x * 0.92), x => my - 0.022 + curve * x * x * 1.45, 0.016), 0.024, '#fbfaf6');
    const lipLow = tube(along(xs.slice(1, -1), x => my - 0.09 - (cfg.mouth === 'grin' ? 0.03 : 0) + curve * x * x * 0.9, 0.006), 0.022, lip);
    for (const m of [m1, m2, teeth, lipLow]) { G.remove(m); mouth.add(m); }
  } else {
    const l = tube(along(xs, x => my + curve * x * x * 1.6, 0.012), 0.024, darker(skin, 0.42)); G.remove(l); mouth.add(l);
  }

  // facial hair: the lower face again, a little bigger, only where the hair grows
  const fc = cfg.facialColor;
  // a shell over the head whose edge is soft: dist(x, y, z) > 0 where the hair grows; around the edge the shell
  // sinks smoothly under the skin, so the hairline / beard line is a clean curve, not a staircase of triangles
  const shell = (dist, op = 1, grow = 1.025, color = fc) => {
    const g = deform(new THREE.SphereGeometry(1, 160, 120), 1), p = g.attributes.position, v = new THREE.Vector3(), idx = [];
    const keep = new Uint8Array(p.count);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const d = dist(v.x, v.y, v.z), k = Math.min(1, Math.max(0, (d + 0.035) / 0.07)), e = k * k * (3 - 2 * k);
      const f = 0.965 + (grow - 0.965) * e; p.setXYZ(i, v.x * f, v.y * f, v.z * f); keep[i] = d > -0.08 ? 1 : 0;
    }
    const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) if (keep[ix[i]] || keep[ix[i + 1]] || keep[ix[i + 2]]) idx.push(ix[i], ix[i + 1], ix[i + 2]);
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat(color, op < 1 ? { transparent: true, opacity: op } : {})); G.add(m); return m;
  };
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  if (cfg.facial === 'beard' || cfg.facial === 'full' || cfg.facial === 'stubble') {
    const full = cfg.facial === 'full';
    shell((x, y, z) => {
      // the beard line: low at the chin, rising along the jaw to the sideburns
      const ax = Math.abs(x), top = full ? -0.22 + 0.38 * ss(0.35, 0.95, ax) : -0.5 + 0.48 * ss(0.3, 0.92, ax);
      let d = Math.min(z + 0.3, top - y);
      const mouthE = 1 - ((x / (mw * 1.18)) ** 2 + ((y - (my - 0.025)) / 0.1) ** 2);      // around the mouth (an oval)
      const noseE = z > 0.4 ? 1 - ((x / 0.3) ** 2 + ((y + 0.27) / 0.09) ** 2) : -1;       // under the nose
      d = Math.min(d, -mouthE * 0.2, -noseE * 0.2);
      return d;
    }, cfg.facial === 'stubble' ? 0.35 : 1, full ? 1.055 : 1.03);
  }
  if (cfg.facial === 'goatee' || cfg.facial === 'goatee_mustache') {
    const c1 = on(0, -0.78), c2 = on(0, -0.6);
    ball(0.2, fc, c1.p.clone().add(c1.n.clone().multiplyScalar(-0.06)), [1, 1.05, 0.62]);
    ball(0.08, fc, c2.p.clone().add(c2.n.clone().multiplyScalar(-0.01)), [0.9, 0.7, 0.4]);
  }
  if (cfg.facial === 'mustache' || cfg.facial === 'goatee_mustache' || cfg.facial === 'full') {
    tube(along([-0.24, -0.15, -0.05, 0, 0.05, 0.15, 0.24], x => my + 0.07 + Math.abs(x) * -0.08 + (Math.abs(x) < 0.06 ? 0.008 : 0), 0.022), 0.026, fc);
  }

  // hair
  const hc = cfg.hairColor;
  // hair: the head again, a little bigger, above a hairline that rises at the forehead and drops behind the ears
  const cap = (line, grow) => shell((x, y, z) => y - (line + 0.32 * Math.max(0, z) - 0.25 * Math.max(0, -z) + 0.12 * ss(0.72, 0.95, Math.abs(x)) * (z > -0.2 ? 1 : 0)), 1, grow, hc);
  if (cfg.hair === 'buzz') cap(0.18, 1.02);
  else if (cfg.hair === 'short') { cap(0.16, 1.05); }
  else if (cfg.hair === 'wavy' || cfg.hair === 'side') {
    cap(0.16, 1.06);
    const lumps = cfg.hair === 'wavy' ? [[-0.5, 0.86, 0.42], [-0.18, 0.98, 0.5], [0.15, 0.98, 0.5], [0.48, 0.86, 0.42], [0.0, 1.1, 0.1], [-0.4, 1.02, 0.05], [0.4, 1.02, 0.05]] : [[0.25, 0.95, 0.5], [0.52, 0.85, 0.4], [-0.05, 1.02, 0.42], [-0.35, 0.98, 0.3]];
    lumps.forEach(([x, y, z]) => ball(0.3, hc, new THREE.Vector3(x, y, z), [1.25, 0.62, 0.9]));
  } else if (cfg.hair === 'curly') {
    cap(0.1, 1.04);
    const n = 150, inst = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), mat(hc), n), M = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const t = Math.acos(1 - (i + 0.5) / n * 1.15), ph = i * 2.399963;
      const r = 1.18 + (i % 3) * 0.04, x = r * Math.sin(t) * Math.cos(ph), y = r * Math.cos(t) * 1.08 + 0.05, z = r * Math.sin(t) * Math.sin(ph);
      if (z > 0.55 && y < 0.55) continue;
      const s = 0.17 + (i % 5) * 0.012;
      M.compose(new THREE.Vector3(x, y, z - 0.05), q, new THREE.Vector3(s, s, s)); inst.setMatrixAt(i, M);
    }
    G.add(inst);
  } else if (cfg.hair === 'long') {
    cap(0.16, 1.06);
    ball(1.0, hc, new THREE.Vector3(0, -0.45, -0.34), [1.16, 1.25, 0.8]);
  } else if (cfg.hair === 'locs') {
    cap(0.16, 1.06);
    for (let i = 0; i < 18; i++) {
      const a = Math.PI * (0.15 + 0.7 * i / 17) + Math.PI, x = Math.cos(a) * 1.02, z = Math.sin(a) * 0.95 * -1;
      if (z > 0.55) continue;
      tube([new THREE.Vector3(x, 0.55, z), new THREE.Vector3(x * 1.06, -0.2, z * 1.04), new THREE.Vector3(x * 1.02, -1.0, z * 0.98), new THREE.Vector3(x * 0.98, -1.55, z * 0.95)], 0.085, hc);
    }
  }

  // headwear
  const hw = cfg.headColor;
  const crown = (line = 0.3, grow = 1.1, slope = 0.18) => shell((x, y, z) => y - (line + slope * z), 1, grow, hw);
  if (cfg.head === 'cap_back' || cfg.head === 'cap') {
    crown(0.32, 1.1, 0.16);
    ball(0.06, darker(hw, 0.2), new THREE.Vector3(0, 1.19, 0));
    // the brim: a flattened rounded disc, in front (cap) or behind (worn backwards)
    const front = cfg.head === 'cap';
    const brim = ball(0.62, darker(hw, 0.08), new THREE.Vector3(0, front ? 0.47 : 0.52, front ? 0.88 : -0.86), [1.05, 0.09, 0.78]);
    brim.rotation.x = front ? 0.38 : -0.3;
    if (!front) tube(along([-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3], x => 0.62 - Math.abs(x) * 0.05, 0.11), 0.03, darker(hw, 0.3));
  } else if (cfg.head === 'beanie') {
    crown(0.22, 1.1, 0.12);
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.03, 0.11, 16, 80), mat(darker(hw, 0.08))); r.rotation.x = Math.PI / 2 - 0.2; r.position.y = 0.43; r.position.z = 0.05; r.scale.set(1, 0.95, 1); G.add(r);
    ball(0.16, hw, new THREE.Vector3(0, 1.32, -0.15));
  } else if (cfg.head === 'kumma' || cfg.head === 'massar') {
    // the Omani kumma: a round embroidered cap; the massar: the wrapped turban over it
    const tex = kummaTexture(hw, cfg.head === 'massar');
    if (cfg.head === 'kumma') {
      const k = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.62, 64, 1, true), new THREE.MeshMatcapMaterial({ matcap: matcap(), map: tex, side: THREE.DoubleSide }));
      k.position.y = 0.72; k.rotation.x = -0.18; G.add(k);
      const top = new THREE.Mesh(new THREE.SphereGeometry(1.0, 64, 16, 0, Math.PI * 2, 0, 0.55), mat(hw)); top.position.y = 0.72 + 0.31 - 0.52; top.scale.y = 0.9; top.rotation.x = -0.18; G.add(top);
    } else {
      const m = new THREE.MeshMatcapMaterial({ matcap: matcap(), map: tex });
      for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.98 - i * 0.12, 0.17, 18, 80), m); t.rotation.x = Math.PI / 2 - 0.22; t.position.set(0, 0.6 + i * 0.16, -0.04 - i * 0.03); t.rotation.z = i * 0.5; G.add(t); }
      ball(0.62, hw, new THREE.Vector3(0, 1.12, -0.12), [1.05, 0.55, 1.05], { map: tex });
      tube([new THREE.Vector3(-0.85, 0.58, 0.45), new THREE.Vector3(-0.2, 1.05, 0.72), new THREE.Vector3(0.5, 0.95, 0.6)], 0.11, hw, { map: tex });
    }
  } else if (cfg.head === 'headphones') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.05, 12, 64, Math.PI), mat(hw)); band.position.y = 0.05; band.rotation.y = Math.PI / 2; band.rotation.z = 0; G.add(band);
    for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 32), mat(hw)); c.rotation.z = Math.PI / 2; c.position.set(sx * 1.1, -0.02, -0.04); G.add(c); }
  }

  // glasses
  if (cfg.eyewear !== 'none') {
    const fr = cfg.frame, glass = new THREE.Group(); G.add(glass);
    const lensM = new THREE.MeshBasicMaterial({ color: new THREE.Color(cfg.lens), transparent: true, opacity: Math.max(0.08, cfg.lensOp), depthWrite: false });
    for (const sx of [-1, 1]) {
      const c = on(sx * 0.36, 0.06), at = c.p.clone().add(new THREE.Vector3(0, 0, 0.16));
      let ring;
      if (cfg.eyewear === 'square') { const s = new THREE.Shape(); const w = 0.21, h = 0.16, r = 0.05; s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
        const pts = s.getPoints(40).map(p => new THREE.Vector3(p.x, p.y, 0)); ring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 80, 0.022, 8, true), mat(fr));
        const l = new THREE.Mesh(new THREE.ShapeGeometry(s), lensM); l.position.copy(at); glass.add(l); }
      else { const rx = cfg.eyewear === 'aviator' ? 1.12 : cfg.eyewear === 'sport' ? 1.3 : 1, ry = cfg.eyewear === 'aviator' ? 0.95 : cfg.eyewear === 'sport' ? 0.7 : 1;
        ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, cfg.eyewear === 'sport' ? 0.03 : 0.02, 10, 48), mat(fr)); ring.scale.set(rx, ry, 1);
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.2, 40), lensM); l.scale.set(rx, ry, 1); l.position.copy(at); glass.add(l); }
      ring.position.copy(at); glass.add(ring);
      tube([at.clone().add(new THREE.Vector3(sx * 0.22, 0.03, 0)), new THREE.Vector3(sx * 0.82, 0.12, 0.35), new THREE.Vector3(sx * 0.96, 0.1, -0.1)], 0.018, fr);
    }
    tube([on(-0.15, 0.12).p.add(new THREE.Vector3(0, 0, 0.16)), on(0, 0.14).p.add(new THREE.Vector3(0, 0, 0.13)), on(0.15, 0.12).p.add(new THREE.Vector3(0, 0, 0.16))], 0.018, fr);
  }
  G.userData.cfg = cfg;
  return G;
}
// the kumma's embroidery / the massar's woven pattern, in the chosen colour
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
let snapR = null;
export function snapshot(cfg, size = 512, bg = null) {
  if (!snapR) { snapR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); snapR.outputColorSpace = THREE.SRGBColorSpace; }
  snapR.setSize(size, size, false); snapR.setPixelRatio(1);
  const sc = new THREE.Scene(); if (bg) sc.background = new THREE.Color(bg);
  const h = build(cfg); h.rotation.y = -0.18; sc.add(h);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(0, 0.12, 6.6); cam.lookAt(0, 0.08, 0);
  snapR.render(sc, cam);
  const url = snapR.domElement.toDataURL('image/png');
  dispose(h); return url;
}
export function dispose(g) { g.traverse(o => { o.geometry?.dispose?.(); }); }

// ---------------------------------------------------------------- alive: floats, looks at you, blinks, talks
export class Floating {
  constructor(cfg) { this.cfg = cfg; this.group = new THREE.Group(); this.head = build(cfg); this.group.add(this.head); this.blinkAt = 0; this.t0 = performance.now(); }
  rebuild(cfg) { this.cfg = cfg; this.group.remove(this.head); dispose(this.head); this.head = build(cfg); this.group.add(this.head); }
  update(now, lookAt, talking = false) {
    const t = (now - this.t0) / 1000;
    this.head.position.y = Math.sin(t * 1.4) * 0.06;
    if (lookAt) { const q = this.group.quaternion.clone(); this.group.lookAt(lookAt); const goal = this.group.quaternion.clone(); this.group.quaternion.copy(q).slerp(goal, 0.08); }
    this.head.rotation.z = Math.sin(t * 0.9) * 0.04; this.head.rotation.x = Math.sin(t * 0.7) * 0.03;
    // blink every few seconds
    if (now > this.blinkAt) this.blinkAt = now + 2500 + Math.random() * 3000;
    const b = this.blinkAt - now < 140 ? 0.12 : 1;
    this.head.userData.eyes?.children.forEach(e => { e.scale.y = b; });
    // the mouth moves while Madar speaks
    const m = this.head.userData.mouth; if (m) { const o = talking ? 1 + Math.abs(Math.sin(t * 13)) * 0.9 : 1; m.scale.y += (o - m.scale.y) * 0.4; }
  }
}
