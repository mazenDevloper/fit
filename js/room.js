// Room understanding: Madar looks through the camera, recognises things in your room (TV, sofa,
// table, people…), estimates where they are and how far, and uses that:
//  - floating labels on the real objects,
//  - an approximate room size,
//  - «على التلفاز»: put any window exactly over your real TV,
//  - guard: when someone walks right in front of you, the windows step aside so you can see them.
// Runs on the iPhone with MediaPipe (EfficientDet-Lite0), only while scanning (or once a second for the guard).
import * as THREE from 'three';
import { CanvasPanel, glass, text } from './ui.js';
import { settings } from './config.js';
import { IOS } from './native.js';

const PLANE = { floor: ['الأرضية', '⬜'], wall: ['جدار', '🧱'], ceiling: ['السقف', '⬛'], table: ['طاولة', '🍽'], seat: ['مقعد', '🛋'], door: ['باب', '🚪'], window: ['نافذة', '🪟'] };
const UP = new THREE.Vector3(0, 1, 0);

const MODEL_LOCAL = new URL('../assets/efficientdet_lite0.tflite', import.meta.url).href;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite';

// Known real sizes (metres) let one camera tell distance: big in the picture = close.
// [Arabic name, emoji, size, measured on: 'w' width or 'h' height]
const KNOWN = {
  tv: ['تلفاز', '📺', 1.2, 'w'], couch: ['كنبة', '🛋', 2.0, 'w'], chair: ['كرسي', '🪑', 0.9, 'h'],
  bed: ['سرير', '🛏', 1.6, 'w'], 'dining table': ['طاولة', '🍽', 1.4, 'w'], person: ['شخص', '🧍', 1.6, 'h'],
  laptop: ['لابتوب', '💻', 0.33, 'w'], 'potted plant': ['نبتة', '🪴', 0.5, 'h'], refrigerator: ['ثلاجة', '🧊', 1.8, 'h'],
  clock: ['ساعة', '🕰', 0.3, 'w'], bottle: ['قارورة', '🍶', 0.25, 'h'], cup: ['كوب', '☕', 0.1, 'h'],
  book: ['كتاب', '📖', 0.22, 'h'], 'cell phone': ['هاتف', '📱', 0.15, 'h'], remote: ['ريموت', '🎛', 0.18, 'w'],
  keyboard: ['لوحة مفاتيح', '⌨', 0.45, 'w'], oven: ['فرن', '🔥', 0.6, 'w'], sink: ['مغسلة', '🚰', 0.6, 'w'],
  toilet: ['مرحاض', '🚽', 0.4, 'w'], vase: ['مزهرية', '🏺', 0.3, 'h'], 'teddy bear': ['دمية', '🧸', 0.3, 'h'],
};
const BIG = new Set(['tv', 'couch', 'bed', 'dining table', 'refrigerator', 'chair']);

export class Room {
  constructor(app) {
    this.app = app;
    this.detector = null; this.loading = null;
    this.anchors = [];          // {key, name, emoji, pos (root-local), width, hits, panel}
    this.scanning = false; this.scanUntil = 0;
    this.lastRun = 0; this.busy = false;
    this.guardHit = 0;
    this.group = new THREE.Group();
    this.planes = [];
    if (IOS) {
      // iPhone app: ARKit finds the room's real surfaces (floor, walls, tables, seats, doors, windows) with their
      // true size and place, and Apple Vision sees people in front of you.
      window.MadarIOS.on('planes', list => { this.planes = list || []; if (this.scanning) this.fromPlanes(); });
      window.MadarIOS.on('people', p => { if (p.close) this.guardHit = performance.now(); });
    }
  }
  attach(root) { root.add(this.group); }
  // ARKit world point → this group's space (the same turn and walk offset as everything else).
  toLocal(x, y, z) { return new THREE.Vector3(x, y, z).applyAxisAngle(UP, -(this.app.head.yawOffset || 0)).add(this.app.controls.nav || new THREE.Vector3()); }
  fromPlanes() {
    for (const p of this.planes) {
      const info = PLANE[p.cls]; if (!info) continue;
      const pos = this.toLocal(p.x, p.y, p.z);
      let a = this.anchors.find(x => x.id === p.id);
      if (!a) {
        if (this.anchors.length > 40) continue;
        a = { id: p.id, key: p.cls, name: info[0], emoji: info[1], pos, width: p.w, depth: p.h, hits: 2, vertical: p.v };
        a.panel = new CanvasPanel(0.34, 0.07, (ctx, W, H) => {
          glass(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2, true);
          text(ctx, a.emoji + ' ' + a.name + ' · ' + a.width.toFixed(1) + '×' + a.depth.toFixed(1) + 'م', W / 2, H / 2 + 2, H * 0.42, { weight: 800 });
        }, { pxPerM: 1200 });
        this.group.add(a.panel.mesh); this.anchors.push(a);
      }
      a.pos.copy(pos); a.width = p.w; a.depth = p.h;
      a.panel.mesh.position.copy(pos).add(new THREE.Vector3(0, p.v ? 0 : 0.12, 0));
      a.panel.mesh.scale.setScalar(Math.max(1, pos.distanceTo(new THREE.Vector3()) / 1.6));
      a.panel.redraw();
    }
  }
  // The wall you are looking at (for «على الجدار»).
  wallAhead() {
    const f = this.app.headForward.clone(); f.y = 0; f.normalize();
    let best = null, bestDot = Math.cos(35 * Math.PI / 180);
    for (const p of this.planes) {
      if (p.cls !== 'wall' && !(p.v && p.cls === 'none')) continue;
      const pos = this.toLocal(p.x, p.y, p.z);
      const world = this.group.localToWorld(pos.clone()); const d = world.clone().setY(0);
      const dot = d.normalize().dot(f);
      if (dot > bestDot) { bestDot = dot; best = { pos, width: Math.min(2.4, Math.max(0.8, p.w * 0.8)), key: 'wall' }; }
    }
    return best;
  }

  async load() {
    if (IOS) return true;
    if (this.detector) return this.detector;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const vision = await import('../lib/mediapipe/vision_bundle.mjs');
      const fileset = await vision.FilesetResolver.forVisionTasks(new URL('../lib/mediapipe/wasm', import.meta.url).href);
      let buf = null;
      for (const u of [MODEL_LOCAL, MODEL_URL]) { try { const r = await fetch(u); if (r.ok) { buf = new Uint8Array(await r.arrayBuffer()); break; } } catch {} }
      if (!buf) throw new Error('تعذّر تحميل نموذج التعرف');
      const make = delegate => vision.ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: buf, delegate }, runningMode: 'VIDEO', scoreThreshold: 0.45, maxResults: 10,
      });
      try { this.detector = await make('GPU'); } catch { this.detector = await make('CPU'); }
      return this.detector;
    })();
    try { return await this.loading; } catch (e) { this.loading = null; throw e; }
  }

  async scan() {
    if (this.scanning) { this.stopScan(); return; }
    const a = this.app;
    if (IOS) {
      this.scanning = true; this.scanUntil = performance.now() + 15000;
      window.MadarIOS.send('planes', { on: true });
      this.fromPlanes();
      a.toast('🔍 انظر حولك ببطء: الأرض، الجدران، الطاولات (١٥ ثانية)', 4500);
      return;
    }
    if (!a.camVideo?.srcObject) { a.toast('مسح الغرفة يحتاج الكاميرا — شغّل الرؤية عبر الكاميرا', 3500); return; }
    a.toast('جارٍ تجهيز التعرف على الغرفة…', 2000);
    try { await this.load(); } catch (e) { a.toast(e.message || 'تعذّر التعرف', 3500); return; }
    this.scanning = true; this.scanUntil = performance.now() + 25000;
    a.toast('🔍 انظر حولك ببطء: يمين، يسار، ثم أمامك (٢٥ ثانية)', 4500);
    a.log('مسح الغرفة: بدأ');
  }
  stopScan() {
    if (!this.scanning) return;
    this.scanning = false;
    const n = this.anchors.filter(x => x.hits >= 2).length;
    const size = this.roomSize();
    this.app.toast(n ? `✅ تعرّفت على ${n} عنصراً` + (size ? ` · الغرفة تقريباً ${size}` : '') : 'لم أتعرف على عناصر — جرّب إضاءة أقوى', 5000);
    this.app.log('مسح الغرفة: ' + n + ' عنصر ' + (size || ''));
  }
  clear() { this.anchors.forEach(x => { this.group.remove(x.panel.mesh); x.panel.dispose(); }); this.anchors = []; }

  // Approximate floor size from where the big furniture was found around you.
  roomSize() {
    if (IOS) {
      const floors = this.planes.filter(p => p.cls === 'floor').sort((a, b) => b.w * b.h - a.w * a.h);
      if (floors.length) return `${floors[0].w.toFixed(1)} × ${floors[0].h.toFixed(1)} م`;
      const walls = this.anchors.filter(x => x.key === 'wall');
      if (walls.length < 2) return '';
      let x0 = 0, x1 = 0, z0 = 0, z1 = 0;
      walls.forEach(w => { x0 = Math.min(x0, w.pos.x); x1 = Math.max(x1, w.pos.x); z0 = Math.min(z0, w.pos.z); z1 = Math.max(z1, w.pos.z); });
      return `${Math.max(2, x1 - x0).toFixed(1)} × ${Math.max(2, z1 - z0).toFixed(1)} م`;
    }
    const pts = this.anchors.filter(x => x.hits >= 2 && x.key !== 'person').map(x => x.pos);
    if (pts.length < 2) return '';
    let x0 = 0, x1 = 0, z0 = 0, z1 = 0;   // you are inside the room too
    pts.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); });
    const w = Math.max(2, x1 - x0 + 0.8), d = Math.max(2, z1 - z0 + 0.8);
    return `${w.toFixed(1)} × ${d.toFixed(1)} م`;
  }
  tv() { if (IOS) return null; return this.anchors.filter(x => x.key === 'tv' && x.hits >= 2).sort((a, b) => b.hits - a.hits)[0] || null; }

  update(now, Q) {
    if (this.scanning && now > this.scanUntil) this.stopScan();
    const guard = settings.roomGuard && (this.detector || IOS);
    const every = this.scanning ? 350 : guard ? 1000 : 0;
    if (!IOS && every && !this.busy && now - this.lastRun > every) this.run(now, Q);
    // Guard: hide windows while someone is close in front of you.
    const blocked = guard && now - this.guardHit < 1500;
    if (blocked !== !!this.app.windows.guard) {
      this.app.windows.guard = blocked;
      if (blocked) this.app.toast('🧍 شخص أمامك — أخفيت النوافذ', 1500);
    }
    // Labels face you.
    if (this.anchors.length) {
      const eye = new THREE.Vector3(0, 0, 0);   // your head is the world origin
      this.anchors.forEach(x => { const m = x.panel.mesh; m.visible = x.hits >= 2 && settings.roomLabels !== false; if (m.visible) m.lookAt(eye); });
    }
  }

  run(now, Q) {
    const v = this.app.camVideo;
    if (!v || v.readyState < 2 || !v.videoWidth) return;
    this.busy = true; this.lastRun = now;
    let res = null;
    try { res = this.detector.detectForVideo(v, now); } catch { this.busy = false; return; }
    this.busy = false;
    const W = v.videoWidth, H = v.videoHeight;
    const tx = Math.tan((settings.camFov || 69) * Math.PI / 360), ty = tx * H / W;
    const root = this.app.windows.root; root.updateMatrixWorld();
    for (const d of res?.detections || []) {
      const c = d.categories?.[0]; if (!c) continue;
      const key = c.categoryName, info = KNOWN[key]; if (!info) continue;
      const b = d.boundingBox;
      // Guard: a person filling much of the view, near the middle.
      if (key === 'person' && b.height / H > 0.55 && Math.abs((b.originX + b.width / 2) / W - 0.5) < 0.3) this.guardHit = now;
      if (!this.scanning) continue;
      // Edges of the picture cut objects: their size there is unreliable.
      if (b.originX < 4 || b.originY < 4 || b.originX + b.width > W - 4 || (BIG.has(key) && b.originY + b.height > H - 4)) continue;
      const [, , size, on] = info;
      const frac = on === 'w' ? b.width / W * 2 * tx : b.height / H * 2 * ty;
      const dist = THREE.MathUtils.clamp(size / Math.max(0.02, frac), 0.4, 9);
      const nx = ((b.originX + b.width / 2) / W - 0.5) * 2 * tx, ny = -((b.originY + b.height / 2) / H - 0.5) * 2 * ty;
      const dir = new THREE.Vector3(nx, ny, -1).normalize().applyQuaternion(Q);
      const world = dir.multiplyScalar(dist);
      const pos = root.worldToLocal(world.clone());
      const width = b.width / W * 2 * tx * dist;
      this.add(key, info, pos, width, c.score);
    }
  }

  add(key, info, pos, width, score) {
    const near = this.anchors.find(x => x.key === key && x.pos.distanceTo(pos) < Math.max(0.5, x.pos.length() * 0.25));
    if (near) {
      const k = Math.min(0.35, score / (near.hits + 1));
      near.pos.lerp(pos, k); near.width += (width - near.width) * k; near.hits++;
      near.panel.mesh.position.copy(near.pos).add(new THREE.Vector3(0, 0.12, 0));
      if (near.hits === 2) near.panel.redraw();
      return;
    }
    if (this.anchors.length > 40) return;
    const a = { key, name: info[0], emoji: info[1], pos: pos.clone(), width, hits: 1 };
    a.panel = new CanvasPanel(0.26, 0.07, (ctx, W, H) => {
      glass(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2, true);
      text(ctx, a.emoji + ' ' + a.name + ' · ' + a.pos.length().toFixed(1) + 'م', W / 2, H / 2 + 2, H * 0.44, { weight: 800 });
    }, { pxPerM: 1200 });
    a.panel.mesh.position.copy(a.pos).add(new THREE.Vector3(0, 0.12, 0));
    a.panel.mesh.scale.setScalar(Math.max(1, a.pos.length() / 1.6));
    a.panel.mesh.visible = false;
    this.group.add(a.panel.mesh);
    this.anchors.push(a);
  }
}
