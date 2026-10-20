// Spatial UI primitives drawn with canvas textures: glass panels, icon buttons, ornaments, toasts.
import * as THREE from 'three';

export const FONT = 'system-ui, -apple-system, "SF Arabic", "Geeza Pro", "Helvetica Neue", sans-serif';
export const COLORS = {
  // visionOS-like frosted glass: light grey, translucent, bright hairline edge.
  glass: 'rgba(108,112,124,0.52)',
  glassHi: 'rgba(160,165,178,0.62)',
  stroke: 'rgba(255,255,255,0.32)',
  text: '#f4f6fb',
  dim: 'rgba(225,232,248,0.86)',
  accent: '#7cc4ff',
  accent2: '#b59cff',
  warm: '#ffc88a',
  danger: '#ff7b7b',
};

export let maxAniso = 4;
export function setMaxAniso(v) { maxAniso = v; }

export function canvasTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAniso;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return { canvas, ctx, texture };
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function glass(ctx, x, y, w, h, r, hi = false) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = hi ? COLORS.glassHi : COLORS.glass;
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.24)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = Math.max(1.5, h * 0.012);
  ctx.strokeStyle = COLORS.stroke; ctx.stroke();
  ctx.restore();
}

export const TEXT_SCALE = 1.12;   // all spatial UI text slightly larger
export function text(ctx, str, x, y, size, opts = {}) {
  ctx.save();
  size *= TEXT_SCALE;
  ctx.font = `${opts.weight || 500} ${size}px ${FONT}`;
  ctx.fillStyle = opts.color || COLORS.text;
  ctx.textAlign = opts.align || 'center';
  ctx.textBaseline = opts.baseline || 'middle';
  ctx.direction = opts.dir === 'auto' ? (/[؀-ۿ]/.test(str) ? 'rtl' : 'ltr') : (opts.dir || 'rtl');
  // fit: shrink the text (down to 62%) so the whole label shows, before cutting it with …
  if (opts.maxWidth && opts.fit && ctx.measureText(str).width > opts.maxWidth) {
    const k = Math.max(0.5, opts.maxWidth / ctx.measureText(str).width);
    size *= k; ctx.font = `${opts.weight || 500} ${size}px ${FONT}`;
  }
  if (opts.maxWidth) {
    let s = str;
    while (s.length > 1 && ctx.measureText(s).width > opts.maxWidth) s = s.slice(0, -2);
    if (s !== str) s = s.slice(0, -1) + '…';
    str = s;
  }
  ctx.fillText(str, x, y);
  ctx.restore();
}

// Vector icons. (cx, cy) centre, s = size of the icon box.
export function icon(ctx, name, cx, cy, s, color = COLORS.text) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = s * 0.11; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const h = s / 2;
  const P = (pts, fill = true) => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x * h, y * h) : ctx.moveTo(x * h, y * h)); ctx.closePath(); fill ? ctx.fill() : ctx.stroke(); };
  switch (name) {
    case 'play': P([[-0.45, -0.65], [0.7, 0], [-0.45, 0.65]]); break;
    case 'eye': case 'eyeOff':
      ctx.beginPath(); ctx.moveTo(-0.85 * h, 0); ctx.quadraticCurveTo(0, -0.75 * h, 0.85 * h, 0); ctx.quadraticCurveTo(0, 0.75 * h, -0.85 * h, 0); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 0.26 * h, 0, 7); ctx.fill();
      if (name === 'eyeOff') { ctx.beginPath(); ctx.moveTo(-0.7 * h, -0.7 * h); ctx.lineTo(0.7 * h, 0.7 * h); ctx.stroke(); }
      break;
    case 'pause': ctx.fillRect(-0.55 * h, -0.62 * h, 0.36 * h, 1.24 * h); ctx.fillRect(0.19 * h, -0.62 * h, 0.36 * h, 1.24 * h); break;
    case 'close': ctx.beginPath(); ctx.moveTo(-0.45 * h, -0.45 * h); ctx.lineTo(0.45 * h, 0.45 * h); ctx.moveTo(0.45 * h, -0.45 * h); ctx.lineTo(-0.45 * h, 0.45 * h); ctx.stroke(); break;
    case 'plus': ctx.beginPath(); ctx.moveTo(-0.55 * h, 0); ctx.lineTo(0.55 * h, 0); ctx.moveTo(0, -0.55 * h); ctx.lineTo(0, 0.55 * h); ctx.stroke(); break;
    case 'minus': ctx.beginPath(); ctx.moveTo(-0.55 * h, 0); ctx.lineTo(0.55 * h, 0); ctx.stroke(); break;
    case 'back': case 'fwd': {
      const d = name === 'back' ? -1 : 1;
      ctx.beginPath(); ctx.arc(0, 0, 0.6 * h, d > 0 ? -Math.PI * 0.95 : -Math.PI * 0.05, d > 0 ? Math.PI * 0.6 : Math.PI * 0.4, d < 0); ctx.stroke();
      const ax = d > 0 ? -0.6 * h : 0.6 * h;
      P([[ax / h - 0.25 * d, -0.15], [ax / h + 0.05 * d, -0.55], [ax / h + 0.35 * d, -0.1]]);
      ctx.font = `700 ${s * 0.36}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
      ctx.fillText('10', 0, 0.06 * h); break;
    }
    case 'sound': case 'mute':
      P([[-0.7, -0.25], [-0.35, -0.25], [0.05, -0.6], [0.05, 0.6], [-0.35, 0.25], [-0.7, 0.25]]);
      if (name === 'sound') { ctx.beginPath(); ctx.arc(0.1 * h, 0, 0.42 * h, -0.8, 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(0.1 * h, 0, 0.7 * h, -0.8, 0.8); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(0.3 * h, -0.3 * h); ctx.lineTo(0.75 * h, 0.3 * h); ctx.moveTo(0.75 * h, -0.3 * h); ctx.lineTo(0.3 * h, 0.3 * h); ctx.stroke(); }
      break;
    case 'curve': ctx.beginPath(); ctx.moveTo(-0.8 * h, -0.55 * h); ctx.quadraticCurveTo(0, -0.2 * h, 0.8 * h, -0.55 * h); ctx.lineTo(0.8 * h, 0.55 * h); ctx.quadraticCurveTo(0, 0.2 * h, -0.8 * h, 0.55 * h); ctx.closePath(); ctx.stroke(); break;
    case 'flat': ctx.strokeRect(-0.7 * h, -0.45 * h, 1.4 * h, 0.9 * h); break;
    case 'reload': ctx.beginPath(); ctx.arc(0, 0, 0.55 * h, -Math.PI * 0.2, Math.PI * 1.5); ctx.stroke(); P([[0.25, -0.95], [0.75, -0.5], [0.15, -0.3]]); break;
    case 'spin': ctx.beginPath(); ctx.ellipse(0, 0.2 * h, 0.7 * h, 0.3 * h, 0, 0.3, Math.PI * 2 - 0.3); ctx.stroke(); P([[0.55, 0.05], [0.85, 0.15], [0.6, 0.45]]); ctx.beginPath(); ctx.moveTo(0, -0.7 * h); ctx.lineTo(0, 0.2 * h); ctx.stroke(); break;
    case 'reset': ctx.beginPath(); ctx.arc(0, 0, 0.55 * h, Math.PI * 0.3, Math.PI * 1.9); ctx.stroke(); P([[-0.75, -0.2], [-0.35, 0.25], [-0.15, -0.35]]); break;
    case 'grid': for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc((i - 1) * 0.55 * h, (j - 1) * 0.55 * h, 0.15 * h, 0, 7); ctx.fill(); } break;
    case 'video': roundRect(ctx, -0.75 * h, -0.5 * h, 1.1 * h, 1 * h, 0.15 * h); ctx.stroke(); P([[0.4, -0.05], [0.8, -0.35], [0.8, 0.35], [0.4, 0.05]]); break;
    case 'image': roundRect(ctx, -0.75 * h, -0.6 * h, 1.5 * h, 1.2 * h, 0.15 * h); ctx.stroke(); P([[-0.55, 0.45], [-0.15, -0.05], [0.15, 0.25], [0.3, 0.1], [0.55, 0.45]]); ctx.beginPath(); ctx.arc(0.3 * h, -0.25 * h, 0.13 * h, 0, 7); ctx.fill(); break;
    case 'cube':
      P([[0, -0.75], [0.7, -0.38], [0.7, 0.4], [0, 0.78], [-0.7, 0.4], [-0.7, -0.38]], false);
      ctx.beginPath(); ctx.moveTo(-0.7 * h, -0.38 * h); ctx.lineTo(0, 0); ctx.lineTo(0.7 * h, -0.38 * h); ctx.moveTo(0, 0); ctx.lineTo(0, 0.78 * h); ctx.stroke(); break;
    case 'globe': ctx.beginPath(); ctx.arc(0, 0, 0.7 * h, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, 0, 0.3 * h, 0.7 * h, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-0.7 * h, 0); ctx.lineTo(0.7 * h, 0); ctx.stroke(); break;
    case 'home': ctx.beginPath(); ctx.moveTo(-0.7 * h, -0.05 * h); ctx.lineTo(0, -0.7 * h); ctx.lineTo(0.7 * h, -0.05 * h); ctx.moveTo(-0.5 * h, -0.2 * h); ctx.lineTo(-0.5 * h, 0.65 * h); ctx.lineTo(0.5 * h, 0.65 * h); ctx.lineTo(0.5 * h, -0.2 * h); ctx.stroke(); break;
    case 'keyboard': roundRect(ctx, -0.8 * h, -0.5 * h, 1.6 * h, 1.0 * h, 0.15 * h); ctx.stroke(); for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { ctx.beginPath(); ctx.arc((-0.48 + c * 0.32) * h, (-0.2 + r * 0.28) * h, 0.06 * h, 0, 7); ctx.fill(); } ctx.beginPath(); ctx.moveTo(-0.35 * h, 0.3 * h); ctx.lineTo(0.35 * h, 0.3 * h); ctx.stroke(); break;
    case 'enter': ctx.beginPath(); ctx.moveTo(0.6 * h, -0.55 * h); ctx.lineTo(0.6 * h, 0.15 * h); ctx.lineTo(-0.6 * h, 0.15 * h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-0.3 * h, -0.15 * h); ctx.lineTo(-0.62 * h, 0.15 * h); ctx.lineTo(-0.3 * h, 0.45 * h); ctx.stroke(); break;
    case 'clock': ctx.beginPath(); ctx.arc(0, 0, 0.7 * h, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -0.42 * h); ctx.lineTo(0, 0); ctx.lineTo(0.3 * h, 0.2 * h); ctx.stroke(); break;
    case 'hand': ctx.beginPath(); ctx.arc(0.2 * h, 0.1 * h, 0.12 * h, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(-0.25 * h, -0.2 * h, 0.12 * h, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(-0.25 * h, -0.2 * h); ctx.lineTo(-0.5 * h, -0.75 * h); ctx.moveTo(0.2 * h, 0.1 * h); ctx.lineTo(0.75 * h, 0.4 * h); ctx.stroke(); ctx.beginPath(); ctx.arc(-0.05 * h, 0.35 * h, 0.4 * h, 0, Math.PI * 2); ctx.stroke(); break;
    case 'sun': ctx.beginPath(); ctx.arc(0, 0, 0.32 * h, 0, 7); ctx.fill(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 0.52 * h, Math.sin(a) * 0.52 * h); ctx.lineTo(Math.cos(a) * 0.78 * h, Math.sin(a) * 0.78 * h); ctx.stroke(); } break;
    case 'target': ctx.beginPath(); ctx.arc(0, 0, 0.7 * h, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 0.32 * h, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 0.08 * h, 0, 7); ctx.fill(); break;
    case 'sliders': for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-0.7 * h, i * 0.5 * h); ctx.lineTo(0.7 * h, i * 0.5 * h); ctx.stroke(); ctx.beginPath(); ctx.arc([0.35, -0.3, 0.1][i + 1] * h, i * 0.5 * h, 0.16 * h, 0, 7); ctx.fill(); } break;
    case 'dots': for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * 0.55 * h, 0, 0.14 * h, 0, 7); ctx.fill(); } break;
    case 'stack': for (let i = 0; i < 3; i++) { roundRect(ctx, (-0.6 + i * 0.15) * h, (-0.6 + i * 0.2) * h, 1.0 * h, 0.7 * h, 0.12 * h); i === 2 ? ctx.fill() : ctx.stroke(); } break;
    case 'exit': ctx.beginPath(); ctx.moveTo(0.1 * h, -0.7 * h); ctx.lineTo(-0.6 * h, -0.7 * h); ctx.lineTo(-0.6 * h, 0.7 * h); ctx.lineTo(0.1 * h, 0.7 * h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-0.15 * h, 0); ctx.lineTo(0.75 * h, 0); ctx.stroke(); P([[0.45, -0.3], [0.85, 0], [0.45, 0.3]]); break;
    case 'trash': ctx.beginPath(); ctx.moveTo(-0.6 * h, -0.45 * h); ctx.lineTo(0.6 * h, -0.45 * h); ctx.moveTo(-0.2 * h, -0.65 * h); ctx.lineTo(0.2 * h, -0.65 * h); ctx.stroke(); P([[-0.45, -0.3], [0.45, -0.3], [0.35, 0.7], [-0.35, 0.7]], false); break;
    case 'cast': roundRect(ctx, -0.75 * h, -0.6 * h, 1.5 * h, 1.05 * h, 0.12 * h); ctx.stroke(); P([[-0.35, 0.75], [0.35, 0.75], [0, 0.3]]); break;
    case 'chevL': ctx.beginPath(); ctx.moveTo(0.25 * h, -0.55 * h); ctx.lineTo(-0.3 * h, 0); ctx.lineTo(0.25 * h, 0.55 * h); ctx.stroke(); break;
    case 'chevR': ctx.beginPath(); ctx.moveTo(-0.25 * h, -0.55 * h); ctx.lineTo(0.3 * h, 0); ctx.lineTo(-0.25 * h, 0.55 * h); ctx.stroke(); break;
    case 'snow': for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * -0.75 * h, Math.sin(a) * -0.75 * h); ctx.lineTo(Math.cos(a) * 0.75 * h, Math.sin(a) * 0.75 * h); ctx.stroke(); } ctx.beginPath(); ctx.arc(0, 0, 0.14 * h, 0, 7); ctx.fill(); break;
    case 'walk': ctx.beginPath(); ctx.arc(0.1 * h, -0.62 * h, 0.17 * h, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, -0.35 * h); ctx.lineTo(-0.12 * h, 0.15 * h); ctx.lineTo(-0.45 * h, 0.75 * h); ctx.moveTo(-0.12 * h, 0.15 * h); ctx.lineTo(0.3 * h, 0.4 * h); ctx.lineTo(0.3 * h, 0.78 * h); ctx.moveTo(-0.45 * h, -0.1 * h); ctx.lineTo(-0.05 * h, -0.3 * h); ctx.lineTo(0.4 * h, -0.05 * h); ctx.stroke(); break;
    case 'shield': ctx.beginPath(); ctx.moveTo(0, -0.78 * h); ctx.lineTo(0.62 * h, -0.5 * h); ctx.quadraticCurveTo(0.6 * h, 0.45 * h, 0, 0.8 * h); ctx.quadraticCurveTo(-0.6 * h, 0.45 * h, -0.62 * h, -0.5 * h); ctx.closePath(); ctx.stroke(); break;
    case 'ball': ctx.beginPath(); ctx.arc(0, 0, 0.72 * h, 0, 7); ctx.stroke(); P([[0, -0.3], [0.29, -0.09], [0.18, 0.25], [-0.18, 0.25], [-0.29, -0.09]]); break;
    case 'moon': ctx.beginPath(); ctx.arc(0, 0, 0.7 * h, 0.9, Math.PI * 2 - 0.9 + Math.PI * 0.0, false); ctx.arc(0.32 * h, -0.12 * h, 0.55 * h, Math.PI * 2 - 1.25, 1.55, true); ctx.closePath(); ctx.fill(); break;
    case 'cursor': P([[-0.45, -0.75], [0.5, 0.15], [0.05, 0.2], [0.3, 0.72], [0.1, 0.8], [-0.12, 0.3], [-0.45, 0.6]]); break;
    case 'mic': roundRect(ctx, -0.25 * h, -0.75 * h, 0.5 * h, 0.95 * h, 0.25 * h); ctx.fill(); ctx.beginPath(); ctx.arc(0, -0.05 * h, 0.5 * h, 0.15, Math.PI - 0.15); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 0.45 * h); ctx.lineTo(0, 0.75 * h); ctx.stroke(); break;
    default: ctx.beginPath(); ctx.arc(0, 0, 0.3 * h, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// A plane mesh backed by a canvas, with clickable regions defined during draw.
export class CanvasPanel {
  constructor(widthM, heightM, draw, { pxPerM = 1100, maxPx = 2048, doubleSided = false } = {}) {
    const scale = Math.min(pxPerM, maxPx / Math.max(widthM, heightM));
    this.w = Math.round(widthM * scale); this.h = Math.round(heightM * scale);
    const { canvas, ctx, texture } = canvasTexture(this.w, this.h);
    this.canvas = canvas; this.ctx = ctx; this.texture = texture;
    this.drawFn = draw;
    this.regions = [];
    this.hover = null;
    this.pressed = null;
    this.widthM = widthM; this.heightM = heightM;
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), mat);
    this.mesh.userData.interact = {
      type: 'panel',
      panel: this,
      hover: (on, hit) => this.onHover(on, hit),
      click: hit => this.onClick(hit),
    };
    this.redraw();
  }
  region(x, y, w, h, action, id) { this.regions.push({ x, y, w, h, action, id: id ?? this.regions.length }); }
  isHover(id) { return this.hover != null && this.hover === id; }
  redraw() {
    this.regions = [];
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.drawFn(this.ctx, this.w, this.h, this);
    this.texture.needsUpdate = true;
  }
  hitRegion(hit) {
    if (!hit || !hit.uv) return null;
    const x = hit.uv.x * this.w, y = (1 - hit.uv.y) * this.h;
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }
  onHover(on, hit) {
    const r = on ? this.hitRegion(hit) : null;
    const id = r ? r.id : null;
    if (id !== this.hover) { this.hover = id; this.redraw(); }
    return !!r;
  }
  onClick(hit) {
    const r = this.hitRegion(hit);
    if (r && r.action) { r.action(hit.uv.x * this.w - r.x, (1 - hit.uv.y) * this.h - r.y); return true; }
    return false;
  }
  isButtonAt(hit) { return !!this.hitRegion(hit); }
  dispose() { this.texture.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// Rounded rectangle geometry (XY plane, centred).
export function roundedRectGeometry(w, h, r, seg = 8) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ShapeGeometry(s, seg);
  // Generate UVs 0..1 across the box.
  const pos = g.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pos.getX(i) - x) / w; uv[i * 2 + 1] = (pos.getY(i) - y) / h; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Draggable window bar (visionOS-style pill).
export function makeBar(width = 0.2, height = 0.024) {
  const { canvas, ctx, texture } = canvasTexture(256, 32);
  const draw = (hover) => {
    ctx.clearRect(0, 0, 256, 32);
    roundRect(ctx, 2, 2, 252, 28, 14);
    ctx.fillStyle = hover ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.55)';
    ctx.fill();
    texture.needsUpdate = true;
  };
  draw(false);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  // Larger invisible hit area makes the bar easy to grab.
  const hit = new THREE.Mesh(new THREE.PlaneGeometry(width * 3, height * 5.5), new THREE.MeshBasicMaterial({ visible: false }));
  mesh.add(hit);
  mesh.userData.drawHover = draw;
  return { mesh, hit };
}

// Round icon button.
export class IconButton {
  constructor(iconName, size, onClick, { tint = null } = {}) {
    const { canvas, ctx, texture } = canvasTexture(160, 160);
    this.ctx = ctx; this.texture = texture; this.iconName = iconName; this.tint = tint; this.onClick = onClick;
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(size / 2, 40), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    this.mesh.userData.interact = { type: 'button', hover: on => { this.setHover(on); return true; }, click: () => { this.onClick && this.onClick(); return true; } };
    this.hover = false;
    this.draw();
  }
  setIcon(n) { if (n !== this.iconName) { this.iconName = n; this.draw(); } }
  setHover(on) { if (on !== this.hover) { this.hover = on; this.draw(); this.mesh.scale.setScalar(on ? 1.12 : 1); } }
  draw() {
    const c = this.ctx;
    c.clearRect(0, 0, 160, 160);
    c.beginPath(); c.arc(80, 80, 76, 0, 7);
    c.fillStyle = this.hover ? 'rgba(96,102,126,0.95)' : 'rgba(40,43,56,0.82)'; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.22)'; c.stroke();
    icon(c, this.iconName, 80, 80, 74, this.tint || COLORS.text);
    this.texture.needsUpdate = true;
  }
  dispose() { this.texture.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// Soft circular shadow / glow texture.
export function radialTexture(inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)') {
  const { canvas, ctx, texture } = canvasTexture(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  texture.needsUpdate = true;
  return texture;
}

// Small UI sounds made with WebAudio.
let actx = null;
export function audioContext() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; } }
  return actx;
}
export function blip(kind = 'tap', enabled = true) {
  if (!enabled) return;
  const a = audioContext(); if (!a || a.state !== 'running') return;
  const o = a.createOscillator(), g = a.createGain();
  const t = a.currentTime;
  const f = { tap: [880, 1320], open: [520, 980], close: [700, 360], grab: [420, 520], error: [300, 200] }[kind] || [880, 1320];
  o.type = 'sine';
  o.frequency.setValueAtTime(f[0], t);
  o.frequency.exponentialRampToValueAtTime(f[1], t + 0.08);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + 0.16);
}
