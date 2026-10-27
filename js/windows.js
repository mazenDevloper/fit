// Spatial windows (video, image, web, info panels) and 3D model volumes, plus the manager that places and saves them.
import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { CanvasPanel, IconButton, makeBar, glass, text, icon, roundRect, roundedRectGeometry, radialTexture, COLORS, FONT, TEXT_SCALE, canvasTexture, blip, audioContext } from './ui.js';
import { loadModelFromFiles, loadModelFromUrl, normalize } from './models.js';
import { getItem, importFiles } from './db.js';
import { settings, saveSettings, loadLinks, saveLinks } from './config.js';
import { CSS_K, EYE } from './render.js';
import { drawMatches , drawBoard } from './sports.js';
import { BalloonGame } from './games.js';
import { depthMap, cachedDepth, saveDepth, forgetDepth } from './depth.js';

const BROWSE_ORIGIN = 'https://drivecast.c-p.workers.dev';
const CONTENT_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CONTENT_FRAG = /* glsl */`
  uniform sampler2D map; uniform float uVideo; uniform float uHas; uniform vec2 uSize; uniform float uRadius; uniform float uDim; uniform float uHole;
  uniform vec4 uL; uniform vec4 uR; uniform float uEye;
  uniform vec4 uPic; uniform vec2 uTexel;   // picture: contrast, saturation, sharpness, green boost
  uniform float uCut;                        // 0 = opaque, 1 = the picture's own transparency, 2 = green screen keyed out
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
    vec2 tc = R.xy + vUv * R.zw;
    vec4 s4 = texture2D(map, tc);
    vec3 s = s4.rgb;
    float alpha = 1.0;
    if (uCut > 0.5) {
      if (uCut < 1.5) alpha = s4.a;
      else { float k = smoothstep(0.06, 0.22, s.g - max(s.r, s.b)); alpha = 1.0 - k; s.g = min(s.g, max(s.r, s.b) + 0.04); }   // key out green, no green fringe
      if (alpha < 0.02) discard;
    }
    // a screen shown smaller than its own pixels (a tablet or laptop mirror): 4 rotated-grid samples over the
    // pixel's footprint instead of one, so thin text stays whole instead of breaking up and shimmering
    vec2 fw = fwidth(tc);
    if (uVideo > 0.5 && max(fw.x / uTexel.x, fw.y / uTexel.y) > 1.15) {
      vec2 a = vec2(0.375, 0.125) * fw, b = vec2(-0.125, 0.375) * fw;
      s = 0.25 * (texture2D(map, tc + a).rgb + texture2D(map, tc - a).rgb + texture2D(map, tc + b).rgb + texture2D(map, tc - b).rgb);
    }
    if (uPic.z > 0.01) {
      vec3 n = texture2D(map, tc + vec2(uTexel.x, 0.0)).rgb + texture2D(map, tc - vec2(uTexel.x, 0.0)).rgb
             + texture2D(map, tc + vec2(0.0, uTexel.y)).rgb + texture2D(map, tc - vec2(0.0, uTexel.y)).rgb;
      s = clamp(s + uPic.z * (s - n * 0.25), 0.0, 1.0);
    }
    vec3 c = uVideo > 0.5 ? dec(s) : s;
    if (uPic.x != 1.0 || uPic.y != 1.0 || uPic.w > 0.0) {
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uPic.y);                       // saturation
      c.g *= 1.0 + uPic.w * smoothstep(0.0, 0.15, c.g - max(c.r, c.b));   // grass greener (football)
      c = clamp((c - 0.18) * uPic.x + 0.18, 0.0, 1.0);   // contrast around mid-grey (linear)
    }
    c = mix(vec3(0.035, 0.04, 0.055), c, uHas) * uDim;
    gl_FragColor = vec4(c, alpha);
  }`;

function contentMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, uHole: { value: 0 }, uVideo: { value: 0 }, uHas: { value: 0 }, uCut: { value: 0 }, uSize: { value: new THREE.Vector2(1, 0.5625) }, uRadius: { value: 0.028 }, uDim: { value: 1 },
      uL: { value: new THREE.Vector4(0, 0, 1, 1) }, uR: { value: new THREE.Vector4(0, 0, 1, 1) }, uEye: EYE,
      uPic: { value: new THREE.Vector4(1, 1, 0, 0) }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) } },
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

// The volume of a video / audio element. Safari on iPhone ignores element.volume, so there it goes through a
// Web Audio gain (the element must be CORS-clean - Madar's videos are, they are drawn as textures).
let AC = null;
export function setElementVolume(el, v) {
  if (!el) return;
  try { el.volume = v; } catch {}
  if (Math.abs((el.volume ?? v) - v) < 0.01 && !el._gain) return;
  if (!el._gain && !el.crossOrigin && !/^(blob|data):/.test(el.currentSrc || el.src || '')) return;   // not CORS-clean: a gain would silence it
  try {
    if (!el._gain) {
      AC = AC || audioContext() || new (window.AudioContext || window.webkitAudioContext)();
      const src = AC.createMediaElementSource(el), g = AC.createGain(); src.connect(g).connect(AC.destination); el._gain = g;
    }
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    el._gain.gain.value = v; try { el.volume = 1; } catch {}
  } catch {}
}

// Spatial audio: the sound goes through a stereo panner so it comes from where its window is (extras.js moves it).
export function spatialize(el) {
  if (!el) return null;
  if (el._pan) return el._pan;
  if (el._noPan || el.srcObject || (!el.crossOrigin && !/^(blob|data):/.test(el.currentSrc || el.src || ''))) { el._noPan = true; return null; }
  try {
    AC = AC || audioContext() || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state !== 'running') { AC.resume?.().catch(() => {}); return null; }   // only once sound is allowed (after a tap)
    if (!AC.createStereoPanner) { el._noPan = true; return null; }
    const pan = AC.createStereoPanner();
    if (el._gain) { el._gain.disconnect(); el._gain.connect(pan).connect(AC.destination); }
    else {
      const src = AC.createMediaElementSource(el), g = AC.createGain();
      g.gain.value = el.volume ?? 1; src.connect(g).connect(pan).connect(AC.destination); el._gain = g;
    }
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    el._pan = pan; return pan;
  } catch { el._noPan = true; return null; }
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

let glowTex = null, glowCv = null, glowCtx = null;
// Websites that work like apps inside Madar: [name, url, letter, colour].
export const WEB_APPS = [
  ['يوتيوب', 'https://m.youtube.com/', 'Y', '#ff0033'], ['شاهد', 'https://shahid.mbc.net/ar', 'ش', '#14b8a6'],
  ['نتفليكس', 'https://www.netflix.com/', 'N', '#e50914'], ['سبوتيفاي', 'https://open.spotify.com/', 'S', '#1db954'],
  ['إكس', 'https://x.com/', 'X', '#111111'], ['إنستغرام', 'https://www.instagram.com/', 'I', '#d62976'],
  ['تيك توك', 'https://www.tiktok.com/', 'T', '#25f4ee'], ['خرائط', 'https://www.google.com/maps', 'M', '#4285f4'],
  ['Gmail', 'https://mail.google.com/', 'G', '#ea4335'], ['ChatGPT', 'https://chatgpt.com/', 'C', '#10a37f'],
  ['Claude', 'https://claude.ai/', 'C', '#d97757'], ['القرآن', 'https://quran.com/ar', 'ق', '#0f766e'],
  ['ويكيبيديا', 'https://ar.wikipedia.org/', 'W', '#555555'], ['تويتش', 'https://m.twitch.tv/', 'T', '#9146ff'], ['أخبار', 'https://news.google.com/?hl=ar', 'أ', '#1a73e8'],
];
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
    this.frame = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x7c818e, transparent: true, opacity: 0.4, depthWrite: false }));
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
    this.resizer = new THREE.Mesh(new THREE.CircleGeometry(0.05, 28), rm);
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.011), new THREE.MeshBasicMaterial({ color: 0x141824 }));
    arrow.rotation.z = -Math.PI / 4; arrow.position.z = 0.001; this.resizer.add(arrow);
    this.resizer.userData.interact = { type: 'resize', window: this, hover: on => { rm.opacity = on ? 0.9 : 0.38; return true; }, click: () => this.mgr.app.interaction.beginResizeMode(this) };
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
    this.frame.visible = !this.curved && (this.proj || 'flat') === 'flat' && !this.cut;
    const y = -h / 2 - 0.042;
    this.bar.position.set(0, y, 0.002);
    this.closeBtn.mesh.position.set(-0.155, y, 0.004);
    this.pinBtn.mesh.position.set(0.155, y, 0.004);
    this.resizer.position.set(0.5 + 0.035, -h / 2 - 0.035, 0.006);
    if (this.toolbar) this.toolbar.mesh.position.set(0, y - 0.075, 0.004);
    if (this.more) this.more.mesh.position.set(0, y - 0.075 - 0.06 - this.more.heightM / 2 - (this.opts?.mesh.parent ? 0.13 : 0), 0.004);
    if (this.glow) this.glow.scale.set(w * 1.7, h * 2.1, 1);
    if (this.matchSide) this.matchSide.mesh.position.set(w / 2 + 0.05 + 0.23 + (this.pic?.mesh.parent ? 0.36 : 0), 0, 0.004);
    if (this.modeSide) this.modeSide.mesh.position.set(-w / 2 - 0.05 - 0.17, 0, 0.004);
  }
  setAspect(a) { if (a && isFinite(a) && Math.abs(a - this.aspect) > 0.001) { this.aspect = a; this.layout(); } }
  // a small status pill above the top-right corner (e.g. the HDMI stream's delay)
  setBadge(textV, color = '#22c55e') {
    if (!textV) { if (this.badge) this.badge.mesh.visible = false; return; }
    if (!this.badge) {
      this.badgeTxt = ''; this.badgeCol = color;
      this.badge = new CanvasPanel(0.62, 0.055, (ctx, W, H) => {
        glass(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2);
        ctx.fillStyle = this.badgeCol; ctx.beginPath(); ctx.arc(H * 0.55, H / 2, H * 0.16, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(H * 0.46)}px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
        ctx.fillText(this.badgeTxt.replace(/^\S+\s/, ''), W - H * 0.4, H / 2 + 1);
      }, { pxPerM: 1400 });
      this.group.add(this.badge.mesh);
    }
    if (textV === this.badgeTxt && color === this.badgeCol) return;
    this.badgeTxt = textV; this.badgeCol = color; this.badge.mesh.visible = true;
    this.badge.mesh.position.set(0.5 - 0.31, this.h / 2 + 0.045, 0.004); this.badge.redraw();
  }
  // «بلا خلفية»: the picture's own transparency (PNG, video with alpha) or a green screen keyed out - no frame, no glass
  setCut(mode) {
    this.cut = mode || 0;
    const m = this.mat; m.uniforms.uCut.value = this.cut; m.transparent = this.cut > 0; m.depthWrite = this.cut === 0; m.needsUpdate = true;
    m.uniforms.uRadius.value = this.cut ? 0 : 0.028;
    this.layout();
    this.mgr.changed();
  }
  // Immersive 180°/360° video: a sphere around you, the window stays as the remote control.
  setProjection(p) {
    this.proj = p;
    if (this.sphere) { this.mgr.root.remove(this.sphere); this.sphere.geometry.dispose(); this.sphere.material.dispose(); this.sphere = null; }
    if (this.frame) this.frame.visible = p === 'flat';
    if (p === 'flat') { this.content.visible = true; this.mgr.refreshTargets?.(); return; }
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
    // Point and click on the picture all around you (shared screens, web pages).
    if (this.content.userData.interact.toPx) sp.userData.interact = this.content.userData.interact;
    this.mgr.refreshTargets?.();
    this.mgr.app.toast((this.kind === 'image' ? 'صورة' : this.kind === 'web' ? 'الصفحة' : 'فيديو') + (p === '180' ? ' 180°' : ' 360°') + ' حولك · النافذة للتحكم', 2500);
  }
  disposeSphere() { if (this.sphere) { this.mgr.root.remove(this.sphere); this.sphere.geometry.dispose(); this.sphere.material.dispose(); this.sphere = null; } }
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
  // ---------- «المزيد» (⋯): extra options under every window ----------
  moreItems() {
    const app = this.mgr.app, M = this.mgr;
    const dist = () => this.group.getWorldPosition(new THREE.Vector3()).length();
    return [
      ['السينما', M.cinema === this ? 'مفعّلة' : 'إيقاف', () => {
        M.cinema = M.cinema === this ? null : this;
        app.toast(M.cinema ? 'وضع السينما: الظلام حولك وهذه النافذة وحدها' : 'وضع السينما متوقف', 2200);
      }],
      ['إضاءة محيطة', this.glow ? 'مفعّلة' : 'إيقاف', () => this.setGlow(!this.glow)],
      ['المسافة', dist() < 1.5 ? 'قريبة' : dist() < 2.8 ? 'متوسطة' : 'بعيدة', () => {
        const d = dist(), n = d < 1.5 ? 2.2 : d < 2.8 ? 3.6 : 1.2;
        const k = n / Math.max(0.5, d);
        this.group.position.multiplyScalar(k);   // same direction, new distance
        this.group.scale.multiplyScalar(k);      // looks the same size: only depth changes
        this.updateRadius?.(); this.layout(); M.changed();
      }],
      ['مسرح ضخم', this.theater ? 'مفعّل' : 'إيقاف', () => this.setTheater(!this.theater)],
      ['فوق رأسك', this.overhead ? 'مفعّل' : 'إيقاف', () => this.setOverhead(!this.overhead)],
      ['أمام عينيك', this.headLock ? 'يتبعك' : 'ثابتة', () => { this.headLock = !this.headLock; if (this.headLock) this.pin = null; }],
      ['وضع المباريات', this.matchSide ? 'مفعّل' : 'إيقاف', () => this.setMatchMode(!this.matchSide)],
      ['لقطة', 'حفظ', () => this.snapshot()],
      ['على الجدار', this.wallLock ? 'مثبّتة · إلغاء' : (app.room?.tv() || app.room?.wallAhead?.()) ? 'ثبّت هنا' : 'ثبّت', () => this.toggleWall()],
      ['في هذه البيئة', this.envPin ? 'مثبّتة' : 'إيقاف', () => M.pinToEnv(this, !this.envPin)],
      ['بلا خلفية', ['إيقاف', 'شفافية', 'شاشة خضراء'][this.cut || 0], () => this.setCut(((this.cut || 0) + 1) % 3)],
      ...(app.hub?.canSend(this) ? [['أرسل إلى', app.hub.targetName(), () => app.hub.sendWindow(this)]] : []),
    ];
  }
  // «وضع المباريات» (like Football AI on sports TVs): today's matches docked on the right, picture modes and
  // controls docked on the left. The page / video stays in the middle.
  setMatchMode(on) {
    const M = this.mgr;
    if (!on) {
      for (const k of ['matchSide', 'modeSide']) if (this[k]) { this.group.remove(this[k].mesh); this[k].dispose?.(); this[k] = null; }
      this.layout(); M.refreshTargets(); return;
    }
    const H = Math.max(0.45, this.h);
    this.matchSide = new CanvasPanel(0.46, H, (ctx, W, Hh) => { drawMatches(ctx, W, Hh, M.app.sports); }, { pxPerM: 1400 });
    this.modeSide = new CanvasPanel(0.34, H, (ctx, W, Hh, p) => {
      glass(ctx, 2, 2, W - 4, Hh - 4, 34);
      text(ctx, 'وضع المباريات', W / 2, 44, 30, { weight: 800 });
      const pic = picture(), items = [
        ...Object.keys(PIC_PRESETS).map(k => [PIC_PRESETS[k][0], pic.preset === k, () => { saveSettings({ picture: Object.assign(picture(), { ...PIC_PRESETS[k][1], preset: k }) }); M.applyPicture(); }]),
        ['تركيز (بلا نقر بالنظر)', !!this.gazeOff, () => { this.gazeOff = !this.gazeOff; this.toolbar?.redraw(); }],
        ['السينما', M.cinema === this, () => { M.cinema = M.cinema === this ? null : this; }],
        ['إضاءة محيطة', !!this.glow, () => this.setGlow(!this.glow)],
        ['إيقاف / تشغيل', false, () => this.mediaToggle?.()],
      ];
      const top = 84, rh = Math.min(70, (Hh - top - 16) / items.length);
      items.forEach(([l, on, act], i) => {
        const y = top + i * rh, id = 'mm' + i, hov = p.isHover(id);
        roundRect(ctx, 14, y + 4, W - 28, rh - 8, (rh - 8) / 2);
        ctx.fillStyle = on ? 'rgba(52,211,153,0.85)' : hov ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'; ctx.fill();
        text(ctx, l, W / 2, y + rh / 2 + 1, Math.min(24, rh * 0.36), { weight: 800, color: on ? '#04140d' : COLORS.text, maxWidth: W - 40, fit: true });
        p.region(14, y, W - 28, rh, () => { blip('tap', settings.sounds); act(); this.modeSide?.redraw(); }, id);
      });
    }, { pxPerM: 1400 });
    this.matchSide.mesh.userData.interact = null;
    this.group.add(this.matchSide.mesh, this.modeSide.mesh);
    this.layout(); this.matchSide.redraw(); this.modeSide.redraw(); M.refreshTargets();
    M.app.sports?.refresh?.(true);
  }
  matchTick() {
    if (this.matchSide && this.matchDrawn !== this.mgr.app.sports?.version) { this.matchDrawn = this.mgr.app.sports?.version; this.matchSide.redraw(); }
  }
  // Pin to the wall (visionOS 26): on the real wall / TV you look at when the room is known, otherwise upright
  // right where it is. A pinned window can't be dragged by mistake, stays out of «ترتيب» and is remembered.
  toggleWall() {
    const app = this.mgr.app;
    if (this.wallLock) { this.wallLock = false; this.mgr.changed(); app.toast('أُلغي التثبيت — يمكنك تحريكها', 2000); return; }
    if (app.room?.tv() || app.room?.wallAhead?.()) this.onTv();
    else { const g = this.group; g.lookAt(new THREE.Vector3(0, g.position.y, 0)); this.updateRadius?.(); this.layout(); }
    this.wallLock = true; this.mgr.changed();
    app.toast('📌 مثبّتة على الجدار', 2000);
  }
  // Put this window exactly over your real TV (found by «مسح الغرفة»).
  onTv() {
    const app = this.mgr.app, tv = app.room?.tv() || app.room?.wallAhead?.();
    if (!tv) { app.room?.scan(); return; }
    const g = this.group, root = this.mgr.root;
    root.updateMatrixWorld();
    const world = root.localToWorld(tv.pos.clone());
    world.multiplyScalar(Math.max(0.3, (world.length() - 0.06)) / world.length());   // just in front of the screen
    g.position.copy(root.worldToLocal(world.clone()));
    g.lookAt(new THREE.Vector3(0, world.y, 0));
    g.scale.setScalar(Math.max(0.4, tv.width));
    this.headLock = false; this.pin = null; this.updateRadius?.(); this.layout(); this.mgr.changed();
    app.toast(tv.key === 'wall' ? '🧱 النافذة الآن على الجدار' : '📺 النافذة الآن فوق تلفازك', 2200);
  }
  toggleMore() {
    if (!this.more) {
      this.more = new CanvasPanel(1.0, 0.2, (ctx, W, H, p) => {
        glass(ctx, 2, 2, W - 4, H - 4, 36);
        const items = this.moreItems(), cols = Math.ceil(items.length / 2), cw = (W - 20) / cols, rh = (H - 12) / 2;
        items.forEach(([l, val, act], i) => {
          const r = Math.floor(i / cols), c = i % cols;
          const x = W - 10 - (c + 1) * cw, y = 6 + r * rh, id = 'm' + i, hov = p.isHover(id);
          const on = /مفعّل|يتبعك/.test(val);
          if (hov || on) { roundRect(ctx, x + 5, y + 5, cw - 10, rh - 10, 22); ctx.fillStyle = hov ? 'rgba(255,255,255,0.22)' : 'rgba(124,196,255,0.22)'; ctx.fill(); }
          text(ctx, l, x + cw / 2, y + rh * 0.36, rh * 0.22, { color: COLORS.dim, weight: 600, maxWidth: cw - 14 });
          text(ctx, val, x + cw / 2, y + rh * 0.7, rh * 0.26, { weight: 800, dir: 'auto', maxWidth: cw - 14 });
          p.region(x, y, cw, rh, () => { blip('tap', settings.sounds); act(); this.more.redraw(); this.toolbar?.redraw(); }, id);
        });
      }, { pxPerM: 1400 });
    }
    const m = this.more.mesh;
    if (m.parent) this.group.remove(m); else this.group.add(m);
    this.layout(); this.more.redraw(); this.mgr.refreshTargets();
  }
  // Ambient light: the window's colours glow softly around it (like Ambilight TVs).
  setGlow(on) {
    if (!on) { if (this.glow) { this.group.remove(this.glow); this.glow.material.dispose(); this.glow = null; } return; }
    if (!glowTex) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128); glowTex = new THREE.CanvasTexture(c);
    }
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x6688cc, opacity: 0.75 }));
    this.glow.position.z = -0.03; this.glow.renderOrder = -2;
    this.group.add(this.glow); this.layout();
    this.glowAt = 0;
  }
  // The picture this window shows right now (video, page picture, photo).
  pictureSource() {
    const m = this.mat.uniforms.map.value;
    const src = m && m.image;
    if (!src) return null;
    if (src.tagName === 'VIDEO' && src.readyState < 2) return null;
    return src;
  }
  updateGlow(now) {
    if (!this.glow || now - (this.glowAt || 0) < 180) return;
    this.glowAt = now;
    const src = this.pictureSource(); if (!src) return;
    if (!glowCv) { glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 4; glowCtx = glowCv.getContext('2d', { willReadFrequently: true }); }
    try {
      glowCtx.drawImage(src, 0, 0, 4, 4);
      const d = glowCtx.getImageData(0, 0, 4, 4).data; let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4, col = new THREE.Color(r / n / 255, g / n / 255, b / n / 255);
      // Richer, never grey: push saturation a little.
      const hsl = {}; col.getHSL(hsl); col.setHSL(hsl.h, Math.min(1, hsl.s * 1.4 + 0.1), Math.max(0.25, Math.min(0.6, hsl.l)));
      this.glow.material.color.lerp(col, 0.35);
    } catch { /* picture from another site can't be read */ }
  }
  // A giant screen far away, like sitting in a cinema hall.
  setTheater(on) {
    const g = this.group;
    if (on) {
      this.theater = { p: g.position.clone(), q: g.quaternion.clone(), s: g.scale.x };
      this.mgr.place(g, 5, 0.4, false);
      g.scale.setScalar(Math.max(4.5, g.scale.x * 4));
      this.mgr.app.toast('مسرح ضخم: شاشة عرضها نحو ٥ أمتار على بعد ٥ أمتار', 2500);
    } else if (this.theater) {
      g.position.copy(this.theater.p); g.quaternion.copy(this.theater.q); g.scale.setScalar(this.theater.s); this.theater = null;
    }
    this.headLock = false; this.updateRadius?.(); this.layout(); this.mgr.changed();
  }
  // Watching lying down: the window above you, facing down.
  setOverhead(on) {
    const g = this.group, M = this.mgr;
    if (on) {
      this.overhead = { p: g.position.clone(), q: g.quaternion.clone() };
      M.root.updateMatrixWorld();
      const f = M.app.headForward.clone(); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
      const world = new THREE.Vector3(0, 1.9, 0).addScaledVector(f, 0.35);
      g.position.copy(M.root.worldToLocal(world.clone()));
      g.lookAt(new THREE.Vector3(0, 0, 0));
      this.mgr.app.toast('النافذة فوق رأسك — استلقِ وانظر للأعلى', 2500);
    } else if (this.overhead) { g.position.copy(this.overhead.p); g.quaternion.copy(this.overhead.q); this.overhead = null; }
    this.headLock = false; this.updateRadius?.(); this.layout(); M.changed();
  }
  // Save what the window shows as a photo in the library.
  async snapshot() {
    const src = this.pictureSource();
    if (!src) { this.mgr.app.toast('لا توجد صورة لحفظها بعد'); return; }
    try {
      const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(src, 0, 0, w, h);
      const blob = await new Promise((res, rej) => { try { c.toBlob(b => b ? res(b) : rej(new Error('')), 'image/jpeg', 0.92); } catch (e) { rej(e); } });
      const d = new Date(), name = 'لقطة ' + d.toLocaleDateString('ar') + ' ' + d.toTimeString().slice(0, 5).replace(':', '-') + '.jpg';
      await importFiles([new File([blob], name, { type: 'image/jpeg' })]);
      blip('tap', settings.sounds);
      this.mgr.app.toast('📸 حُفظت اللقطة في المكتبة', 2200);
      this.mgr.app.renderLibrary?.(); this.mgr.app.launcher?.refresh?.();
    } catch { this.mgr.app.toast('هذا المحتوى لا يسمح بالتقاط صورة منه', 3000); }
  }
  // ---- sound: one easy control for each window (tap the speaker: − / slider / + / mute; or say «ارفع الصوت»)
  isMuted() { return !!this.mute; }
  setVolume(v, mute = this.isMuted()) {
    this.vol = Math.round(THREE.MathUtils.clamp(v, 0, 1) * 100) / 100; this.mute = !!mute;
    this.applyVolume?.(); this.volPop?.redraw(); this.toolbar?.redraw(); this.mgr.changed();
  }
  volIcon() { return this.isMuted() || this.vol === 0 ? 'mute' : 'sound'; }
  stepVolume(d) { this.setVolume((this.vol ?? 1) + d, false); this.mgr.app.toast((this.vol > 0 ? '🔊 ' : '🔇 ') + Math.round(this.vol * 100) + '%', 1200); }
  toggleVolume() {
    if (this.volPop?.mesh.parent) { this.group.remove(this.volPop.mesh); this.mgr.refreshTargets?.(); return; }
    if (this.vol == null) this.vol = 1;
    if (!this.volPop) this.volPop = new CanvasPanel(0.62, 0.1, (ctx, W, H, p) => {
      glass(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2); ctx.fillStyle = 'rgba(14,18,28,0.55)'; roundRect(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2); ctx.fill();
      const muted = this.isMuted(), v = muted ? 0 : (this.vol ?? 1), b = H * 0.8;
      const btn = (id, ic, cx, act) => { const hv = p.isHover(id); ctx.beginPath(); ctx.arc(cx, H / 2, b / 2, 0, 7); ctx.fillStyle = hv ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'; ctx.fill(); icon(ctx, ic, cx, H / 2, b * 0.55); p.region(cx - b / 2, 0, b, H, () => { blip('tap', settings.sounds); act(); this.pokeVolume(); }, id); };
      btn('mu', muted ? 'mute' : 'sound', H * 0.6, () => this.setVolume(this.vol || 0.6, !muted));
      btn('dn', 'minus', H * 1.55, () => this.setVolume((this.vol ?? 1) - 0.1, false));
      btn('up', 'plus', W - H * 0.6, () => this.setVolume((this.vol ?? 1) + 0.1, false));
      const x0 = H * 2.2, x1 = W - H * 1.95, y = H / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; roundRect(ctx, x0, y - 7, x1 - x0, 14, 7); ctx.fill();
      ctx.fillStyle = muted ? 'rgba(255,255,255,0.35)' : '#7cc4ff'; roundRect(ctx, x0, y - 7, Math.max(14, (x1 - x0) * v), 14, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * v, y, p.isHover('bar') ? 20 : 16, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      text(ctx, Math.round(v * 100) + '%', x1 + H * 0.5, y, H * 0.3, { dir: 'ltr', weight: 800 });
      p.region(x0 - 16, 0, x1 - x0 + 32, H, lx => { this.setVolume((lx - 16) / (x1 - x0), false); this.pokeVolume(); }, 'bar');
    }, { pxPerM: 1500 });
    const tb = this.toolbar?.mesh.position || new THREE.Vector3(0, -this.h / 2 - 0.12, 0.004);
    this.volPop.mesh.position.set(Math.min(0.3, (this.toolbar?.width || 1) / 2 - 0.31), tb.y + 0.15, 0.03);
    this.volPop.redraw(); this.group.add(this.volPop.mesh); this.mgr.refreshTargets?.(); this.pokeVolume();
  }
  pokeVolume() { clearTimeout(this.volT); this.volT = setTimeout(() => { if (this.volPop?.mesh.parent) { this.group.remove(this.volPop.mesh); this.mgr.refreshTargets?.(); } }, 6000); }
  update() {}
  ref() { return null; }
  serialize() {
    const g = this.group;
    return { vol: this.vol != null && this.vol !== 1 ? this.vol : undefined, kind: this.kind, ref: this.ref(), p: g.position.toArray().map(v => +v.toFixed(3)), q: g.quaternion.toArray().map(v => +v.toFixed(4)), s: +g.scale.x.toFixed(3), c: this.curved, wl: this.wallLock || undefined, ek: this.envPin || undefined, cut: this.cut || undefined };
  }
  dispose() {
    if (this.mgr.cinema === this) this.mgr.cinema = null;
    this.more?.dispose(); this.setGlow(false);
    this.content.geometry.dispose(); this.mat.dispose(); this.frame.geometry.dispose(); this.frame.material.dispose();
    this.bar.material.map?.dispose(); this.closeBtn.dispose(); this.pinBtn?.dispose(); this.toolbar?.dispose(); this.volPop?.dispose(); clearTimeout(this.volT);
  }
}

// Picture controls beside a video or shared screen: quality, sharpness, brightness, contrast, colour, presets.
const PIC_PRESETS = {
  normal: ['عادي', { bright: 1.05, contrast: 1, sat: 1, sharp: 0, green: 0 }],
  football: ['كرة القدم AI', { bright: 1.12, contrast: 1.12, sat: 1.25, sharp: 0.7, green: 0.28 }],
  cinema: ['سينما', { bright: 0.97, contrast: 1.1, sat: 1.05, sharp: 0.25, green: 0 }],
  vivid: ['حيوي', { bright: 1.15, contrast: 1.15, sat: 1.35, sharp: 0.45, green: 0 }],
};
const QUALITY = [['game', 'ألعاب'], ['medium', 'متوسطة'], ['high', 'عالية'], ['max', 'قصوى']];
function picture() { return Object.assign({ preset: 'normal', quality: 'high' }, PIC_PRESETS.normal[1], settings.picture || {}); }
class PicturePanel {
  constructor(win) {
    this.win = win;
    const rows = [
      ['bright', 'السطوع', 0.05, 0.5, 1.8, v => Math.round(v * 100) + '%'],
      ['contrast', 'التباين', 0.05, 0.6, 1.6, v => Math.round(v * 100) + '%'],
      ['sat', 'الألوان', 0.05, 0, 2, v => Math.round(v * 100) + '%'],
      ['sharp', 'الحدة', 0.1, 0, 1.5, v => v.toFixed(1)],
    ];
    this.panel = new CanvasPanel(0.34, 0.62, (ctx, W, H, p) => {
      const pic = picture();
      glass(ctx, 2, 2, W - 4, H - 4, 34);
      let y = 46;
      text(ctx, 'الصورة', W / 2, y, 30, { weight: 800 }); y += 46;
      // Quality (shared screens only)
      if (win.remote) {
        text(ctx, 'جودة البث', W / 2, y, 22, { color: COLORS.dim, weight: 600 }); y += 34;
        const qw = (W - 30) / QUALITY.length;
        QUALITY.forEach(([k, l], i) => {
          const x = W - 15 - (i + 1) * qw, on = pic.quality === k, id = 'q' + k, hov = p.isHover(id);
          roundRect(ctx, x + 3, y - 22, qw - 6, 44, 22); ctx.fillStyle = on ? 'rgba(255,255,255,0.9)' : hov ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'; ctx.fill();
          text(ctx, l, x + qw / 2, y + 1, 19, { weight: 800, color: on ? '#141824' : COLORS.text });
          p.region(x, y - 24, qw, 48, () => { blip('tap', settings.sounds); this.set({ quality: k }); win.sendQuality?.(k); }, id);
        });
        y += 50;
      }
      rows.forEach(([k, label, step, min, max, fmt]) => {
        text(ctx, label, W - 24, y, 23, { align: 'right', weight: 700 });
        text(ctx, fmt(pic[k]), W / 2 - 10, y, 22, { dir: 'ltr', weight: 800, color: COLORS.accent });
        [['minus', 46, -1], ['plus', 112, 1]].forEach(([ic, x, d]) => {
          const id = k + d, hov = p.isHover(id);
          ctx.beginPath(); ctx.arc(x, y, 24, 0, 7); ctx.fillStyle = hov ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.1)'; ctx.fill();
          icon(ctx, ic, x, y, 22);
          p.region(x - 32, y - 30, 64, 60, () => { blip('tap', settings.sounds); this.set({ [k]: Math.min(max, Math.max(min, Math.round((pic[k] + d * step) * 100) / 100)), preset: 'custom' }); }, id);
        });
        y += 62;
      });
      // Presets
      const keys = Object.keys(PIC_PRESETS), pw = (W - 30) / 2;
      keys.forEach((k, i) => {
        const x = W - 15 - ((i % 2) + 1) * pw, yy = y + Math.floor(i / 2) * 54, on = pic.preset === k, id = 'p' + k, hov = p.isHover(id);
        roundRect(ctx, x + 4, yy - 22, pw - 8, 46, 23); ctx.fillStyle = on ? 'rgba(124,196,255,0.85)' : hov ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'; ctx.fill();
        text(ctx, PIC_PRESETS[k][0], x + pw / 2, yy + 1, 20, { weight: 800, color: on ? '#0b1020' : COLORS.text });
        p.region(x, yy - 24, pw, 50, () => { blip('tap', settings.sounds); this.set({ ...PIC_PRESETS[k][1], preset: k }); }, id);
      });
    }, { pxPerM: 1500 });
    this.mesh = this.panel.mesh;
    this.apply();
  }
  set(o) { saveSettings({ picture: Object.assign(picture(), o) }); this.win.mgr.applyPicture(); this.panel.redraw(); }
  apply() {
    const pic = picture(), u = this.win.mat.uniforms;
    u.uDim.value = pic.bright; u.uPic.value.set(pic.contrast, pic.sat, pic.sharp, pic.green);
  }
  dispose() { this.panel.dispose(); }
}

export class VideoWindow extends SpatialWindow {
  isMuted() { return !!this.video?.muted; }
  applyVolume() { const v = this.video; if (!v) return; v.muted = this.mute; setElementVolume(v, this.vol ?? 1); if (!this.mute && v.paused && !this.userPaused) v.play().catch(() => {}); }
  constructor(mgr, { itemId = null, url = null, name = '', stream = null, remote = null, fmt = null, proj = null, browser = false, start = 0 }) {
    super(mgr, 'video');
    this.browser = browser; this.pageUrl = browser ? (url || '') : ''; this.pageTitle = '';
    if (browser) this.canReshape = true;
    this.fmt = fmt || '2d'; this.proj = proj || 'flat'; this.fmtSet = !!fmt;
    this.stream = stream; this.remote = remote; this.control = false;
    if (remote) setTimeout(() => { try { remote.send({ type: 'quality', level: picture().quality }); } catch {} }, 1500);   // sharp text from the start
    if (stream || remote) { mgr.app.renderer.readCount = (mgr.app.renderer.readCount || 0) + 1; this.reading = true; }
    this.itemId = itemId; this.url = url; this.name = name; this.startAt = +start || 0;
    this.video = mgr.app.media.acquire();
    this.mat.uniforms.uVideo.value = 1;
    this.tex = null;
    if (remote && browser) {
      // Madar's built-in browser (running on a paired tablet): a real browser you can click anywhere,
      // curve, view in 360°, and reshape (the page really gets wider or taller).
      this.toolbar = new Toolbar([
        { icon: 'chevR', action: () => this.key('back') },
        { icon: 'chevL', action: () => this.remote.send({ type: 'input', a: 'forward' }) },
        { icon: 'reload', action: () => this.remote.send({ type: 'input', a: 'reload' }) },
        { icon: 'keyboard', action: () => this.mgr.openKeyboardFor(this, false) },   // types into the page's field (the address bar opens the URL keyboard)
        { icon: 'enter', action: () => this.key('enter') },
        { icon: () => this.proj === '360' ? 'image' : 'globe', action: () => { this.setProjection(this.proj === '360' ? 'flat' : '360'); } },
        { icon: () => this.curved ? 'flat' : 'curve', action: () => this.setCurved(!this.curved) },
        { icon: 'sliders', action: () => this.togglePicture() },
        { icon: 'minus', action: () => this.scaleBy(1 / 1.15) },
        { icon: 'plus', action: () => this.scaleBy(1.15) },
        { icon: 'dots', active: () => !!this.more?.mesh.parent, action: () => this.toggleMore() },
      ]).install();
      Object.assign(this.content.userData.interact, {
        scroll: () => this.control,
        toPx: uv => [uv.x * (this.video.videoWidth || 1280), (1 - uv.y) * (this.video.videoHeight || 800)],
        scrollBy: (dx, dy, at) => this.scrollAt(dx, dy, at),
      });
      this.makeBrowserBar();
    } else if (remote) {
      // A shared screen you can operate: click = mouse click / tap, pinch-drag or triggers = scroll.
      this.toolbar = new Toolbar([
        { icon: 'chevR', action: () => this.key('back') },
        { icon: 'home', action: () => this.key('home') },
        { icon: 'keyboard', action: () => this.mgr.openKeyboardFor(this, false) },
        { icon: 'enter', action: () => this.key('enter') },
        { icon: 'sliders', action: () => this.togglePicture() },
        { icon: () => this.headLock ? 'target' : 'grid', action: () => { this.headLock = !this.headLock; this.mgr.app.toast(this.headLock ? 'الشاشة مثبتة أمام عينيك وتتبع رأسك' : 'الشاشة ثابتة في مكانها بالغرفة'); } },
        { icon: () => this.volIcon(), action: () => this.toggleVolume() },
        { icon: () => this.proj === '360' ? 'image' : 'globe', active: () => this.proj === '360', action: () => this.setProjection(this.proj === '360' ? 'flat' : '360') },
        { icon: () => this.curved ? 'flat' : 'curve', active: () => this.curved, action: () => this.setCurved(!this.curved) },
        { icon: 'minus', action: () => this.scaleBy(1 / 1.15) },
        { icon: 'plus', action: () => this.scaleBy(1.15) },
        { icon: 'dots', active: () => !!this.more?.mesh.parent, action: () => this.toggleMore() },
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
      { icon: () => this.volIcon(), action: () => this.toggleVolume() },
      { icon: 'cast', action: () => this.cast() },
      { icon: 'sliders', action: () => { this.toggleOptions(); this.togglePicture(); } },
      { icon: () => this.proj === '360' ? 'image' : 'globe', active: () => this.proj === '360', action: () => { this.setProjection(this.proj === '360' ? 'flat' : '360'); this.mgr.changed(); } },
      { icon: () => this.curved ? 'flat' : 'curve', active: () => this.curved, action: () => this.setCurved(!this.curved) },
      { icon: 'minus', action: () => this.scaleBy(1 / 1.15) },
      { icon: 'plus', action: () => this.scaleBy(1.15) },
      { icon: 'dots', active: () => !!this.more?.mesh.parent, action: () => this.toggleMore() },
    ], { width: 1.28, progress: { get: () => [this.video.currentTime || 0, this.video.duration || 0], seek: f => { if (this.video.duration) this.video.currentTime = f * this.video.duration; } } }).install();
    this.group.add(this.toolbar.mesh);
    this.layout();
    this.lastBar = 0;
    { const pic = picture(); this.mat.uniforms.uDim.value = pic.bright; this.mat.uniforms.uPic.value.set(pic.contrast, pic.sat, pic.sharp, pic.green); }
    if (remote && !browser) this.togglePicture(true);   // shared screens show their picture controls on the right
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
    v.onloadedmetadata = () => { if (!this.guessed) { this.guessed = true; this.guessFormat(); } this.setAspect(this.dispAspect()); this.setupTexture(); if (this.startAt > 5 && isFinite(v.duration)) { v.currentTime = Math.min(this.startAt, v.duration - 5); this.startAt = 0; } };
    this.mgr.app.log('فتح فيديو: ' + (this.name || this.url));
    try { await v.play(); } catch { v.muted = true; try { await v.play(); this.mgr.app.toast('الصوت مكتوم — اضغط زر الصوت'); } catch {} }
  }
  // Videos wider than 1920 px (4K from the iPhone camera) are scaled down through a canvas to save GPU memory.
  setupTexture() {
    const v = this.video;
    this.tex?.dispose();
    const w = v.videoWidth, h = v.videoHeight;
    const cap = this.stream && /iPhone|iPad/.test(navigator.userAgent) ? 1280 : 1920;   // live pictures on iPhone: lighter (no memory crash)
    // live pictures always go through a canvas (drawImage works for every WebRTC stream; a raw video texture
    // stayed black on some decoders)
    if (Math.max(w, h) > cap || (this.stream && w > 0)) {
      const k = Math.min(1, cap / Math.max(w, h));
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
      // a plain texture updated by hand (see update): only new frames, only while you can see the window, and at
      // most 30 / 25 times a second in the cooling modes - videos behind you cost nothing
      this.tex = new THREE.Texture(v); this.lastFrameTime = -1;
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
      this.mat.uniforms.uVideo.value = 1;
    }
    this.mat.uniforms.map.value = this.tex;
    const tw = this.canvas ? this.canvas.width : w, th = this.canvas ? this.canvas.height : h;
    this.mat.uniforms.uTexel.value.set(1 / Math.max(1, tw), 1 / Math.max(1, th));
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
  mediaToggle() { const v = this.video; if (!v) return; if (v.paused) v.play?.().catch(() => {}); else v.pause(); }
  moreItems() {
    const v = this.video, base = super.moreItems();
    if (this.remote) {
      const Q = QUALITY.map(x => x[0]);
      return [...base,
        ['جودة البث', (QUALITY.find(x => x[0] === picture().quality) || QUALITY[1])[1], () => { const n = Q[(Q.indexOf(picture().quality) + 1) % Q.length]; saveSettings({ picture: Object.assign(picture(), { quality: n }) }); this.pic?.panel.redraw(); this.sendQuality(n); }],
        ['الصوت', v.muted ? 'مكتوم' : Math.round((this.vol ?? 1) * 100) + '%', () => this.toggleVolume()],
        ['صورة', 'ضبط', () => this.togglePicture()],
      ];
    }
    return [...base,
      ['السرعة', (v.playbackRate || 1) + '×', () => { const o = [1, 1.25, 1.5, 2, 0.5, 0.75]; v.playbackRate = o[(o.indexOf(v.playbackRate) + 1) % o.length]; }],
      ['مؤقت النوم', this.sleepAt ? Math.max(1, Math.round((this.sleepAt - Date.now()) / 60000)) + ' د' : 'إيقاف', () => this.cycleSleep()],
      ['التكرار', v.loop ? 'مفعّل' : 'إيقاف', () => { v.loop = !v.loop; }],
      ['تكبير الصوت', this.boost ? 'مفعّل' : 'إيقاف', () => this.setBoost(!this.boost)],
    ];
  }
  // Stop playing after a while (falling asleep in the headset).
  cycleSleep() {
    const o = [0, 15, 30, 60, 90], cur = this.sleepMin || 0, n = o[(o.indexOf(cur) + 1) % o.length];
    this.sleepMin = n; clearTimeout(this.sleepTimer);
    this.sleepAt = n ? Date.now() + n * 60000 : 0;
    if (n) this.sleepTimer = setTimeout(() => { if (this.disposed) return; this.userPaused = true; this.video.pause(); this.mgr.app.toast('مؤقت النوم: توقف الفيديو', 3000); this.sleepAt = 0; this.sleepMin = 0; this.more?.redraw(); }, n * 60000);
    this.mgr.app.toast(n ? 'سيتوقف الفيديو بعد ' + n + ' دقيقة' : 'مؤقت النوم متوقف', 2000);
  }
  // Louder than the device allows for quiet videos (WebAudio gain).
  setBoost(on) {
    try {
      if (!this.boostNode) {
        const ctx = this.mgr.app.audioCtx || (this.mgr.app.audioCtx = new (window.AudioContext || window.webkitAudioContext)());
        const srcN = ctx.createMediaElementSource(this.video), g = ctx.createGain();
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
        srcN.connect(g).connect(comp).connect(ctx.destination); this.boostNode = g; ctx.resume?.();
      }
      this.boost = on; this.boostNode.gain.value = on ? 2.4 : 1;
      this.mgr.app.toast(on ? 'تكبير الصوت مفعّل' : 'الصوت عادي', 1800);
    } catch { this.mgr.app.toast('تكبير الصوت غير متاح لهذا الفيديو', 2500); }
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
    if (this.pic) this.pic.mesh.position.set(0.5 + 0.23, 0, 0.004);
    if (this.bbar) this.bbar.mesh.position.set(0, this.h / 2 + 0.065, 0.004);
  }
  // Address bar of the built-in browser: shows the page; pointing + click opens the keyboard to go elsewhere.
  makeBrowserBar() {
    this.bbar = new CanvasPanel(0.96, 0.075, (ctx, W, H, p) => {
      glass(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2);
      if (p.isHover('url')) { roundRect(ctx, 8, 8, W - 16, H - 16, (H - 16) / 2); ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill(); }
      roundRect(ctx, W - H * 3.3, 8, H * 3.2, H - 16, (H - 16) / 2); ctx.fillStyle = 'rgba(124,196,255,0.28)'; ctx.fill();
      text(ctx, this.loading ? 'يُحمّل…' : 'متصفح مدار', W - H * 1.7, H / 2 + 2, H * 0.3, { weight: 800 });
      const shown = (this.pageTitle ? this.pageTitle + ' — ' : '') + (this.pageUrl || '').replace(/^https?:\/\/(www\.)?/, '');
      text(ctx, shown || 'اكتب عنواناً أو بحثاً', W / 2 - H * 0.8, H / 2 + 2, H * 0.34, { weight: 700, dir: 'auto', maxWidth: W - H * 5.6, color: COLORS.text });
      icon(ctx, 'keyboard', H * 0.6, H / 2, H * 0.5, COLORS.dim);
      p.region(0, 0, W, H, () => { blip('tap', settings.sounds); this.mgr.openKeyboard(this.pageUrl); }, 'url');
    }, { pxPerM: 1500 });
    this.group.add(this.bbar.mesh);
  }
  onPage(s) {
    if (!s) return;
    if (s.url != null) this.pageUrl = s.url; if (s.title != null) this.pageTitle = s.title; if (s.loading != null) this.loading = s.loading;
    this.name = this.pageTitle || this.name;
    this.bbar?.redraw();
  }
  navigate(url) { this.remote?.send({ type: 'input', a: 'nav', url }); this.pageUrl = url; this.loading = true; this.bbar?.redraw(); }
  togglePicture(force) {
    if (!this.pic) this.pic = new PicturePanel(this);
    const show = force ?? !this.pic.mesh.parent;
    if (show && !this.pic.mesh.parent) this.group.add(this.pic.mesh); else if (!show && this.pic.mesh.parent) this.group.remove(this.pic.mesh);
    this.layout(); this.pic.panel.redraw(); this.mgr.refreshTargets();
  }
  sendQuality(q) { if (this.remote) { this.remote.send({ type: 'quality', level: q }); this.mgr.app.toast('جودة البث: ' + (QUALITY.find(x => x[0] === q) || [])[1], 2000); } }
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
    this.lastFrameTime = -1; this.texSeen = 0;
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    setTimeout(() => this.setupTexture(), 600);   // the new picture's size, a fresh texture
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
  // the keyboard typing into the focused field of this device / built-in browser page
  send(msg) {
    if (!this.remote) return;
    if (msg.type === 'text') this.remote.send({ type: 'input', a: 'text', value: msg.value });
    else if (msg.type === 'key') this.remote.send({ type: 'input', a: 'key', key: msg.key === 'Backspace' ? 'backspace' : msg.key === 'Enter' ? 'enter' : String(msg.key).toLowerCase() });
    else if (msg.type === 'clear') { for (let i = 0; i < 60; i++) this.remote.send({ type: 'input', a: 'key', key: 'backspace' }); }
  }
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
    // Built-in browser: while you reshape it, keep your shape; then ask the browser for that page size.
    // (keep the asked shape until the browser's picture arrives in that shape, at most 8 s)
    const waiting = this.browser && this.wantAspect && Math.abs(this.dispAspect() - this.wantAspect) > 0.03 && now - this.wantAt < 8000;
    const reshaping = this.browser && (now - (this.reshapeAt || 0) < 1500 || waiting);
    if (this.tex && v.videoWidth && !reshaping && Math.abs(this.dispAspect() - this.aspect) > 0.01) this.setAspect(this.dispAspect());
    if (this.browser && this.reshapeAt && now - this.reshapeAt > 400 && now - this.reshapeAt < 3000 && Math.abs((this.sentAspect || 0) - this.aspect) > 0.01) {
      this.sentAspect = this.aspect; this.wantAspect = this.aspect; this.wantAt = now;
      this.remote?.send({ type: 'input', a: 'resize', aspect: +this.aspect.toFixed(3) });
    }
    if (this.sphere) this.sphere.position.copy(this.mgr.headLocal());
    this.mat.uniforms.uHas.value = v.readyState >= 2 && this.tex ? 1 : 0;
    // smart heat: only the video you look at gets every frame; the others refresh at 15 fps (cooler phone)
    const ex = this.mgr.app.extras, side = settings.smartHeat !== false && ex?.lookedWin && ex.lookedWin !== this && ex.lookedWin.kind === 'video' && performance.now() - (ex.lookedAt || 0) < 8000;
    if (this.stream && this.tex && v.readyState >= 2 && v.videoWidth && now - (this.texChk || 0) > 1000) {
      this.texChk = now;
      if (!this.texW || this.texW !== v.videoWidth || this.texH !== v.videoHeight) { this.texW = v.videoWidth; this.texH = v.videoHeight; this.setAspect(v.videoWidth / v.videoHeight); this.setupTexture(); }
    }
    if (this.tex && v.readyState >= 2 && (this.stream ? now - (this.texAt || 0) >= 30 : v.currentTime !== this.lastFrameTime) && (now - (this.texAt || 0) >= (side ? 66 : settings.coolMax ? 39 : settings.cool ? 32 : 0)) && this.inView(now)) {
      this.lastFrameTime = v.currentTime; this.texAt = now;
      if (this.canvas) { try { this.cctx.drawImage(v, 0, 0, this.canvas.width, this.canvas.height); this.tex.needsUpdate = true; } catch {} }
      else this.tex.needsUpdate = true;
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
  // is the window (or its 360° sphere) in front of you? checked 5 times a second
  inView(now) {
    if (this.sphere || this.mgr.cinema === this || this.lastFrameTime < 0) return true;
    if (now - (this.viewAt || 0) > 200) { this.viewAt = now; const p = this.group.getWorldPosition(new THREE.Vector3()), d = p.length(); this.seen = d < 0.8 || p.divideScalar(d).dot(this.mgr.app.headForward) > 0.25 - Math.min(0.4, this.group.scale.x / Math.max(0.5, d) * 0.3); }
    return this.seen !== false;
  }
  ref() {
    if (this.stream || (this.url && this.url.startsWith('blob:'))) return null;
    const r = this.itemId ? { item: this.itemId } : { url: this.url };
    if (this.fmt !== '2d') r.fmt = this.fmt;
    if (this.proj !== 'flat') r.proj = this.proj;
    return r;
  }
  dispose() {
    this.disposed = true;
    if (this.reading) { this.reading = false; this.mgr.app.renderer.readCount--; }
    if (this.sphere) { this.mgr.root.remove(this.sphere); this.sphere.geometry.dispose(); this.sphere.material.dispose(); this.sphere = null; }
    this.opts?.dispose(); this.pic?.dispose(); this.bbar?.dispose();
    if (this.browser) { try { this.remote?.close(); } catch {} }
    super.dispose();
    this.video.onpause = null;
    this.video.pause(); this.video.srcObject = null; this.video.removeAttribute('src'); this.video.load();
    this.mgr.app.media.release(this.video);
    this.tex?.dispose();
    if (this.objUrl) URL.revokeObjectURL(this.objUrl);
  }
}

export class ImageWindow extends SpatialWindow {
  constructor(mgr, { itemId, file = null, proj = null, depth = null }) {
    super(mgr, 'image');
    this.itemId = itemId; this.file = file; this.proj = proj || 'flat';
    this.depthSrc = depth;   // spatial photo: a depth map (PNG, bright = near) from the iPhone app
    this.toolbar = new Toolbar([
      { icon: () => this.proj === '360' ? 'image' : 'globe', action: () => { this.setProjection(this.proj === '360' ? 'flat' : '360'); this.mgr.changed(); } },
      { icon: () => this.curved ? 'flat' : 'curve', action: () => this.setCurved(!this.curved) },
      { icon: 'cube', active: () => !!this.depth, action: () => this.toggleSpatial() },
      { icon: 'minus', action: () => this.scaleBy(1 / 1.15) },
      { icon: 'plus', action: () => this.scaleBy(1.15) },
      { icon: 'dots', active: () => !!this.more?.mesh.parent, action: () => this.toggleMore() },
    ]).install();
    this.group.add(this.toolbar.mesh);
    this.layout();
    this.load();
  }
  // visionOS «مشهد مكاني»: any ordinary photo becomes 3D - the depth is estimated on the phone (once per photo)
  async toggleSpatial() {
    const app = this.mgr.app;
    if (this.depth) { this.depth = null; this.depthSrc = null; if (this.itemId) forgetDepth(this.itemId); this.layout(); this.toolbar.redraw(); app.toast('الصورة مسطحة', 1500); return; }
    if (this.depthBusy || !this.tex?.image) return;
    if (this.proj !== 'flat') this.setProjection('flat');
    if (this.curved) this.setCurved(false);
    this.depthBusy = true;
    try {
      const png = await depthMap(this.tex.image, { onStep: m => app.toast(m, 4000) });
      if (!this.mgr.windows.includes(this)) return;
      this.depthSrc = png; saveDepth(this.itemId, png);
      await this.loadDepth();
      this.toolbar.redraw();
    } catch (e) { app.toast('تعذّر تحويل الصورة: ' + (e.message || e), 3500); }
    this.depthBusy = false;
  }
  async load() {
    const item = this.file ? { name: this.file.name, files: [{ blob: this.file }] } : await getItem(this.itemId);
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
      const r = c.width / c.height;
      if (this.cut == null && hasAlpha(c)) { this.setCut(1); this.mgr.app.toast('🖼 صورة بلا خلفية', 1800); }
      if (!this.depthSrc && this.proj === 'flat') this.depthSrc = cachedDepth(this.itemId);   // converted before: spatial again
      if (this.depthSrc) await this.loadDepth();
      if (this.proj && this.proj !== 'flat') this.setProjection(this.proj);
      else if (/360|panorama|بانوراما|مكة|مكه|الحرم/i.test(item.name || '') && Math.abs(r - 2) < 0.15) this.setProjection('360');
    } catch { this.mgr.app.toast('تعذّر فتح الصورة'); }
  }
  // Spatial photo: the picture becomes a relief — near things come towards you, so each eye sees real depth.
  async loadDepth() {
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = this.depthSrc.startsWith('data:') ? this.depthSrc : 'data:image/png;base64,' + this.depthSrc; });
      const c = document.createElement('canvas'); c.width = 160; c.height = Math.max(2, Math.round(160 * img.height / img.width));
      const g = c.getContext('2d'); g.filter = 'blur(1.5px)'; g.drawImage(img, 0, 0, c.width, c.height);
      this.depth = { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data };
      this.depthAmount = this.depthAmount || 0.2;
      this.layout(); this.mgr.app.toast('🧊 صورة مجسّمة — حرّك رأسك لترى العمق', 2500);
    } catch { this.mgr.app.toast('تعذّر قراءة عمق الصورة'); }
  }
  layout() {
    super.layout();
    if (!this.depth || this.curved) return;
    this.frame.visible = false;   // a spatial scene has no frame: the picture itself stands in the room
    const h = this.h, sx = 120, sy = Math.max(2, Math.round(120 * h));
    const geo = new THREE.PlaneGeometry(1, h, sx, sy), pos = geo.attributes.position, uv = geo.attributes.uv, D = this.depth;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      const x = Math.min(D.w - 1, Math.round(u * (D.w - 1))), y = Math.min(D.h - 1, Math.round((1 - v) * (D.h - 1)));
      const d = D.d[(y * D.w + x) * 4] / 255;
      pos.setZ(i, (d - 0.5) * this.depthAmount);
    }
    pos.needsUpdate = true; geo.computeBoundingSphere();
    this.content.geometry.dispose(); this.content.geometry = geo;
  }
  moreItems() {
    const base = super.moreItems();
    if (!this.depth) return base;
    return [...base, ['العمق', Math.round(this.depthAmount * 500) + '%', () => { const o = [0.2, 0.3, 0.4, 0.1]; this.depthAmount = o[(o.indexOf(this.depthAmount) + 1) % o.length]; this.layout(); }]];
  }
  ref() { return this.file ? null : this.proj !== 'flat' ? { item: this.itemId, proj: this.proj } : { item: this.itemId }; }
  update() { if (this.sphere) this.sphere.position.copy(this.mgr.headLocal()); }
  dispose() { this.disposeSphere(); super.dispose(); this.tex?.dispose(); }
}

// Does a picture have see-through parts? (a PNG cut out of its background)
function hasAlpha(c) {
  try {
    const t = document.createElement('canvas'); t.width = 48; t.height = 48; const g = t.getContext('2d', { willReadFrequently: true });
    g.drawImage(c, 0, 0, 48, 48); const d = g.getImageData(0, 0, 48, 48).data;
    let clear = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 200) clear++;
    return clear > 48 * 48 * 0.04;
  } catch { return false; }
}

// Info panels drawn on canvas: welcome, gesture guide, clock.
export class PanelWindow extends SpatialWindow {
  constructor(mgr, { panel }) {
    super(mgr, 'panel');
    this.panelKind = panel;
    this.canCurve = false;
    const specs = { welcome: [1, 0.72], guide: [1, 0.74], clock: [1, 0.42], pad: [1, 0.86], matches: [1, 0.8], store: [1, 0.7], scoreboard: [0.78, 1] };
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
  // «تطبيقات»: websites that work like apps, one tap opens them; ＋ adds them to «مواقعي» (your own apps).
  drawStore(ctx, W, H) {
    text(ctx, 'التطبيقات', W - 60, 70, 56, { align: 'right', weight: 800 });
    text(ctx, 'اضغط لفتح التطبيق · ＋ لإضافته إلى تطبيقاتك', W - 60, 125, 28, { align: 'right', color: '#aab4c8' });
    const cols = 5, rows = Math.ceil(WEB_APPS.length / cols), top = 165, gw = (W - 80) / cols, gh = (H - top - 30) / rows;
    const mine = new Set(loadLinks().map(l => l.url));
    this.storeCells = [];
    WEB_APPS.forEach((a, i) => {
      const c = i % cols, r = Math.floor(i / cols), x = W - 40 - (c + 1) * gw, y = top + r * gh, cx = x + gw / 2, cy = y + gh * 0.4, rad = Math.min(gw, gh) * 0.26;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fillStyle = a[3]; ctx.fill();
      text(ctx, a[2], cx, cy + 2, rad * 0.95, { weight: 900, color: '#fff', dir: 'auto' });
      text(ctx, a[0], cx, y + gh * 0.82, 30, { weight: 700, dir: 'auto', maxWidth: gw - 10 });
      const added = mine.has(a[1]);
      ctx.beginPath(); ctx.arc(cx + rad * 0.85, cy - rad * 0.85, rad * 0.32, 0, 7); ctx.fillStyle = added ? '#34d399' : 'rgba(255,255,255,0.85)'; ctx.fill();
      text(ctx, added ? '✓' : '+', cx + rad * 0.85, cy - rad * 0.85 + 2, rad * 0.42, { weight: 900, color: added ? '#fff' : '#141824' });
      this.storeCells.push({ x, y, w: gw, h: gh, app: a, plus: [cx + rad * 0.85, cy - rad * 0.85, rad * 0.45] });
    });
  }
  onContentClick(hit) {
    if (this.panelKind !== 'store' || !hit?.uv || !this.storeCells) return false;
    const { canvas } = this.cv, px = hit.uv.x * canvas.width, py = (1 - hit.uv.y) * canvas.height;
    const cell = this.storeCells.find(c => px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h);
    if (!cell) return false;
    blip('tap', settings.sounds);
    const [name, url] = cell.app, [qx, qy, qr] = cell.plus;
    if (Math.hypot(px - qx, py - qy) < qr * 1.6) {
      const l = loadLinks();
      if (!l.some(x => x.url === url)) { l.unshift({ id: 'l' + Date.now(), title: name, url }); saveLinks(l); this.mgr.app.toast('أُضيف «' + name + '» إلى تطبيقاتك', 2000); }
      this.draw(); return true;
    }
    this.mgr.open({ kind: 'web', url, title: name });
    return true;
  }
  draw() {
    const { ctx, canvas, texture } = this.cv;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(96,100,114,0.92)'); g.addColorStop(1, 'rgba(78,82,96,0.92)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, 0, W, H * 0.02);
    const k = this.panelKind;
    if (k === 'matches') { drawMatches(ctx, W, H, this.mgr.app.sports); this.drawnV = this.mgr.app.sports?.version; texture.needsUpdate = true; return; }
    if (k === 'scoreboard') { drawBoard(ctx, W, H, this.mgr.app.sports); this.drawnV = this.mgr.app.sports?.version; this.drawnAt = performance.now(); texture.needsUpdate = true; return; }
    if (k === 'store') { this.drawStore(ctx, W, H); texture.needsUpdate = true; return; }
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
        ['hand', 'للنقر', 'وجّه إصبعك واقرص، أو ثبّته على الزر ثانيتين'],
        ['stack', 'لنقل نافذة', 'اقرص الشريط أسفلها أو إطارها واسحب'],
        ['plus', 'لتغيير الحجم', 'اقرص الدائرة في ركنها واسحب، أو باليدين'],
        ['grid', 'لفتح القائمة', 'اقرص مطوّلاً في الفراغ'],
        ['target', 'تثبيت أمام عينيك', 'زر ◎ تحت النافذة · باليدين في الفراغ لإعادة التمركز'],
        ['sun', 'بدون يدين', 'انظر إلى الزر ثانيتين أو المس الشاشة'],
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
  update(dt, now) {
    if (this.panelKind === 'clock' && now - this.lastDraw > 1000) { this.lastDraw = now; this.draw(); }
    if (this.panelKind === 'matches' && this.drawnV !== this.mgr.app.sports?.version) this.draw();
    if (this.panelKind === 'scoreboard' && (this.drawnV !== this.mgr.app.sports?.version || now - (this.drawnAt || 0) > 2000)) this.draw();   // logos arriving
  }
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
  constructor(mgr, { url, title = '', direct = false, aspect = 0, start = 0 }) {
    super(mgr, 'web');
    this.url = url; this.title = title; this.start = +start || 0;
    mgr.app.log('فتح موقع: ' + url);
    this.canCurve = false;
    this.aspect = aspect > 0.5 && aspect < 3.3 ? aspect : 16 / 10; this.pageH = Math.round(1024 / this.aspect); this.canReshape = true;
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
    this.cplay = (host === 'drivecast.c-p.workers.dev' || /cplay[23]\.netlify\.app/.test(host));
    this.base = (() => { try { return new URL(url).origin; } catch { return ''; } })();
    // Internal browser: ordinary sites open through Madar's page service so the pointer can click in them.
    this.direct = direct;
    // Phone/laptop modes touch the page directly; in the headset the internal browser makes clicks possible.
    // A site you switched to «مباشر» stays direct next time.
    const hostKey = host.replace(/^www\./, '');
    const directHost = (settings.directHosts || []).includes(hostKey);
    // In the iPhone app every page already gets Madar's bridge: no proxy server needed.
    this.proxied = !window.MadarIOS && !this.cplay && !this.yt && !direct && !directHost && settings.viewMode === 'sbs' && settings.browseProxy !== false && /^https?:/i.test(url);
    this.direct = !this.proxied && !this.cplay && !this.yt;
    if (this.proxied) this.base = BROWSE_ORIGIN;
    this.bridge = false; this.path = '';
    // Pages that include madar-bridge.js (cplay2) accept taps and scrolls from the hands.
    Object.assign(this.content.userData.interact, {
      scroll: () => this.bridge,
      toPx: uv => [512 + (uv.x - 0.5) * 1024 / WEB_INFLATE, this.pageH / 2 + (0.5 - uv.y) * this.pageH / WEB_INFLATE],
      scrollBy: (dx, dy, at) => { this.lastAt = at; this.send({ type: 'scroll', dx, dy, x: at[0], y: at[1] }); },
    });
    const items = [];
    if (this.cplay || this.proxied) items.push({ icon: 'chevR', action: () => this.send({ type: 'back' }) });
    items.push({ icon: 'reload', action: () => this.reload() });
    if (this.yt) items.push(
      { icon: () => this.ytState.playing ? 'pause' : 'play', action: () => this.ytToggle() },
      { icon: () => this.volIcon(), action: () => this.toggleVolume() },
    );
    if (!this.yt) items.push({ icon: () => this.snap ? 'video' : 'stack', active: () => !this.snap, action: () => this.toggleLive() }, { icon: () => this.volIcon(), action: () => this.toggleVolume() });
    items.push(
      { icon: () => this.proj === '360' ? 'image' : 'globe', active: () => this.proj === '360', action: () => this.view360(this.proj !== '360') },
      { icon: () => this.curved ? 'flat' : 'curve', active: () => this.curved, action: () => this.viewCurved(!this.curved) },
    );
    items.push({ icon: 'grid', action: () => this.cycleShape() });
    // eye: looking at the page doesn't tap it (watch without pausing by accident) · play/pause the page's video
    items.push({ icon: () => this.gazeOff ? 'eyeOff' : 'eye', active: () => !this.gazeOff, action: () => { this.gazeOff = !this.gazeOff; this.mgr.app.toast(this.gazeOff ? 'وضع المشاهدة: النظر لا ينقر الصفحة' : 'النقر بالنظر مفعّل', 1800); } });
    if (!this.yt) items.push({ icon: 'play', action: () => this.mediaToggle() });
    // a keyboard joined to this page: it types into the page's field and sits right under the window
    items.push({ icon: 'keyboard', active: () => this.mgr.windows.some(w => w.kind === 'keyboard' && w.field === this), action: () => this.toggleKeyboard() });
    items.push({ icon: 'minus', action: () => this.scaleBy(1 / 1.15) }, { icon: 'plus', action: () => this.scaleBy(1.15) }, { icon: 'dots', active: () => !!this.more?.mesh.parent, action: () => this.toggleMore() });
    this.toolbar = new Toolbar(items).install();
    this.group.add(this.toolbar.mesh);
    if (this.cplay) this.makeTabs(); else this.makeAddress();
    this.makeScrollStrip();
    this.vel = 0;
    this.layout();
    this.css = [0, 1].map(i => this.makeCss(i));
    mgr.app.renderer.cssCount++;
    // One source for both eyes: the page runs once and the same picture of it goes to each eye,
    // so the eyes never load or draw differently.
    this.oneSource = !this.yt && settings.viewMode === 'sbs' && settings.webOneSource !== false;
    if (this.oneSource) this.ensureSnap(true);
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
  // Page shape presets: wide (21:9) for a wrap-around feel, normal, tall like a phone.
  // Curved screen and 360° for web pages. A live page (iframe) can only be shown flat, so in these modes
  // the page keeps running hidden and its picture is redrawn several times a second onto a curved
  // screen or onto the whole sphere around you; pointing, clicking and scrolling still reach the page.
  canSnap() { return this.cplay || this.proxied || (!!window.MadarIOS && !this.yt); }
  ensureSnap(quiet) {
    if (this.snap) return true;
    if (this.yt) { this.mgr.app.toast('فيديو يوتيوب: استخدم نافذة الفيديو للتقويس و360°', 3500); return false; }
    if (!this.canSnap()) {
      // A site opened «مباشر» can't be drawn — reopen it in Madar's browser first.
      this.setDirect(false);
      this.pendingView = true;
    }
    this.snap = true; this.canCurve = true;
    this.snapSeq = 0; this.snapBusy = false; this.snapAt = 0; this.snapGot = 0; this.snapStarted = performance.now();
    if (!this.snapCv) { this.snapCv = canvasTexture(1024, this.pageH); this.snapCv.texture.colorSpace = THREE.SRGBColorSpace; }
    this.mat.uniforms.uHole.value = 0;
    if (this.snapGot) this.mat.uniforms.map.value = this.snapCv.texture;
    // Only one copy of the page is needed while it is drawn as a picture.
    const c1 = this.css[1]; c1.pending = true;
    if (c1.f.getAttribute('src') && c1.f.getAttribute('src') !== 'about:blank') c1.f.src = 'about:blank';
    this.requestSnap(0);
    return true;
  }
  stopSnap() {
    if (!this.snap || this.curved || this.proj === '360' || this.oneSource) return;
    this.snap = false; this.canCurve = false;
    clearTimeout(this.snapTimer);
    this.mat.uniforms.uHole.value = 1;
    this.mat.uniforms.map.value = this.cv.texture;
    this.css.forEach(c => { c.key = ''; c.el.style.opacity = ''; c.el.style.transformOrigin = ''; });
    this.loadEye1();
  }
  moreItems() {
    const base = super.moreItems();
    const z = this.zoom || 1;
    return [...base,
      ['تطبيقاتي', loadLinks().some(l => l.url === this.url) ? 'مضاف ✓' : 'أضف', () => {
        const l = loadLinks(); if (l.some(x => x.url === this.url)) return;
        let t = this.title; try { t = t || new URL(this.url).hostname.replace(/^www\./, ''); } catch {}
        l.unshift({ id: 'l' + Date.now(), title: t || this.url, url: this.url }); saveLinks(l); this.mgr.app.toast('أُضيف إلى تطبيقاتك', 1800);
      }],
      ['حجم النص', Math.round(z * 100) + '%', () => { const o = [1, 1.15, 1.3, 1.5, 0.85]; this.zoom = o[(o.indexOf(z) + 1) % o.length]; this.send({ type: 'zoom', value: this.zoom }); }],
      ['الوضع الليلي', this.night ? 'مفعّل' : 'إيقاف', () => { this.night = !this.night; this.send({ type: 'night', on: this.night }); }],
      ['قراءة تلقائية', this.autoScroll ? 'مفعّلة' : 'إيقاف', () => { this.autoScroll = !this.autoScroll; this.mgr.app.toast(this.autoScroll ? 'الصفحة تتمرّر ببطء — اضغط مجدداً للإيقاف' : 'توقف التمرير', 2200); }],
      ['المصدر', this.snap ? 'واحد للعينين' : 'مباشر', () => this.toggleLive()],
      ['اقرأ في مدار', 'كتاب', () => this.mgr.app.readWeb?.(this.pageUrl || this.url)],
      ['ملخص', 'لخّص الصفحة', () => this.mgr.app.extras?.summarize(this.pageUrl || this.url, this.title)],
    ];
  }
  // 🎬 Live: both eyes show the real page (moving video inside sites); otherwise one picture for both eyes.
  toggleLive() {
    if (this.snap) {
      this.oneSource = false;
      if (this.curved) this.setCurved(false);
      if (this.proj === '360') this.view360(false);
      this.stopSnap();
      this.mgr.app.toast('عرض مباشر: الصفحة تتحرك كما هي (للفيديو داخل المواقع)', 3000);
    } else {
      this.oneSource = true; this.ensureSnap();
      this.mgr.app.toast('مصدر واحد: نفس الصورة للعينين', 2500);
    }
    this.toolbar.redraw();
  }
  viewCurved(on) {
    if (on && !this.ensureSnap()) return;
    this.setCurved(on);
    if (!on) this.stopSnap();
    this.mgr.app.toast(on ? 'شاشة منحنية' : 'شاشة مسطحة', 1500);
  }
  view360(on) {
    if (on && !this.ensureSnap()) return;
    this.setProjection(on ? '360' : 'flat');
    this.frame.visible = !on;   // only the bars and buttons stay in front of you
    if (this.sphere) {
      // Point and click anywhere on the page all around you.
      this.sphere.userData.interact = this.content.userData.interact;
      if (this.snapGot) this.sphere.material.uniforms.map.value = this.snapCv.texture;
    }
    if (!on) this.stopSnap();
    this.mgr.refreshTargets();
  }
  requestSnap(delay) {
    clearTimeout(this.snapTimer);
    this.snapTimer = setTimeout(() => {
      if (this.disposed || !this.snap) return;
      const now = performance.now();
      // Waiting for the page (or a lost answer): ask again.
      if (!this.bridge || (this.snapBusy && now - this.snapAt < 6000)) { this.requestSnap(400); return; }
      this.snapBusy = true; this.snapAt = now;
      const id = ++this.snapSeq;
      try { this.css[0].f.contentWindow.postMessage({ madar: 1, type: 'snap', id, q: 0.8 }, this.base); } catch {}
    }, delay);
  }
  async onSnap(d) {
    this.snapBusy = false;
    if (!this.snap) return;
    if (d.media && !this.mediaHint && !this.curved && this.proj !== '360') { this.mediaHint = true; this.mgr.app.toast('في الصفحة فيديو يعمل: اضغط 🎬 في الشريط لعرضه مباشرة', 4500); }
    if (d.blob) {
      try {
        const bmp = await createImageBitmap(d.blob);
        const { canvas, ctx, texture } = this.snapCv;
        if (canvas.width !== bmp.width || canvas.height !== bmp.height) { canvas.width = bmp.width; canvas.height = bmp.height; texture.dispose(); }
        ctx.filter = this.night ? 'invert(0.92) hue-rotate(180deg)' : 'none';
        ctx.drawImage(bmp, 0, 0); bmp.close?.(); ctx.filter = 'none';
        texture.needsUpdate = true;
        if (!this.snapGot) this.mgr.app.log('الصفحة كصورة: ' + canvas.width + '×' + canvas.height);
        this.snapGot++;
        this.mat.uniforms.map.value = texture;
        if (this.sphere) this.sphere.material.uniforms.map.value = texture;
      } catch (e) { if (!this.snapErr) { this.snapErr = true; this.mgr.app.log('رسم الصفحة: ' + e.message); } }
    } else if (d.error && !this.snapErr) { this.snapErr = true; this.mgr.app.log('رسم الصفحة: ' + d.error); }
    // Quick refresh right after you click or scroll, calmer when the page is idle.
    const busy = performance.now() - (this.lastInput || 0) < 2500;
    this.requestSnap(busy ? 60 : 450);
  }
  poke() { this.lastInput = performance.now(); if (this.snap && !this.snapBusy) this.requestSnap(90); }

  cycleShape() {
    const S = [[16 / 10, '16:10'], [16 / 9, '16:9'], [21 / 9, 'عريضة 21:9'], [4 / 3, '4:3'], [1, 'مربعة'], [9 / 16, 'طولية كالهاتف']];
    const i = S.findIndex(x => Math.abs(x[0] - this.aspect) < 0.02);
    const [a, l] = S[(i + 1) % S.length];
    this.setAspect(a); this.mgr.changed();
    this.mgr.app.toast('شكل الصفحة: ' + l, 1800);
  }
  // Corner handle on a web page changes its shape too (like resizing a browser window): the page gets taller or wider.
  setAspect(a) {
    super.setAspect(a);
    const h = Math.round(1024 / this.aspect);
    if (h !== this.pageH) { this.pageH = h; this.css?.forEach(c => { c.el.style.height = h + 'px'; c.key = ''; }); }
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
    // iPhone app: the page may have moved to another site inside the window; the frame is still ours.
    const target = window.MadarIOS ? '*' : this.base;
    (this.snap ? [this.css[0]] : this.css).forEach(c => { try { c.f.contentWindow.postMessage(msg, target); } catch {} });
    if (msg.type !== 'snap') this.poke();
  }
  navTo(path) {
    this.path = path; this.tabPanel?.redraw();
    if (this.bridge) this.send({ type: 'nav', path });
    else { this.url = this.base + path; this.reload(); }
  }
  // Memory guard (iPhone app): a sleeping page is unloaded (its two copies freed) and shows a still card;
  // a tap, or opening it, wakes it - reloaded where it was.
  sleep() {
    if (this.asleep || this.disposed) return;
    this.asleep = true;
    const u = this.mat.uniforms;
    this.slept = { map: u.map.value, hole: u.uHole.value, has: u.uHas.value };
    this.css.forEach(c => { c.f.src = 'about:blank'; c.el.style.display = 'none'; });
    if (!this.sleepTex) {
      const { ctx, texture } = canvasTexture(640, 400);
      ctx.fillStyle = '#10131c'; ctx.fillRect(0, 0, 640, 400);
      text(ctx, '💤', 320, 140, 90, {});
      text(ctx, 'نائمة لتوفير الذاكرة', 320, 250, 40, { weight: 800 });
      text(ctx, (this.title || this.url || '').slice(0, 40), 320, 310, 26, { color: '#9aa4bd', dir: 'auto' });
      text(ctx, 'انقر لإيقاظها', 320, 360, 28, { color: '#7cc4ff', weight: 700 });
      texture.needsUpdate = true; this.sleepTex = texture;
    }
    u.map.value = this.sleepTex; u.uHole.value = 0; u.uHas.value = 1;
    this.mgr.app.log('حارس الذاكرة: نامت ' + this.url);
  }
  wake() {
    if (!this.asleep) return;
    this.asleep = false;
    const u = this.mat.uniforms, s = this.slept || {};
    u.map.value = s.map ?? null; u.uHole.value = s.hole ?? 1; u.uHas.value = s.has ?? 0;
    this.css.forEach(c => { c.el.style.display = ''; c.key = ''; });
    this.lastUse = performance.now();
    this.reload();
    this.mgr.guardMemory(this);
  }
  onContentClick(hit) {
    if (this.asleep) { this.wake(); return true; }
    this.lastUse = performance.now();
    if (!this.bridge) {
      // Pages from other sites can't receive clicks from Madar's eye/hand pointer unless they include madar-bridge.js.
      const now = performance.now();
      if (!this.warned || now - this.warned > 8000) {
        this.warned = now;
        this.mgr.app.toast(this.cplay ? 'cplay2 لم يتصل بعد — أعد تحميل النافذة' : this.proxied ? 'الصفحة ما زالت تتحمّل…' : 'هذا الموقع لا يقبل النقر بالعين أو اليد — المسه مباشرة في وضع الهاتف/اللابتوب', 4500);
        this.mgr.app.log('نقر على موقع بلا جسر: ' + this.url);
      }
      return false;
    }
    if (!hit || !hit.uv) return false;
    const [x, y] = this.content.userData.interact.toPx(hit.uv);
    this.mgr.lastWebTap = this;
    this.send({ type: 'tap', x, y });
    blip('tap', settings.sounds);
    return true;
  }
  src(eye) {
    if (this.proxied) return BROWSE_ORIGIN + '/api/madar-browse?url=' + encodeURIComponent(this.url);
    if (this.yt) {
      const p = new URLSearchParams({ playsinline: '1', autoplay: '1', mute: '1', enablejsapi: '1', rel: '0', modestbranding: '1', origin: location.origin, controls: '1' });
      if (this.start > 5) p.set('start', String(Math.floor(this.start)));   // «تابع المشاهدة» from another device
      return `https://www.youtube.com/embed/${this.yt}?${p}`;
    }
    return this.url;
  }
  makeCss(eye) {
    // Plain 2D-positioned iframe per eye (3D CSS transforms are unreliable on iOS Safari).
    const el = document.createElement('div');
    el.className = 'webwin';
    el.style.height = this.pageH + 'px';
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
    if (this.asleep) return;
    const r = this.mgr.app.renderer, m = this.content.matrixWorld, h = this.h, k = WEB_INFLATE;
    const head = this.mgr.app.headForward, toWin = this.group.getWorldPosition(new THREE.Vector3()).normalize();
    const vis = head.dot(toWin) > 0.2 && this.group.visible;
    const corners = vis ? [[-0.5, h / 2], [0.5, h / 2], [-0.5, -h / 2], [0.5, -h / 2]].map(([x, y]) => new THREE.Vector3(x * k, y * k, 0).applyMatrix4(m)) : null;
    if (this.snap) {
      // Drawn as a picture: the page stays on screen (browsers pause pages moved out of view) but
      // nearly transparent, in the corner of the left eye, so the picture of it is what you see.
      const c = this.css[0];
      if (c.el.style.opacity !== '0.01') { c.el.style.opacity = '0.01'; c.el.style.transform = 'translate(0px,0px) scale(0.25)'; c.el.style.transformOrigin = '0 0'; c.key = ''; }
      // The second copy is not used: hide it completely (its dark box covered the right eye).
      if (this.css[1].el.style.display !== 'none') { this.css[1].el.style.display = 'none'; this.css[1].key = ''; }
      // No picture of the page after a while (the page can't be drawn): show it live instead of a black window.
      if (!this.snapGot && this.snapStarted && performance.now() - this.snapStarted > 8000 && !this.snapGaveUp) {
        this.snapGaveUp = true; this.oneSource = false;
        if (this.curved) this.setCurved(false);
        if (this.proj === '360') this.view360(false);
        this.stopSnap();
        this.mgr.app.log('الصفحة لا تُرسم كصورة — عرض مباشر: ' + this.url);
      }
      return;
    }
    this.css.forEach((c, i) => {
      const P = corners && corners.map(v => r.eyePx(i, v));
      if (!P || P.some(q => !q)) { if (c.el.style.display !== 'none') c.el.style.display = 'none'; c.key = ''; return; }
      if (c.el.style.display) c.el.style.display = '';
      // Skip sub-pixel changes: re-applying transforms makes Safari repaint the page.
      const key = P.map(q => q[0].toFixed(0) + ',' + q[1].toFixed(0)).join(';');
      if (key === c.key) return;
      c.key = key;
      c.el.style.transform = homography(1024, this.pageH, P);
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
    if (this.disposed || !c.pending || this.snap) return;
    c.pending = false; clearTimeout(this.eyeTimer);
    c.f.src = this.src(1);
  }
  onFrameLoad(eye, f) {
    const at = f.getAttribute('src');
    if (!at || at === 'about:blank' || this.disposed) return;
    if (eye === 0) { this.mgr.app.log('اكتمل تحميل الصفحة'); if (this.css[1].pending) { clearTimeout(this.eyeTimer); this.eyeTimer = setTimeout(() => this.loadEye1(), 1200); } }
    if (this.base && !this.yt) { try { f.contentWindow.postMessage({ madar: 1, type: 'hello' }, window.MadarIOS ? '*' : this.base); } catch {} }
    if (!this.yt) return;
    const post = o => { try { f.contentWindow.postMessage(JSON.stringify(o), 'https://www.youtube.com'); } catch {} };
    post({ event: 'listening', id: 'madar' + this.id + '-' + eye, channel: 'widget' });
    if (eye === 0) setTimeout(() => this.ytMute(false), 900);
  }
  cmd(eye, func, args = []) { try { this.css[eye].f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube.com'); } catch {} }
  ytToggle() { const p = !this.ytState.playing; this.ytState.playing = p; [0, 1].forEach(e => this.cmd(e, p ? 'playVideo' : 'pauseVideo')); }
  isMuted() { return this.yt ? !!this.ytState?.muted : !!this.mute; }
  applyVolume() {
    const v = this.mute ? 0 : (this.vol ?? 1);
    if (this.yt) { this.ytMute(this.mute); if (!this.mute) this.cmd(0, 'setVolume', [Math.round(v * 100)]); }
    else this.send({ type: 'volume', v });
  }
  ytMute(m) { this.ytState.muted = m; this.cmd(0, m ? 'mute' : 'unMute'); this.cmd(1, 'mute'); if (!m) this.cmd(0, 'setVolume', [Math.round((this.vol ?? 1) * 100)]); }
  mediaToggle() { this.send({ type: 'media', a: 'toggle' }); }
  toggleKeyboard() {
    const kb = this.mgr.windows.find(w => w.kind === 'keyboard');
    if (kb && kb.field === this) { this.mgr.close?.(kb); return; }
    this.mgr.openKeyboardFor(this, false);
  }
  handleMessage(e) {
    // a field inside a frame of the page (iPhone app): its bridge talks to Madar directly; it belongs to the window last tapped
    const nested = window.MadarIOS && e.data && e.data.madar === 1 && e.data.nested && this.mgr.lastWebTap === this && /^(focus|field)$/.test(e.data.type);
    if (nested) {
      if (e.data.type === 'focus') this.mgr.openKeyboardFor(this, !!e.data.numeric);
      else { const kb = this.mgr.windows.find(w => w.kind === 'keyboard'); if (kb?.field === this) kb.syncField(e.data.value, e.data.caret); }
      return;
    }
    if ((e.origin === this.base || window.MadarIOS) && e.data && e.data.madar === 1 && this.css.some(c => c.f.contentWindow === e.source)) {
      if (e.data.type === 'snap') { if (this.css[0].f.contentWindow === e.source) this.onSnap(e.data); return; }
      if (e.data.type === 'field') { if (this.css[0].f.contentWindow === e.source) { const kb = this.mgr.windows.find(w => w.kind === 'keyboard'); if (kb?.field === this) kb.syncField(e.data.value, e.data.caret); } return; }
      if (e.data.type === 'focus') { if (this.css[0].f.contentWindow === e.source || this.snap) this.mgr.openKeyboardFor(this, !!e.data.numeric); return; }
      if (e.data.type === 'ready' && !this.bridge) { this.bridge = true; this.mgr.app.log('cplay2: التحكم باليد متصل'); this.mgr.app.toast('التحكم باليد جاهز: اقرص للنقر واسحب للتمرير'); }
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
    if (typeof d.info.duration === 'number' && d.info.duration > 0) this.ytState.dur = d.info.duration;
    if (eye === 0 && d.info.videoData?.title) this.ytTitle = d.info.videoData.title;
    if (eye === 0 && typeof d.info.muted === 'boolean') this.ytState.muted = d.info.muted;
    if (eye === 0 && typeof d.info.playerState === 'number') this.ytState.playing = d.info.playerState === 1 || d.info.playerState === 3;
  }
  // Called from a genuine screen tap: the best chance iOS allows sound.
  userGesture() { if (this.yt && this.ytState.muted) this.ytMute(false); }
  reload() { this.css.forEach(c => { c.f.src = 'about:blank'; }); this.loadEyes(); }
  update(dt, now) {
    if (this.sphere) this.sphere.position.copy(this.mgr.headLocal());
    this.content.updateMatrixWorld();
    if (this.autoScroll && this.bridge && now - (this.autoAt || 0) > 120) { this.autoAt = now; this.send({ type: 'scroll', dx: 0, dy: 6, x: 512, y: this.pageH / 2 }); }
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
  ref() { return Math.abs(this.aspect - 1.6) > 0.01 ? { url: this.url, title: this.title, aspect: +this.aspect.toFixed(3) } : { url: this.url, title: this.title }; }
  dispose() {
    this.disposed = true; clearTimeout(this.eyeTimer);
    this.mgr.webClosedAt = performance.now();
    super.dispose();
    this.tabPanel?.dispose(); this.strip?.dispose();
    window.removeEventListener('message', this.onMsg);
    this.css.forEach(c => { c.f.src = 'about:blank'; c.el.remove(); });
    this.mgr.app.renderer.cssCount--;
    this.cv.texture.dispose();
    clearTimeout(this.snapTimer); this.disposeSphere(); this.snapCv?.texture.dispose();
  }
}

// --- 3D model volume ---
let shadowTex = null;
export class ModelVolume {
  constructor(mgr, { itemId = null, url = null, name = '', files = null, includes = null }) {
    this.mgr = mgr; this.kind = 'model'; this.id = ++winId; this.files = files; this.includes = includes;
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
      { icon: 'home', active: () => !!this.envPin, action: () => this.mgr.pinToEnv(this, !this.envPin) },
      { icon: 'mic', action: () => { this.mgr.app.extras.noteTarget = this; this.mgr.app.listen('dictate'); } },
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
      } else if (this.files) res = await loadModelFromFiles(this.files.map(f => ({ name: f.name, blob: f })));
      else res = await loadModelFromUrl(this.url, this.includes);
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
  // visionOS 27 Quick Look annotations: notes floating above the model (say «ملاحظة …» while pointing at it, or 🎙)
  addNote(t) {
    t = String(t || '').trim(); if (!t) return;
    (this.notes ||= []).push(t);
    const i = this.notes.length - 1, ctx2 = document.createElement('canvas').getContext('2d');
    ctx2.font = '700 40px system-ui'; const wpx = Math.min(900, ctx2.measureText(t).width + 90);
    const panel = new CanvasPanel(wpx / 1500, 0.06, (ctx, W, H, p) => {
      roundRect(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2); ctx.fillStyle = 'rgba(250,204,21,0.92)'; ctx.fill();
      text(ctx, '📝 ' + t, W / 2, H / 2 + 2, H * 0.42, { weight: 700, color: '#2b2203', dir: 'auto', maxWidth: W - 30, fit: true });
      p.region(0, 0, W, H, () => { this.notes.splice(this.notes.indexOf(t), 1); this.group.remove(panel.mesh); panel.dispose(); this.noteMeshes = this.noteMeshes.filter(m => m !== panel.mesh); this.mgr.changed(); this.mgr.refreshTargets(); this.mgr.app.toast('حُذفت الملاحظة', 1200); }, 'x');
    }, { pxPerM: 1500 });
    (this.noteMeshes ||= []).push(panel.mesh); this.group.add(panel.mesh); this.mgr.refreshTargets();
  }
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
    if (this.noteMeshes) { const top = this.proxy.position.y * 2 + 0.06; this.noteMeshes.forEach((m, i) => m.position.set(0, top + i * 0.075, 0)); }
  }
  serialize() {
    const g = this.group;
    return { kind: 'model', ref: this.itemId ? { item: this.itemId } : this.files ? null : this.includes ? { url: this.url, name: this.name, includes: this.includes } : { url: this.url }, p: g.position.toArray().map(v => +v.toFixed(3)), s: +g.scale.x.toFixed(3), r: +this.rot.toFixed(3), spin: this.spin, ek: this.envPin || undefined, n: this.notes?.length ? this.notes : undefined };
  }
  dispose() {
    this.toolbar.dispose();
    this.object?.traverse(o => {
      if (o.isMesh) { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!m) return; Object.values(m).forEach(v => v && v.isTexture && v.dispose()); m.dispose(); }); }
    });
    this.revoke?.();
  }
}

// Other kinds of windows (reader, shelf, coach, manuscripts…) register themselves here: how to make one and where it opens.
const KINDS = {};
export function registerKind(kind, make, place = {}) { KINDS[kind] = { make, place }; }

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
    for (const w of this.windows) [w.group, w.world, w.sphere?.userData.interact ? w.sphere : null].filter(Boolean).forEach(g => g.traverse(o => { if (o.userData.interact) t.push(o); }));
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
    this.app.log?.('نافذة: ' + win.kind + (win.stream || win.remote ? ' (شاشة جهاز)' : '') + ' · المجموع ' + (this.windows.length + 1));
    win.group.scale.setScalar(scale);
    if (place) {
      if (win.kind === 'model') { this.place(win.group, dist, y); win.group.rotation.set(0, 0, 0); }
      else this.place(win.group, dist, y);
    }
    if (settings.curveAll && this.curvable(win)) setTimeout(() => { if (!win.disposed && !win.curved) win.setCurved(true); }, 0);
    this.root.add(win.group);
    this.windows.push(win);
    if (win.kind === 'web') { win.lastUse = performance.now(); this.guardMemory(win); }
    this.refreshTargets();
    this.changed();
    blip('open', settings.sounds);
    return win;
  }
  // visionOS 27 curved windows: every video / picture window bends around you (live web pages stay flat so
  // they keep working; the 🌀 button on a page curves it as a picture).
  // iPhone app: at most 3 live web pages at once (each one is two page copies in memory); the least recently
  // used one sleeps. Safari on its own copes; inside the app ARKit and Metal share the same memory budget.
  guardMemory(keep) {
    const max = window.MadarIOS ? 2 : 6;   // the iPhone app: ARKit + Metal share the page's memory
    const live = this.windows.filter(w => w.kind === 'web' && !w.asleep && !w.disposed);
    if (live.length <= max) return;
    live.filter(w => w !== keep).sort((a, b) => (a.lastUse || 0) - (b.lastUse || 0)).slice(0, live.length - max).forEach(w => w.sleep());
    this.app.toast('💤 حارس الذاكرة: نامت صفحة قديمة — انقرها لإيقاظها', 3000);
  }
  curvable(w) { return (w.kind === 'video' || w.kind === 'image') && !w.sphere && typeof w.setCurved === 'function'; }
  // which place you are in: a built-in environment, a library pick, or your own
  envId() { const e = settings.environment; return e === 'gallery' ? 'g:' + (settings.galleryEnv?.id || '') : e === 'mine' ? 'm:' + (settings.mineEnv || '') : e; }
  // furniture / pictures that belong to an environment: shown only there, and back whenever you return to it
  pinToEnv(w, on) {
    const id = this.envId();
    if (on && ['passthrough', 'dim'].includes(id)) { this.app.toast('اختر بيئة أولاً — في الواقع تبقى القطعة في غرفتك', 2500); w.envPin = null; return; }
    w.envPin = on ? id : null; this.changed(); w.toolbar?.redraw?.();
    this.app.toast(on ? '🏠 ثُبّتت في هذه البيئة' : 'تظهر في كل البيئات', 1800);
  }
  setCurveAll(on) {
    saveSettings({ curveAll: on });
    let n = 0;
    for (const w of this.windows) if (this.curvable(w) && w.curved !== on) { w.setCurved(on); n++; }
    this.changed();
    this.app.toast(on ? 'النوافذ منحنية حولك' + (n ? '' : ' · الجديدة ستنحني') : 'النوافذ مستوية', 2000);
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
  applyPicture() {
    const pic = picture();
    this.windows.forEach(w => { if (w.kind === 'video') { w.mat.uniforms.uDim.value = pic.bright; w.mat.uniforms.uPic.value.set(pic.contrast, pic.sat, pic.sharp, pic.green); w.pic?.panel.redraw(); } });
  }
  // A field was tapped inside a website: open the keyboard typing straight into it (numbers pad for number fields).
  openKeyboardFor(win, numeric) {
    let kb = this.windows.find(w => w.kind === 'keyboard');
    if (!kb) kb = this.open({ kind: 'keyboard' });
    kb.forField(win, numeric);
    // right under the page it types into, facing the same way
    if (win?.group) {
      win.group.updateMatrixWorld(true);
      const below = new THREE.Vector3(0, -((win.height || 0.6) * (win.group.scale?.y || 1)) / 2 - 0.2, 0.08).applyQuaternion(win.group.quaternion);
      // as wide as most of the window (a far window gets a big keyboard: it reads the same size)
      const k = Math.max(1, Math.min(3, ((win.width || 1) * (win.group.scale?.x || 1)) * 0.8 / 0.62));
      kb.group.scale.setScalar(k);
      below.set(0, -((win.height || 0.6) * (win.group.scale?.y || 1)) / 2 - 0.16 * k, 0.1).applyQuaternion(win.group.quaternion);
      kb.group.position.copy(win.group.position).add(below);
      kb.group.quaternion.copy(win.group.quaternion);
    }
    return kb;
  }
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
    if (KINDS[k]) { const K = KINDS[k]; if (K.place.single) { const old = this.windows.find(w => w.kind === k); if (old) this.close(old); } return this.add(K.make(this, spec), K.place); }
    if (k === 'video') return this.add(new VideoWindow(this, spec), { dist: 2.3, scale: 1.7, y: 0.05 });
    if (k === 'image') return this.add(new ImageWindow(this, spec), { dist: 1.9, scale: 1.25 });
    if (k === 'web') {
      // In the headset, sites open in a paired tablet's built-in browser when one is available.
      if (!spec.direct && this.app.useBuiltinBrowser?.(spec.url)) { this.app.openBrowser(spec.url); return null; }
      // Each site runs twice (one copy per eye): the memory guard keeps the live ones within the limit.
      return this.add(new WebWindow(this, spec), { dist: 2.1, scale: 1.6 });
    }
    if (k === 'panel') return this.add(new PanelWindow(this, spec), { dist: 1.6, scale: spec.panel === 'clock' ? 0.55 : 0.95, y: spec.panel === 'clock' ? 0.45 : 0 });
    if (k === 'model') return this.add(new ModelVolume(this, spec), { dist: 1.25, y: -0.38 });
    if (k === 'game') { const old = this.windows.find(w => w.kind === 'game'); if (old) this.close(old); return this.add(new BalloonGame(this), { dist: 1.2, y: -0.28, scale: 1 }); }
    if (k === 'keyboard') { const old = this.windows.find(w => w.kind === 'keyboard'); if (old) this.close(old); return this.add(new KeyboardWindow(this), { dist: 0.9, y: -0.2, scale: 1 }); }
  }
  // Put a window at an angle from where you look (negative = to your right), facing you.
  placeBeside(win, yawOff, dist = 2, y = 0) {
    const a = this.forwardYaw() + yawOff, h = this.headLocal();
    win.group.position.set(h.x - Math.sin(a) * dist, h.y + y, h.z - Math.cos(a) * dist);
    win.group.lookAt(h.x, h.y + y, h.z);
    win.onDragEnd?.();
  }
  // Bring every window back into a fan in front of the viewer.
  arrange() {
    const yaw = this.forwardYaw();
    const list = this.windows;
    const n = list.length;
    list.forEach((w, i) => {
      if (w.wallLock) return;   // pinned to a wall: stays there
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
      if (s.kind === 'web' && ++webs > 6) continue;   // the memory guard puts the extra ones to sleep
      try {
        const spec = Object.assign({ kind: s.kind }, s.ref);
        if (s.ref.item) spec.itemId = s.ref.item;
        if (spec.url) spec.url = spec.url.replace(/cplay[23]\.(netlify|vercel)\.app/, 'drivecast.c-p.workers.dev');
        let win;
        if (s.kind === 'video') win = new VideoWindow(this, spec);
        else if (s.kind === 'image') win = new ImageWindow(this, spec);
        else if (s.kind === 'web') win = new WebWindow(this, spec);
        else if (s.kind === 'panel') win = new PanelWindow(this, spec);
        else if (s.kind === 'model') win = new ModelVolume(this, spec);
        else if (KINDS[s.kind]) win = KINDS[s.kind].make(this, spec);
        if (!win) continue;
        win.group.position.fromArray(s.p);
        if (s.q) win.group.quaternion.fromArray(s.q);
        win.group.scale.setScalar(s.s || 1);
        win.wallLock = !!s.wl; if (s.ek) win.envPin = s.ek;
        if (s.vol != null && win.setVolume) setTimeout(() => win.setVolume(s.vol, false), 1500);
        if (s.cut) setTimeout(() => win.setCut?.(s.cut), 400);
        if (s.kind === 'model') { win.rot = s.r || 0; win.spin = !!s.spin; (s.n || []).forEach(t => win.addNote(t)); }
        else if (s.c) { win.curved = true; win.updateRadius(); win.layout(); }
        this.root.add(win.group);
        this.windows.push(win);
        // the iPhone app starts light: only the first saved page loads, the others wait asleep (tap to wake)
        if (win.kind === 'web') { if (window.MadarIOS && webs > 1) win.sleep(); else this.guardMemory(win); }
      } catch (e) { console.warn('restore failed', e); }
    }
    this.refreshTargets();
  }
  update(dt, now) {
    if (this.cinema && !this.windows.includes(this.cinema)) this.cinema = null;
    const env = this.envId();
    for (const w of this.windows) {
      // Cinema: only the chosen window stays visible. Pieces pinned to another environment wait for it.
      w.group.visible = !this.guard && (!this.cinema || w === this.cinema) && (!w.envPin || w.envPin === env);
      w.update(dt, now); w.matchTick?.();
      if (w.glow) w.updateGlow(now);
      // Pinned to the view: the window glides to stay straight ahead at the same distance.
      if (w.headLock && w.kind !== 'model') {
        // Keep the distance and height it had when pinned (measured once), so it never drifts away.
        const g = w.group, h = this.headLocal();
        if (!w.pin) { const rel = g.position.clone().sub(h); w.pin = { d: Math.max(0.8, Math.hypot(rel.x, rel.z)), y: rel.y }; }
        const yaw = this.forwardYaw();
        const tx = h.x - Math.sin(yaw) * w.pin.d, tz = h.z - Math.cos(yaw) * w.pin.d, ty = h.y + w.pin.y;
        const k = Math.min(1, dt * 6);
        g.position.x += (tx - g.position.x) * k; g.position.y += (ty - g.position.y) * k; g.position.z += (tz - g.position.z) * k;
        const t = this._pinT || (this._pinT = new THREE.Object3D());
        t.position.copy(g.position); this.root.add(t); t.lookAt(h.x, g.position.y, h.z); this.root.remove(t);
        g.quaternion.slerp(t.quaternion, k);
      } else if (w.pin) w.pin = null;
    }
  }
}

// ---------- Virtual keyboard with an address bar ----------
const KB = {
  en: ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
  ar: ['1234567890', 'ضصثقفغعهخحج', 'شسيبلاتنمكط', 'ئءؤرىةوزظد'],
  num: ['123', '456', '789', '.0+'],
};
export class KeyboardWindow {
  constructor(mgr) {
    this.mgr = mgr; this.kind = 'keyboard'; this.id = ++winId;
    this.text = ''; this.lang = 'en';
    this.group = new THREE.Group(); this.group.userData.window = this;
    this.panel = new CanvasPanel(0.62, 0.3, (ctx, W, H, p) => this.draw(ctx, W, H, p), { pxPerM: 2400 });
    this.panel.mesh.userData.interact.window = this;
    // Eye/pointer over the text: show where the cursor will land.
    const ph = this.panel.onHover.bind(this.panel);
    this.panel.onHover = (on, hit) => {
      const idx = on && hit?.uv && this.idxAt ? this.idxAt(hit.uv.x * this.panel.w) : null;
      const r = ph(on, hit);
      if (idx !== this.hoverIdx) { this.hoverIdx = idx; if (this.panel.hover === 'field') this.panel.redraw(); }
      return r;
    };
    this.group.add(this.panel.mesh);
    const { mesh: bar, hit } = makeBar(0.14, 0.016);
    hit.userData.interact = { type: 'drag', window: this, hover: on => { bar.userData.drawHover(on); return true; } };
    bar.position.set(0, -0.172, 0.002); this.group.add(bar); this.bar = bar;
    this.closeBtn = new IconButton('close', 0.034, () => this.mgr.close(this));
    this.closeBtn.mesh.position.set(-0.1, -0.172, 0.004); this.group.add(this.closeBtn.mesh);
  }
  // Typing at the cursor; in a website field the page edits at the same spot.
  live() { return this.field && this.mgr.windows.includes(this.field); }
  caretAt(i) { this.caret = Math.max(0, Math.min(this.text.length, i)); if (this.live()) this.field.send({ type: 'caret', pos: this.caret }); this.panel.redraw(); }
  key(ch) {
    const c = this.caret ?? this.text.length;
    this.text = this.text.slice(0, c) + ch + this.text.slice(c); this.caret = c + ch.length;
    if (this.live()) this.field.send({ type: 'text', value: ch });
    this.panel.redraw();
  }
  back() {   // delete one letter before the cursor
    const c = this.caret ?? this.text.length; if (c <= 0) return;
    this.text = this.text.slice(0, c - 1) + this.text.slice(c); this.caret = c - 1;
    if (this.live()) this.field.send({ type: 'key', key: 'Backspace' });
    this.panel.redraw();
  }
  clearAll() { this.text = ''; this.caret = 0; if (this.live()) this.field.send({ type: 'clear' }); this.panel.redraw(); }
  syncField(value, caret) { this.text = value || ''; this.caret = caret ?? this.text.length; this.panel.redraw(); }
  forField(win, numeric) { this.field = win; this.text = ''; this.caret = 0; this.lang = numeric ? 'num' : (this.lang === 'num' ? 'en' : this.lang); this.panel.redraw(); }
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
    const fy = 18 + fh / 2 + 2, fs = fh * 0.48, fx0 = 50, fx1 = W - 50;
    if (!this.text) {
      text(ctx, this.field ? (this.lang === 'num' ? 'اكتب الأرقام…' : 'اكتب في الحقل…') : 'اكتب رابطاً أو نصاً…', fx1, fy, fs, { align: 'right', dir: 'auto', weight: 700, color: COLORS.dim });
      this.caret = 0; this.idxAt = null;
    } else {
      // Text with a cursor that the eye/pointer can move: look at a spot in the text and click (or hold).
      ctx.save();
      ctx.font = `700 ${fs * TEXT_SCALE}px ${FONT}`;
      const rtl = /[\u0600-\u06FF]/.test(this.text), t = this.text, n = t.length;
      if (this.caret == null || this.caret > n) this.caret = n;
      const full = ctx.measureText(t).width, room = fx1 - fx0;
      // Distance from the starting edge to each letter boundary (keeps the cursor visible when the text is long).
      const off = i => ctx.measureText(t.slice(0, i)).width;
      const shift = Math.max(0, Math.min(full - room, off(this.caret) - room * 0.8));
      const xAt = i => rtl ? fx1 - (off(i) - shift) : fx0 + (off(i) - shift);
      ctx.beginPath(); ctx.rect(fx0, 18, room, fh); ctx.clip();
      ctx.fillStyle = COLORS.text; ctx.textBaseline = 'middle';
      ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'left';
      ctx.fillText(t, xAt(0), fy);
      const cx = xAt(this.caret);
      ctx.fillStyle = '#7cc4ff'; ctx.fillRect(cx - 2, 18 + fh * 0.18, 4, fh * 0.64);
      // Pointer/eye hovering the text: a faint marker where the cursor would go.
      if (p.isHover('field') && this.hoverIdx != null) { ctx.fillStyle = 'rgba(124,196,255,0.45)'; ctx.fillRect(xAt(this.hoverIdx) - 1, 18 + fh * 0.1, 2, fh * 0.8); }
      ctx.restore();
      this.idxAt = lx => { let best = n, bd = 1e9; for (let i = 0; i <= n; i++) { const d = Math.abs(xAt(i) - lx); if (d < bd) { bd = d; best = i; } } return best; };
      p.region(24, 18, W - 48, fh, (lx) => { blip('tap', settings.sounds); this.caretAt(this.idxAt(24 + lx)); }, 'field');
    }
    const rows = KB[this.lang], top = 18 + fh + 16, rh = (H - top - 18) / 5.2;
    const keyBtn = (x, y, w, h, label, action, id, accent) => {
      const hov = p.isHover(id);
      roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 14);
      ctx.fillStyle = hov ? 'rgba(255,255,255,0.4)' : accent ? 'rgba(124,196,255,0.28)' : 'rgba(255,255,255,0.1)'; ctx.fill();
      text(ctx, label, x + w / 2, y + h / 2 + 2, Math.min(h * 0.45, 44), { weight: 800, dir: 'auto' });
      p.region(x, y, w, h, () => { blip('tap', settings.sounds); action(); }, id);
    };
    rows.forEach((r, ri) => {
      const n = r.length, kw = (W - 48) / Math.max(n, this.lang === 'num' ? 4 : 10), x0 = (W - kw * n) / 2;
      [...r].forEach((ch, i) => {
        const x = this.lang === 'ar' ? x0 + (n - 1 - i) * kw : x0 + i * kw;
        keyBtn(x, top + ri * rh, kw, rh, ch, () => this.key(ch), 'k' + ri + '-' + i);
      });
    });
    // Bottom row
    const y = top + 4 * rh, bh = rh * 1.15;
    const nextLang = () => { this.lang = { en: 'ar', ar: 'num', num: 'en' }[this.lang] || 'en'; this.panel.redraw(); };
    const langLabel = { en: 'ع', ar: '123', num: 'EN' }[this.lang];
    const items = this.field ? [
      [langLabel, 0.9, nextLang],
      ['◀', 0.7, () => this.caretAt((this.caret ?? 0) - 1)], ['مسافة', 2, () => this.key(' ')], ['▶', 0.7, () => this.caretAt((this.caret ?? 0) + 1)],
      ['⌫', 0.9, () => this.back()], ['🗑', 0.9, () => this.clearAll()],
      ['🎙', 0.8, () => this.mgr.app.listen('dictate')],
      ['إدخال ↵', 1.4, () => { this.field?.send({ type: 'key', key: 'Enter' }); }, true],
      ['تم', 1.1, () => this.mgr.close(this), true],
    ] : [
      [langLabel, 0.8, nextLang],
      ['.', 0.6, () => this.key('.')], ['/', 0.6, () => this.key('/')], ['.com', 1, () => this.key('.com')],
      ['مسافة', 1.6, () => this.key(' ')], ['⌫', 0.8, () => this.back()], ['🗑', 0.8, () => this.clearAll()],
      ['🎙', 0.8, () => this.mgr.app.listen('dictate')],
      ['حفظ', 1, () => this.save(), true], ['إرسال', 1.1, () => this.sendToPage(), true], ['فتح', 1.1, () => this.open(), true],
    ];
    const total = items.reduce((s, it) => s + it[1], 0), unit = (W - 48) / total;
    let x = 24;
    items.forEach(([l, w, a, acc], i) => { keyBtn(x, y, unit * w, bh, l, a, 'b' + i, acc); x += unit * w; });
  }
  open() {
    if (/^\d{6}$/.test(this.text.trim())) { this.mgr.app.connectMirror(this.text.trim()); return; }   // laptop screen code
    const b = [...this.mgr.windows].reverse().find(x => x.browser && x.remote);
    if (b && this.text.trim()) { b.navigate(this.text.trim()); this.mgr.app.toast('فتح في متصفح مدار', 1500); return; }
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
