// The DriveCast APK's match art, drawn the same way in Madar: the live island pill, the «مباريات فرقي»
// widget rows, and the animated goal card (GOAAAL! → score bar with the scoring digit popping green).
// Ported from IslandArt.java / WidgetArt.java / Art.java so both look identical.
import { FONT } from './ui.js';

const WHITE = '#ffffff', EMERALD = '#34d399', RED = '#dc2626', RED_SOFT = '#f87171', YELLOW = '#facc15', GREEN = '#00ff85';
const a = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${k})`; };
const font = (w, px) => `${w} ${px}px ${FONT}`;

// ---------- logos (loaded once, shared) ----------
const LOGOS = new Map();
let onLogo = null;
export function setLogoListener(fn) { onLogo = fn; }
function logoImg(url) {
  if (!url) return null;
  let e = LOGOS.get(url);
  if (!e) {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
    e = { img, ok: false }; LOGOS.set(url, e);
    img.onload = () => { e.ok = true; onLogo?.(); };
    img.src = url;
  }
  return e.ok ? e.img : null;
}

// ---------- Art helpers ----------
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2)) : ctx.rect(x, y, w, h); }
function fill(ctx, x, y, w, h, r, color) { rr(ctx, x, y, w, h, r); ctx.fillStyle = color; ctx.fill(); }
function stroke(ctx, x, y, w, h, r, color, lw) { ctx.lineWidth = lw; rr(ctx, x + lw / 2, y + lw / 2, w - lw, h - lw, r); ctx.strokeStyle = color; ctx.stroke(); }
function glow(ctx, x, y, w, h, r, color, blur) { ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; fill(ctx, x, y, w, h, r, color); ctx.restore(); }
function centerText(ctx, s, cx, cy, f, color) { ctx.direction = /[؀-ۿ]/.test(s) ? 'rtl' : 'ltr'; ctx.font = f; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, cx, cy); }
// The site's glass text: diagonal gradient from bright to faint.
function glassText(ctx, s, cx, cy, f, from = a(WHITE, 0.95), to = a(WHITE, 0.18)) {
  ctx.font = f; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
  const w = ctx.measureText(s).width, px = parseFloat(f.split(' ')[1]);
  const g = ctx.createLinearGradient(cx - w / 2, cy - px / 2, cx + w / 2, cy + px / 2);
  g.addColorStop(0, from); g.addColorStop(1, to);
  ctx.fillStyle = g; ctx.fillText(s, cx, cy);
}
function scorePieces(ctx, l, r, cx, cy, f, from, to, sep = ' - ') {
  ctx.font = f; ctx.direction = 'ltr';
  const wl = ctx.measureText(l).width, ws = ctx.measureText(sep).width, wr = ctx.measureText(r).width, x = cx - (wl + ws + wr) / 2;
  glassText(ctx, l, x + wl / 2, cy, f, from, to);
  glassText(ctx, sep, x + wl + ws / 2, cy, f, from, to);
  glassText(ctx, r, x + wl + ws + wr / 2, cy, f, from, to);
}
function plate(ctx, img, cx, cy, r, name) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = a(WHITE, 0.06); ctx.fill();
  ctx.lineWidth = Math.max(1, r / 22); ctx.strokeStyle = a(WHITE, 0.12); ctx.beginPath(); ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, 7); ctx.stroke();
  if (img) {
    const inner = r * 0.8, s = Math.min(inner * 2 / img.width, inner * 2 / img.height), w = img.width * s, h = img.height * s;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = r / 10; ctx.shadowOffsetY = r / 20;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h); ctx.restore();
  } else centerText(ctx, initials(name), cx, cy, font(700, r * 0.7), a(WHITE, 0.55));
}
function plainLogo(ctx, img, cx, cy, r, name) {
  if (!img) { plate(ctx, null, cx, cy, r, name); return; }
  const s = Math.min(r * 2 / img.width, r * 2 / img.height), w = img.width * s, h = img.height * s;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}
function initials(n) {
  n = (n || '').trim(); if (!n) return '⚽';
  const p = n.split(/\s+/); if (p.length === 1) return p[0].slice(0, /[؀-ۿ]/.test(p[0]) ? 1 : 2).toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
}
function minuteBadge(ctx, s, cx, cy, h) {
  ctx.font = font(900, h * 0.58); const w = ctx.measureText(s).width + h * 0.7;
  glow(ctx, cx - w / 2, cy - h / 2, w, h, h / 2, 'rgba(220,38,38,0.6)', h * 0.35);
  fill(ctx, cx - w / 2, cy - h / 2, w, h, h / 2, RED);
  centerText(ctx, s, cx, cy, font(900, h * 0.58), WHITE);
}
function badgeWidth(ctx, s, h) { ctx.font = font(900, h * 0.58); return ctx.measureText(s).width + h * 0.7; }
function fitName(ctx, name, maxW) {
  let s = (name || '').trim();
  if (ctx.measureText(s).width <= maxW) return s;
  const words = s.split(/\s+/).filter(w => !/^(fc|cf|sc|ac|afc|club|نادي|الـ)$/i.test(w));
  s = words.join(' ');
  if (ctx.measureText(s).width <= maxW) return s;
  if (words.length > 1 && words[0].length >= 3 && ctx.measureText(words[0]).width <= maxW) return words[0];
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}
const minuteText = m => m.elapsed != null && m.elapsed >= 0 ? 'د' + m.elapsed : 'مباشر';
const to12h = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); if (!m) return t || ''; let h = +m[1]; const pm = h >= 12; h = h % 12 || 12; return h + ':' + m[2] + (pm ? ' م' : ' ص'); };

// ---------- the island (a black glass pill) ----------
export function islandWidth(ctx, m, h, expanded) {
  let w = h * 0.25;
  if (m.status === 'live') w += badgeWidth(ctx, minuteText(m), h * 0.56) + h * 0.16;
  w += h * 0.96 * 2;
  ctx.font = font(900, h * 0.62); w += Math.max(h * 1.3, ctx.measureText(center(m)).width) + h * 0.36;
  if (expanded) { ctx.font = font(700, h * 0.26); w += Math.min(ctx.measureText(m.home.name).width, h * 2.6) + Math.min(ctx.measureText(m.away.name).width, h * 2.6) + h * 0.4; }
  return w + h * 0.25;
}
function center(m) {
  if (m.status === 'live' || m.status === 'finished') return (m.score.home ?? 0) + '-' + (m.score.away ?? 0);
  return to12h(m.omanTime);
}
export function drawIsland(ctx, x0, y0, w, h, m, now, { fav = false, expanded = true } = {}) {
  const live = m.status === 'live', favLive = fav && live, rad = h / 2;
  if (favLive) glow(ctx, x0, y0, w, h, rad, 'rgba(250,204,21,0.35)', h * 0.3);
  fill(ctx, x0, y0, w, h, rad, 'rgba(0,0,0,0.95)');
  const sheen = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h); sheen.addColorStop(0, 'rgba(255,255,255,0.08)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
  rr(ctx, x0, y0, w, h, rad); ctx.fillStyle = sheen; ctx.fill();
  stroke(ctx, x0, y0, w, h, rad, favLive ? a(YELLOW, 0.7) : a(WHITE, 0.12), Math.max(1.5, h / 36));
  let x = x0 + h * 0.25; const cy = y0 + h / 2;
  if (live) { const s = minuteText(m), bw = badgeWidth(ctx, s, h * 0.56); minuteBadge(ctx, s, x + bw / 2, cy, h * 0.56); x += bw + h * 0.16; }
  const lr = h * 0.45, hcx = x + lr + h * 0.03, acx = x0 + w - h * 0.25 - lr - h * 0.03;
  plate(ctx, logoImg(m.home.logo), hcx, cy, lr, m.home.name);
  plate(ctx, logoImg(m.away.logo), acx, cy, lr, m.away.name);
  const c = center(m), mid = (hcx + acx) / 2, sf = font(900, h * 0.62);
  if (expanded) {
    ctx.font = sf; const sw = Math.max(h * 1.3, ctx.measureText(c).width);
    const each = Math.max(h * 0.5, ((acx - lr) - (hcx + lr) - sw - h * 0.36) / 2 - h * 0.2);
    ctx.font = font(700, h * 0.26); ctx.fillStyle = a(WHITE, 0.9); ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    ctx.textAlign = 'left'; ctx.fillText(fitName(ctx, m.home.name, each), hcx + lr + h * 0.2, cy);
    ctx.textAlign = 'right'; ctx.fillText(fitName(ctx, m.away.name, each), acx - lr - h * 0.2, cy);
  }
  const sh = String(m.score.home ?? 0), sa = String(m.score.away ?? 0);
  if (live) { const p = 0.75 + 0.25 * Math.abs(Math.sin(now / 650)); scorePieces(ctx, sh, sa, mid, cy, sf, a(EMERALD, p), a(EMERALD, 0.5 * p), '-'); }
  else if (m.status === 'finished') { scorePieces(ctx, sh, sa, mid, cy - h * 0.06, sf, a(WHITE, 0.95), a(WHITE, 0.18), '-'); centerText(ctx, 'انتهت', mid, cy + h * 0.32, font(700, h * 0.17), a(WHITE, 0.5)); }
  else glassText(ctx, c, mid, cy, font(900, h * 0.5));
}

// ---------- the «مباريات فرقي» widget ----------
export function drawWidget(ctx, W, H, list, { heading = 'مباريات فرقي ⚽', empty = 'لا مباريات لفرقك اليوم', favOf = () => false } = {}) {
  const rad = Math.min(W, H) * 0.06;
  fill(ctx, 0, 0, W, H, rad, 'rgba(5,5,7,0.95)');
  const sh = ctx.createLinearGradient(0, 0, W, H); sh.addColorStop(0, 'rgba(255,255,255,0.06)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  rr(ctx, 0, 0, W, H, rad); ctx.fillStyle = sh; ctx.fill();
  stroke(ctx, 0, 0, W, H, rad, a(WHITE, 0.1), Math.max(1, H / 300));
  const pad = W * 0.035, headH = Math.max(H * 0.09, 60);
  ctx.direction = 'rtl'; ctx.textBaseline = 'middle';
  ctx.font = font(900, headH * 0.5); ctx.fillStyle = YELLOW; ctx.textAlign = 'right'; ctx.fillText(heading, W - pad, pad * 0.5 + headH / 2);
  const liveN = list.filter(m => m.status === 'live').length;
  if (liveN) { ctx.font = font(700, headH * 0.34); ctx.fillStyle = RED_SOFT; ctx.textAlign = 'left'; ctx.fillText('● ' + liveN + ' مباشر', pad, pad * 0.5 + headH / 2); }
  const top = pad * 0.5 + headH + pad * 0.3, avail = H - top - pad;
  if (!list.length) { centerText(ctx, empty, W / 2, top + avail / 2, font(700, H * 0.05), a(WHITE, 0.35)); return; }
  const rows = Math.min(list.length, Math.max(4, Math.floor(avail / (H * 0.1))));
  const rowH = Math.min(avail / rows, H * 0.16), gap = rowH * 0.1;
  list.slice(0, rows).forEach((m, i) => drawRow(ctx, pad * 0.7, top + i * rowH + gap / 2, W - pad * 1.4, rowH - gap, m, favOf(m)));
  if (list.length > rows) { ctx.font = font(700, headH * 0.3); ctx.fillStyle = a(WHITE, 0.35); ctx.textAlign = 'left'; ctx.fillText('+' + (list.length - rows), pad, H - pad * 0.5); }
}
// "غداً" / the weekday for a match that isn't today (Oman time), so tomorrow's games don't look like today's
const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export function dayTag(m) {
  if (!m || !m.timestamp) return '';
  const d = t => { const x = new Date(t + 4 * 3600e3); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) / 864e5; };
  const diff = d(m.timestamp * 1000) - d(Date.now());
  return diff === 0 ? '' : diff === 1 ? 'غداً' : diff === -1 ? 'أمس' : AR_DAYS[new Date(m.timestamp * 1000 + 4 * 3600e3).getUTCDay()];
}
function drawRow(ctx, x0, y0, w, h, m, fav) {
  const live = m.status === 'live', fin = m.status === 'finished', favLive = live && fav, rad = h / 2, cy = y0 + h / 2;
  if (favLive) { glow(ctx, x0, y0, w, h, rad, 'rgba(250,204,21,0.35)', h * 0.22); fill(ctx, x0, y0, w, h, rad, '#0a0a0c'); stroke(ctx, x0, y0, w, h, rad, a(YELLOW, 0.7), Math.max(1.5, h / 30)); }
  else { fill(ctx, x0, y0, w, h, rad, a(WHITE, 0.045)); stroke(ctx, x0, y0, w, h, rad, a(WHITE, 0.08), Math.max(1, h / 50)); }
  const x = x0 + h * 0.18, bh = h * 0.52; let sw;
  if (live) { const s = minuteText(m); sw = badgeWidth(ctx, s, bh); minuteBadge(ctx, s, x + sw / 2, cy, bh); }
  else {
    const day = fin ? '' : dayTag(m), s = fin ? 'انتهت' : (day ? day + ' ' : '') + to12h(m.omanTime), f = font(fin ? 700 : 500, h * (fin ? 0.26 : day ? 0.27 : 0.32));
    ctx.font = f; sw = Math.max(ctx.measureText(s).width, h * 0.6); centerText(ctx, s, x + sw / 2, cy, f, a(WHITE, fin ? 0.4 : 0.6));
  }
  const cl = x + sw + h * 0.22, cr = x0 + w - h * 0.12, lr = h * 0.38, hcx = cl + lr, acx = cr - lr;
  plate(ctx, logoImg(m.home.logo), hcx, cy, lr, m.home.name);
  plate(ctx, logoImg(m.away.logo), acx, cy, lr, m.away.name);
  const score = live || fin ? (m.score.home ?? 0) + ' - ' + (m.score.away ?? 0) : '×', sf = font(900, h * 0.56), mid = (hcx + acx) / 2;
  ctx.font = sf; ctx.direction = 'ltr'; const sWid = ctx.measureText(score).width;
  const shs = String(m.score.home ?? 0), sas = String(m.score.away ?? 0);
  if (live) scorePieces(ctx, shs, sas, mid, cy, sf, EMERALD, a(EMERALD, 0.55));
  else if (fin) scorePieces(ctx, shs, sas, mid, cy, sf, a(WHITE, 0.85), a(WHITE, 0.3));
  else centerText(ctx, score, mid, cy, sf, a(WHITE, 0.35));
  const ng = h * 0.18;
  const leftMax = (mid - sWid / 2 - ng) - (hcx + lr + ng), rightMax = (acx - lr - ng) - (mid + sWid / 2 + ng);
  ctx.font = font(700, h * 0.34); ctx.fillStyle = a(WHITE, 0.92); ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
  if (leftMax > h * 0.5) { ctx.textAlign = 'left'; ctx.fillText(fitName(ctx, m.home.name, leftMax), hcx + lr + ng, cy); }
  if (rightMax > h * 0.5) { ctx.textAlign = 'right'; ctx.fillText(fitName(ctx, m.away.name, rightMax), acx - lr - ng, cy); }
}

// ---------- the goal card animation (GoalCelebration) ----------
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
const easeBack = t => { t = clamp01(t); const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const prog = (t, s, d) => clamp01((t - s) / d);
const ACT2 = 2300;
export function goalDuration(g) { return g.scorer ? 7000 : 5600; }
// g: { home, away, homeLogo, awayLogo, sh, sa, side: 'home'|'away', league, minute, scorer, photo }
export function drawGoal(ctx, W, H, g, t) {
  const D = goalDuration(g);
  const pillW = Math.min(W, H * 1.1), pillH = H * 0.3;
  const k = easeOut(prog(t, 120, 400)) * (1 - easeOut(prog(t, D * 0.9, D * 0.07)));
  const w = pillW + (W - pillW) * k, h = pillH + (H - pillH) * k;
  const alpha = t < 120 ? t / 120 : t > D * 0.97 ? clamp01(1 - (t - D * 0.97) / (D * 0.03)) : 1;
  if (alpha <= 0) return false;
  const x0 = W / 2 - w / 2, y0 = 0;
  const rad = Math.min(h / 2, H * 0.18 + (pillH / 2 - H * 0.18) * (1 - k));
  ctx.save(); ctx.globalAlpha = alpha;
  glow(ctx, x0, y0, w, h, rad, 'rgba(0,255,133,0.35)', Math.min(W, H) * 0.08);
  ctx.save(); rr(ctx, x0, y0, w, h, rad); ctx.clip();
  let bg = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h); bg.addColorStop(0, '#37003c'); bg.addColorStop(0.5, '#24002a'); bg.addColorStop(1, '#0b0010');
  ctx.fillStyle = bg; ctx.fillRect(x0, y0, w, h);
  let bl = ctx.createRadialGradient(x0 + w - H * 0.1, y0, 0, x0 + w - H * 0.1, y0, H * 0.9); bl.addColorStop(0, 'rgba(233,0,82,0.25)'); bl.addColorStop(1, 'rgba(233,0,82,0)'); ctx.fillStyle = bl; ctx.fillRect(x0, y0, w, h);
  bl = ctx.createRadialGradient(x0 + H * 0.1, y0 + h, 0, x0 + H * 0.1, y0 + h, H * 0.9); bl.addColorStop(0, 'rgba(4,245,255,0.2)'); bl.addColorStop(1, 'rgba(4,245,255,0)'); ctx.fillStyle = bl; ctx.fillRect(x0, y0, w, h);
  // colour wipe
  const wp = prog(t, 330, 800);
  if (wp > 0 && wp < 1) {
    const x = x0 - w * 1.2 + w * 2.5 * easeOut(wp);
    const g2 = ctx.createLinearGradient(x, 0, x + w * 1.2, 0); g2.addColorStop(0, GREEN); g2.addColorStop(0.5, '#04f5ff'); g2.addColorStop(1, '#e90052');
    ctx.save(); ctx.globalAlpha = alpha * (wp > 0.85 ? (1 - wp) / 0.15 : 1); ctx.transform(1, 0, -0.32, 1, 0, 0);
    ctx.fillStyle = g2; ctx.fillRect(x + h * 0.3, y0 - h, w * 1.2, h * 3); ctx.restore();
  }
  if (k > 0.6) {
    const cx = x0 + w / 2;
    // Act 1: GOAAAL!
    if (t >= 480 && t < ACT2) {
      const inn = easeOut(prog(t, 480, 620)), out = prog(t, 1960, 330);
      const sc = (2.6 - 1.6 * inn) * (1 - 0.28 * out), cy = y0 + h / 2 - h * 0.28 * out;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.transform(1, 0, -0.22, 1, 0, 0);
      ctx.globalAlpha = alpha * clamp01((t - 480) / 80) * (1 - out);
      ctx.shadowColor = 'rgba(0,255,133,0.9)'; ctx.shadowBlur = H * 0.12;
      centerText(ctx, 'GOAAAL!', 0, 0, font(900, H * 0.3), WHITE); ctx.restore();
    }
    // Act 2: label + score bar, the scoring digit pops green
    if (t >= ACT2 && t < D * 0.9) {
      const at = t - ACT2, pad = H * 0.06;
      const lp = easeOut(prog(at, 0, 360)), ph = H * 0.12, ly = y0 + pad - (1 - lp) * H * 0.07;
      ctx.font = font(900, ph * 0.62); const gw = ctx.measureText('GOAL ⚽').width + ph * 1.1;
      ctx.save(); ctx.globalAlpha = alpha * lp;
      fill(ctx, x0 + pad, ly, gw, ph, ph / 2, GREEN);
      ctx.save(); ctx.translate(x0 + pad + gw / 2, ly + ph / 2); ctx.transform(1, 0, -0.18, 1, 0, 0); centerText(ctx, 'GOAL ⚽', 0, 0, font(900, ph * 0.62), '#37003c'); ctx.restore();
      const meta = (g.league || '') + (g.minute ? (g.league ? ' · ' : '') + g.minute : '');
      ctx.globalAlpha = alpha * lp * 0.7; ctx.font = font(700, ph * 0.5); ctx.fillStyle = WHITE; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
      ctx.fillText(meta, x0 + pad + gw + pad * 0.6, ly + ph / 2);
      ctx.restore();
      const hl = logoImg(g.homeLogo), al = logoImg(g.awayLogo);
      const bar = { x: x0 + W * 0.12, y: y0 + H * 0.28, w: w - W * 0.24, h: h - H * 0.28 - pad };
      const sp = easeOut(prog(at, 180, 460));
      ctx.save(); ctx.translate(0, (1 - sp) * H * 0.16); ctx.globalAlpha = alpha * sp;
      const br = Math.min(bar.h / 2, H * 0.14);
      fill(ctx, bar.x, bar.y, bar.w, bar.h, br, 'rgba(0,0,0,0.75)'); stroke(ctx, bar.x, bar.y, bar.w, bar.h, br, a(WHITE, 0.15), Math.max(1, H / 200));
      const lr = bar.h * 0.31, bcy = bar.y + bar.h / 2;
      plainLogo(ctx, hl, bar.x + bar.h * 0.55, bcy, lr, g.home); plainLogo(ctx, al, bar.x + bar.w - bar.h * 0.55, bcy, lr, g.away);
      const nf = font(900, bar.h * 0.62); ctx.font = nf; ctx.direction = 'ltr';
      const hs = String(g.sh), as = String(g.sa), wh = ctx.measureText(hs).width, wa = ctx.measureText(as).width, gap = bar.h * 0.18;
      ctx.font = font(900, bar.h * 0.6); const dw = ctx.measureText('-').width;
      const total = wh + gap + dw + gap + wa, sx = bar.x + bar.w / 2 - total / 2;
      const pp = prog(at, 650, 700), pop = pp <= 0 ? 1 : pp < 0.35 ? 1 + 0.9 * (pp / 0.35) : 1 + 0.9 * (1 - (pp - 0.35) / 0.65), green = pp > 0.1;
      const digit = (d, x, scoring) => {
        ctx.save(); const dwid = (ctx.font = nf, ctx.measureText(d).width);
        if (scoring) { ctx.translate(x + dwid / 2, bcy); ctx.scale(pop, pop); ctx.translate(-(x + dwid / 2), -bcy); }
        ctx.fillStyle = scoring && green ? GREEN : WHITE; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(d, x, bcy); ctx.restore();
      };
      digit(hs, sx, g.side === 'home');
      ctx.font = font(900, bar.h * 0.6); ctx.fillStyle = a(WHITE, 0.4); ctx.textAlign = 'left'; ctx.fillText('-', sx + wh + gap, bcy);
      digit(as, sx + wh + gap + dw + gap, g.side === 'away');
      ctx.restore();
    }
  }
  ctx.restore();
  stroke(ctx, x0, y0, w, h, rad, a(GREEN, 0.7), Math.max(2, H / 110));
  ctx.restore();
  return true;
}

// ---------- the clock (the APK's glass outlined digits) ----------
export function drawClock(ctx, W, H, now = new Date()) {
  let hh = now.getHours() % 12 || 12; const mm = String(now.getMinutes()).padStart(2, '0');
  const s = hh + ':' + mm, f = font(800, H * 0.72);
  glassText(ctx, s, W / 2, H / 2, f, a(WHITE, 0.6), a(WHITE, 0.12));
  ctx.font = f; ctx.lineWidth = Math.max(1, H / 90); ctx.strokeStyle = a(WHITE, 0.22); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(s, W / 2, H / 2);
}

// ---------- the sports-mode scoreboard: no names, big logos, a huge score and minute ----------
export function drawScoreboard(ctx, W, H, list, { empty = 'لا مباريات لفرقك الآن' } = {}) {
  ctx.clearRect(0, 0, W, H);
  const rad = W * 0.06;
  fill(ctx, 0, 0, W, H, rad, 'rgba(4,4,6,0.96)');
  stroke(ctx, 0, 0, W, H, rad, a(WHITE, 0.1), Math.max(1, H / 300));
  if (!list.length) { centerText(ctx, empty, W / 2, H / 2, font(800, W * 0.06), a(WHITE, 0.4)); return; }
  const n = Math.min(list.length, 5), pad = W * 0.04, rowH = (H - pad * 2) / Math.max(n, 3), gap = rowH * 0.09;
  list.slice(0, n).forEach((m, i) => {
    const y0 = pad + i * rowH + gap / 2, h = rowH - gap, cy = y0 + h / 2, x0 = pad, w = W - pad * 2;
    const live = m.status === 'live', fin = m.status === 'finished', fav = !!m.favorite;
    if (live && fav) { glow(ctx, x0, y0, w, h, h * 0.3, 'rgba(250,204,21,0.25)', h * 0.15); fill(ctx, x0, y0, w, h, h * 0.3, '#0a0a0c'); stroke(ctx, x0, y0, w, h, h * 0.3, a(YELLOW, 0.65), Math.max(2, h / 40)); }
    else { fill(ctx, x0, y0, w, h, h * 0.3, a(WHITE, live ? 0.07 : 0.04)); stroke(ctx, x0, y0, w, h, h * 0.3, a(WHITE, 0.08), Math.max(1, h / 60)); }
    // logos as big as the row allows, at the two ends
    const lr = h * 0.42;
    plate(ctx, logoImg(m.home.logo), x0 + h * 0.08 + lr, cy - h * 0.02, lr, m.home.name);
    plate(ctx, logoImg(m.away.logo), x0 + w - h * 0.08 - lr, cy - h * 0.02, lr, m.away.name);
    const mid = x0 + w / 2;
    if (live || fin) {
      const sf = font(900, h * 0.62);
      scorePieces(ctx, String(m.score.home ?? 0), String(m.score.away ?? 0), mid, cy - h * 0.1, sf, live ? EMERALD : a(WHITE, 0.9), live ? a(EMERALD, 0.6) : a(WHITE, 0.35));
      if (live) { const s = minuteText(m), bh = h * 0.27; minuteBadge(ctx, s, mid, cy + h * 0.3, bh); }
      else centerText(ctx, 'انتهت', mid, cy + h * 0.32, font(800, h * 0.18), a(WHITE, 0.45));
    } else {
      centerText(ctx, to12h(m.omanTime), mid, cy, font(900, h * 0.38), a(WHITE, 0.75));
    }
  });
}
