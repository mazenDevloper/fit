// «أثاث مدار»: pieces made for gaming rooms, views and quiet offices that you place in any environment
// (gaming chair, RGB desk, curved monitor, LED strip, neon sign, lit shelf, punching bag, dumbbell rack, plant, desk lamp).
// Each one stands on the floor where you put it, turns, scales, and stays in the environment it was placed in.
import * as THREE from 'three';
import { IconButton, makeBar, blip } from './ui.js';
import { settings } from './config.js';
import { tex, box, cyl, glow, std, emit } from './rooms.js';

const C = { neon: [0x8a3cff, 0x18d8ff], red: [0xff2a3c, 0xff9a1a], teal: [0x34d399, 0x2dd4bf] };
const black = () => std(0x111114, { roughness: 0.35, metalness: 0.2 });

function chair(c1) {
  const g = new THREE.Group(), leather = std(0x16161a, { roughness: 0.45 }), stripe = std(c1, { roughness: 0.4, emissive: new THREE.Color(c1).multiplyScalar(0.15) }), b = black();
  box(g, 0.52, 0.1, 0.5, leather, 0, 0.5, 0);
  for (const sx of [-1, 1]) { box(g, 0.08, 0.12, 0.48, leather, sx * 0.25, 0.57, 0); box(g, 0.05, 0.25, 0.05, b, sx * 0.3, 0.68, 0.05); box(g, 0.07, 0.03, 0.26, leather, sx * 0.3, 0.8, 0.05); }
  box(g, 0.5, 0.82, 0.1, leather, 0, 0.98, -0.25).rotation.x = -0.12;
  for (const sx of [-1, 1]) { const w = box(g, 0.07, 0.62, 0.12, leather, sx * 0.27, 1.0, -0.22); w.rotation.set(-0.12, 0, -sx * 0.12); box(g, 0.06, 0.66, 0.02, stripe, sx * 0.17, 0.98, -0.198).rotation.x = -0.12; }
  box(g, 0.26, 0.12, 0.04, stripe, 0, 1.32, -0.29).rotation.x = -0.12;
  cyl(g, 0.03, 0.03, 0.3, b, 0, 0.3, 0, 12);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; box(g, 0.06, 0.04, 0.32, b, Math.sin(a) * 0.16, 0.08, Math.cos(a) * 0.16).rotation.y = a; cyl(g, 0.03, 0.03, 0.04, b, Math.sin(a) * 0.32, 0.03, Math.cos(a) * 0.32, 10).rotation.z = Math.PI / 2; }
  return g;
}
function desk(c1, c2) {
  const g = new THREE.Group(), b = black(), top = 0.75;
  box(g, 1.6, 0.04, 0.75, b, 0, top, 0);
  for (const sx of [-0.75, 0.75]) box(g, 0.06, 0.73, 0.68, b, sx, 0.365, 0);
  box(g, 1.55, 0.015, 0.015, emit(c2), 0, top - 0.03, 0.37);
  glow(g, 2.0, 0.8, c1, 0.35, 0, 0.02, 0.1, 0, -Math.PI / 2);
  box(g, 0.44, 0.02, 0.14, b, -0.05, top + 0.03, 0.18);
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.12), new THREE.MeshBasicMaterial({ toneMapped: false, map: tex(256, 64, (x, w, h) => { x.fillStyle = '#0a0a0e'; x.fillRect(0, 0, w, h); for (let r = 0; r < 4; r++) for (let c = 0; c < 15; c++) { x.fillStyle = `hsl(${(c * 18 + r * 30) % 360},90%,60%)`; x.fillRect(4 + c * 16.5, 4 + r * 15, 13, 11); } }) }));
  keys.position.set(-0.05, top + 0.041, 0.18); keys.rotation.x = -Math.PI / 2; g.add(keys);
  box(g, 0.06, 0.03, 0.1, b, 0.32, top + 0.035, 0.2);
  return g;
}
function monitor(c1) {
  const g = new THREE.Group(), b = black();
  const screen = tex(1024, 512, (x, w, h) => { const s = x.createLinearGradient(0, 0, 0, h * 0.62); s.addColorStop(0, '#0b0326'); s.addColorStop(1, '#' + new THREE.Color(c1).getHexString()); x.fillStyle = s; x.fillRect(0, 0, w, h * 0.62); x.fillStyle = '#ff9ad5'; x.beginPath(); x.arc(w / 2, h * 0.5, 110, Math.PI, 0); x.fill(); x.fillStyle = '#05020f'; x.fillRect(0, h * 0.62, w, h); x.strokeStyle = '#37f0ff'; x.lineWidth = 2; for (let i = -16; i <= 16; i++) { x.beginPath(); x.moveTo(w / 2 + i * 12, h * 0.62); x.lineTo(w / 2 + i * 90, h); x.stroke(); } });
  screen.wrapS = THREE.RepeatWrapping; screen.repeat.x = -1;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.42, 32, 1, true, Math.PI - 0.28, 0.56), new THREE.MeshBasicMaterial({ map: screen, toneMapped: false, side: THREE.BackSide }));
  m.position.set(0, 0.45, 1.55); g.add(m);
  box(g, 0.06, 0.28, 0.06, b, 0, 0.14, -0.02); box(g, 0.3, 0.015, 0.2, b, 0, 0.008, 0);
  return g;
}
function ledStrip(c1, c2) {
  const g = new THREE.Group();
  box(g, 2.0, 0.02, 0.02, emit(c1), 0, 1.2, 0); glow(g, 2.4, 0.7, c1, 0.4, 0, 1.2, 0.01); glow(g, 2.0, 0.5, c2, 0.2, 0, 1.2, 0.02);
  return g;
}
function neonSign(c1, label = 'مدار') {
  const g = new THREE.Group();
  const t = tex(1024, 256, (x, w, h) => { x.font = '900 170px system-ui, "Geeza Pro", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl'; x.shadowColor = '#fff'; x.shadowBlur = 40; x.fillStyle = '#fff'; x.fillText(label, w / 2, h / 2 + 8); });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(c1), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  p.position.y = 1.7; g.add(p); glow(g, 1.8, 0.8, c1, 0.35, 0, 1.7, -0.01);
  return g;
}
function litShelf(c1) {
  const g = new THREE.Group(), b = black();
  for (const y of [1.2, 1.55]) { box(g, 1.2, 0.03, 0.25, b, 0, y, 0); box(g, 1.15, 0.012, 0.012, emit(c1), 0, y - 0.022, 0.11); }
  const cols = [0xff70d0, 0x18d8ff, 0xffd23a, 0x8a3cff, 0x34d399];
  for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.08, 4, 10), std(cols[i], { emissive: new THREE.Color(cols[i]).multiplyScalar(0.25) })); f.position.set(-0.45 + i * 0.22, 1.29, 0); g.add(f); }
  for (let i = 0; i < 7; i++) box(g, 0.035, 0.2 + (i % 3) * 0.02, 0.17, std([0x2b6cb0, 0x9b2c2c, 0x2f855a, 0x553c9a][i % 4]), 0.1 + i * 0.045, 1.66 + (i % 3) * 0.01, 0);
  return g;
}
function punchBag() {
  const g = new THREE.Group(), red = std(0x9b1c1c, { roughness: 0.45 }), dark = std(0x17191d), steel = std(0x9ea4ac, { metalness: 0.85, roughness: 0.3 });
  box(g, 0.08, 2.3, 0.08, dark, -0.45, 1.15, 0); box(g, 0.6, 0.06, 0.06, dark, -0.17, 2.27, 0); box(g, 0.7, 0.04, 0.5, dark, -0.45, 0.02, 0);
  cyl(g, 0.008, 0.008, 0.5, steel, 0.08, 2.0, 0, 6);
  cyl(g, 0.19, 0.19, 1.15, red, 0.08, 1.17, 0, 28); cyl(g, 0.192, 0.192, 0.05, dark, 0.08, 1.75, 0, 28); cyl(g, 0.192, 0.192, 0.05, dark, 0.08, 0.6, 0, 28);
  return g;
}
function dumbbells() {
  const g = new THREE.Group(), rack = std(0x1d1f24, { metalness: 0.4, roughness: 0.45 }), rub = std(0x17191d, { roughness: 0.55 }), steel = std(0x9ea4ac, { metalness: 0.85, roughness: 0.3 });
  for (const [y, z] of [[0.45, 0.05], [0.8, -0.08]]) box(g, 1.2, 0.04, 0.28, rack, 0, y, z);
  for (const sx of [-0.58, 0.58]) box(g, 0.04, 0.85, 0.36, rack, sx, 0.42, 0);
  for (let i = 0; i < 9; i++) {
    const top = i >= 5, x = -0.45 + (top ? (i - 5) * 0.3 : i * 0.225), y = top ? 0.86 : 0.51, z = top ? -0.08 : 0.05, k = top ? 0.75 : 1 - i * 0.05;
    cyl(g, 0.015, 0.015, 0.22, steel, x, y, z, 8).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) { const h = cyl(g, 0.055 * k, 0.055 * k, 0.06, rub, x, y, z + s * 0.1, 6); h.rotation.x = Math.PI / 2; }
  }
  return g;
}
function plant() {
  const g = new THREE.Group();
  cyl(g, 0.17, 0.13, 0.36, std(0xe8e2d6, { roughness: 0.7 }), 0, 0.18, 0, 24);
  const leaf = std(0x2f6b2f, { roughness: 0.6, side: THREE.DoubleSide });
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI), leaf); l.scale.set(0.5, 1.6, 0.12); l.position.set(Math.cos(a) * 0.1, 0.55 + (i % 3) * 0.08, Math.sin(a) * 0.1); l.rotation.set(0.5 * Math.cos(a), -a, 0.5 * Math.sin(a)); g.add(l); }
  return g;
}
function deskLamp(c1) {
  const g = new THREE.Group(), m = std(0x2a2d33, { metalness: 0.6, roughness: 0.35 });
  cyl(g, 0.1, 0.11, 0.02, m, 0, 0.01, 0); const a = box(g, 0.02, 0.4, 0.02, m, 0, 0.2, 0); a.rotation.z = 0.25;
  const b = box(g, 0.02, 0.35, 0.02, m, -0.12, 0.5, 0); b.rotation.z = -0.9;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.12, 20, 1, true), std(c1, { side: THREE.DoubleSide, emissive: new THREE.Color(c1).multiplyScalar(0.2) })); shade.position.set(-0.27, 0.58, 0); shade.rotation.z = 2.4; g.add(shade);
  glow(g, 0.6, 0.6, 0xfff0c8, 0.35, -0.3, 0.005, 0, 0, -Math.PI / 2);
  return g;
}

// the catalog (shown in the library's «أثاث ومجسمات» tab, category «مدار»)
export const FURNITURE = [
  ['chair', 'كرسي ألعاب', 'neon', () => chair(C.neon[0])], ['chairRed', 'كرسي ألعاب أحمر', 'red', () => chair(C.red[0])],
  ['desk', 'مكتب ألعاب RGB', 'neon', () => desk(...C.neon)], ['monitor', 'شاشة منحنية', 'neon', () => monitor(C.neon[0])],
  ['led', 'شريط إضاءة LED', 'neon', () => ledStrip(...C.neon)], ['sign', 'لافتة نيون «مدار»', 'neon', () => neonSign(C.neon[1])],
  ['shelf', 'رف مضاء بمجسمات', 'neon', () => litShelf(C.neon[1])], ['bag', 'كيس ملاكمة', 'red', punchBag],
  ['dumbbells', 'حامل دمبل', 'teal', dumbbells], ['plant', 'نبتة مكتب', 'teal', plant], ['lamp', 'مصباح مكتب', 'red', () => deskLamp(0xffb347)],
].map(([id, name, theme, make]) => ({ id, name, theme, make }));
export const FURN_COLORS = { neon: ['#8a3cff', '#18d8ff'], red: ['#ff2a3c', '#ff9a1a'], teal: ['#1f8a7a', '#c8d0da'] };

let fid = 7000;
export class FurnitureWindow {
  constructor(mgr, { item = 'chair', r = 0 } = {}) {
    this.mgr = mgr; this.app = mgr.app; this.kind = 'furniture'; this.id = ++fid; this.item = item;
    const def = FURNITURE.find(f => f.id === item) || FURNITURE[0];
    this.group = new THREE.Group(); this.group.userData.window = this;
    this.piece = def.make(); this.piece.rotation.y = r || 0; this.group.add(this.piece);
    const bb = new THREE.Box3().setFromObject(this.piece), top = Math.max(0.3, bb.max.y);
    const { mesh: bar, hit } = makeBar(0.22, 0.022);
    hit.userData.interact = { type: 'drag', window: this, hover: on => { bar.userData.drawHover(on); return true; } };
    bar.position.set(0, top + 0.12, 0.05); this.group.add(bar);
    const mk = (ic, x, fn) => { const b = new IconButton(ic, 0.05, fn); b.mesh.position.set(x, top + 0.12, 0.055); this.group.add(b.mesh); return b; };
    this.btns = [mk('close', -0.17, () => this.mgr.close(this)), mk('spin', 0.17, () => { this.piece.rotation.y += Math.PI / 4; blip('tap', settings.sounds); this.mgr.changed(); })];
  }
  update() {}
  scaleBy(f) { this.group.scale.setScalar(THREE.MathUtils.clamp(this.group.scale.x * f, 0.3, 3)); this.mgr.changed(); }
  serialize() { const g = this.group; return { kind: 'furniture', ref: { item: this.item, r: +this.piece.rotation.y.toFixed(3) }, p: g.position.toArray().map(v => +v.toFixed(3)), q: g.quaternion.toArray().map(v => +v.toFixed(4)), s: +g.scale.x.toFixed(3), ek: this.envPin || undefined }; }
  dispose() { this.btns.forEach(b => b.dispose()); this.group.traverse(o => { if (o.isMesh) { o.geometry?.dispose(); } }); }
}
