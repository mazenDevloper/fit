// «مخطوطات»: your DriveCast manuscripts (calligraphy saved as transparent PNGs) as glowing panels in your space -
// white, gold or coloured ink, on your real wall (📌) or floating; ⟳ shows them one after another like DriveCast's board.
import * as THREE from 'three';
import { IconButton, makeBar, blip } from './ui.js';
import { Toolbar } from './windows.js';
import { settings } from './config.js';
import { MANUSCRIPTS_BIN } from './gallery.js';

const W8 = 'https://studio.c-p.workers.dev';
const INKS = ['gold', 'white', 'rose', 'sky', 'jade'];
const INK_COL = { white: '#ffffff', rose: '#ffb3c7', sky: '#9fd8ff', jade: '#8ff0c4' };
let listP = null;
async function manuscripts() {
  if (!listP) listP = fetch(W8 + '/bin/' + MANUSCRIPTS_BIN).then(r => r.json()).then(d => (Array.isArray(d) ? d : d.manuscripts || []).filter(m => m.pngDataUrl));
  listP.catch(() => { listP = null; });
  return listP;
}
// the strokes (the PNG's own shape) filled with ink, with a soft glow around them
function inked(img, ink) {
  const pad = 70, w = img.naturalWidth, h = img.naturalHeight;
  const m = document.createElement('canvas'); m.width = w; m.height = h; const mg = m.getContext('2d');
  mg.drawImage(img, 0, 0); mg.globalCompositeOperation = 'source-in';
  if (ink === 'gold') { const g = mg.createLinearGradient(0, 0, w, h); [['#7a5a12', 0], ['#f6d77a', 0.22], ['#b8860b', 0.4], ['#fff1b8', 0.55], ['#a8770e', 0.72], ['#f3cf6b', 0.88], ['#6b4c0c', 1]].forEach(([c, o]) => g.addColorStop(o, c)); mg.fillStyle = g; }
  else mg.fillStyle = INK_COL[ink] || '#fff';
  mg.fillRect(0, 0, w, h);
  const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2; const g = c.getContext('2d');
  g.shadowColor = ink === 'gold' ? 'rgba(255,205,110,0.85)' : 'rgba(255,255,255,0.6)'; g.shadowBlur = 46;
  g.drawImage(m, pad, pad); g.shadowBlur = 14; g.drawImage(m, pad, pad); g.shadowBlur = 0; g.drawImage(m, pad, pad);
  return c;
}
let mid = 4000;
export class ManuscriptWindow {
  constructor(mgr, { id = null, ink = 'gold', cycle = false } = {}) {
    this.mgr = mgr; this.app = mgr.app; this.kind = 'manuscript'; this.id = ++mid;
    this.mid = id; this.ink = ink; this.cycle = cycle;
    this.group = new THREE.Group(); this.group.userData.window = this;
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.75), this.mat); this.group.add(this.plane);
    // grab anywhere on it to move it
    this.plane.userData.interact = { type: 'drag', window: this, hover: () => true };
    const { mesh: bar, hit } = makeBar(0.2, 0.022);
    hit.userData.interact = { type: 'drag', window: this, hover: on => { bar.userData.drawHover(on); return true; } };
    this.bar = bar; this.group.add(bar);
    this.toolbar = new Toolbar([
      { icon: 'close', action: () => this.mgr.close(this) },
      { icon: 'sun', action: () => { this.ink = INKS[(INKS.indexOf(this.ink) + 1) % INKS.length]; this.show(); } },
      { icon: 'reload', active: () => this.cycle, action: () => { this.cycle = !this.cycle; this.app.toast(this.cycle ? '⟳ المخطوطات تتبدّل كل ٢٠ ثانية' : 'مخطوطة واحدة', 1800); this.mgr.changed(); } },
      { icon: 'chevL', action: () => this.step(1) },
      { icon: 'target', active: () => !!this.wallLock, action: () => this.toWall() },
      { icon: 'minus', action: () => this.scaleBy(1 / 1.15) },
      { icon: 'plus', action: () => this.scaleBy(1.15) },
    ]).install();
    this.group.add(this.toolbar.mesh);
    this.layout(0.75);
    this.show();
  }
  layout(h) {
    this.h = h;
    this.plane.geometry.dispose(); this.plane.geometry = new THREE.PlaneGeometry(1, h);
    this.bar.position.set(0, -h / 2 - 0.035, 0.002);
    this.toolbar.mesh.position.set(0, -h / 2 - 0.1, 0.004);
  }
  async show() {
    try {
      const list = await manuscripts();
      if (!list.length) { this.app.toast('لا توجد مخطوطات في DriveCast', 2500); return; }
      let m = list.find(x => x.id === this.mid) || list[0];
      this.mid = m.id;
      const img = new Image();
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = m.pngDataUrl; });
      const c = inked(img, this.ink);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      this.mat.map?.dispose(); this.mat.map = t; this.mat.needsUpdate = true;
      this.layout(c.height / c.width);
      this.mgr.changed();
    } catch (e) { this.app.toast('تعذّر تحميل المخطوطات من DriveCast', 2500); this.app.log('مخطوطات: ' + (e.message || e)); }
  }
  async step(d) {
    const list = await manuscripts().catch(() => []); if (!list.length) return;
    const i = list.findIndex(x => x.id === this.mid);
    this.mid = list[(i + d + list.length) % list.length].id; this.show();
  }
  toWall() {
    const app = this.app, wall = app.room?.wallAhead?.(), g = this.group, root = this.mgr.root;
    if (this.wallLock) { this.wallLock = false; app.toast('أُلغي التثبيت', 1500); this.mgr.changed(); return; }
    if (wall) { root.updateMatrixWorld(); const world = root.localToWorld(wall.pos.clone()); world.multiplyScalar(Math.max(0.3, world.length() - 0.04) / world.length()); g.position.copy(root.worldToLocal(world.clone())); g.scale.setScalar(Math.max(0.5, wall.width * 0.6)); }
    g.lookAt(new THREE.Vector3(0, g.position.y, 0));
    this.wallLock = true; this.mgr.changed();
    app.toast(wall ? '🖼 على جدارك' : '📌 مثبّتة هنا — امسح الغرفة لتعلّق على الجدار', 2500);
  }
  update(dt, now) {
    if (this.cycle && now - (this.cycleAt || now) > 20000) { this.cycleAt = now; this.step(1); }
    if (!this.cycleAt) this.cycleAt = now;
  }
  scaleBy(f) { this.group.scale.setScalar(THREE.MathUtils.clamp(this.group.scale.x * f, 0.2, 6)); this.mgr.changed(); }
  serialize() { const g = this.group; return { kind: 'manuscript', ref: { id: this.mid, ink: this.ink, cycle: this.cycle }, p: g.position.toArray().map(v => +v.toFixed(3)), q: g.quaternion.toArray().map(v => +v.toFixed(4)), s: +g.scale.x.toFixed(3), wl: this.wallLock || undefined, ek: this.envPin || undefined }; }
  dispose() { this.mat.map?.dispose(); this.mat.dispose(); this.plane.geometry.dispose(); this.toolbar.dispose(); }
}
