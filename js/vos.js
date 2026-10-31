// «visionOS 27» - Madar's design system, one place for every surface: Apple's system colours and type, the glass
// material, visionOS app icons, Apple-style widget backgrounds, the Liquid Glass clock numerals, the Apple Clock face.
// Everything is drawn the cheap way for the iPhone: native system font (SF / SF Arabic, already in the OS), native
// Apple emoji for weather symbols, no canvas blur shadows (faked with gradients), fewer pixels per panel on iPhone.
export const OS_NAME = 'visionOS 27';
export const IOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// ---- type: the system font the OS already has (nothing to download), Apple's text styles (pt at 1 m ≈ px here)
export const SF = '-apple-system, "SF Pro Display", "SF Arabic", system-ui, "Geeza Pro", "Helvetica Neue", sans-serif';
export const SF_ROUNDED = 'ui-rounded, "SF Pro Rounded", -apple-system, "SF Arabic", system-ui, sans-serif';

// ---- Apple system colours (dark appearance)
export const SYS = {
  red: '#ff453a', orange: '#ff9f0a', yellow: '#ffd60a', green: '#30d158', mint: '#63e6e2', teal: '#40c8e0', cyan: '#64d2ff',
  blue: '#0a84ff', indigo: '#5e5ce6', purple: '#bf5af2', pink: '#ff375f', brown: '#ac8e68', gray: '#8e8e93',
  label: 'rgba(255,255,255,0.96)', label2: 'rgba(235,235,245,0.64)', label3: 'rgba(235,235,245,0.34)', sep: 'rgba(255,255,255,0.14)',
};
// visionOS icon backgrounds: a bright top, a deeper bottom (Apple's own app colours)
export const ICON_BG = {
  clock: ['#3a3a3c', '#1c1c1e'], mic: ['#ff6a8d', '#e0115f'], sun: ['#5ac8fa', '#1e7cf2'], grid: ['#5ea8ff', '#1f5fe0'],
  stack: ['#c084fc', '#7e3af2'], video: ['#ff6b5e', '#e0261a'], image: ['#ffffff', '#e8e8ed'], keyboard: ['#9a9aa0', '#55555c'],
  reset: ['#6ad0ff', '#0a84ff'], target: ['#5ef0d0', '#00a389'], globe: ['#5ac8fa', '#0a6cff'], play: ['#ff8a3d', '#f2440d'],
  music: ['#ff6482', '#f5214b'], folder: ['#6ac4ff', '#1a8cff'], settings: ['#a1a1a6', '#5e5e63'], eye: ['#8b8aff', '#5150e0'],
  sound: ['#ff6482', '#f5214b'], hand: ['#ffd25e', '#ff9500'], trash: ['#ff6b5e', '#d70015'], exit: ['#ff6b5e', '#d70015'],
  sliders: ['#a1a1a6', '#5e5e63'], cube: ['#8b8aff', '#4b44d6'], snow: ['#7ee4ff', '#16a3d9'], walk: ['#7ae582', '#1fae45'],
  shield: ['#b6e85a', '#5e9e14'], ball: ['#5ee27a', '#16a34a'], moon: ['#4b4fd8', '#1e1b6e'], cursor: ['#6ad0ff', '#0a6cd6'],
  book: ['#ffb340', '#ff7a00'], dumbbell: ['#ff9f5a', '#e2560d'], glove: ['#ff6b5e', '#c4161c'], heart: ['#ff6482', '#e0115f'],
  neck: ['#c084fc', '#7e3af2'], muscle: ['#ff9f5a', '#c2410c'], home: ['#5ea8ff', '#1f5fe0'], cast: ['#5ac8fa', '#0a6cff'],
  chevR: ['#a1a1a6', '#5e5e63'], chevL: ['#a1a1a6', '#5e5e63'], star: ['#ffd25e', '#ff9500'], dots: ['#a1a1a6', '#5e5e63'],
  _: ['#7d8aa6', '#4a5470'],
};
// glyph colour inside the icon: dark on the light ones (Photos-like white icon), white on the rest
const DARK_GLYPH = new Set(['image']);

// ---- the iPhone: no blur shadows on canvas (Safari draws them on the CPU, every redraw) - a big part of the heat
if (IOS && typeof CanvasRenderingContext2D !== 'undefined') {
  try {
    const d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
    if (d?.set) Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowBlur', { configurable: true, get: d.get, set(v) { d.set.call(this, 0); } });
    const c = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowColor');
    if (c?.set) Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowColor', { configurable: true, get: c.get, set(v) { c.set.call(this, 'rgba(0,0,0,0)'); } });
  } catch {}
}
// panels on the iPhone use fewer pixels (sharp enough at 1-2 m in the headset, much less to redraw and upload)
export const PX = IOS ? 0.78 : 1;

// ---- shapes
export function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// a soft shadow under something, without canvas blur: a radial gradient ellipse
export function softShadow(ctx, cx, cy, rx, ry, a = 0.45) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, 7); ctx.fill(); ctx.restore();
}
// the visionOS glass material: translucent grey that lets the room through, a lit top edge, a darker bottom
export function material(ctx, x, y, w, h, r, { hi = false, tint = null, a = 1 } = {}) {
  ctx.save(); ctx.globalAlpha *= a;
  rr(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  if (tint) { g.addColorStop(0, tint[0]); g.addColorStop(1, tint[1]); }
  else { g.addColorStop(0, hi ? 'rgba(150,152,165,0.66)' : 'rgba(118,120,134,0.56)'); g.addColorStop(1, hi ? 'rgba(112,114,128,0.62)' : 'rgba(84,86,100,0.52)'); }
  ctx.fillStyle = g; ctx.fill();
  ctx.clip();
  const sh = ctx.createLinearGradient(0, y, 0, y + Math.min(h, r * 2));
  sh.addColorStop(0, 'rgba(255,255,255,0.20)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh; ctx.fillRect(x, y, w, Math.min(h, r * 2));
  ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.012);
  const rim = ctx.createLinearGradient(0, y, 0, y + h);
  rim.addColorStop(0, 'rgba(255,255,255,0.55)'); rim.addColorStop(0.3, 'rgba(255,255,255,0.14)'); rim.addColorStop(1, 'rgba(255,255,255,0.22)');
  ctx.strokeStyle = rim; rr(ctx, x + 1, y + 1, w - 2, h - 2, Math.max(0, r - 1)); ctx.stroke();
  ctx.restore();
}

// ---- type helper (the OS font, Apple text styles: weight carries the hierarchy)
export function label(ctx, str, x, y, size, { weight = 600, color = SYS.label, align = 'center', dir = 'auto', maxWidth = 0, font = SF, baseline = 'middle' } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = baseline;
  ctx.direction = dir === 'auto' ? (/[؀-ۿ]/.test(String(str)) ? 'rtl' : 'ltr') : dir;
  let s = String(str);
  if (maxWidth && ctx.measureText(s).width > maxWidth) {
    const k = Math.max(0.7, maxWidth / ctx.measureText(s).width); ctx.font = `${weight} ${size * k}px ${font}`;
    while (s.length > 1 && ctx.measureText(s).width > maxWidth) s = s.slice(0, -2) + '…';
  }
  ctx.fillText(s, x, y); ctx.restore();
}
// a label floating over the room (Home View names): a cheap legible shadow - the text once dark and offset, then white
export function floatLabel(ctx, str, x, y, size, maxWidth) {
  label(ctx, str, x + 1.5, y + 2, size, { weight: 600, color: 'rgba(0,0,0,0.55)', maxWidth });
  label(ctx, str, x, y, size, { weight: 600, color: '#fff', maxWidth });
}

// ---- visionOS app icon: a circle with a vivid gradient, a white symbol with a little depth, glass on top
export function appIcon(ctx, glyph, ic, cx, cy, R, { hover = false, round = true } = {}) {
  const [c1, c2] = ICON_BG[ic] || ICON_BG._;
  softShadow(ctx, cx, cy + R * 0.22, R * 1.08, R * 0.9, hover ? 0.5 : 0.4);
  const shape = () => { if (round) { ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); } else rr(ctx, cx - R, cy - R, R * 2, R * 2, R * 0.45); };
  shape(); const g = ctx.createLinearGradient(cx, cy - R, cx, cy + R); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; ctx.fill();
  // layered symbol: a soft dark copy under the white one = the visionOS "depth" layer
  const dark = DARK_GLYPH.has(ic), col = dark ? '#ff9500' : '#ffffff';
  ctx.save(); ctx.globalAlpha = 0.22; glyph(ctx, ic, cx + R * 0.03, cy + R * 0.07, R * 0.98, dark ? '#000' : '#000'); ctx.restore();
  glyph(ctx, ic, cx, cy, R * 0.98, col);
  // the glass cap: a bright arc on the top half, a hairline rim
  ctx.save(); shape(); ctx.clip();
  const hl = ctx.createLinearGradient(cx, cy - R, cx, cy + R * 0.1); hl.addColorStop(0, 'rgba(255,255,255,0.42)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl; ctx.beginPath(); ctx.ellipse(cx, cy - R * 0.45, R * 0.95, R * 0.62, 0, 0, 7); ctx.fill();
  ctx.restore();
  shape(); ctx.lineWidth = Math.max(2, R * 0.035); ctx.strokeStyle = hover ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.32)'; ctx.stroke();
}

// ---- Liquid Glass numerals (the iOS 26 / 27 Lock Screen clock): clear glass letters with lit edges
export function glassNumerals(ctx, str, x, y, size, { weight = 700, align = 'center', font = SF } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
  const top = y - size * 0.5, bot = y + size * 0.5;
  const body = ctx.createLinearGradient(0, top, 0, bot);
  body.addColorStop(0, 'rgba(255,255,255,0.62)'); body.addColorStop(0.45, 'rgba(255,255,255,0.16)'); body.addColorStop(1, 'rgba(255,255,255,0.40)');
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillText(str, x, y + size * 0.03);   // the faint contact shadow
  ctx.fillStyle = body; ctx.fillText(str, x, y);
  ctx.lineWidth = Math.max(1.5, size * 0.018);
  const edge = ctx.createLinearGradient(0, top, 0, bot); edge.addColorStop(0, 'rgba(255,255,255,0.95)'); edge.addColorStop(0.6, 'rgba(255,255,255,0.35)'); edge.addColorStop(1, 'rgba(255,255,255,0.75)');
  ctx.strokeStyle = edge; ctx.strokeText(str, x, y);
  ctx.restore();
}

// ---- the Apple Clock face (Clock app widget): white dial, black numbers, black hands, orange seconds
export function clockFace(ctx, cx, cy, r, d = new Date(), { dark = false, seconds = true, numbers = true } = {}) {
  const fg = dark ? '#fff' : '#000', bg = dark ? '#1c1c1e' : '#fff';
  softShadow(ctx, cx, cy + r * 0.06, r * 1.04, r * 1.04, 0.35);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = bg; ctx.fill();
  // ticks: 60 minutes, the hours thicker
  for (let i = 0; i < 60; i++) {
    const a = i * Math.PI / 30, h = i % 5 === 0, r1 = r * (h ? 0.86 : 0.9), r2 = r * 0.95;
    ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1); ctx.lineTo(cx + Math.sin(a) * r2, cy - Math.cos(a) * r2);
    ctx.strokeStyle = h ? fg : (dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)'); ctx.lineWidth = r * (h ? 0.022 : 0.01); ctx.stroke();
  }
  if (numbers) for (let n = 1; n <= 12; n++) {
    const a = n * Math.PI / 6, rr2 = r * 0.7;
    label(ctx, String(n), cx + Math.sin(a) * rr2, cy - Math.cos(a) * rr2 + r * 0.01, r * 0.2, { weight: 500, color: fg, dir: 'ltr', font: SF_ROUNDED });
  }
  const H = d.getHours() % 12, M = d.getMinutes(), S = d.getSeconds() + d.getMilliseconds() / 1000;
  const hand = (ang, len, w, col, tail = 0) => {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, r * tail); ctx.lineTo(0, -len); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); ctx.restore();
  };
  hand((H + M / 60) * Math.PI / 6, r * 0.5, r * 0.06, fg);
  hand((M + S / 60) * Math.PI / 30, r * 0.78, r * 0.045, fg);
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.05, 0, 7); ctx.fillStyle = fg; ctx.fill();
  if (seconds) { hand(S * Math.PI / 30, r * 0.86, r * 0.016, SYS.orange, 0.18); ctx.beginPath(); ctx.arc(cx, cy, r * 0.03, 0, 7); ctx.fillStyle = SYS.orange; ctx.fill(); ctx.beginPath(); ctx.arc(cx, cy, r * 0.012, 0, 7); ctx.fillStyle = bg; ctx.fill(); }
}

// ---- a progress ring (Timer, Fitness): the track, then the arc with round caps
export function ring(ctx, cx, cy, r, frac, color, w) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = w;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.stroke();
  if (frac > 0.001) { ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac)); ctx.strokeStyle = color; ctx.stroke(); }
  ctx.restore();
}

// ---- Apple widget backgrounds
export function widgetBg(ctx, W, H, kind, r) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const hr = new Date().getHours(), night = hr < 6 || hr >= 18;
  const T = {
    weather: night ? ['#0b1b4a', '#2a3a74'] : ['#2f80ed', '#56b6f7'],
    notes: ['rgba(38,38,41,0.92)', 'rgba(28,28,30,0.92)'],
    calendar: ['rgba(34,34,38,0.9)', 'rgba(24,24,28,0.9)'],
    clock: ['rgba(20,20,22,0.92)', 'rgba(10,10,12,0.92)'],
  }[kind];
  if (!T) { material(ctx, 0, 0, W, H, r); return; }
  g.addColorStop(0, T[0]); g.addColorStop(1, T[1]); rr(ctx, 0, 0, W, H, r); ctx.fillStyle = g; ctx.fill();
  ctx.save(); rr(ctx, 0, 0, W, H, r); ctx.clip();
  const sh = ctx.createLinearGradient(0, 0, 0, H * 0.35); sh.addColorStop(0, 'rgba(255,255,255,0.12)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H * 0.35);
  ctx.lineWidth = Math.max(2, Math.min(W, H) * 0.01); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; rr(ctx, 1, 1, W - 2, H - 2, r - 1); ctx.stroke();
  ctx.restore();
}
