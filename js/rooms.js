// Furnished rooms (built in code, no downloads): the "neon desk" room and the lavender study.
// Everything uses unlit materials with the light painted into textures, so it costs almost nothing to draw
// and looks the same whatever the scene's lights do. Floor at y = -1.55, the desk in front of you at z ≈ -2.3.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FLOOR = -1.55;

function tex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const basic = (o) => new THREE.MeshBasicMaterial(typeof o === 'object' && !(o instanceof THREE.Color) && !o.isTexture ? o : (o && o.isTexture ? { map: o } : { color: o }));
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(geo, mat.isMaterial ? mat : basic(mat)); m.position.set(x, y, z); parent && parent.add(m); return m; }
function box(p, w, h, d, mat, x, y, z) { return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, p); }
function cyl(p, rt, rb, h, mat, x, y, z, seg = 20) { return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, p); }
function plane(p, w, h, mat, x, y, z, ry = 0, rx = 0) { const m = mesh(new THREE.PlaneGeometry(w, h), mat, x, y, z, p); m.rotation.set(rx, ry, 0); return m; }
// a soft light halo (additive)
const glowTex = tex(128, 128, (g, w, h) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
function glow(p, w, h, color, opacity, x, y, z, ry = 0, rx = 0) {
  const m = plane(p, w, h, new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }), x, y, z, ry, rx);
  m.renderOrder = 2; return m;
}
function radial(g, x, y, r, col, sy = 1) { g.save(); g.translate(x, y); g.scale(1, sy); const q = g.createRadialGradient(0, 0, 0, 0, 0, r); q.addColorStop(0, col); q.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = q; g.fillRect(-r, -r, 2 * r, 2 * r); g.restore(); }
function noise(g, w, h, n, f) { for (let i = 0; i < n; i++) { g.fillStyle = f(); g.fillRect(Math.random() * w, Math.random() * h, 2, 1); } }
function drawersTex(base, line, handle) {
  return tex(128, 200, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) { const y = 4 + i * 49; g.strokeStyle = line; g.lineWidth = 2; g.strokeRect(5, y, w - 10, 45); g.fillStyle = handle; g.fillRect(w / 2 - 14, y + 20, 28, 4); } });
}

// ---------------------------------------------------------------- neon desk room
export function neonDesk() {
  const R = new THREE.Group(), BW = -2.6, top = -0.78;
  // back wall: grey-violet, warm haze under the light bar, purple around the monitor, blue wash under the desk
  plane(R, 5.4, 3.1, tex(1024, 600, (g, w, h) => {
    const b = g.createLinearGradient(0, 0, 0, h); b.addColorStop(0, '#5c5a76'); b.addColorStop(1, '#4b5688'); g.fillStyle = b; g.fillRect(0, 0, w, h);
    radial(g, w * 0.5, h * 0.08, 260, 'rgba(255,214,120,.35)', 0.45);
    radial(g, w * 0.5, h * 0.55, 300, 'rgba(190,120,255,.28)', 0.6);
    radial(g, w * 0.5, h * 0.82, 520, 'rgba(60,150,255,.75)', 0.38);
    radial(g, w * 0.5, h * 0.66, 420, 'rgba(80,200,255,.35)', 0.12);
    noise(g, w, h, 6000, () => `rgba(255,255,255,${Math.random() * 0.05})`);
  }), 0, FLOOR + 1.55, BW);
  // side walls: darker, blue light spilling from the desk
  const side = (sx) => tex(512, 512, (g, w, h) => { g.fillStyle = '#3d3b57'; g.fillRect(0, 0, w, h); radial(g, sx ? w * 0.05 : w * 0.95, h * 0.7, 360, 'rgba(70,120,255,.45)', 0.8); radial(g, sx ? w * 0.05 : w * 0.95, h * 0.2, 260, 'rgba(160,110,255,.18)'); });
  plane(R, 5, 3.1, side(1), -2.7, 0, -0.1, Math.PI / 2);
  plane(R, 5, 3.1, side(0), 2.7, 0, -0.1, -Math.PI / 2);
  plane(R, 5.4, 3.1, '#26253a', 0, 0, 2.4, Math.PI);
  plane(R, 5.4, 5, '#2a2940', 0, 1.55, -0.1, 0, Math.PI / 2);
  // carpet: deep navy with a blue sheen near the desk
  plane(R, 5.4, 5, tex(512, 512, (g, w, h) => {
    g.fillStyle = '#121b45'; g.fillRect(0, 0, w, h); radial(g, w / 2, 0, 420, 'rgba(70,130,255,.55)', 0.6);
    noise(g, w, h, 16000, () => `rgba(${120 + Math.random() * 80},${170 + Math.random() * 60},255,${0.08 + Math.random() * 0.18})`);
  }), 0, FLOOR, -0.1, 0, -Math.PI / 2);
  // the warm light bar
  box(R, 1.25, 0.05, 0.07, '#3c3c44', 0, 1.0, BW + 0.04);
  box(R, 1.2, 0.012, 0.02, '#ffd43b', 0, 0.972, BW + 0.06);
  glow(R, 1.9, 0.6, 0xffc93a, 0.55, 0, 0.92, BW + 0.01);
  // long floating desk + cyan strip at its back edge
  const deskZ = BW + 0.33;
  box(R, 3.9, 0.045, 0.62, '#8e8ca6', 0.15, top, deskZ);
  box(R, 3.9, 0.008, 0.62, '#a9a7c2', 0.15, top + 0.026, deskZ);
  box(R, 3.6, 0.014, 0.014, '#5fdcff', 0.15, top + 0.035, BW + 0.05);
  glow(R, 4.2, 0.35, 0x40c8ff, 0.9, 0.15, top + 0.05, BW + 0.01);
  glow(R, 4.0, 0.9, 0x3a8cff, 0.6, 0.15, top - 0.35, BW + 0.01);
  // drawer cabinets + glowing posts
  const dt = drawersTex('#9fa9c8', 'rgba(40,50,90,.35)', '#3a3f55');
  for (const x of [-0.7, 1.0]) {
    const cab = box(R, 0.42, 0.64, 0.5, '#8f9abd', x, FLOOR + 0.32, deskZ);
    plane(R, 0.42, 0.64, dt, x, FLOOR + 0.32, deskZ + 0.251);
    for (const dx of [-0.1, 0.1]) { cyl(R, 0.028, 0.028, 0.13, '#8ffff0', x + dx, top - 0.09, deskZ + 0.05, 12); glow(R, 0.22, 0.3, 0x5ffff0, 0.55, x + dx, top - 0.09, deskZ + 0.09); }
  }
  // monitor riser with a magenta glow underneath
  box(R, 1.0, 0.025, 0.26, '#bdb9cc', 0.15, top + 0.12, BW + 0.2);
  for (const dx of [-0.45, 0.45]) cyl(R, 0.012, 0.012, 0.1, '#b87fd0', 0.15 + dx, top + 0.07, BW + 0.2, 8);
  box(R, 0.9, 0.006, 0.006, '#ff5fd6', 0.15, top + 0.105, BW + 0.12);
  glow(R, 1.4, 0.22, 0xff4fd0, 0.85, 0.15, top + 0.05, BW + 0.2, 0, -Math.PI / 2);
  glow(R, 1.2, 0.18, 0xff60e0, 0.5, 0.15, top + 0.1, BW + 0.02);
  // ultrawide monitor
  box(R, 1.05, 0.42, 0.03, '#0b0b10', 0.15, top + 0.5, BW + 0.2);
  box(R, 0.07, 0.2, 0.04, '#17171c', 0.15, top + 0.24, BW + 0.18);
  box(R, 0.45, 0.012, 0.16, '#141418', 0.15, top + 0.14, BW + 0.2);
  // potted purple plants at both ends
  const pot = (x, s) => {
    const z = BW + 0.2;
    cyl(R, 0.07 * s, 0.05 * s, 0.14 * s, '#d9d5d2', x, top + 0.07 * s + 0.02, z, 16);
    const leaf = new THREE.SphereGeometry(0.028 * s, 6, 4);
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.08 * s, yy = Math.random() * 0.12 * s;
      const c = new THREE.Color().setHSL(0.78 + Math.random() * 0.03, 0.75, 0.36 + Math.random() * 0.12);
      mesh(leaf, c, x + Math.cos(a) * r, top + 0.2 * s + yy, z + Math.sin(a) * r, R);
    }
  };
  pot(-1.6, 1); pot(-1.38, 0.55); pot(1.85, 1); pot(2.05, 0.55);
  return R;
}

// ---------------------------------------------------------------- lavender study
function leafTex() {
  return tex(128, 192, (g, w, h) => {
    const p = new Path2D(); p.moveTo(w / 2, h * 0.98); p.bezierCurveTo(w * 0.02, h * 0.7, w * 0.08, h * 0.12, w / 2, h * 0.02); p.bezierCurveTo(w * 0.92, h * 0.12, w * 0.98, h * 0.7, w / 2, h * 0.98);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3f7d3a'); gr.addColorStop(1, '#1f4a22'); g.fillStyle = gr; g.fill(p);
    g.strokeStyle = 'rgba(190,220,140,.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, h * 0.95); g.lineTo(w / 2, h * 0.08); g.stroke();
    g.lineWidth = 1.2; for (let i = 1; i < 7; i++) { const y = h * (0.15 + i * 0.11); g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w * 0.2, y - 18); g.moveTo(w / 2, y); g.lineTo(w * 0.8, y - 18); g.stroke(); }
  });
}
export function study() {
  const R = new THREE.Group(), BW = -2.5, top = -0.8;
  // lavender walls with sunlight and dappled leaf shadows (a window behind you, to the right)
  const wallTex = tex(1024, 640, (g, w, h) => {
    g.fillStyle = '#c8afe0'; g.fillRect(0, 0, w, h);
    // window light patches (two long diagonals) and the frame's shadow
    g.fillStyle = 'rgba(255,240,255,.35)'; g.beginPath(); g.moveTo(w * 0.55, h * 0.25); g.lineTo(w, h * 0.05); g.lineTo(w, h * 0.75); g.lineTo(w * 0.6, h * 0.92); g.fill();
    g.fillStyle = 'rgba(80,40,110,.28)'; for (const o of [0, 0.16]) { g.beginPath(); g.moveTo(w * (0.62 + o), h * 0.2); g.lineTo(w * (0.66 + o), h * 0.18); g.lineTo(w * (0.7 + o), h); g.lineTo(w * (0.66 + o), h); g.fill(); }
    // fig-leaf shadows from the plant (left)
    g.fillStyle = 'rgba(80,40,120,.16)';
    for (let i = 0; i < 34; i++) { g.save(); g.translate(w * (0.2 + Math.random() * 0.24), h * (0.22 + Math.random() * 0.6)); g.rotate(Math.random() * 6);
      g.beginPath(); g.moveTo(0, -38); g.bezierCurveTo(26, -30, 22, 22, 0, 36); g.bezierCurveTo(-22, 22, -26, -30, 0, -38); g.fill(); g.restore(); }
    // the desk's long shadow to the right
    g.fillStyle = 'rgba(80,40,110,.22)'; g.beginPath(); g.moveTo(w * 0.68, h * 0.56); g.lineTo(w, h * 0.5); g.lineTo(w, h * 0.9); g.lineTo(w * 0.72, h * 0.95); g.fill();
    noise(g, w, h, 4000, () => `rgba(255,255,255,${Math.random() * 0.04})`);
  });
  plane(R, 5.2, 3.1, wallTex, 0, 0, BW);
  plane(R, 5.2, 0.09, '#f3f1f5', 0, FLOOR + 0.045, BW + 0.012);   // skirting
  const sideTex = tex(256, 256, (g, w, h) => { g.fillStyle = '#b79ad3'; g.fillRect(0, 0, w, h); radial(g, w / 2, h / 2, 200, 'rgba(255,240,255,.15)'); });
  plane(R, 5, 3.1, sideTex, -2.6, 0, 0, Math.PI / 2);
  plane(R, 5, 3.1, sideTex, 2.6, 0, 0, -Math.PI / 2);
  plane(R, 5.2, 3.1, '#a88cc4', 0, 0, 2.5, Math.PI);
  plane(R, 5.2, 5, '#efe9f2', 0, 1.55, 0, 0, Math.PI / 2);
  plane(R, 5.2, 5, tex(512, 512, (g, w, h) => { g.fillStyle = '#dcdade'; g.fillRect(0, 0, w, h); radial(g, w * 0.7, h * 0.2, 300, 'rgba(255,255,255,.5)'); noise(g, w, h, 5000, () => `rgba(120,110,140,${Math.random() * 0.06})`); }), 0, FLOOR, 0, 0, -Math.PI / 2);
  // white desk (frame legs, apron, low stretcher)
  const dz = BW + 0.33, W2 = 0.78, white = '#f4f3f6', shade = '#e2dfe8';
  box(R, 1.6, 0.035, 0.6, white, 0, top, dz);
  box(R, 1.56, 0.1, 0.56, shade, 0, top - 0.07, dz);
  for (const sx of [-W2, W2]) for (const sz of [-0.27, 0.27]) box(R, 0.03, 0.72, 0.03, white, sx, FLOOR + 0.36, dz + sz);
  for (const sx of [-W2, W2]) box(R, 0.025, 0.025, 0.54, white, sx, FLOOR + 0.13, dz);
  box(R, 1.56, 0.025, 0.025, white, 0, FLOOR + 0.13, dz + 0.27);
  // laptop with a blue swirl wallpaper
  box(R, 0.34, 0.012, 0.23, '#c9ccd2', 0.0, top + 0.024, dz + 0.02);
  const scr = box(R, 0.34, 0.22, 0.008, '#1b1d22', 0.0, top + 0.13, dz - 0.09);
  plane(R, 0.32, 0.2, tex(256, 160, (g, w, h) => {
    const b = g.createLinearGradient(0, 0, 0, h); b.addColorStop(0, '#cfe3f2'); b.addColorStop(1, '#a9c6e0'); g.fillStyle = b; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) { g.strokeStyle = `rgba(${20 + i * 10},${80 + i * 15},${220},.85)`; g.lineWidth = 9 - i; g.beginPath(); g.ellipse(w / 2 + i * 3, h / 2 + 6, 40 - i * 3, 26 - i * 2, -0.5 + i * 0.25, 0, 5.4); g.stroke(); }
  }), 0.0, top + 0.13, dz - 0.085);
  // ribbed lamp (left), notebook, candle, blue mug, orange ornament (right)
  cyl(R, 0.07, 0.08, 0.01, white, -0.55, top + 0.022, dz - 0.05);
  cyl(R, 0.008, 0.008, 0.3, white, -0.55, top + 0.17, dz - 0.05, 8);
  const shadeTex = tex(256, 128, (g, w, h) => { g.fillStyle = '#fbefd8'; g.fillRect(0, 0, w, h); for (let i = 0; i < 26; i++) { g.fillStyle = i % 2 ? 'rgba(200,170,120,.18)' : 'rgba(255,255,255,.25)'; g.fillRect(i * 10, 0, 5, h); } });
  const shadeM = cyl(R, 0.11, 0.11, 0.18, { map: shadeTex }, -0.55, top + 0.38, dz - 0.05, 26);
  glow(R, 0.7, 0.6, 0xffe2a8, 0.35, -0.55, top + 0.36, BW + 0.02);
  box(R, 0.18, 0.012, 0.13, '#e9ecf8', -0.25, top + 0.024, dz + 0.04).rotation.y = 0.15;
  box(R, 0.16, 0.006, 0.11, '#7d8fe0', -0.24, top + 0.032, dz + 0.04).rotation.y = 0.12;
  cyl(R, 0.032, 0.032, 0.09, '#4a2d1e', 0.3, top + 0.063, dz - 0.05, 14);
  box(R, 0.05, 0.03, 0.002, '#e8dccb', 0.3, top + 0.06, dz - 0.017);
  glow(R, 0.08, 0.1, 0xffc070, 0.8, 0.3, top + 0.13, dz - 0.05);
  cyl(R, 0.04, 0.035, 0.075, '#5b86d6', 0.38, top + 0.055, dz + 0.05, 16);
  const orn = mesh(new THREE.IcosahedronGeometry(0.06, 1), '#e2914a', 0.55, top + 0.075, dz - 0.03, R);
  // floating shelf with books and a cactus
  const sy = 0.55;
  box(R, 0.85, 0.035, 0.2, white, -0.3, sy, BW + 0.1);
  [['#1c1c1e', 0.22], ['#7a2b25', 0.24], ['#2a2a2c', 0.23], ['#e9e6e1', 0.25], ['#1c1c1e', 0.21], ['#3a2a28', 0.22]].forEach(([col, hh], i) =>
    box(R, 0.035, hh, 0.15, col, -0.2 + i * 0.04, sy + 0.018 + hh / 2, BW + 0.1));
  cyl(R, 0.05, 0.045, 0.08, '#7fb8a8', -0.6, sy + 0.058, BW + 0.1, 14);
  mesh(new THREE.SphereGeometry(0.045, 12, 10), '#5c8a52', -0.6, sy + 0.13, BW + 0.1, R).scale.set(1, 1.3, 1);
  // framed print: blue-violet waves
  box(R, 0.56, 0.56, 0.03, white, 0.85, 0.4, BW + 0.02);
  plane(R, 0.46, 0.46, tex(256, 256, (g, w, h) => {
    const b = g.createLinearGradient(0, 0, w, h); b.addColorStop(0, '#2b2cf0'); b.addColorStop(0.5, '#b44bf0'); b.addColorStop(1, '#3d22d8'); g.fillStyle = b; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(20, h * 0.75); g.quadraticCurveTo(w * 0.5, h * 0.35, w * 0.9, h * 0.5); g.quadraticCurveTo(w * 0.5, h * 0.55, 20, h * 0.75); g.fill();
    g.fillStyle = 'rgba(40,20,160,.6)'; g.beginPath(); g.moveTo(w, h * 0.2); g.quadraticCurveTo(w * 0.55, h * 0.45, w * 0.35, h); g.lineTo(w, h); g.fill();
  }), 0.85, 0.4, BW + 0.036);
  // wall outlet + cable
  plane(R, 0.09, 0.12, '#f1eff3', -0.42, FLOOR + 0.5, BW + 0.005);
  box(R, 0.006, 0.42, 0.006, '#f7f7f7', -0.47, FLOOR + 0.74, BW + 0.03);
  // fiddle-leaf fig in a white pot (left)
  const px = -1.55, pz = BW + 0.45;
  cyl(R, 0.24, 0.19, 0.5, '#f5f3f7', px, FLOOR + 0.25, pz, 28);
  cyl(R, 0.012, 0.016, 1.45, '#5b4630', px + 0.05, FLOOR + 0.95, pz, 6);
  const lt = leafTex(), lm = new THREE.MeshBasicMaterial({ map: lt, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  for (let i = 0; i < 46; i++) {
    const y = FLOOR + 0.55 + Math.random() * 1.25, a = Math.random() * Math.PI * 2, r = 0.1 + Math.random() * 0.38 * (1 - (y - FLOOR - 0.55) / 2.2);
    const l = plane(R, 0.24, 0.28, lm, px + Math.cos(a) * r, y, pz + Math.sin(a) * r * 0.7);
    l.rotation.set(-0.4 + Math.random() * 0.8, a + Math.PI / 2, -0.6 + Math.random() * 1.2);
    l.material = lm;
  }
  // rattan armchair (in front of the desk, turned a little)
  const ch = new THREE.Group(); ch.position.set(0.25, FLOOR, dz + 0.52); ch.rotation.y = 0.12; R.add(ch);
  const wood = '#d7a87a';
  for (const [x, z] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.22], [0.25, 0.22]]) cyl(ch, 0.02, 0.016, 0.45, wood, x, 0.225, z, 8);
  box(ch, 0.55, 0.08, 0.45, '#5c5f66', 0, 0.48, 0);
  box(ch, 0.56, 0.05, 0.46, wood, 0, 0.42, 0);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.03, 8, 30, Math.PI), basic(wood)); rim.rotation.set(Math.PI / 2, 0, 0); rim.position.set(0, 0.72, 0.02); ch.add(rim);
  const caneTex = tex(256, 128, (g, w, h) => { g.fillStyle = '#e0b48c'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(90,60,40,.55)'; for (let y = 4; y < h; y += 8) for (let x = (y / 8 % 2) * 4; x < w; x += 8) { g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); } }, [2, 1]);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.24, 24, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshBasicMaterial({ map: caneTex, side: THREE.DoubleSide }));
  back.position.set(0, 0.6, 0.02); ch.add(back);
  for (const sx of [-0.28, 0.28]) cyl(ch, 0.022, 0.022, 0.3, wood, sx, 0.58, 0.02, 8);
  return R;
}

// ---------------------------------------------------------------- photo-real rooms (Poly Haven, CC0)
// A 360° photograph of a real room all around you, with real scanned furniture (GLB) standing in front of you.
const BASE = new URL('../assets/rooms/', import.meta.url).href;
let loader;
function glb(name) {
  loader = loader || new GLTFLoader();
  return new Promise((ok, bad) => loader.load(BASE + name + '.glb', g => ok(one(g.scene)), undefined, bad));
}
// some scans hold several variants side by side: keep the biggest
function one(scene) {
  let root = scene; while (root.children.length === 1 && !root.children[0].isMesh) root = root.children[0];
  if (root.children.length < 2) return scene;
  const size = o => { const v = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()); return v.x * v.y * v.z; };
  const spread = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const best = root.children.reduce((a, b) => (size(b) > size(a) ? b : a));
  const bs = new THREE.Box3().setFromObject(best).getSize(new THREE.Vector3());
  if (spread.x < bs.x * 1.6 && spread.z < bs.z * 1.6) return scene;   // one object made of parts
  best.removeFromParent(); best.position.set(0, best.position.y, 0); return best;
}
function photoSphere(file, yaw) {
  const t = new THREE.TextureLoader().load(BASE + file); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(12, 64, 32), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, depthWrite: false }));
  m.scale.x = -1; m.rotation.y = yaw; m.position.y = 0.2; m.renderOrder = -1;
  return m;
}
// put a model on the floor (or on top of another), centred at x/z, turned by ry, scaled
function place(obj, { x = 0, z = -1.5, ry = 0, s = 1, on = null, dx = 0, dz = 0, y0 = FLOOR, height = 0 } = {}) {
  const g = new THREE.Group(); g.add(obj);
  if (height) { const h = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()).y; s = height / h; }
  g.scale.setScalar(s); g.rotation.y = ry; g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g);
  let y = y0 - b.min.y;
  if (on) { const ob = new THREE.Box3().setFromObject(on); y = ob.max.y - b.min.y; x = (ob.min.x + ob.max.x) / 2 + dx; z = (ob.min.z + ob.max.z) / 2 + dz; }
  g.position.set(x - (b.min.x + b.max.x) / 2, y, z - (b.min.z + b.max.z) / 2);
  g.updateMatrixWorld(true);
  return g;
}
function realRoom(photo, yaw, light, furnish) {
  const R = new THREE.Group();
  R.add(photoSphere(photo, yaw));
  // the room's own light on the furniture (warm by the fire / soft daylight)
  R.add(new THREE.HemisphereLight(light.sky, light.ground, light.amb));
  const d = new THREE.DirectionalLight(light.key, light.keyI); d.position.set(...light.dir); R.add(d);
  furnish(R).catch(e => console.warn('room', e));
  return R;
}
export function lounge() {
  return realRoom('fireplace.jpg', -0.15, { sky: 0xffd8b0, ground: 0x30201a, amb: 0.9, key: 0xffb070, keyI: 1.4, dir: [-2, 2, -1] }, async R => {
    const [chair, table, tea] = await Promise.all(['mid_century_lounge_chair', 'modern_coffee_table_01', 'tea_set_01'].map(glb));
    R.add(place(table, { x: 0, z: -1.45 }));
    R.add(place(tea, { on: table }));
    R.add(place(chair, { x: -1.2, z: -1.6, ry: 0.7 }));
  });
}
export function realStudy() {
  return realRoom('lythwood_lounge.jpg', 0, { sky: 0xffffff, ground: 0x8a8070, amb: 1.2, key: 0xfff4e0, keyI: 1.5, dir: [2, 3, 1] }, async R => {
    const [table, laptop, lamp, books, chair, plant] = await Promise.all(['modern_coffee_table_01', 'classic_laptop', 'desk_lamp_arm_01', 'book_encyclopedia_set_01', 'modern_arm_chair_01', 'potted_plant_02'].map(glb));
    R.add(place(table, { x: 0, z: -1.5 }));
    R.add(place(laptop, { on: table, dx: -0.15, s: 0.8 }));
    R.add(place(books, { on: table, dx: 0.3, dz: 0.05, s: 0.6, ry: -0.3 }));
    R.add(place(chair, { x: 1.25, z: -1.3, ry: -1.0 }));
    R.add(place(lamp, { x: 1.0, z: -2.0, ry: -0.8, s: 1.6 }));
    R.add(place(plant, { x: -1.3, z: -1.7 }));
  });
}

// ---------------------------------------------------------------- the two rooms again, photo-real
// Same layout as the light versions, now with real materials (Poly Haven PBR textures), scanned furniture (GLB)
// and real lights. The scene's general light is turned down while these are shown (see envs.js: dim).
const texCache = {};
function pbr(name, { color = 0xffffff, repeat = [1, 1], rough = 1, envI = 0.3, normal = true, map = true } = {}) {
  const load = (suf, srgb) => {
    const k = name + suf + repeat; if (texCache[k]) return texCache[k];
    const t = new THREE.TextureLoader().load(BASE + name + '_' + suf + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return (texCache[k] = t);
  };
  return new THREE.MeshStandardMaterial({ color, map: map ? load('diff', true) : null, normalMap: normal ? load('nor') : null, roughnessMap: load('rough'), roughness: rough, metalness: 0, envMapIntensity: envI });
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, envMapIntensity: 0.3, ...o });
const emit = (color) => new THREE.MeshBasicMaterial({ color });
function tame(obj, envI, tint) {   // GLB materials: room light only (and an optional colour)
  obj.traverse(o => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.envMapIntensity = envI; if (tint) m.color?.multiply(new THREE.Color(tint)); }); } });
  return obj;
}
function pointL(R, color, i, d, x, y, z) { const l = new THREE.PointLight(color, i, d, 2); l.position.set(x, y, z); R.add(l); return l; }

export function realNeon() {
  const R = new THREE.Group(), BW = -2.6, top = -0.78, deskZ = BW + 0.33;
  const wall = pbr('white_plaster_02', { color: 0x8c8aa8, repeat: [3, 2], envI: 0.05, map: false });
  R.add(new THREE.HemisphereLight(0x8a8cff, 0x202050, 0.35));
  const sideWall = pbr('white_plaster_02', { color: 0x6c6a8c, repeat: [3, 2], envI: 0.05, map: false });
  plane(R, 5.4, 3.1, wall, 0, 0, BW);
  plane(R, 5, 3.1, sideWall, -2.7, 0, -0.1, Math.PI / 2);
  plane(R, 5, 3.1, sideWall, 2.7, 0, -0.1, -Math.PI / 2);
  plane(R, 5.4, 3.1, std(0x3a3950), 0, 0, 2.4, Math.PI);
  plane(R, 5.4, 5, std(0x2a2940), 0, 1.55, -0.1, 0, Math.PI / 2);
  plane(R, 5.4, 5, pbr('fabric_pattern_05', { color: 0x223a8a, repeat: [8, 8], map: false, envI: 0.05 }), 0, FLOOR, -0.1, 0, -Math.PI / 2);
  // light bar + its warm light
  box(R, 1.25, 0.05, 0.07, std(0x3c3c44, { metalness: 0.6, roughness: 0.3 }), 0, 1.0, BW + 0.04);
  box(R, 1.2, 0.012, 0.02, emit(0xffd43b), 0, 0.972, BW + 0.06);
  glow(R, 1.9, 0.6, 0xffc93a, 0.45, 0, 0.92, BW + 0.01);
  pointL(R, 0xffc85a, 2.2, 3.5, 0, 0.85, BW + 0.25);
  // desk (oak veneer, painted grey-white) + cyan strip and its light on the wall
  box(R, 3.9, 0.045, 0.62, pbr('white_oak_veneer', { color: 0xc8c6dc, repeat: [3, 1], envI: 0.08 }), 0.15, top, deskZ);
  box(R, 3.6, 0.014, 0.014, emit(0x5fdcff), 0.15, top + 0.035, BW + 0.05);
  glow(R, 4.2, 0.35, 0x40c8ff, 0.7, 0.15, top + 0.05, BW + 0.01);
  for (const x of [-1.2, 0.15, 1.5]) pointL(R, 0x3aa8ff, 1.6, 2.4, x, top - 0.25, BW + 0.2);
  pointL(R, 0x5fd8ff, 0.8, 1.6, 0.15, top + 0.15, BW + 0.12);
  // monitor riser + magenta light, monitor
  box(R, 1.0, 0.025, 0.26, std(0xc9c6d8), 0.15, top + 0.12, BW + 0.2);
  for (const dx of [-0.45, 0.45]) cyl(R, 0.012, 0.012, 0.1, std(0xb8a0d0, { metalness: 0.8, roughness: 0.25 }), 0.15 + dx, top + 0.07, BW + 0.2, 8);
  box(R, 0.9, 0.006, 0.006, emit(0xff5fd6), 0.15, top + 0.105, BW + 0.12);
  glow(R, 1.4, 0.22, 0xff4fd0, 0.7, 0.15, top + 0.05, BW + 0.2, 0, -Math.PI / 2);
  pointL(R, 0xff4fd0, 0.9, 1.2, 0.15, top + 0.06, BW + 0.2);
  box(R, 1.05, 0.42, 0.03, std(0x0a0a0e, { roughness: 0.15, envMapIntensity: 0.6 }), 0.15, top + 0.5, BW + 0.2);
  box(R, 0.07, 0.2, 0.04, std(0x18181c, { metalness: 0.5 }), 0.15, top + 0.24, BW + 0.18);
  box(R, 0.45, 0.012, 0.16, std(0x141418, { metalness: 0.5 }), 0.15, top + 0.14, BW + 0.2);
  // glowing posts
  for (const x of [-0.7, 1.0]) for (const dx of [-0.1, 0.1]) { cyl(R, 0.028, 0.028, 0.13, emit(0x8ffff0), x + dx, top - 0.09, deskZ + 0.05, 12); glow(R, 0.22, 0.3, 0x5ffff0, 0.5, x + dx, top - 0.09, deskZ + 0.09); }
  const dt = drawersTex('#c4cbe4', 'rgba(40,50,90,.35)', '#3a3f55');
  const cabM = new THREE.MeshStandardMaterial({ map: dt, roughness: 0.55, envMapIntensity: 0.05 });
  for (const x of [-0.7, 1.0]) { box(R, 0.42, 0.64, 0.5, std(0xbfc6e0, { envMapIntensity: 0.05 }), x, FLOOR + 0.32, deskZ); plane(R, 0.42, 0.64, cabM, x, FLOOR + 0.32, deskZ + 0.251); }
  (async () => {
    const [plant, vase] = await Promise.all(['calathea_orbifolia_01', 'ceramic_vase_01'].map(glb));
    for (const [x, k] of [[-1.6, 1], [-1.38, 0.6], [1.85, 1], [2.05, 0.6]]) {
      const v = place(tame(vase.clone(true), 0.05), { x, z: BW + 0.2, height: 0.16 * k, y0: top + 0.022 }); R.add(v);
      const vb = new THREE.Box3().setFromObject(v);
      R.add(place(tame(plant.clone(true), 0.05, 0xd070ff), { x, z: BW + 0.2, height: 0.36 * k, y0: vb.max.y - 0.03 * k }));
    }
  })().catch(e => console.warn('room', e));
  return R;
}

export function realStudio() {
  const R = new THREE.Group(), BW = -2.5, top = -0.8, dz = BW + 0.33;
  // light lavender plaster; the sun through a window behind you throws real shadows on it
  const wall = pbr('white_plaster_02', { color: 0xe4c6f6, repeat: [3, 2], envI: 0.2, map: false });
  plane(R, 5.2, 3.1, wall, 0, 0, BW).receiveShadow = true;
  plane(R, 5.2, 0.09, std(0xf3f1f5), 0, FLOOR + 0.045, BW + 0.012);
  const side = pbr('white_plaster_02', { color: 0xd8c0ea, repeat: [3, 2], envI: 0.25, map: false });
  plane(R, 5, 3.1, side, -2.6, 0, 0, Math.PI / 2); plane(R, 5, 3.1, side, 2.6, 0, 0, -Math.PI / 2);
  plane(R, 5.2, 3.1, std(0xa88cc4), 0, 0, 2.5, Math.PI); plane(R, 5.2, 5, std(0xefe9f2), 0, 1.55, 0, 0, Math.PI / 2);
  plane(R, 5.2, 5, pbr('concrete_floor_01', { color: 0xf0eef2, repeat: [4, 4], envI: 0.3, map: false }), 0, FLOOR, 0, 0, -Math.PI / 2).receiveShadow = true;
  // sunlight from behind-right (matching the painted window light) + soft fill
  const target = new THREE.Vector3(0.3, -0.2, BW), dir = new THREE.Vector3(-1.0, 0.6, 1).normalize();   // sun from behind-left, as in the picture
  const sun = new THREE.DirectionalLight(0xfff3e6, 3.2); sun.position.copy(target).addScaledVector(dir, 6); sun.target.position.copy(target);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 9; sun.shadow.blurSamples = 16; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -3.5, right: 3.5, top: 3, bottom: -3, near: 0.5, far: 14 }); sun.shadow.camera.updateProjectionMatrix();
  R.add(sun, sun.target);
  R.add(new THREE.HemisphereLight(0xeedcff, 0xcdb6e0, 1.15));
  // the window (out of sight, behind-right): a wall with a 4-pane opening between the sun and the room - it only casts shadows
  const win = new THREE.Group(), hide = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const ww = 1.9, wh = 1.7, bar = 0.07, B = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), hide); m.position.set(x, y, 0); m.castShadow = true; win.add(m); };
  B(20, 10, 0, wh / 2 + 5); B(20, 10, 0, -wh / 2 - 5); B(10, wh, -ww / 2 - 5, 0); B(10, wh, ww / 2 + 5, 0);   // the wall around the opening
  B(bar, wh, 0, 0); B(ww, bar, 0, 0.1);                                                                   // the window's cross bars
  win.position.copy(target).addScaledVector(dir, 3.1); win.lookAt(sun.position); R.add(win);
  // white desk (metal frame, painted)
  const white = std(0xf6f5f8, { roughness: 0.35 });
  box(R, 1.6, 0.035, 0.6, white, 0, top, dz); box(R, 1.56, 0.1, 0.56, std(0xe9e6ee, { roughness: 0.4 }), 0, top - 0.07, dz);
  for (const sx of [-0.78, 0.78]) for (const sz of [-0.27, 0.27]) box(R, 0.03, 0.72, 0.03, white, sx, FLOOR + 0.36, dz + sz);
  for (const sx of [-0.78, 0.78]) box(R, 0.025, 0.025, 0.54, white, sx, FLOOR + 0.13, dz);
  box(R, 1.56, 0.025, 0.025, white, 0, FLOOR + 0.13, dz + 0.27);
  // modern laptop (aluminium) with the blue swirl
  const alu = std(0xc9ccd2, { metalness: 0.7, roughness: 0.3, envMapIntensity: 0.8 });
  box(R, 0.34, 0.012, 0.23, alu, 0, top + 0.024, dz + 0.02); box(R, 0.34, 0.22, 0.008, alu, 0, top + 0.13, dz - 0.09);
  plane(R, 0.32, 0.2, study().children.find(c => c.geometry?.parameters?.width === 0.32).material, 0, top + 0.13, dz - 0.085);
  // ribbed lamp, notebook, candle (flame + warm light), mug, ornament
  cyl(R, 0.07, 0.08, 0.01, white, -0.55, top + 0.022, dz - 0.05); cyl(R, 0.008, 0.008, 0.3, white, -0.55, top + 0.17, dz - 0.05, 8);
  const shade = cyl(R, 0.11, 0.11, 0.18, new THREE.MeshStandardMaterial({ color: 0xfbefd8, emissive: 0xffe6b8, emissiveIntensity: 0.2, roughness: 0.9 }), -0.55, top + 0.38, dz - 0.05, 32);
  pointL(R, 0xffe2b0, 0.6, 1.5, -0.55, top + 0.36, dz);
  box(R, 0.18, 0.012, 0.13, std(0xe9ecf8), -0.25, top + 0.024, dz + 0.04).rotation.y = 0.15;
  cyl(R, 0.032, 0.032, 0.09, std(0x4a2d1e, { roughness: 0.15, transparent: true, opacity: 0.9 }), 0.3, top + 0.063, dz - 0.05, 20);
  glow(R, 0.08, 0.1, 0xffc070, 0.8, 0.3, top + 0.13, dz - 0.05); pointL(R, 0xffb060, 0.25, 0.6, 0.3, top + 0.15, dz - 0.05);
  cyl(R, 0.04, 0.035, 0.075, std(0x5b86d6, { roughness: 0.2 }), 0.38, top + 0.055, dz + 0.05, 24);
  mesh(new THREE.IcosahedronGeometry(0.06, 2), std(0xe2914a, { roughness: 0.5 }), 0.55, top + 0.075, dz - 0.03, R);
  // shelf with books and a small succulent
  const sy = 0.55; box(R, 0.85, 0.035, 0.2, white, -0.3, sy, BW + 0.1);
  [[0x1c1c1e, 0.22], [0x7a2b25, 0.24], [0x2a2a2c, 0.23], [0xe9e6e1, 0.25], [0x1c1c1e, 0.21], [0x3a2a28, 0.22]].forEach(([col, hh], i) => box(R, 0.035, hh, 0.15, std(col, { roughness: 0.8 }), -0.2 + i * 0.04, sy + 0.018 + hh / 2, BW + 0.1));
  // framed print
  const art = study().children.find(c => c.geometry?.parameters?.width === 0.46).material;
  plane(R, 0.46, 0.46, art, 0.85, 0.4, BW + 0.036); box(R, 0.56, 0.56, 0.03, white, 0.85, 0.4, BW + 0.02);
  plane(R, 0.09, 0.12, std(0xf1eff3), -0.42, FLOOR + 0.5, BW + 0.005);
  // the rattan armchair (as in the light version)
  const light = study(); const ch = light.children.find(c => c.isGroup); if (ch) R.add(ch);
  (async () => {
    const [tree, small] = await Promise.all(['pachira_aquatica_01', 'potted_plant_04'].map(glb));
    cyl(R, 0.24, 0.19, 0.5, std(0xf5f3f7, { roughness: 0.35 }), -1.55, FLOOR + 0.25, BW + 0.45, 36);
    R.add(place(tame(tree, 0.3), { x: -1.55, z: BW + 0.45, height: 1.7, y0: FLOOR + 0.42 }));
    R.traverse(o => { if (o.isMesh && o.material && o.material.blending !== THREE.AdditiveBlending && o.geometry.type !== 'PlaneGeometry' && o.material !== hide) o.castShadow = true; });
    R.userData.shadowsDirty = true;
    R.add(place(tame(small, 0.3), { x: -0.6, z: BW + 0.1, height: 0.18, y0: sy + 0.018 }));
  })().catch(e => console.warn('room', e));
  return R;
}
