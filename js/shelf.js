// «رف الكتب»: your books standing on a wooden shelf - the mushaf first, then everything you imported (PDF, EPUB, text,
// articles, photographed books). Each spine shows how far you have read; look or point at a book and it slides out,
// pinch (or tap) to open it. 📌 hangs the shelf on your real wall (after «مسح الغرفة») or where it stands.
import * as THREE from 'three';
import { IconButton, makeBar, text, COLORS, blip } from './ui.js';
import { settings } from './config.js';
import { listItems } from './db.js';
import { progress } from './reader.js';
import { BFONT, QFONT } from './quran.js';

const COLS = ['#7a2b25', '#1f3b63', '#2f5d3a', '#5a3a6e', '#8a5a1c', '#24525a', '#6b2f47', '#3d3d48', '#94522a', '#2a4d7a'];
let sid = 3000;
export class ShelfWindow {
  constructor(mgr) {
    this.mgr = mgr; this.app = mgr.app; this.kind = 'shelf'; this.id = ++sid;
    this.group = new THREE.Group(); this.group.userData.window = this;
    this.books = new THREE.Group(); this.group.add(this.books);
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.7, metalness: 0 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3e2a1a, roughness: 0.8 });
    this.W = 1.1;
    for (const y of [-0.02, 0.36, 0.74]) { const b = new THREE.Mesh(new THREE.BoxGeometry(this.W + 0.06, 0.025, 0.22), wood); b.position.set(0, y, 0); this.group.add(b); }
    for (const x of [-1, 1]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.79, 0.22), wood); s.position.set(x * (this.W / 2 + 0.03), 0.36, 0); this.group.add(s); }
    const back = new THREE.Mesh(new THREE.BoxGeometry(this.W + 0.08, 0.8, 0.01), dark); back.position.set(0, 0.36, -0.11); this.group.add(back);
    const { mesh: bar, hit } = makeBar(0.22, 0.022);
    hit.userData.interact = { type: 'drag', window: this, hover: on => { bar.userData.drawHover(on); return true; } };
    bar.position.set(0, -0.08, 0.1); this.group.add(bar);
    this.closeBtn = new IconButton('close', 0.05, () => this.mgr.close(this)); this.closeBtn.mesh.position.set(-0.16, -0.08, 0.1); this.group.add(this.closeBtn.mesh);
    this.pinBtn = new IconButton('target', 0.05, () => this.toWall()); this.pinBtn.mesh.position.set(0.16, -0.08, 0.1); this.group.add(this.pinBtn.mesh);
    this.title = makeLabel('رف الكتب', 0.3, 0.06); this.title.position.set(0, 0.82, 0.02); this.group.add(this.title);
    this.refresh();
  }
  async refresh() {
    let docs = [];
    try { docs = (await listItems()).filter(i => i.type === 'doc'); } catch {}
    const list = [{ id: 'quran', book: 'quran', title: 'المصحف الشريف', color: '#174a3c', gold: true, pages: 604 }, ...docs.map((d, i) => ({ id: 'doc:' + d.id, book: 'doc', item: d.id, title: d.name, color: COLS[i % COLS.length], kind: d.format }))];
    this.books.children.forEach(c => { c.geometry.dispose(); [].concat(c.material).forEach(m => { m.map?.dispose(); m.dispose(); }); });
    this.books.clear();
    const row = [0, 0], rowY = [0.0, 0.38];
    for (const b of list) {
      const pr = progress.get(b.id), frac = pr && pr.count > 1 ? Math.min(1, (pr.page - 1) / (pr.count - 1) + 2 / pr.count) : 0;
      const th = b.id === 'quran' ? 0.075 : 0.035 + Math.min(0.04, (pr?.count || 120) / 9000), h = b.id === 'quran' ? 0.3 : 0.24 + (b.title.length % 4) * 0.012;
      const r = row[0] + th > this.W - 0.02 ? 1 : 0;
      if (row[r] + th > this.W - 0.02) break;
      const mats = spineMats(b, frac, pr);
      const m = new THREE.Mesh(new THREE.BoxGeometry(th, h, 0.17), mats);
      // Arabic shelf: the first book on the right
      m.position.set(this.W / 2 - row[r] - th / 2 - 0.01, rowY[r] + h / 2 + 0.002, 0.005);
      row[r] += th + 0.004;
      const base = m.position.z;
      m.userData.interact = { type: 'button', window: this, hover: on => { m.position.z = base + (on ? 0.045 : 0); return true; }, click: () => { blip('tap', settings.sounds); this.app.openReader(b.book, b.item); return true; } };
      this.books.add(m);
    }
    this.mgr.refreshTargets?.();
  }
  // on the real wall in front of you (found by «مسح الغرفة»), else upright where it is
  toWall() {
    const app = this.app, wall = app.room?.wallAhead?.();
    const g = this.group, root = this.mgr.root;
    if (wall) {
      root.updateMatrixWorld();
      const world = root.localToWorld(wall.pos.clone());
      world.multiplyScalar(Math.max(0.3, world.length() - 0.13) / world.length());
      g.position.copy(root.worldToLocal(world.clone())); g.position.y = Math.min(g.position.y, 0.1);
      g.lookAt(new THREE.Vector3(0, g.position.y, 0));
      app.toast('📚 الرف على جدارك', 2000);
    } else { g.lookAt(new THREE.Vector3(0, g.position.y, 0)); app.toast('📚 ثُبّت الرف هنا — امسح الغرفة ليُعلّق على الجدار', 3000); }
    this.wallLock = true; this.mgr.changed();
  }
  update() {}
  scaleBy(f) { this.group.scale.setScalar(THREE.MathUtils.clamp(this.group.scale.x * f, 0.4, 3)); this.mgr.changed(); }
  serialize() { const g = this.group; return { kind: 'shelf', ref: { shelf: 1 }, p: g.position.toArray().map(v => +v.toFixed(3)), q: g.quaternion.toArray().map(v => +v.toFixed(4)), s: +g.scale.x.toFixed(3), wl: this.wallLock || undefined }; }
  dispose() { this.books.children.forEach(c => { c.geometry.dispose(); [].concat(c.material).forEach(m => { m.map?.dispose(); m.dispose(); }); }); this.closeBtn.dispose(); this.pinBtn.dispose(); this.title.material.map.dispose(); }
}

function makeLabel(str, w, h) {
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const g = c.getContext('2d');
  text(g, str, 256, c.height / 2, c.height * 0.5, { weight: 800 });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
}
// a book's spine: its colour, the title running down it, and a gold bar for how much you have read
function spineMats(b, frac, pr) {
  const c = document.createElement('canvas'); c.width = 160; c.height = 640; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 160, 0); grd.addColorStop(0, shade(b.color, -0.35)); grd.addColorStop(0.35, b.color); grd.addColorStop(1, shade(b.color, -0.25));
  g.fillStyle = grd; g.fillRect(0, 0, 160, 640);
  g.strokeStyle = '#d9b860'; g.lineWidth = 6; for (const y of [40, 600]) { g.beginPath(); g.moveTo(10, y); g.lineTo(150, y); g.stroke(); }
  g.save(); g.translate(80, 320); g.rotate(-Math.PI / 2);
  g.fillStyle = b.gold ? '#f0d48a' : '#f3ead8'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
  let fs = 64; g.font = `700 ${fs}px ${b.gold ? QFONT : BFONT}`;
  while (g.measureText(b.title).width > 470 && fs > 26) { fs -= 4; g.font = `700 ${fs}px ${b.gold ? QFONT : BFONT}`; }
  g.fillText(b.title.length > 40 ? b.title.slice(0, 38) + '…' : b.title, 0, 0);
  g.restore();
  // progress
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(30, 560, 100, 14);
  g.fillStyle = '#ffd36b'; g.fillRect(30, 560, 100 * frac, 14);
  if (pr) { g.font = `700 30px ${BFONT}`; g.textAlign = 'center'; g.fillStyle = '#ffe9b0'; g.fillText(Math.round(frac * 100) + '٪', 80, 530); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.color).multiplyScalar(0.8), roughness: 0.7 });
  const pages = new THREE.MeshStandardMaterial({ color: 0xf1e8d2, roughness: 0.9 });
  const spine = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  // box faces: +x, -x, +y, -y, +z (spine, facing you), -z
  return [side, side, pages, pages, spine, pages];
}
function shade(hex, k) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k * 0.5); return '#' + c.getHexString(); }
