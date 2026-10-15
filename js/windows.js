// Spatial windows (video, image, web, info panels) and 3D model volumes, plus the manager that places and saves them.
import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { CanvasPanel, IconButton, makeBar, glass, text, icon, roundRect, roundedRectGeometry, radialTexture, COLORS, FONT, canvasTexture, blip } from './ui.js';
import { loadModelFromFiles, loadModelFromUrl, normalize } from './models.js';
import { getItem } from './db.js';
import { settings, saveSettings, loadLinks, saveLinks } from './config.js';
import { CSS_K, EYE } from './render.js';

const BROWSE_ORIGIN = 'https://cplay3.netlify.app';
const CONTENT_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CONTENT_FRAG = /* glsl */`
  uniform sampler2D map; uniform float uVideo; uniform float uHas; uniform vec2 uSize; uniform float uRadius; uniform float uDim; uniform float uHole;
  uniform vec4 uL; uniform vec4 uR; uniform float uEye;
  varying vec2 vUv;
  vec3 dec(vec3 s){ return mix(s * 0.0773993808, pow(s * 0.9478672986 + 0.0521327014, vec3(2.4)), step(0.04045, s)); }
  void main(){
    vec2 p = (vUv - 0.5) * uSize;
    vec2 q = abs(p) - (uSize * 0.5 - uRadius);
    if (length(max(q, 0.0)) - uRadius > 0.0) discard;
    // Web windows: a transparent hole so the live page under the canvas shows, with a thin opaque rim
    // that hides small misalignment between the lens-corrected scene and the page.
    if (uHole > 0.5) {
      vec2 e = abs(p) - uSize * 0.5 * 0.975;
      if (max(e.x, e.y) < 0.0) { gl_FragColor = vec4(0.0); return; }
      gl_FragColor = vec4(0.06, 0.07, 0.1, 1.0); return;
    }
    vec4 R = uEye > 0.5 ? uR : uL;
    vec3 s = texture2D(map, R.xy + vUv * R.zw).rgb;
    vec3 c = uVideo > 0.5 ? dec(s) : s;
    c = mix(vec3(0.035, 0.04, 0.055), c, uHas) * uDim;
    gl_FragColor = vec4(c, 1.0);
  }`;

function contentMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, uHole: { value: 0 }, uVideo: { value: 0 }, uHas: { value: 0 }, uSize: { value: new THREE.Vector2(1, 0.5625) }, uRadius: { value: 0.028 }, uDim: { value: 1 },
      uL: { value: new THREE.Vector4(0, 0, 1, 1) }, uR: { value: new THREE.Vector4(0, 0, 1, 1) }, uEye: EYE },
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

// The page is drawn a little larger than its window; the window's opaque rim hides the overflow,
// so small differences between the lens-corrected scene and the flat page never show a gap.
const WEB_INFLATE = 1.04;

// CSS matrix3d mapping a w×h box onto four screen points (tl, tr, bl, br).
function homography(w, h, [p0, p1, p2, p3]) {
  const [x0, y0] = p0, [x1, y1] = p1, [x2, y2] = p2, [x3, y3] = p3;
  const dx1 = x1 - x3, dx2 = x2 - x3, dy1 = y1 - y3, dy2 = y2 - y3;
  const sx = x0 - x1 + x3 - x2, sy = y0 - y1 + y3 - y2;
  const det = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (sx * dy2 - dx2 * sy) / det, hh = (dx1 * sy - sx * dy1) / det;
  const a = x1 - x0 + g * x1, b = x2 - x0 + hh * x2, c = x0;
  const d = y1 - y0 + g * y1, e = y2 - y0 + hh * y2, f = y0;
  // Unit square → quad, then scale from the box size.
  const A = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1];
  return 'matrix3d(' + A.map(v => +v.toFixed(8)).join(',') + ')';
}

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
    this.pinBtn = new IconButton('target', 0.05, () => {
      this.headLock = !this.headLock;
      this.mgr.app.toast(this.headLock ? 'النافذة مثبتة في مجال رؤيتك وتتبع رأسك' : 'النافذة ثابتة في مكانها بالغرفة', 2200);
    });
    this.group.add(this.pinBtn.mesh);
    // Corner handle: pinch it and pull outward/inward to resize (separate from scrolling and moving).
    const rm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false });
    this.resizer = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), rm);
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(0.044, 0.008), new THREE.MeshBasicMaterial({ color: 0x141824 }));
    arrow.rotation.z = -Math.PI / 4; arrow.position.z = 0.001; this.resizer.add(arrow);
    this.resizer.userData.interact = { type: 'resize', window: this, hover: on => { rm.opacity = on ? 0.9 : 0.38; return true; } };
    this.group.add(this.resizer);
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
    this.pinBtn.mesh.position.set(0.155, y, 0.004);
    this.resizer.position.set(0.5 + 0.03, -h / 2 - 0.03, 0.006);
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
    this.bar.material.map?.dispose(); this.closeBtn.dispose(); this.pinBtn?.dispose(); this.toolbar?.dispose();
  }
}

export class VideoWindow extends SpatialWindow {
  constructor(mgr, { itemId = null, url = null, name = '', stream = null, remote = null, fmt = null, proj = null }) {
    super(mgr, 'video');
    this.fmt = fmt || '2d'; this.proj = proj || 'flat'; this.fmtSet = !!fmt;
    this.stream = stream; this.remote = remote; this.control = false;
    this.itemId = itemId; this.url = url; this.name = name;
    this.video = mgr.app.media.acquire();
    this.mat.uniforms.uVideo.value = 1;
    this.tex = null;
    if (remote) {
      // A shared screen you can operate: click = mouse click / tap, pinch-drag or triggers = scroll.
      this.toolbar = new Toolbar([
        { icon: 'chevR', action: () => this.key('back') },
        { icon: 'home', action: () => this.key('home') },
        { icon: 'keyboard', action: () => this.mgr.openKeyboard() },
        { icon: 'enter', action: () => this.key('enter') },
        { icon: () => this.headLock ? 'target' : 'grid', action: () => { this.headLock = !this.headLock; this.mgr.app.toast(this.headLock ? 'الشاشة مثبتة أمام عينيك وتتبع رأسك' : 'الشاشة ثابتة في مكانها بالغرفة'); } },
        { icon: () => this.video.muted ? 'mute' : 'sound', action: () => { this.video.muted = !this.video.muted; } },
        { icon: () => this.curved ? 'flat' : 'curve', action: () => this.setCurved(!this.curved) },
        { icon: 'minus', action: () => this.scaleBy(1 / 1.15) },
        { icon: 'plus', action: () => this.scaleBy(1.15) },
      ]).install();
      Object.assign(this.content.userData.interact, {
        scroll: () => this.control,
        toPx: uv => [uv.x * (this.video.videoWidth || 1280), (1 - uv.y) * (this.video.videoHeight || 720)],
        scrollBy: (dx, dy, at) => this.scrollAt(dx, dy, at),
      });
    } else this.toolbar = new Toolbar([
      { icon: 'back', action: () => { this.video.currentTime = Math.max(0, this.video.currentTime - 10); } },
      { icon: () => this.video.paused ? 'play' : 'pause', action: () => this.togglePlay() },
      { icon: 'fwd', action: () => { this.video.currentTime = Math.min(this.video.duration || 0, this.video.currentTime + 10); } },
      'progress',
      { icon: () => this.video.muted ? 'mute' : 'sound', action: () => { this.video.muted = !this.video.muted; } },
      { icon: 'cast', action: () => this.cast() },
      { icon: 'sliders', action: () => this.toggleOptions() },
      { icon: () => this.curved ? 'flat' : 'curve', action: () => this.setCurved(!this.curved) },
      { icon: 'minus', action: () => this.scaleBy(1 / 1.15) },
      { icon: 'plus', action: () => this.scaleBy(1.15) },
    ], { width: 1.1, progress: { get: () => [this.video.currentTime || 0, this.video.duration || 0], seek: f => { if (this.video.duration) this.video.currentTime = f * this.video.duration; } } }).install();
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
    if (this.stream) { v.loop = false; v.srcObject = this.stream; } else v.src = src;
    v.onerror = () => { if (!this.stream) this.mgr.app.toast('تعذّر تشغيل هذا الفيديو'); };
    // iOS pauses videos on its own (camera restarts, audio interruptions, live streams that hiccup):
    // anything the user didn't pause is resumed right away.
    v.onpause = () => { if (!this.userPaused && !this.disposed) setTimeout(() => this.resume(), 250); };
    this.watchFrames();
    v.onloadedmetadata = () => { if (!this.guessed) { this.guessed = true; this.guessFormat(); } this.setAspect(this.dispAspect()); this.setupTexture(); };
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
  // Send this video to a TV: AirPlay (Safari) or Chromecast (Chrome) through the browser's own picker.
  cast() {
    const v = this.video;
    if (this.stream) { this.mgr.app.toast('البث المباشر لا يُرسل للتلفاز — استخدم انعكاس الشاشة من مركز التحكم', 4000); return; }
    try {
      if (v.webkitShowPlaybackTargetPicker) { v.webkitShowPlaybackTargetPicker(); return; }
      if (v.remote && v.remote.prompt) { v.remote.prompt().catch(e => this.mgr.app.toast('لم يُعثر على جهاز عرض: ' + (e.message || ''), 3500)); return; }
    } catch {}
    this.mgr.app.toast('هذا المتصفح لا يدعم الإرسال للتلفاز', 3500);
  }
  // ---- Player options (like Play'A / VR Station): 3D formats, 180°/360°, speed, brightness, lock to view ----
  dispAspect() {
    const v = this.video, w = v.videoWidth || 16, h = v.videoHeight || 9;
    return { sbs: w / 2 / h, ou: w / (h / 2) }[this.fmt] || w / h;   // half-width formats (sbsh/ouh) keep the full shape
  }
  // Guess the format from the file name: "SBS", "3D", "_LR", "OU", "TB", "180", "360".
  guessFormat() {
    if (this.fmtSet || this.stream) { this.applyFormat(); return; }
    const n = (this.name || this.url || '').toLowerCase();
    if (/(^|[^a-z])(ou|tb|top.?bottom|over.?under)([^a-z]|$)/.test(n)) this.fmt = 'ouh';
    else if (/(^|[^a-z])(sbs|3d|lr|side.?by.?side)([^a-z]|$)/.test(n)) this.fmt = 'sbsh';
    if (/360/.test(n)) this.proj = '360'; else if (/180/.test(n)) { this.proj = '180'; if (this.fmt === '2d') this.fmt = 'sbsh'; }
    this.applyFormat();
  }
  applyFormat() {
    const u = this.mat.uniforms, L = u.uL.value, R = u.uR.value;
    if (this.fmt === 'sbs' || this.fmt === 'sbsh') { L.set(0, 0, 0.5, 1); R.set(0.5, 0, 0.5, 1); }
    else if (this.fmt === 'ou' || this.fmt === 'ouh') { L.set(0, 0.5, 1, 0.5); R.set(0, 0, 1, 0.5); }
    else { L.set(0, 0, 1, 1); R.set(0, 0, 1, 1); }
    if (this.video.videoWidth) this.setAspect(this.dispAspect());
    this.setProjection(this.proj);
    this.opts?.redraw();
  }
  // Immersive 180°/360° video: a sphere around you, the window stays as the remote control.
  setProjection(p) {
    this.proj = p;
    if (this.sphere) { this.mgr.root.remove(this.sphere); this.sphere.geometry.dispose(); this.sphere.material.dispose(); this.sphere = null; }
    if (p === 'flat') { this.content.visible = true; return; }
    const g = p === '180' ? new THREE.SphereGeometry(12, 64, 48, Math.PI, Math.PI) : new THREE.SphereGeometry(12, 96, 48);
    g.scale(-1, 1, 1);
    const m = contentMaterial(), u = this.mat.uniforms;
    ['map', 'uVideo', 'uHas', 'uL', 'uR', 'uDim'].forEach(k => { m.uniforms[k] = u[k]; });
    m.uniforms.uSize.value.set(1, 1); m.uniforms.uRadius.value = 0;
    m.side = THREE.FrontSide; m.depthWrite = false;
    const sp = new THREE.Mesh(g, m);
    sp.renderOrder = -10; sp.frustumCulled = false;
    sp.rotation.y = this.mgr.forwardYaw() + (p === '360' ? -Math.PI / 2 : 0);
    this.mgr.root.add(sp); this.sphere = sp;
    this.content.visible = false;
    this.mgr.app.toast(p === '180' ? 'فيديو 180° حولك · النافذة للتحكم' : 'فيديو 360° حولك · النافذة للتحكم', 2500);
  }
  toggleOptions() {
    if (!this.opts) {
      const FMT = { '2d': '2D', sbs: 'SBS كامل', sbsh: 'SBS', ou: 'OU كامل', ouh: 'OU' }, PROJ = { flat: 'شاشة', '180': '180°', '360': '360°' };
      this.opts = new CanvasPanel(1, 0.11, (ctx, W, H, p) => {
        glass(ctx, 2, 2, W - 4, H - 4, 36);
        const v = this.video;
        const items = [
          ['الصيغة', FMT[this.fmt], () => { const o = Object.keys(FMT); this.fmt = o[(o.indexOf(this.fmt) + 1) % o.length]; this.fmtSet = true; this.applyFormat(); }],
          ['العرض', PROJ[this.proj], () => { const o = Object.keys(PROJ); this.setProjection(o[(o.indexOf(this.proj) + 1) % o.length]); this.mgr.changed(); }],
          ['السرعة', (v.playbackRate || 1) + '×', () => { const o = [1, 1.25, 1.5, 2, 0.5, 0.75]; v.playbackRate = o[(o.indexOf(v.playbackRate) + 1) % o.length]; }],
          ['الإضاءة', Math.round(this.mat.uniforms.uDim.value * 100) + '%', () => { const o = [1, 1.15, 1.3, 0.7, 0.85]; const u = this.mat.uniforms.uDim; u.value = o[(o.indexOf(u.value) + 1) % o.length]; }],
          ['التكرار', v.loop ? 'مفعّل' : 'متوقف', () => { v.loop = !v.loop; }],
          ['أمام العين', this.headLock ? 'مثبتة' : 'حرة', () => { this.headLock = !this.headLock; }],
        ];
        const cw = (W - 20) / items.length;
        items.forEach(([l, val, act], i) => {
          const x = W - 10 - (i + 1) * cw, id = 'o' + i, hov = p.isHover(id);
          if (hov) { roundRect(ctx, x + 6, 10, cw - 12, H - 20, 26); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill(); }
          text(ctx, l, x + cw / 2, H * 0.34, H * 0.2, { color: COLORS.dim, weight: 600 });
          text(ctx, val, x + cw / 2, H * 0.68, H * 0.27, { weight: 800, dir: 'auto' });
          p.region(x, 0, cw, H, () => { blip('tap', settings.sounds); act(); this.opts.redraw(); }, id);
        });
      }, { pxPerM: 1500 });
    }
    const m = this.opts.mesh;
    if (m.parent) this.group.remove(m); else this.group.add(m);
    this.layout(); this.opts.redraw(); this.mgr.refreshTargets();
  }
  layout() {
    super.layout();
    if (this.opts) this.opts.mesh.position.set(0, -this.h / 2 - 0.23, 0.004);
  }
  togglePlay() {
    const v = this.video;
    if (v.paused) { this.userPaused = false; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
    else { this.userPaused = true; v.pause(); }
  }
  resume() {
    const v = this.video;
    if (this.disposed || this.userPaused || !v.paused || (!v.srcObject && !v.currentSrc)) return;
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  }
  // Live screen: swap in a fresh stream after a reconnect, keeping the window where it is.
  setStream(stream) {
    this.stream = stream; this.userPaused = false;
    const v = this.video; v.srcObject = stream; this.lastFrameAt = performance.now();
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  }
  // Remember when the last real frame arrived (for live screens).
  watchFrames() {
    const v = this.video; this.lastFrameAt = performance.now();
    if (typeof v.requestVideoFrameCallback !== 'function') return;
    const tick = () => { if (this.disposed) return; this.lastFrameAt = performance.now(); v.requestVideoFrameCallback(tick); };
    v.requestVideoFrameCallback(tick);
  }
  onContentClick(hit) {
    if (this.remote) {
      if (!this.control) { this.mgr.app.toast(this.remote.caps?.why || 'التحكم غير متاح لهذه الشاشة', 4000); return true; }
      if (hit && hit.uv) { this.remote.send({ type: 'input', a: 'tap', x: hit.uv.x, y: 1 - hit.uv.y }); blip('tap', settings.sounds); }
      return true;
    }
    this.togglePlay(); blip('tap', settings.sounds); this.toolbar.redraw(); return true;
  }
  // ---- Remote control (shared screens) ----
  setControl(c) { this.control = !!(c && c.control); this.ctlKind = c && c.kind; }
  key(k) {
    if (!this.control) { this.mgr.app.toast(this.remote?.caps?.why || 'التحكم غير متاح', 3500); return; }
    this.remote.send({ type: 'input', a: 'key', key: k }); blip('tap', settings.sounds);
  }
  typeText(t) { if (this.control) this.remote.send({ type: 'input', a: 'text', value: t }); }
  scrollAt(dx, dy, at) {
    if (!this.control) return;
    const W = this.video.videoWidth || 1280, H = this.video.videoHeight || 720;
    this.remote.send({ type: 'input', a: 'scroll', x: at[0] / W, y: at[1] / H, dx: dx / W, dy: dy / H });
  }
  goBack() { if (this.remote) this.key('back'); }
  // The pointer over the screen moves the computer's mouse (so hover menus and the cursor follow you).
  trackPointer(now) {
    if (!this.control || this.ctlKind !== 'agent' || now - (this.lastMove || 0) < 45) return;
    const p = this.mgr.app.interaction?.pointers.find(x => x.active && x.hit && x.hit.object === this.content && x.hit.uv);
    if (!p) return;
    const x = p.hit.uv.x, y = 1 - p.hit.uv.y;
    if (this.lastPt && Math.abs(x - this.lastPt[0]) + Math.abs(y - this.lastPt[1]) < 0.0015) return;
    this.lastPt = [x, y]; this.lastMove = now;
    this.remote.send({ type: 'input', a: 'move', x, y });
  }
  update(dt, now) {
    const v = this.video;
    // Live streams may report their size late or skip 'loadedmetadata': set up the texture once frames exist.
    if (!this.tex && v.readyState >= 2 && v.videoWidth) { if (!this.guessed) { this.guessed = true; this.guessFormat(); } this.setAspect(this.dispAspect()); this.setupTexture(); }
    if (this.tex && v.videoWidth && Math.abs(this.dispAspect() - this.aspect) > 0.01) this.setAspect(this.dispAspect());
    if (this.sphere) this.sphere.position.copy(this.mgr.headLocal());
    this.mat.uniforms.uHas.value = v.readyState >= 2 && this.tex ? 1 : 0;
    if (this.canvas && v.readyState >= 2 && v.currentTime !== this.lastFrameTime) {
      this.lastFrameTime = v.currentTime;
      try { this.cctx.drawImage(v, 0, 0, this.canvas.width, this.canvas.height); this.tex.needsUpdate = true; } catch {}
    }
    if (now - this.lastBar > 250) { this.lastBar = now; this.toolbar.redraw(); }
    if (this.remote) this.trackPointer(now);

    // Watchdog: a paused or stuck live screen is restarted.
    if (now - (this.lastCheck || 0) > 1000) {
      this.lastCheck = now;
      if (v.paused) this.resume();
      if (this.stream && !this.userPaused && this.onStall && now - this.lastFrameAt > 9000 && now - (this.stallAt || 0) > 15000) {
        this.stallAt = now; this.onStall();
      }
    }
  }
  ref() {
    if (this.stream) return null;
    const r = this.itemId ? { item: this.itemId } : { url: this.url };
    if (this.fmt !== '2d') r.fmt = this.fmt;
    if (this.proj !== 'flat') r.proj = this.proj;
    return r;
  }
  dispose() {
    this.disposed = true;
    if (this.sphere) { this.mgr.root.remove(this.sphere); this.sphere.geometry.dispose(); this.sphere.material.dispose(); this.sphere = null; }
    this.opts?.dispose();
    super.dispose();
    this.video.onpause = null;
    this.video.pause(); this.video.srcObject = null; this.video.removeAttribute('src'); this.video.load();
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
    const specs = { welcome: [1, 0.72], guide: [1, 0.74], clock: [1, 0.42], pad: [1, 0.86] };
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
      const title = k === 'welcome' ? 'أهلاً بك في مدار' : k === 'pad' ? 'يد التحكم' : 'دليل الإيماءات';
      text(ctx, title, W - 70, 92, 76, { align: 'right', weight: 800 });
      if (k === 'welcome') text(ctx, 'النوافذ معلّقة في غرفتك، التفت حولك', W - 70, 170, 42, { align: 'right', color: '#d5ddef', weight: 600 });
      const rows = [
        ['hand', 'للنقر', 'ضع إصبعيك فوق الزر واقرص'],
        ['stack', 'لنقل نافذة', 'اقرص النافذة أو إطارها واسحب'],
        ['plus', 'للتكبير', 'باليدين وباعد، أو اقرص مطوّلاً وارفع يدك'],
        ['grid', 'لفتح القائمة', 'اقرص مطوّلاً في الفراغ'],
        ['target', 'لإعادة التمركز', 'اقرص باليدين معاً في الفراغ ثانية'],
        ['sun', 'بدون يدين', 'انظر إلى الزر 3 ثوانٍ أو المس الشاشة'],
      ];
      if (k === 'pad') rows.splice(0, rows.length,
        ['hand', '✕ / A', 'اختيار · اضغط مطوّلاً للسحب والتمرير'],
        ['close', '○ / B', 'رجوع وإغلاق القائمة'],
        ['grid', 'Options', 'القائمة الرئيسية'],
        ['stack', 'العصا اليسرى', 'التحرك في المكان'],
        ['reload', 'العصا اليمنى', 'التفاف 30° · أعلى/أسفل للتمرير'],
        ['plus', 'L1 / R1', 'تصغير / تكبير ما تشير إليه'],
        ['sliders', 'L2 / R2', 'تمرير الصفحة'],
        ['target', '□ / X', 'إعادة التمركز · △ لوحة المفاتيح'],
      );
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
  constructor(mgr, { url, title = '', direct = false }) {
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
    this.mat.uniforms.uHole.value = 1;
    let host = ''; try { host = new URL(url).hostname; } catch {}
    this.cplay = (host === 'cplay3.netlify.app' || host === 'cplay2.netlify.app');
    this.base = (() => { try { return new URL(url).origin; } catch { return ''; } })();
    // Internal browser: ordinary sites open through Madar's page service so the pointer can click in them.
    this.direct = direct;
    // Phone/laptop modes touch the page directly; in the headset the internal browser makes clicks possible.
    // A site you switched to «مباشر» stays direct next time.
    const hostKey = host.replace(/^www\./, '');
    const directHost = (settings.directHosts || []).includes(hostKey);
    this.proxied = !this.cplay && !this.yt && !direct && !directHost && settings.viewMode === 'sbs' && settings.browseProxy !== false && /^https?:/i.test(url);
    this.direct = !this.proxied && !this.cplay && !this.yt;
    if (this.proxied) this.base = BROWSE_ORIGIN;
    this.bridge = false; this.path = '';
    // Pages that include madar-bridge.js (cplay2) accept taps and scrolls from the hands.
    Object.assign(this.content.userData.interact, {
      scroll: () => this.bridge,
      toPx: uv => [512 + (uv.x - 0.5) * 1024 / WEB_INFLATE, 320 + (0.5 - uv.y) * 640 / WEB_INFLATE],
      scrollBy: (dx, dy, at) => { this.lastAt = at; this.send({ type: 'scroll', dx, dy, x: at[0], y: at[1] }); },
    });
    const items = [];
    if (this.cplay || this.proxied) items.push({ icon: 'chevR', action: () => this.send({ type: 'back' }) });
    items.push({ icon: 'reload', action: () => this.reload() });
    if (this.yt) items.push(
      { icon: () => this.ytState.playing ? 'pause' : 'play', action: () => this.ytToggle() },
      { icon: () => this.ytState.muted ? 'mute' : 'sound', action: () => this.ytMute(!this.ytState.muted) },
    );
    items.push({ icon: 'minus', action: () => this.scaleBy(1 / 1.15) }, { icon: 'plus', action: () => this.scaleBy(1.15) });
    this.toolbar = new Toolbar(items).install();
    this.group.add(this.toolbar.mesh);
    if (this.cplay) this.makeTabs(); else this.makeAddress();
    this.makeScrollStrip();
    this.vel = 0;
    this.layout();
    this.css = [0, 1].map(i => this.makeCss(i));
    mgr.app.renderer.cssCount++;
    this.loadEyes();
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
  // Switch between Madar's browser (clickable from the headset) and opening the site directly.
  setDirect(on) {
    if (this.cplay || this.yt) return;
    this.direct = on; this.proxied = !on;
    let hk = ''; try { hk = new URL(this.url).hostname.replace(/^www\./, ''); } catch {}
    const list = (settings.directHosts || []).filter(x => x !== hk);
    if (on && hk) list.push(hk);
    saveSettings({ directHosts: list });
    this.base = on ? (() => { try { return new URL(this.url).origin; } catch { return ''; } })() : BROWSE_ORIGIN;
    this.bridge = false; this.tabPanel?.redraw(); this.reload();
    this.mgr.app.toast(on ? 'فتح مباشر: يعمل اللمس فقط في وضع الهاتف' : 'متصفح مدار: النقر والتمرير بالمؤشر', 3000);
  }
  // Address bar like a browser: shows the site; pointing + click opens the keyboard to type another address.
  makeAddress() {
    this.tabPanel = new CanvasPanel(0.96, 0.075, (ctx, W, H, p) => {
      glass(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2);
      const hov = p.isHover('url');
      if (hov) { roundRect(ctx, 8, 8, W - 16, H - 16, (H - 16) / 2); ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill(); }
      const hg = p.isHover('mode');
      roundRect(ctx, W - H * 2.9, 8, H * 2.8, H - 16, (H - 16) / 2); ctx.fillStyle = hg ? 'rgba(255,255,255,0.3)' : this.proxied ? 'rgba(124,196,255,0.28)' : 'rgba(255,255,255,0.1)'; ctx.fill();
      text(ctx, this.proxied ? 'متصفح مدار' : 'مباشر', W - H * 1.5, H / 2 + 2, H * 0.3, { weight: 800 });
      text(ctx, this.url.replace(/^https?:\/\/(www\.)?/, ''), W / 2 - H * 0.6, H / 2 + 2, H * 0.36, { weight: 700, dir: 'ltr', maxWidth: W - H * 5.4, color: COLORS.text });
      icon(ctx, 'keyboard', H * 0.6, H / 2, H * 0.5, COLORS.dim);
      p.region(0, 0, W - H * 3, H, () => { blip('tap', settings.sounds); this.mgr.openKeyboard(this.url); }, 'url');
      p.region(W - H * 3, 0, H * 3, H, () => { blip('tap', settings.sounds); this.setDirect(this.proxied); }, 'mode');
    }, { pxPerM: 1500 });
    this.group.add(this.tabPanel.mesh);
  }
  layout() {
    super.layout();
    if (this.tabPanel) this.tabPanel.mesh.position.set(0, this.h / 2 + 0.065, 0.004);
    if (this.strip) this.strip.mesh.position.set(0.5 + 0.075, 0, 0.004);
  }
  // Scroll strip beside the window: arrows, page jumps, and a pinch-drag track (touch-screen style).
  makeScrollStrip() {
    const H = 0.5;
    this.strip = new CanvasPanel(0.1, H, (ctx, W, Hp, p) => {
      glass(ctx, 2, 2, W - 4, Hp - 4, (W - 4) / 2);
      const b = W * 0.9, cx = W / 2;
      const btn = (id, y, ic, act) => {
        if (p.isHover(id)) { ctx.beginPath(); ctx.arc(cx, y, b * 0.42, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill(); }
        ctx.save(); ctx.translate(cx, y); ctx.rotate(ic === 'up' || ic === 'top' ? -Math.PI / 2 : Math.PI / 2); icon(ctx, ic === 'top' || ic === 'end' ? 'fwd' : 'chevR', 0, 0, b * 0.42); ctx.restore();
        p.region(0, y - b / 2, W, b, () => { blip('tap', settings.sounds); act(); }, id);
      };
      btn('top', b * 0.6, 'top', () => this.scrollPage(-20));
      btn('up', b * 1.55, 'up', () => this.scrollPage(-0.85));
      btn('down', Hp - b * 1.55, 'down', () => this.scrollPage(0.85));
      btn('end', Hp - b * 0.6, 'end', () => this.scrollPage(20));
      const t0 = b * 2.2, t1 = Hp - b * 2.2, hov = p.isHover('track');
      roundRect(ctx, cx - 8, t0, 16, t1 - t0, 8); ctx.fillStyle = hov ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)'; ctx.fill();
      p.region(0, t0, W, t1 - t0, null, 'track');
    }, { pxPerM: 1500 });
    const it = this.strip.mesh.userData.interact;
    // Pinch-drag on the strip scrolls the page (like dragging a scroll bar).
    it.type = 'surface'; it.window = this;
    it.scroll = () => this.bridge;
    it.toPx = uv => [0, -(1 - uv.y) * 640 * 3];
    it.scrollBy = (dx, dy) => this.send({ type: 'scroll', dx: 0, dy: -dy, x: 512, y: 320 });
    this.group.add(this.strip.mesh);
  }
  scrollPage(f) {
    if (!this.bridge) { this.mgr.app.toast('التمرير يحتاج اتصال الصفحة — أعد تحميلها'); return; }
    this.send({ type: 'scroll', dx: 0, dy: f * 600, x: 512, y: 320 });
  }
  fling(v) { this.vel = v; }
  goBack() { if (this.bridge) this.send({ type: 'back' }); }
  send(msg) {
    if (!this.bridge || !this.css) return;
    msg.madar = 1;
    this.css.forEach(c => { try { c.f.contentWindow.postMessage(msg, this.base); } catch {} });
  }
  navTo(path) {
    this.path = path; this.tabPanel?.redraw();
    if (this.bridge) this.send({ type: 'nav', path });
    else { this.url = this.base + path; this.reload(); }
  }
  onContentClick(hit) {
    if (!this.bridge) {
      // Pages from other sites can't receive clicks from Madar's eye/hand pointer unless they include madar-bridge.js.
      const now = performance.now();
      if (!this.warned || now - this.warned > 8000) {
        this.warned = now;
        this.mgr.app.toast(this.cplay ? 'cplay3 لم يتصل بعد — أعد تحميل النافذة' : this.proxied ? 'الصفحة ما زالت تتحمّل…' : 'هذا الموقع لا يقبل النقر بالعين أو اليد — المسه مباشرة في وضع الهاتف/اللابتوب', 4500);
        this.mgr.app.log('نقر على موقع بلا جسر: ' + this.url);
      }
      return false;
    }
    if (!hit || !hit.uv) return false;
    const [x, y] = this.content.userData.interact.toPx(hit.uv);
    this.send({ type: 'tap', x, y });
    blip('tap', settings.sounds);
    return true;
  }
  src(eye) {
    if (this.proxied) return BROWSE_ORIGIN + '/api/madar-browse?url=' + encodeURIComponent(this.url);
    if (this.yt) {
      const p = new URLSearchParams({ playsinline: '1', autoplay: '1', mute: '1', enablejsapi: '1', rel: '0', modestbranding: '1', origin: location.origin, controls: '1' });
      return `https://www.youtube.com/embed/${this.yt}?${p}`;
    }
    return this.url;
  }
  makeCss(eye) {
    // Plain 2D-positioned iframe per eye (3D CSS transforms are unreliable on iOS Safari).
    const el = document.createElement('div');
    el.className = 'webwin';
    const f = document.createElement('iframe');
    // The page can tell which copy it is (madar-bridge.js: the right-eye copy stays silent and light).
    f.name = 'madar-eye-' + eye;
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    // No allow-top-navigation: a site that tries to break out of frames can no longer replace Madar.
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-presentation');
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.addEventListener('load', () => this.onFrameLoad(eye, f));
    el.appendChild(f);
    this.mgr.app.renderer.cssHolders[eye].appendChild(el);
    return { el, f };
  }
  // Called after each render with the current eye cameras: place both iframes over the window.
  placeCss() {
    const r = this.mgr.app.renderer, m = this.content.matrixWorld, h = this.h, k = WEB_INFLATE;
    const head = this.mgr.app.headForward, toWin = this.group.getWorldPosition(new THREE.Vector3()).normalize();
    const vis = head.dot(toWin) > 0.2;
    const corners = vis ? [[-0.5, h / 2], [0.5, h / 2], [-0.5, -h / 2], [0.5, -h / 2]].map(([x, y]) => new THREE.Vector3(x * k, y * k, 0).applyMatrix4(m)) : null;
    this.css.forEach((c, i) => {
      const P = corners && corners.map(v => r.eyePx(i, v));
      if (!P || P.some(q => !q)) { if (c.el.style.display !== 'none') c.el.style.display = 'none'; c.key = ''; return; }
      if (c.el.style.display) c.el.style.display = '';
      // Skip sub-pixel changes: re-applying transforms makes Safari repaint the page.
      const key = P.map(q => q[0].toFixed(0) + ',' + q[1].toFixed(0)).join(';');
      if (key === c.key) return;
      c.key = key;
      c.el.style.transform = homography(1024, 640, P);
    });
  }
  // The two copies of the page load one after the other (not together), and a new site waits a moment
  // after the previous one closed, so the iPhone never holds three heavy pages at once.
  loadEyes() {
    clearTimeout(this.eyeTimer);
    this.css[1].pending = true;
    const wait = Math.max(0, (this.mgr.webClosedAt || 0) + 900 - performance.now());
    this.eyeTimer = setTimeout(() => {
      if (this.disposed) return;
      this.css[0].f.src = this.src(0);
      this.eyeTimer = setTimeout(() => this.loadEye1(), 7000);
    }, wait);
  }
  loadEye1() {
    const c = this.css[1];
    if (this.disposed || !c.pending) return;
    c.pending = false; clearTimeout(this.eyeTimer);
    c.f.src = this.src(1);
  }
  onFrameLoad(eye, f) {
    const at = f.getAttribute('src');
    if (!at || at === 'about:blank' || this.disposed) return;
    if (eye === 0) { this.mgr.app.log('اكتمل تحميل الصفحة'); if (this.css[1].pending) { clearTimeout(this.eyeTimer); this.eyeTimer = setTimeout(() => this.loadEye1(), 1200); } }
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
      if (e.data.type === 'ready' && !this.bridge) { this.bridge = true; this.mgr.app.log('cplay3: التحكم باليد متصل'); this.mgr.app.toast('التحكم باليد جاهز: اقرص للنقر واسحب للتمرير'); }
      if (e.data.path && this.css[0].f.contentWindow === e.source) { this.path = e.data.path; this.tabPanel?.redraw(); }
      if (e.data.url && this.proxied && this.css[0].f.contentWindow === e.source && e.data.url !== this.url) { this.url = e.data.url; this.tabPanel?.redraw(); this.mgr.changed(); }
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
  reload() { this.css.forEach(c => { c.f.src = 'about:blank'; }); this.loadEyes(); }
  update(dt, now) {
    this.content.updateMatrixWorld();
    // Momentum after a flick, like iOS scrolling.
    if (Math.abs(this.vel) > 20) {
      const at = this.lastAt || [512, 320];
      this.send({ type: 'scroll', dx: 0, dy: this.vel * dt, x: at[0], y: at[1] });
      this.vel *= Math.pow(0.04, dt);
    } else this.vel = 0;
    if (this.yt && now - this.lastSync > 2000) {
      this.lastSync = now;
      const [a, b] = this.ytState.times;
      if (a > 1 && Math.abs(a - b) > 0.35) this.cmd(1, 'seekTo', [a + 0.15, true]);
      this.toolbar.redraw();
    }
  }
  ref() { return { url: this.url, title: this.title }; }
  dispose() {
    this.disposed = true; clearTimeout(this.eyeTimer);
    this.mgr.webClosedAt = performance.now();
    super.dispose();
    this.tabPanel?.dispose(); this.strip?.dispose();
    window.removeEventListener('message', this.onMsg);
    this.css.forEach(c => { c.f.src = 'about:blank'; c.el.remove(); });
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
    this.rot = 0;   // model yaw in the room
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
      { icon: 'target', action: () => this.mgr.app.controls.toggleOrbit(this), active: () => this.mgr.app.controls.orbit?.win === this },
      { icon: 'reset', action: () => { this.rot = 0; this.group.scale.setScalar(1); this.mgr.changed(); } },
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
  rotateBy(a) { this.rot += a; }
  onDragEnd() {}
  update(dt) {
    if (this.loader.parent) this.loader.rotation.z -= dt * 5;
    if (this.spin) this.rot += dt * 0.6;
    this.mixer?.update(dt);
    // Keep the toolbar facing the viewer.
    // Only the toolbar turns to you; the model keeps its own orientation in the room, so walking
    // or orbiting around it shows its other sides.
    const wp = this.group.getWorldPosition(new THREE.Vector3());
    this.group.rotation.y = Math.atan2(-wp.x, -wp.z);
    this.pivot.rotation.y = this.rot - this.group.rotation.y;
    this.shadow.rotation.z = 0;
  }
  serialize() {
    const g = this.group;
    return { kind: 'model', ref: this.itemId ? { item: this.itemId } : { url: this.url }, p: g.position.toArray().map(v => +v.toFixed(3)), s: +g.scale.x.toFixed(3), r: +this.rot.toFixed(3), spin: this.spin };
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
  forwardYaw() { const f = this.app.headForward; return Math.atan2(-f.x, -f.z); }
  // Place a group in front of the viewer, avoiding overlap with existing windows.
  place(group, dist, y = 0, avoid = true) {
    // New windows open exactly where you are looking (also up/down), a little closer than any window already there.
    const yaw = this.forwardYaw(), f = this.app.headForward;
    const pitchY = THREE.MathUtils.clamp(f.y / Math.max(0.2, Math.hypot(f.x, f.z)), -1, 1) * dist;
    const h = this.headLocal();
    if (avoid) for (const w of this.windows) {
      const p = w.group.position.clone().sub(h), wa = Math.atan2(-p.x, -p.z);
      if (Math.abs(Math.atan2(Math.sin(wa - yaw), Math.cos(wa - yaw))) < 0.3 && Math.hypot(p.x, p.z) <= dist + 0.1) dist = Math.max(0.6, Math.hypot(p.x, p.z) - 0.3);
    }
    y += pitchY;
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
  openKeyboard(text = '') {
    let kb = this.windows.find(w => w.kind === 'keyboard');
    if (!kb) kb = this.open({ kind: 'keyboard' });
    if (text) { kb.text = text; kb.panel.redraw(); }
    return kb;
  }
  // After the camera restarts (iOS pauses other media when it does), start the videos again.
  resumeMedia() { this.windows.forEach(w => w.resume?.()); }
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
    if (k === 'keyboard') { const old = this.windows.find(w => w.kind === 'keyboard'); if (old) this.close(old); return this.add(new KeyboardWindow(this), { dist: 0.9, y: -0.2, scale: 1 }); }
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
        if (spec.url) spec.url = spec.url.replace(/cplay2\.(netlify|vercel)\.app/, 'cplay3.netlify.app');
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
        if (s.kind === 'model') { win.rot = s.r || 0; win.spin = !!s.spin; }
        else if (s.c) { win.curved = true; win.updateRadius(); win.layout(); }
        this.root.add(win.group);
        this.windows.push(win);
      } catch (e) { console.warn('restore failed', e); }
    }
    this.refreshTargets();
  }
  update(dt, now) {
    for (const w of this.windows) {
      w.update(dt, now);
      // Pinned to the view: the window glides to stay straight ahead at the same distance.
      if (w.headLock && w.kind !== 'model') {
        const g = w.group, h = this.headLocal(), d = Math.max(0.8, g.position.distanceTo(h));
        const t = this._pinT || (this._pinT = new THREE.Object3D());
        this.root.add(t); this.place(t, d, 0, false); this.root.remove(t);
        g.position.lerp(t.position, Math.min(1, dt * 6)); g.quaternion.slerp(t.quaternion, Math.min(1, dt * 6));
      }
    }
  }
}

// ---------- Virtual keyboard with an address bar ----------
const KB = {
  en: ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
  ar: ['1234567890', 'ضصثقفغعهخحج', 'شسيبلاتنمكط', 'ئءؤرىةوزظد'],
};
export class KeyboardWindow {
  constructor(mgr) {
    this.mgr = mgr; this.kind = 'keyboard'; this.id = ++winId;
    this.text = ''; this.lang = 'en';
    this.group = new THREE.Group(); this.group.userData.window = this;
    this.panel = new CanvasPanel(0.62, 0.3, (ctx, W, H, p) => this.draw(ctx, W, H, p), { pxPerM: 2400 });
    this.panel.mesh.userData.interact.window = this;
    this.group.add(this.panel.mesh);
    const { mesh: bar, hit } = makeBar(0.14, 0.016);
    hit.userData.interact = { type: 'drag', window: this, hover: on => { bar.userData.drawHover(on); return true; } };
    bar.position.set(0, -0.172, 0.002); this.group.add(bar); this.bar = bar;
    this.closeBtn = new IconButton('close', 0.034, () => this.mgr.close(this));
    this.closeBtn.mesh.position.set(-0.1, -0.172, 0.004); this.group.add(this.closeBtn.mesh);
  }
  key(ch) { this.text += ch; this.panel.redraw(); }
  url() {
    let t = this.text.trim(); if (!t) return '';
    if (!/^https?:\/\//i.test(t)) t = 'https://' + t.replace(/^\/+/, '');
    return t;
  }
  draw(ctx, W, H, p) {
    glass(ctx, 0, 0, W, H, 46);
    // Text field
    const fh = H * 0.15;
    roundRect(ctx, 24, 18, W - 48, fh, fh / 2); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    const shown = this.text || 'اكتب رابطاً أو نصاً…';
    text(ctx, shown + (this.text ? '|' : ''), W - 50, 18 + fh / 2 + 2, fh * 0.48, { align: 'right', dir: 'auto', weight: 700, color: this.text ? COLORS.text : COLORS.dim, maxWidth: W - 100 });
    const rows = KB[this.lang], top = 18 + fh + 16, rh = (H - top - 18) / 5.2;
    const keyBtn = (x, y, w, h, label, action, id, accent) => {
      const hov = p.isHover(id);
      roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 14);
      ctx.fillStyle = hov ? 'rgba(255,255,255,0.4)' : accent ? 'rgba(124,196,255,0.28)' : 'rgba(255,255,255,0.1)'; ctx.fill();
      text(ctx, label, x + w / 2, y + h / 2 + 2, Math.min(h * 0.45, 44), { weight: 800, dir: 'auto' });
      p.region(x, y, w, h, () => { blip('tap', settings.sounds); action(); }, id);
    };
    rows.forEach((r, ri) => {
      const n = r.length, kw = (W - 48) / Math.max(n, 10), x0 = (W - kw * n) / 2;
      [...r].forEach((ch, i) => {
        const x = this.lang === 'ar' ? x0 + (n - 1 - i) * kw : x0 + i * kw;
        keyBtn(x, top + ri * rh, kw, rh, ch, () => this.key(ch), 'k' + ri + '-' + i);
      });
    });
    // Bottom row
    const y = top + 4 * rh, bh = rh * 1.15;
    const items = [
      [this.lang === 'en' ? 'ع' : 'EN', 0.8, () => { this.lang = this.lang === 'en' ? 'ar' : 'en'; this.panel.redraw(); }],
      ['.', 0.6, () => this.key('.')], ['/', 0.6, () => this.key('/')], ['.com', 1, () => this.key('.com')],
      ['مسافة', 2, () => this.key(' ')], ['⌫', 0.9, () => { this.text = this.text.slice(0, -1); this.panel.redraw(); }],
      ['حفظ', 1, () => this.save(), true], ['إرسال', 1.1, () => this.sendToPage(), true], ['فتح', 1.1, () => this.open(), true],
    ];
    const total = items.reduce((s, it) => s + it[1], 0), unit = (W - 48) / total;
    let x = 24;
    items.forEach(([l, w, a, acc], i) => { keyBtn(x, y, unit * w, bh, l, a, 'b' + i, acc); x += unit * w; });
  }
  open() {
    if (/^\d{6}$/.test(this.text.trim())) { this.mgr.app.connectMirror(this.text.trim()); return; }   // laptop screen code
    const u = this.url(); if (!u) return;
    this.mgr.open({ kind: 'web', url: u, title: u.replace(/^https?:\/\//, '').slice(0, 40) });
  }
  save() {
    const u = this.url(); if (!u) return;
    const l = loadLinks(); if (!l.some(x => x.url === u)) { l.unshift({ id: 'l' + Date.now(), title: u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40), url: u }); saveLinks(l); }
    this.mgr.app.toast('حُفظ الرابط في مواقعك');
  }
  // Types the text into the focused field of the open page (cplay2 with the bridge).
  sendToPage() {
    const m = [...this.mgr.windows].reverse().find(x => x.remote && x.control);
    if (m) { m.typeText(this.text); this.mgr.app.toast('أُرسل النص إلى الجهاز'); this.text = ''; this.panel.redraw(); return; }
    const w = [...this.mgr.windows].reverse().find(x => x.kind === 'web' && x.bridge);
    if (!w) { this.mgr.app.toast('لا توجد صفحة متصلة تقبل الكتابة'); return; }
    w.send({ type: 'text', value: this.text });
    this.mgr.app.toast('أُرسل النص إلى الصفحة');
  }
  scaleBy(f) { this.group.scale.setScalar(THREE.MathUtils.clamp(this.group.scale.x * f, 0.4, 3)); }
  onDragEnd() {}
  update() {}
  serialize() { return { ref: null }; }
  dispose() { this.panel.dispose(); this.closeBtn.dispose(); this.bar.material.map?.dispose(); }
}
