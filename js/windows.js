// Spatial windows (video, image, web, info panels) and 3D model volumes, plus the manager that places and saves them.
import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { CanvasPanel, IconButton, makeBar, glass, text, icon, roundRect, roundedRectGeometry, radialTexture, COLORS, FONT, canvasTexture, blip } from './ui.js';
import { loadModelFromFiles, loadModelFromUrl, normalize } from './models.js';
import { getItem } from './db.js';
import { settings } from './config.js';
import { CSS_K } from './render.js';

const CONTENT_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CONTENT_FRAG = /* glsl */`
  uniform sampler2D map; uniform float uVideo; uniform float uHas; uniform vec2 uSize; uniform float uRadius; uniform float uDim;
  varying vec2 vUv;
  vec3 dec(vec3 s){ return mix(s * 0.0773993808, pow(s * 0.9478672986 + 0.0521327014, vec3(2.4)), step(0.04045, s)); }
  void main(){
    vec2 p = (vUv - 0.5) * uSize;
    vec2 q = abs(p) - (uSize * 0.5 - uRadius);
    if (length(max(q, 0.0)) - uRadius > 0.0) discard;
    vec3 s = texture2D(map, vUv).rgb;
    vec3 c = uVideo > 0.5 ? dec(s) : s;
    c = mix(vec3(0.035, 0.04, 0.055), c, uHas) * uDim;
    gl_FragColor = vec4(c, 1.0);
  }`;

function contentMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, uVideo: { value: 0 }, uHas: { value: 0 }, uSize: { value: new THREE.Vector2(1, 0.5625) }, uRadius: { value: 0.028 }, uDim: { value: 1 } },
    vertexShader: CONTENT_VERT, fragmentShader: CONTENT_FRAG, side: THREE.DoubleSide,
  });
}

// Plane or cylindrical patch (concave towards the viewer) of width w, height h, radius R.
function surfaceGeometry(w, h, R) {
  if (!R) return new THREE.PlaneGeometry(w, h, 1, 1);
  const seg = 48, theta = Math.min(w / R, Math.PI * 1.2);
  const g = new THREE.PlaneGeometry(w, h, seg, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const a = (x / w) * theta;
    pos.setX(i, R * Math.sin(a));
    pos.setZ(i, R * (1 - Math.cos(a)));
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const fmtTime = s => { if (!isFinite(s)) return '--:--'; s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60), x = s % 60; return (m >= 60 ? Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

// Glass capsule of buttons (and optional progress bar), drawn on one canvas.
export class Toolbar {
  constructor(items, { width = null, height = 0.085, progress = null } = {}) {
    this.items = items; this.progress = progress;
    const btnW = 0.078;
    const w = width || (items.length * btnW + (progress ? 0.36 : 0) + 0.05);
    this.panel = new CanvasPanel(w, height, (ctx, W, H, p) => this.draw(ctx, W, H, p), { pxPerM: 1500 });
    this.mesh = this.panel.mesh;
    this.width = w; this.height = height;
  }
  draw(ctx, W, H, p) {
    glass(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2);
    const pad = H * 0.32, bw = H * 0.92;
    let x = pad;
    const btn = (it, i) => {
      const cx = x + bw / 2, cy = H / 2, hov = p.isHover(i);
      if (hov || it.active?.()) { ctx.beginPath(); ctx.arc(cx, cy, bw * 0.46, 0, 7); ctx.fillStyle = hov ? 'rgba(255,255,255,0.22)' : 'rgba(124,196,255,0.25)'; ctx.fill(); }
      const name = typeof it.icon === 'function' ? it.icon() : it.icon;
      icon(ctx, name, cx, cy, bw * 0.5, it.tint || COLORS.text);
      p.region(x, 0, bw, H, () => { blip('tap', settings.sounds); it.action(); this.panel.redraw(); }, i);
      x += bw;
    };
    this.items.forEach((it, i) => {
      if (it === 'progress' && this.progress) {
        const pw = W - x - pad - (this.items.length - i - 1) * bw;
        const [cur, dur] = this.progress.get();
        const y = H / 2, bx = x + H * 0.2, bwid = pw - H * 0.4 - H * 1.3;
        ctx.fillStyle = 'rgba(255,255,255,0.22)'; roundRect(ctx, bx, y - 4, bwid, 8, 4); ctx.fill();
        const f = dur > 0 ? Math.min(1, cur / dur) : 0;
        ctx.fillStyle = COLORS.text; roundRect(ctx, bx, y - 4, Math.max(8, bwid * f), 8, 4); ctx.fill();
        ctx.beginPath(); ctx.arc(bx + bwid * f, y, p.isHover('prog') ? 13 : 9, 0, 7); ctx.fill();
        text(ctx, fmtTime(cur), bx + bwid + H * 0.65, y, H * 0.3, { dir: 'ltr', color: '#e8edf8', weight: 700 });
        p.region(bx - 10, 0, bwid + 20, H, null, 'prog');
        p.regions[p.regions.length - 1].action = () => {};
        p.regions[p.regions.length - 1].seek = true;
        p.regions[p.regions.length - 1].bx = bx; p.regions[p.regions.length - 1].bw = bwid;
        x += pw;
      } else btn(it, i);
    });
  }
  // Progress seek needs the hit x coordinate.
  install() {
    const inter = this.mesh.userData.interact;
    const origClick = inter.click;
    inter.click = hit => {
      const r = this.panel.hitRegion(hit);
      if (r && r.seek && this.progress) {
        const x = hit.uv.x * this.panel.w;
        this.progress.seek(Math.min(1, Math.max(0, (x - r.bx) / r.bw)));
        blip('tap', settings.sounds); this.panel.redraw(); return true;
      }
      return origClick(hit);
    };
    return this;
  }
  redraw() { this.panel.redraw(); }
  dispose() { this.panel.dispose(); }
}

let winId = 0;

class SpatialWindow {
  constructor(mgr, kind) {
    this.mgr = mgr; this.kind = kind; this.id = ++winId;
    this.group = new THREE.Group();
    this.group.userData.window = this;
    this.aspect = 16 / 9;
    this.curved = false;
    this.canCurve = true;
    this.radius = 2;
    this.mat = contentMaterial();
    this.content = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.content.userData.interact = { type: 'surface', window: this, click: hit => this.onContentClick(hit), hover: () => true };
    this.group.add(this.content);
    this.frame = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x1b1d26, transparent: true, opacity: 0.55, depthWrite: false }));
    this.frame.position.z = -0.006;
    // The frame margin around the content is a grab handle too.
    this.frame.userData.interact = { type: 'drag', window: this, hover: () => true };
    this.group.add(this.frame);
    const { mesh: bar, hit } = makeBar(0.2, 0.022);
    this.bar = bar;
    hit.userData.interact = { type: 'drag', window: this, hover: on => { bar.userData.drawHover(on); return true; } };
    this.group.add(bar);
    this.closeBtn = new IconButton('close', 0.05, () => this.mgr.close(this));
    this.group.add(this.closeBtn.mesh);
    this.toolbar = null;
  }
  get h() { return 1 / this.aspect; }
  layout() {
    const w = 1, h = this.h;
    this.content.geometry.dispose();
    this.content.geometry = surfaceGeometry(w, h, this.curved ? this.radius : 0);
    this.mat.uniforms.uSize.value.set(w, h);
    this.frame.geometry.dispose();
    this.frame.geometry = roundedRectGeometry(w + 0.09, h + 0.09, 0.06);
    this.frame.visible = !this.curved;
    const y = -h / 2 - 0.042;
    this.bar.position.set(0, y, 0.002);
    this.closeBtn.mesh.position.set(-0.155, y, 0.004);
    if (this.toolbar) this.toolbar.mesh.position.set(0, y - 0.075, 0.004);
  }
  setAspect(a) { if (a && isFinite(a) && Math.abs(a - this.aspect) > 0.001) { this.aspect = a; this.layout(); } }
  setCurved(on) {
    if (!this.canCurve) return;
    this.curved = on;
    this.updateRadius();
    this.layout();
    this.mgr.changed();
  }
  updateRadius() {
    const d = this.group.getWorldPosition(new THREE.Vector3()).length() || 2;
    this.radius = Math.max(0.6, d / this.group.scale.x);
  }
  scaleBy(f) {
    const s = THREE.MathUtils.clamp(this.group.scale.x * f, 0.25, 8);
    this.group.scale.setScalar(s);
    if (this.curved) { this.updateRadius(); this.layout(); }
    this.mgr.changed();
  }
  onDragEnd() { if (this.curved) { this.updateRadius(); this.layout(); } }
  onContentClick() { return false; }
  update() {}
  ref() { return null; }
  serialize() {
    const g = this.group;
    return { kind: this.kind, ref: this.ref(), p: g.position.toArray().map(v => +v.toFixed(3)), q: g.quaternion.toArray().map(v => +v.toFixed(4)), s: +g.scale.x.toFixed(3), c: this.curved };
  }
  dispose() {
    this.content.geometry.dispose(); this.mat.dispose(); this.frame.geometry.dispose(); this.frame.material.dispose();
    this.bar.material.map?.dispose(); this.closeBtn.dispose(); this.toolbar?.dispose();
  }
}

export class VideoWindow extends SpatialWindow {
  constructor(mgr, { itemId = null, url = null, name = '' }) {
    super(mgr, 'video');
    this.itemId = itemId; this.url = url; this.name = name;
    this.video = mgr.app.media.acquire();
    this.mat.uniforms.uVideo.value = 1;
    this.tex = null;
    this.toolbar = new Toolbar([
      { icon: 'back', action: () => { this.video.currentTime = Math.max(0, this.video.currentTime - 10); } },
      { icon: () => this.video.paused ? 'play' : 'pause', action: () => this.togglePlay() },
      { icon: 'fwd', action: () => { this.video.currentTime = Math.min(this.video.duration || 0, this.video.currentTime + 10); } },
      'progress',
      { icon: () => this.video.muted ? 'mute' : 'sound', action: () => { this.video.muted = !this.video.muted; } },
      { icon: () => this.curved ? 'flat' : 'curve', action: () => this.setCurved(!this.curved) },
      { icon: 'minus', action: () => this.scaleBy(1 / 1.15) },
      { icon: 'plus', action: () => this.scaleBy(1.15) },
    ], { width: 1.0, progress: { get: () => [this.video.currentTime || 0, this.video.duration || 0], seek: f => { if (this.video.duration) this.video.currentTime = f * this.video.duration; } } }).install();
    this.group.add(this.toolbar.mesh);
    this.layout();
    this.lastBar = 0;
    this.load();
  }
  async load() {
    let src = this.url;
    if (this.itemId) {
      const item = await getItem(this.itemId);
      if (!item) { this.mgr.app.toast('الملف لم يعد موجوداً في المكتبة'); this.mgr.close(this); return; }
      this.name = item.name;
      this.objUrl = URL.createObjectURL(item.files[0].blob);
      src = this.objUrl;
    }
    const v = this.video;
    v.loop = true; v.muted = false; v.playsInline = true;
    v.src = src;
    v.onerror = () => this.mgr.app.toast('تعذّر تشغيل هذا الفيديو');
    v.onloadedmetadata = () => { this.setAspect(v.videoWidth / v.videoHeight); this.setupTexture(); };
    this.mgr.app.log('فتح فيديو: ' + (this.name || this.url));
    try { await v.play(); } catch { v.muted = true; try { await v.play(); this.mgr.app.toast('الصوت مكتوم — اضغط زر الصوت'); } catch {} }
  }
  // Videos wider than 1920 px (4K from the iPhone camera) are scaled down through a canvas to save GPU memory.
  setupTexture() {
    const v = this.video;
    this.tex?.dispose();
    const w = v.videoWidth, h = v.videoHeight;
    if (Math.max(w, h) > 1920) {
      const k = 1920 / Math.max(w, h);
      const c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      this.canvas = c; this.cctx = c.getContext('2d');
      this.tex = new THREE.CanvasTexture(c);
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
      this.mat.uniforms.uVideo.value = 0;
      this.lastFrameTime = -1;
    } else {
      this.canvas = null;
      this.tex = new THREE.VideoTexture(v);
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
      this.mat.uniforms.uVideo.value = 1;
    }
    this.mat.uniforms.map.value = this.tex;
  }
  togglePlay() { const v = this.video; if (v.paused) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); else v.pause(); }
  onContentClick() { this.togglePlay(); blip('tap', settings.sounds); this.toolbar.redraw(); return true; }
  update(dt, now) {
    const v = this.video;
    this.mat.uniforms.uHas.value = v.readyState >= 2 && this.tex ? 1 : 0;
    if (this.canvas && v.readyState >= 2 && v.currentTime !== this.lastFrameTime) {
      this.lastFrameTime = v.currentTime;
      try { this.cctx.drawImage(v, 0, 0, this.canvas.width, this.canvas.height); this.tex.needsUpdate = true; } catch {}
    }
    if (now - this.lastBar > 250) { this.lastBar = now; this.toolbar.redraw(); }
  }
  ref() { return this.itemId ? { item: this.itemId } : { url: this.url }; }
  dispose() {
    super.dispose();
    this.video.pause(); this.video.removeAttribute('src'); this.video.load();
    this.mgr.app.media.release(this.video);
    this.tex?.dispose();
    if (this.objUrl) URL.revokeObjectURL(this.objUrl);
  }
}

export class ImageWindow extends SpatialWindow {
  constructor(mgr, { itemId }) {
    super(mgr, 'image');
    this.itemId = itemId;
    this.toolbar = new Toolbar([
      { icon: () => this.curved ? 'flat' : 'curve', action: () => this.setCurved(!this.curved) },
      { icon: 'minus', action: () => this.scaleBy(1 / 1.15) },
      { icon: 'plus', action: () => this.scaleBy(1.15) },
    ]).install();
    this.group.add(this.toolbar.mesh);
    this.layout();
    this.load();
  }
  async load() {
    const item = await getItem(this.itemId);
    if (!item) { this.mgr.close(this); return; }
    this.mgr.app.log('فتح صورة: ' + item.name);
    try {
      // Decode, then shrink to at most 2560 px so large camera photos do not exhaust memory.
      const url = URL.createObjectURL(item.files[0].blob);
      const img = new Image();
      img.decoding = 'async';
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const k = Math.min(1, 2560 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      img.src = '';
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      this.mat.uniforms.map.value = t; this.mat.uniforms.uHas.value = 1;
      this.tex = t;
      this.setAspect(c.width / c.height);
    } catch { this.mgr.app.toast('تعذّر فتح الصورة'); }
  }
  ref() { return { item: this.itemId }; }
  dispose() { super.dispose(); this.tex?.dispose(); }
}

// Info panels drawn on canvas: welcome, gesture guide, clock.
export class PanelWindow extends SpatialWindow {
  constructor(mgr, { panel }) {
    super(mgr, 'panel');
    this.panelKind = panel;
    this.canCurve = false;
    const specs = { welcome: [1, 0.72], guide: [1, 0.74], clock: [1, 0.42] };
    const [w, h] = specs[panel] || [1, 0.6];
    this.aspect = w / h;
    this.cv = canvasTexture(1400, Math.round(1400 * h / w));
    this.mat.uniforms.map.value = this.cv.texture;
    this.mat.uniforms.uHas.value = 1;
    this.mat.uniforms.uRadius.value = 0.04;
    this.frame.visible = false;
    this.layout();
    this.frame.visible = false;
    this.lastDraw = 0;
    this.draw();
  }
  layout() { super.layout(); this.frame.visible = false; }
  draw() {
    const { ctx, canvas, texture } = this.cv;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1c2233'); g.addColorStop(1, '#241d33');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, 0, W, H * 0.02);
    const k = this.panelKind;
    if (k === 'clock') {
      const now = new Date();
      const t = now.toLocaleTimeString('ar-OM-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: true });
      const d = now.toLocaleDateString('ar-OM-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
      text(ctx, t, W / 2, H * 0.44, H * 0.4, { weight: 500, dir: 'rtl' });
      text(ctx, d, W / 2, H * 0.82, H * 0.13, { color: '#dfe6f5', weight: 600 });
    } else {
      const title = k === 'welcome' ? 'أهلاً بك في مدار' : 'دليل الإيماءات';
      text(ctx, title, W - 70, 92, 76, { align: 'right', weight: 800 });
      if (k === 'welcome') text(ctx, 'النوافذ معلّقة في غرفتك، التفت حولك', W - 70, 170, 42, { align: 'right', color: '#d5ddef', weight: 600 });
      const rows = [
        ['hand', 'للنقر', 'ضع إصبعيك فوق الزر واقرص'],
        ['stack', 'لنقل نافذة', 'اقرص النافذة أو إطارها واسحب'],
        ['plus', 'للتكبير', 'اقرص باليدين وباعد بينهما'],
        ['grid', 'لفتح القائمة', 'اقرص مطوّلاً في الفراغ'],
        ['target', 'لإعادة التمركز', 'اقرص باليدين مطوّلاً'],
        ['sun', 'بدون يدين', 'انظر إلى الزر لحظة أو المس الشاشة'],
      ];
      const top = k === 'welcome' ? 225 : 165, rh = (H - top - 30) / rows.length;
      rows.forEach(([ic, a, b], i) => {
        const y = top + i * rh + rh / 2;
        ctx.beginPath(); ctx.arc(W - 120, y, 44, 0, 7); ctx.fillStyle = 'rgba(124,196,255,0.2)'; ctx.fill();
        icon(ctx, ic, W - 120, y, 48, COLORS.accent);
        text(ctx, a, W - 190, y - 22, 44, { align: 'right', weight: 800 });
        text(ctx, b, W - 190, y + 27, 38, { align: 'right', color: '#d5ddef', weight: 600, maxWidth: W - 260 });
      });
    }
    texture.needsUpdate = true;
  }
  update(dt, now) { if (this.panelKind === 'clock' && now - this.lastDraw > 1000) { this.lastDraw = now; this.draw(); } }
  ref() { return { panel: this.panelKind }; }
  dispose() { super.dispose(); this.cv.texture.dispose(); }
}

// --- Web windows (CSS3D iframes, one copy per eye) ---
export function youtubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0];
    if (u.hostname.includes('youtube.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(embed|shorts|live|v)\/([\w-]{6,})/); if (m) return m[2];
    }
  } catch {}
  return null;
}

export class WebWindow extends SpatialWindow {
  constructor(mgr, { url, title = '' }) {
    super(mgr, 'web');
    this.url = url; this.title = title;
    mgr.app.log('فتح موقع: ' + url);
    this.canCurve = false;
    this.aspect = 16 / 10;
    this.yt = youtubeId(url);
    this.mat.uniforms.uHas.value = 1;
    this.cv = canvasTexture(640, 400);
    const { ctx } = this.cv;
    ctx.fillStyle = '#10131c'; ctx.fillRect(0, 0, 640, 400);
    text(ctx, 'جاري تحميل الصفحة…', 320, 185, 36, { color: '#d5ddef', weight: 600 });
    text(ctx, title || url, 320, 235, 20, { color: 'rgba(255,255,255,0.35)', dir: 'ltr', maxWidth: 560 });
    this.cv.texture.needsUpdate = true;
    this.mat.uniforms.map.value = this.cv.texture;
    this.ytState = { playing: true, muted: true, times: [0, 0] };
    let host = ''; try { host = new URL(url).hostname; } catch {}
    this.cplay = host === 'cplay2.netlify.app';
    this.base = (() => { try { return new URL(url).origin; } catch { return ''; } })();
    this.bridge = false; this.path = '';
    // Pages that include madar-bridge.js (cplay2) accept taps and scrolls from the hands.
    Object.assign(this.content.userData.interact, {
      scroll: () => this.bridge,
      toPx: uv => [uv.x * 1024, (1 - uv.y) * 640],
      scrollBy: (dx, dy, at) => this.send({ type: 'scroll', dx, dy, x: at[0], y: at[1] }),
    });
    const items = [];
    if (this.cplay) items.push({ icon: 'chevR', action: () => this.send({ type: 'back' }) });
    items.push({ icon: 'reload', action: () => this.reload() });
    if (this.yt) items.push(
      { icon: () => this.ytState.playing ? 'pause' : 'play', action: () => this.ytToggle() },
      { icon: () => this.ytState.muted ? 'mute' : 'sound', action: () => this.ytMute(!this.ytState.muted) },
    );
    items.push({ icon: 'minus', action: () => this.scaleBy(1 / 1.15) }, { icon: 'plus', action: () => this.scaleBy(1.15) });
    this.toolbar = new Toolbar(items).install();
    this.group.add(this.toolbar.mesh);
    if (this.cplay) this.makeTabs();
    this.layout();
    this.css = [0, 1].map(i => this.makeCss(i));
    mgr.app.renderer.cssCount++;
    this.onMsg = e => this.handleMessage(e);
    window.addEventListener('message', this.onMsg);
    this.lastSync = 0;
  }
  makeTabs() {
    this.tabs = [['الوسائط', '/media'], ['المباريات', '/matches'], ['لوحة القيادة', '/dashboard'], ['القرآن', '/quran'], ['IPTV', '/iptv'], ['الأذكار', '/football'], ['الإعدادات', '/settings']];
    this.tabPanel = new CanvasPanel(0.96, 0.075, (ctx, W, H, p) => {
      glass(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2);
      const n = this.tabs.length, pad = 10, tw = (W - pad * 2) / n;
      this.tabs.forEach(([label, path], i) => {
        const x = W - pad - (i + 1) * tw, on = this.path.startsWith(path), hov = p.isHover(i);
        if (on || hov) { roundRect(ctx, x + 4, 8, tw - 8, H - 16, (H - 16) / 2); ctx.fillStyle = on ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.2)'; ctx.fill(); }
        text(ctx, label, x + tw / 2, H / 2 + 2, H * 0.36, { weight: 800, color: on ? '#141824' : COLORS.text, maxWidth: tw - 16, dir: 'auto' });
        p.region(x, 0, tw, H, () => { blip('tap', settings.sounds); this.navTo(path); }, i);
      });
    }, { pxPerM: 1500 });
    this.group.add(this.tabPanel.mesh);
  }
  layout() {
    super.layout();
    if (this.tabPanel) this.tabPanel.mesh.position.set(0, this.h / 2 + 0.065, 0.004);
  }
  send(msg) {
    if (!this.bridge || !this.css) return;
    msg.madar = 1;
    this.css.forEach(c => { try { c.f.contentWindow.postMessage(msg, this.base); } catch {} });
  }
  navTo(path) {
    this.path = path; this.tabPanel?.redraw();
    if (this.bridge) this.send({ type: 'nav', path });
    else this.css.forEach(c => { c.f.src = this.base + path; });
  }
  onContentClick(hit) {
    if (!this.bridge || !hit || !hit.uv) return false;
    const [x, y] = this.content.userData.interact.toPx(hit.uv);
    this.send({ type: 'tap', x, y });
    blip('tap', settings.sounds);
    return true;
  }
  src(eye) {
    if (this.yt) {
      const p = new URLSearchParams({ playsinline: '1', autoplay: '1', mute: '1', enablejsapi: '1', rel: '0', modestbranding: '1', origin: location.origin, controls: '1' });
      return `https://www.youtube.com/embed/${this.yt}?${p}`;
    }
    return this.url;
  }
  makeCss(eye) {
    // Zero-size wrapper: CSS3DObject centres its element with translate(-50%), which must not be scaled.
    const el = document.createElement('div');
    el.className = 'webwrap';
    const box = document.createElement('div');
    box.className = 'webwin';
    el.appendChild(box);
    const f = document.createElement('iframe');
    f.src = this.src(eye);
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    // No allow-top-navigation: a site that tries to break out of frames can no longer replace Madar.
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-presentation');
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.setAttribute('loading', 'eager');
    f.addEventListener('load', () => this.onFrameLoad(eye, f));
    box.appendChild(f);
    const obj = new CSS3DObject(el);
    obj.matrixAutoUpdate = false;
    this.mgr.app.renderer.cssScenes[eye].add(obj);
    return { el, f, obj };
  }
  onFrameLoad(eye, f) {
    if (this.base && !this.yt) { try { f.contentWindow.postMessage({ madar: 1, type: 'hello' }, this.base); } catch {} }
    if (!this.yt) return;
    const post = o => { try { f.contentWindow.postMessage(JSON.stringify(o), 'https://www.youtube.com'); } catch {} };
    post({ event: 'listening', id: 'madar' + this.id + '-' + eye, channel: 'widget' });
    if (eye === 0) setTimeout(() => this.ytMute(false), 900);
  }
  cmd(eye, func, args = []) { try { this.css[eye].f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube.com'); } catch {} }
  ytToggle() { const p = !this.ytState.playing; this.ytState.playing = p; [0, 1].forEach(e => this.cmd(e, p ? 'playVideo' : 'pauseVideo')); }
  ytMute(m) { this.ytState.muted = m; this.cmd(0, m ? 'mute' : 'unMute'); this.cmd(1, 'mute'); if (!m) this.cmd(0, 'setVolume', [100]); }
  handleMessage(e) {
    if (e.origin === this.base && e.data && e.data.madar === 1 && this.css.some(c => c.f.contentWindow === e.source)) {
      if (e.data.type === 'ready' && !this.bridge) { this.bridge = true; this.mgr.app.toast('التحكم باليد جاهز: اقرص للنقر واسحب للتمرير'); }
      if (e.data.path && this.css[0].f.contentWindow === e.source) { this.path = e.data.path; this.tabPanel?.redraw(); }
      return;
    }
    if (!this.yt || !String(e.origin).includes('youtube.com')) return;
    let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    if (!d || !d.info) return;
    const eye = this.css.findIndex(c => c.f.contentWindow === e.source);
    if (eye < 0) return;
    if (typeof d.info.currentTime === 'number') this.ytState.times[eye] = d.info.currentTime;
    if (eye === 0 && typeof d.info.muted === 'boolean') this.ytState.muted = d.info.muted;
    if (eye === 0 && typeof d.info.playerState === 'number') this.ytState.playing = d.info.playerState === 1 || d.info.playerState === 3;
  }
  // Called from a genuine screen tap: the best chance iOS allows sound.
  userGesture() { if (this.yt && this.ytState.muted) this.ytMute(false); }
  reload() { this.css.forEach((c, i) => { c.f.src = this.src(i); }); }
  update(dt, now) {
    const head = this.mgr.app.headForward;
    const toWin = this.group.getWorldPosition(new THREE.Vector3()).normalize();
    const visible = head.dot(toWin) > 0.2;
    const sm = new THREE.Matrix4().makeScale(1 / 1024, 1 / 1024, 1);
    const km = new THREE.Matrix4().makeScale(CSS_K, CSS_K, CSS_K);
    this.content.updateMatrixWorld();
    for (const c of this.css) {
      c.obj.matrix.copy(km).multiply(this.content.matrixWorld).multiply(sm);
      c.obj.matrixWorldNeedsUpdate = true;
      const disp = visible ? '' : 'none';
      if (c.el.style.display !== disp) c.el.style.display = disp;
    }
    if (this.yt && now - this.lastSync > 2000) {
      this.lastSync = now;
      const [a, b] = this.ytState.times;
      if (a > 1 && Math.abs(a - b) > 0.35) this.cmd(1, 'seekTo', [a + 0.15, true]);
      this.toolbar.redraw();
    }
  }
  ref() { return { url: this.url, title: this.title }; }
  dispose() {
    super.dispose();
    this.tabPanel?.dispose();
    window.removeEventListener('message', this.onMsg);
    this.css.forEach((c, i) => { c.f.src = 'about:blank'; this.mgr.app.renderer.cssScenes[i].remove(c.obj); c.el.remove(); });
    this.mgr.app.renderer.cssCount--;
    this.cv.texture.dispose();
  }
}

// --- 3D model volume ---
let shadowTex = null;
export class ModelVolume {
  constructor(mgr, { itemId = null, url = null, name = '' }) {
    this.mgr = mgr; this.kind = 'model'; this.id = ++winId;
    mgr.app.log('فتح مجسم: ' + (name || url || itemId));
    this.itemId = itemId; this.url = url; this.name = name;
    this.group = new THREE.Group();
    this.group.userData.window = this;
    this.spin = false;
    this.pivot = new THREE.Group();
    this.group.add(this.pivot);
    if (!shadowTex) shadowTex = radialTexture('rgba(0,0,0,0.5)', 'rgba(0,0,0,0)');
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 40), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = -0.002;
    this.group.add(this.shadow);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.29, 0.3, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.group.add(this.ring);
    this.proxy = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.position.y = 0.22;
    this.proxy.userData.interact = { type: 'drag', window: this, model: true, hover: on => { this.ring.material.opacity = on ? 0.6 : 0.25; return true; } };
    this.group.add(this.proxy);
    // Loading spinner.
    this.loader = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 8, 48, Math.PI * 1.5), new THREE.MeshBasicMaterial({ color: 0x7cc4ff }));
    this.loader.position.y = 0.2;
    this.group.add(this.loader);
    this.toolbar = new Toolbar([
      { icon: 'close', action: () => this.mgr.close(this), tint: COLORS.text },
      { icon: 'spin', action: () => { this.spin = !this.spin; }, active: () => this.spin },
      { icon: 'reset', action: () => { this.pivot.rotation.set(0, 0, 0); this.group.scale.setScalar(1); this.mgr.changed(); } },
      { icon: 'minus', action: () => this.scaleBy(1 / 1.15) },
      { icon: 'plus', action: () => this.scaleBy(1.15) },
    ]).install();
    this.toolbar.mesh.position.set(0, -0.06, 0.32);
    this.toolbar.mesh.rotation.x = -0.35;
    this.group.add(this.toolbar.mesh);
    this.mixer = null;
    this.load();
  }
  async load() {
    try {
      let res;
      if (this.itemId) {
        const item = await getItem(this.itemId);
        if (!item) { this.mgr.close(this); return; }
        this.name = item.name;
        res = await loadModelFromFiles(item.files, item.format);
      } else res = await loadModelFromUrl(this.url);
      this.revoke = res.revoke;
      const { radius, height } = normalize(res.object);
      this.pivot.add(res.object);
      this.object = res.object;
      const r = Math.max(0.12, radius * 1.15);
      this.shadow.scale.setScalar(r / 0.3 * 1.1);
      this.ring.scale.setScalar(r / 0.3);
      this.proxy.scale.set(Math.max(radius * 2, 0.15) / 0.5, Math.max(height, 0.1) / 0.45, Math.max(radius * 2, 0.15) / 0.5);
      this.proxy.position.y = height / 2;
      this.toolbar.mesh.position.set(0, -0.06, r + 0.04);
      if (res.animations.length) { this.mixer = new THREE.AnimationMixer(res.object); res.animations.forEach(a => this.mixer.clipAction(a).play()); }
    } catch (e) {
      console.error(e);
      this.mgr.app.toast('تعذّر تحميل المجسم: ' + (e.message || 'ملف غير صالح'));
    }
    this.group.remove(this.loader); this.loader.geometry.dispose();
  }
  scaleBy(f) { this.group.scale.setScalar(THREE.MathUtils.clamp(this.group.scale.x * f, 0.1, 12)); this.mgr.changed(); }
  rotateBy(a) { this.pivot.rotation.y += a; }
  onDragEnd() {}
  update(dt) {
    if (this.loader.parent) this.loader.rotation.z -= dt * 5;
    if (this.spin) this.pivot.rotation.y += dt * 0.6;
    this.mixer?.update(dt);
    // Keep the toolbar facing the viewer.
    const wp = this.group.getWorldPosition(new THREE.Vector3());
    this.group.rotation.y = Math.atan2(-wp.x, -wp.z);
  }
  serialize() {
    const g = this.group;
    return { kind: 'model', ref: this.itemId ? { item: this.itemId } : { url: this.url }, p: g.position.toArray().map(v => +v.toFixed(3)), s: +g.scale.x.toFixed(3), r: +this.pivot.rotation.y.toFixed(3), spin: this.spin };
  }
  dispose() {
    this.toolbar.dispose();
    this.object?.traverse(o => {
      if (o.isMesh) { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!m) return; Object.values(m).forEach(v => v && v.isTexture && v.dispose()); m.dispose(); }); }
    });
    this.revoke?.();
  }
}

// --- Manager ---
export class WindowManager {
  constructor(app) {
    this.app = app;
    this.windows = [];
    this.root = new THREE.Group();
    app.renderer.scene.add(this.root);
    this.targets = [];
    this.saveTimer = 0;
  }
  refreshTargets() {
    const t = [];
    for (const w of this.windows) w.group.traverse(o => { if (o.userData.interact) t.push(o); });
    this.targets = t;
    this.app.interaction?.setTargets();
  }
  headLocal() { this.root.updateMatrixWorld(); return this.root.worldToLocal(new THREE.Vector3(0, 0, 0)); }
  forwardYaw() { return this.app.head.currentYaw() - this.app.head.yawOffset; }
  // Place a group in front of the viewer, avoiding overlap with existing windows.
  place(group, dist, y = 0, avoid = true) {
    let yaw = this.forwardYaw();
    const tries = [0, 0.42, -0.42, 0.84, -0.84, 1.26, -1.26];
    for (const dy of tries) {
      const a = yaw + dy;
      const ok = !avoid || this.windows.every(w => { const p = w.group.position; const wa = Math.atan2(-p.x, -p.z); return Math.abs(Math.atan2(Math.sin(wa - a), Math.cos(wa - a))) > 0.35 || Math.abs(p.y - y) > 0.6; });
      if (ok) { yaw = a; break; }
    }
    const h = this.headLocal();
    group.position.set(h.x - Math.sin(yaw) * dist, h.y + y, h.z - Math.cos(yaw) * dist);
    if (group.parent) group.lookAt(0, 0, 0); else { group.lookAt(h.x, h.y + y, h.z); }
  }
  add(win, { dist = 2, y = 0, scale = 1, place = true } = {}) {
    win.group.scale.setScalar(scale);
    if (place) {
      if (win.kind === 'model') { this.place(win.group, dist, y); win.group.rotation.set(0, 0, 0); }
      else this.place(win.group, dist, y);
    }
    this.root.add(win.group);
    this.windows.push(win);
    this.refreshTargets();
    this.changed();
    blip('open', settings.sounds);
    return win;
  }
  close(win) {
    const i = this.windows.indexOf(win); if (i < 0) return;
    this.windows.splice(i, 1);
    this.root.remove(win.group);
    win.dispose();
    this.refreshTargets();
    this.app.interaction?.forget(win);
    this.changed();
    blip('close', settings.sounds);
  }
  closeAll() { [...this.windows].forEach(w => this.close(w)); }
  open(spec) {
    const k = spec.kind;
    if (k === 'video') return this.add(new VideoWindow(this, spec), { dist: 2.3, scale: 1.7, y: 0.05 });
    if (k === 'image') return this.add(new ImageWindow(this, spec), { dist: 1.9, scale: 1.25 });
    if (k === 'web') {
      // Each site runs twice (one copy per eye), so keep a single web window to stay within iPhone memory.
      const old = this.windows.filter(w => w.kind === 'web');
      if (old.length) { old.forEach(w => this.close(w)); this.app.toast('أُغلق الموقع السابق لتوفير الذاكرة'); }
      return this.add(new WebWindow(this, spec), { dist: 2.1, scale: 1.6 });
    }
    if (k === 'panel') return this.add(new PanelWindow(this, spec), { dist: 1.6, scale: spec.panel === 'clock' ? 0.55 : 0.95, y: spec.panel === 'clock' ? 0.45 : 0 });
    if (k === 'model') return this.add(new ModelVolume(this, spec), { dist: 1.25, y: -0.38 });
  }
  // Bring every window back into a fan in front of the viewer.
  arrange() {
    const yaw = this.forwardYaw();
    const list = this.windows;
    const n = list.length;
    list.forEach((w, i) => {
      const a = yaw + (i - (n - 1) / 2) * 0.55;
      const d = w.kind === 'model' ? 1.25 : 2.1;
      const y = w.kind === 'model' ? -0.38 : 0;
      const h = this.headLocal();
      w.group.position.set(h.x - Math.sin(a) * d, h.y + y, h.z - Math.cos(a) * d);
      if (w.kind !== 'model') w.group.lookAt(0, 0, 0);
      w.onDragEnd?.();
    });
    this.changed();
  }
  changed() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.app.persistLayout(), 800);
  }
  serialize() { return this.windows.map(w => w.serialize()).filter(x => x.ref); }
  restore(list) {
    const seen = new Set();
    let webs = 0;
    for (const s of list || []) {
      const key = s.kind + JSON.stringify(s.ref);
      if (seen.has(key)) continue;          // drop duplicates saved by older versions
      seen.add(key);
      if (s.kind === 'web' && ++webs > 1) continue;
      try {
        const spec = Object.assign({ kind: s.kind }, s.ref);
        if (s.ref.item) spec.itemId = s.ref.item;
        let win;
        if (s.kind === 'video') win = new VideoWindow(this, spec);
        else if (s.kind === 'image') win = new ImageWindow(this, spec);
        else if (s.kind === 'web') win = new WebWindow(this, spec);
        else if (s.kind === 'panel') win = new PanelWindow(this, spec);
        else if (s.kind === 'model') win = new ModelVolume(this, spec);
        if (!win) continue;
        win.group.position.fromArray(s.p);
        if (s.q) win.group.quaternion.fromArray(s.q);
        win.group.scale.setScalar(s.s || 1);
        if (s.kind === 'model') { win.pivot.rotation.y = s.r || 0; win.spin = !!s.spin; }
        else if (s.c) { win.curved = true; win.updateRadius(); win.layout(); }
        this.root.add(win.group);
        this.windows.push(win);
      } catch (e) { console.warn('restore failed', e); }
    }
    this.refreshTargets();
  }
  update(dt, now) { for (const w of this.windows) w.update(dt, now); }
}
