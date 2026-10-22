// «القراءة»: a book open in front of you, two facing pages like a real one.
//  · the Madani mushaf, page for page and line for line (604 pages × 15 lines, word by word), in the Amiri Quran font
//  · a reciter of your choice: the recited ayah glows on the page (and the recited word, for the Quran.com recordings),
//    the page turns by itself, an optional pause after each ayah, and it stops when you look away
//  · two tafsir panels beside the book (right and left, any of 16 books), the current ayah floating large above it
//  · your own books (PDF, EPUB, text, web articles, photographed pages) - see books.js - read aloud with the sentence glowing
// The line under your gaze (or finger) is softly highlighted; pinch the page and swipe to turn it.
import * as THREE from 'three';
import { CanvasPanel, IconButton, makeBar, glass, text, icon, roundRect, COLORS, blip } from './ui.js';
import { settings, saveSettings } from './config.js';
import * as Q from './quran.js';
import { openBook, BOOK_KINDS } from './books.js';

export const PW = 0.42, PH = 0.63;            // one page, metres
const CW = 900, CH = 1350;                     // its canvas
const OPEN = 0.17;                             // each page leans towards you (rad)
const FS = 41;                                 // mushaf text size on the canvas
const THEMES = {
  day: { paper: ['#fdf8ea', '#efe2c0'], ink: '#1c1812', gold: '#a9802f', gold2: '#e2c271', band: ['#2c6a56', '#163d31'], dim: '#7a6030', mark: '#fff6da', vignette: 'rgba(120,90,30,0.16)', spine: 'rgba(70,45,10,0.26)', hl: 0xffc84a, hlOp: 0.3, word: 0xff9d1a, line: 0x3a8cff, lineOp: 0.1 },
  night: { paper: ['#141b2a', '#0b1019'], ink: '#efe5cb', gold: '#c9a35a', gold2: '#8d6f33', band: ['#1d4150', '#10262f'], dim: '#bca371', mark: '#1a2335', vignette: 'rgba(0,0,0,0.35)', spine: 'rgba(0,0,0,0.45)', hl: 0xffcf5a, hlOp: 0.2, word: 0xffb347, line: 0x7cc4ff, lineOp: 0.12 },
};
let rid = 2000;

// ---------------------------------------------------------------- reading progress (shelf, resume)
const PKEY = 'madar.reading.v1';
export const progress = {
  all() { try { return JSON.parse(localStorage.getItem(PKEY) || '{}'); } catch { return {}; } },
  get(id) { return this.all()[id] || null; },
  set(id, page, count, title) { const a = this.all(); a[id] = { page, count, title, at: Date.now() }; try { localStorage.setItem(PKEY, JSON.stringify(a)); } catch {} },
};

// ---------------------------------------------------------------- drawing helpers
let noiseCv = null;
function grain() {
  if (!noiseCv) {
    noiseCv = document.createElement('canvas'); noiseCv.width = noiseCv.height = 128;
    const g = noiseCv.getContext('2d'), im = g.createImageData(128, 128);
    for (let i = 0; i < im.data.length; i += 4) { const v = 120 + Math.random() * 40; im.data[i] = v; im.data[i + 1] = v * 0.95; im.data[i + 2] = v * 0.85; im.data[i + 3] = 14; }
    g.putImageData(im, 0, 0);
  }
  return noiseCv;
}
export function paper(ctx, side, th, W = CW, H = CH) {
  ctx.fillStyle = th.paper[0]; ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, th.vignette); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // the spine side darker, like a real open book
  const R = side === 'R', s = ctx.createLinearGradient(R ? 0 : W, 0, R ? 70 : W - 70, 0);
  s.addColorStop(0, th.spine); s.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = s; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = ctx.createPattern(grain(), 'repeat'); ctx.fillRect(0, 0, W, H);
}
function rosette(ctx, cx, cy, r, th, fill = th.gold2) {
  ctx.save(); ctx.translate(cx, cy); ctx.beginPath();
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? r * 0.55 : r; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(rr, 0); }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = th.gold; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, 7); ctx.fillStyle = th.band[1]; ctx.fill();
  ctx.restore();
}
function frame(ctx, th) {
  const o = 24, b = 24, x = o, y = o, w = CW - 2 * o, h = CH - 2 * o;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.rect(x + b, y + b, w - 2 * b, h - 2 * b);
  const g = ctx.createLinearGradient(0, 0, CW, CH); g.addColorStop(0, th.band[0]); g.addColorStop(1, th.band[1]);
  ctx.fillStyle = g; ctx.fill('evenodd');
  ctx.fillStyle = th.gold2;
  const dia = (cx, cy, r) => { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill(); };
  for (let t = x + b + 4; t < x + w - b - 10; t += 21) { dia(t + 10, y + b / 2, 4.5); dia(t + 10, y + h - b / 2, 4.5); }
  for (let t = y + b + 4; t < y + h - b - 10; t += 21) { dia(x + b / 2, t + 10, 4.5); dia(x + w - b / 2, t + 10, 4.5); }
  ctx.strokeStyle = th.gold; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
  ctx.lineWidth = 2.5; ctx.strokeRect(x + b, y + b, w - 2 * b, h - 2 * b);
  ctx.lineWidth = 1; ctx.strokeRect(x + b + 7, y + b + 7, w - 2 * b - 14, h - 2 * b - 14);
  for (const [cx, cy] of [[x + b / 2, y + b / 2], [x + w - b / 2, y + b / 2], [x + b / 2, y + h - b / 2], [x + w - b / 2, y + h - b / 2]]) rosette(ctx, cx, cy, b * 0.78, th);
  ctx.restore();
}
function ayahMark(ctx, cx, cy, r, num, th) {
  ctx.save(); ctx.translate(cx, cy); ctx.beginPath();
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, rr = i % 2 ? r * 0.86 : r; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(rr, 0); }
  ctx.closePath(); ctx.fillStyle = th.mark; ctx.fill(); ctx.lineWidth = Math.max(1.5, r * 0.09); ctx.strokeStyle = th.gold; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2); ctx.lineWidth = Math.max(1, r * 0.05); ctx.stroke();
  ctx.fillStyle = th.ink; ctx.font = `700 ${r * (num.length > 2 ? 0.62 : 0.8)}px ${Q.BFONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
  ctx.fillText(num, 0, r * 0.08);
  ctx.restore();
}
function medallion(ctx, cx, cy, r, label, th) {
  ctx.save();
  ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.5, r, 0, 0, 7); ctx.fillStyle = th.paper[0]; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = th.gold; ctx.stroke();
  ctx.fillStyle = th.ink; ctx.font = `700 ${r * 0.9}px ${Q.BFONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
  ctx.fillText(label, cx, cy + r * 0.08);
  ctx.restore();
}
function surahBanner(ctx, x0, x1, y, h, s, th) {
  const cy = y + h / 2, k = h * 0.45;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x0, cy); ctx.lineTo(x0 + k, y + h * 0.08); ctx.lineTo(x1 - k, y + h * 0.08); ctx.lineTo(x1, cy); ctx.lineTo(x1 - k, y + h * 0.92); ctx.lineTo(x0 + k, y + h * 0.92); ctx.closePath();
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, th.band[0]); g.addColorStop(1, th.band[1]);
  ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = th.gold; ctx.stroke();
  const iw = Math.min((x1 - x0) * 0.56, 380), ix = (x0 + x1) / 2 - iw / 2;
  roundRect(ctx, ix, y + h * 0.2, iw, h * 0.6, h * 0.3); ctx.fillStyle = th.paper[0]; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = th.gold; ctx.stroke();
  ctx.fillStyle = th.ink; ctx.font = `${h * 0.4}px ${Q.QFONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
  ctx.fillText('سورة ' + Q.SURAHS[s - 1][0], (x0 + x1) / 2, cy + h * 0.05);
  rosette(ctx, x0 + k + 30, cy, h * 0.2, th); rosette(ctx, x1 - k - 30, cy, h * 0.2, th);
  ctx.font = `700 ${h * 0.2}px ${Q.BFONT}`; ctx.fillStyle = th.gold2;
  ctx.fillText(Q.arNum(Q.SURAHS[s - 1][1]) + ' آية', x0 + k + 30 + (ix - x0 - k - 30) / 2 + 10, cy + 2);
  ctx.restore();
}
// One mushaf line, right to left: justified like the printed page (or centred), words measured one by one.
function drawLine(ctx, words, x0, x1, base, fs, th, center) {
  ctx.font = `${fs}px ${Q.QFONT}`; ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  const mw = fs * 0.95, ws = words.map(w => w.end ? mw : ctx.measureText(w.t).width);
  const sum = ws.reduce((a, b) => a + b, 0), n = words.length, avail = x1 - x0, minGap = fs * 0.2;
  let gap = minGap, sx = 1, start = x1;
  const natural = sum + minGap * (n - 1);
  if (natural > avail) sx = avail / natural;
  else if (!center && n > 1 && natural > avail * 0.7) gap = (avail - sum) / (n - 1);
  else start = x1 - (avail - natural) / 2;
  const out = [];
  let x = start;
  words.forEach((w, i) => {
    const ww = ws[i] * sx;
    if (w.end) ayahMark(ctx, x - ww / 2, base - fs * 0.3, fs * 0.46, w.t, th);
    else { ctx.save(); ctx.translate(x, base); if (sx !== 1) ctx.scale(sx, 1); ctx.fillStyle = th.ink; ctx.fillText(w.t, 0, 0); ctx.restore(); }
    out.push({ x0: x - ww, x1: x, key: w.key, pos: w.pos, end: w.end });
    x -= ww + gap * sx;
  });
  return out;
}
// quran.com unreachable: lay the page's ayahs out ourselves (not line-exact, same look)
function flowLines(ctx, page, x0, x1, fs) {
  ctx.font = `${fs}px ${Q.QFONT}`;
  const lines = [], avail = x1 - x0, gap = fs * 0.2;
  let cur = [], w = 0;
  const push = () => { if (cur.length) lines.push({ type: 'text', words: cur }); cur = []; w = 0; };
  for (const a of page.flow) {
    if (a.a === 1) { push(); lines.push({ type: 'surah', s: a.s }); if (a.s !== 1 && a.s !== 9) lines.push({ type: 'basmala' }); }
    const words = a.text.split(/\s+/).filter(Boolean).map((t, i) => ({ t, key: a.key, pos: i + 1 }));
    words.push({ t: Q.arNum(a.a), key: a.key, end: true });
    for (const wd of words) {
      const ww = wd.end ? fs * 0.95 : ctx.measureText(wd.t).width;
      if (cur.length && w + ww + gap > avail) push();
      cur.push(wd); w += ww + gap;
    }
  }
  push();
  return lines.slice(0, 18);
}
// A mushaf page → canvas. Returns where every word sits (for highlighting and tapping).
function drawQuranPage(ctx, page, side, th) {
  paper(ctx, side, th); frame(ctx, th);
  const x0 = 82, x1 = CW - 82;
  ctx.save();
  ctx.font = `600 27px ${Q.BFONT}`; ctx.fillStyle = th.dim; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
  const firstKey = page.ayahs[0]?.key || '1:1', s0 = +firstKey.split(':')[0];
  ctx.textAlign = 'right'; ctx.fillText('سورة ' + Q.SURAHS[s0 - 1][0], x1, 98);
  ctx.textAlign = 'left'; ctx.fillText('الجزء ' + Q.arNum(page.juz || Q.juzOfPage(page.n)), x0, 98);
  ctx.strokeStyle = th.gold; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x0, 118); ctx.lineTo(x1, 118); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.restore();
  medallion(ctx, CW / 2, CH - 36, 22, Q.arNum(page.n), th);
  const lines = page.lines || flowLines(ctx, page, x0, x1, FS);
  let top = 128, pitch = (CH - 100 - top) / 15, lx0 = x0, lx1 = x1, fs = FS;
  if (page.special) { pitch = 96; fs = 46; top = (CH - pitch * lines.length) / 2; lx0 = x0 + 60; lx1 = x1 - 60; }
  else if (lines.length > 15) pitch = (CH - 100 - top) / lines.length;
  const layout = { lines: [], fs, pitch };
  lines.forEach((ln, i) => {
    const y0 = top + i * pitch, base = y0 + pitch * 0.68;
    const rec = { y0, y1: y0 + pitch, words: [] };
    layout.lines.push(rec);
    if (ln.type === 'surah') surahBanner(ctx, lx0, lx1, y0 + pitch * 0.06, pitch * 0.88, ln.s, th);
    else if (ln.type === 'basmala') { ctx.save(); ctx.font = `${fs}px ${Q.QFONT}`; ctx.fillStyle = th.ink; ctx.textAlign = 'center'; ctx.direction = 'rtl'; ctx.fillText(Q.BASMALA, CW / 2, base); ctx.restore(); }
    else if (ln.type === 'text') rec.words = drawLine(ctx, ln.words, lx0, lx1, base, fs, th, page.special);
  });
  return layout;
}

// ---------------------------------------------------------------- the Quran as a "book"
class QuranBook {
  constructor() { this.id = 'quran'; this.title = 'المصحف الشريف'; this.rtl = true; this.count = Q.PAGES; this.quran = true; this.pages = new Map(); }
  async open() { await Q.readerFonts(); }
  async load(n) {
    if (!(n >= 1 && n <= Q.PAGES)) throw new Error('no page ' + n);
    if (this.pages.has(n)) return this.pages.get(n);
    const p = Q.loadPage(n);
    this.pages.set(n, p); p.catch(() => this.pages.delete(n));
    if (this.pages.size > 24) this.pages.delete(this.pages.keys().next().value);
    return p;
  }
  async draw(ctx, n, side, th) { const page = await this.load(n); return drawQuranPage(ctx, page, side, th); }
  async keys(n) { try { return (await this.load(n)).ayahs.map(a => a.key); } catch { return []; } }
  async ayahText(key) {
    for (const p of this.pages.values()) { try { const pg = await p; const a = pg.ayahs.find(x => x.key === key); if (a) return a.text; } catch {} }
    return '';
  }
  // the page holding an ayah: the surah's pages, searched with the pages' word lists
  async pageOf(key) {
    const [s] = key.split(':').map(Number);
    const first = Q.SURAHS[s - 1][2], last = s < 114 ? Q.SURAHS[s][2] : Q.PAGES;
    for (let n = first; n <= last; n++) { const ks = await this.keys(n); if (ks.includes(key)) return n; }
    return first;
  }
}

// ---------------------------------------------------------------- recitation
// Quran.com recordings: one file per surah + every word's time → the word lights up as it is recited.
// alquran.cloud recordings: one file per ayah.
class Recitation {
  constructor(r) { this.r = r; this.audio = r.app.media.audioEl(); this.rec = Q.RECITERS.find(x => x.id === settings.reciter) || Q.RECITERS[0]; this.key = null; this.state = 'stop'; this.surah = null; this.reps = 0; }
  get playing() { return this.state === 'play'; }
  setReciter(id) { const was = this.playing ? this.key : null; this.stop(); this.rec = Q.RECITERS.find(x => x.id === id) || Q.RECITERS[0]; saveSettings({ reciter: this.rec.id }); if (was) this.play(was); }
  async play(key) {
    const a = this.audio, r = this.r;
    this.key = key; this.state = 'load'; this.reps = 0; this.pauseUntil = 0; this.word = null; r.onRecite(key);
    const token = this.token = {};
    try {
      if (this.rec.q) {
        const s = +key.split(':')[0];
        if (!this.surah || this.surah.s !== s || this.surah.q !== this.rec.q) { this.surah = { s, q: this.rec.q, ...(await Q.surahTimings(this.rec.q, s)) }; if (token !== this.token) return; }
        const t = this.surah.ayahs[key];
        if (!t) throw new Error('no timing for ' + key);
        if (!a.src.endsWith(this.surah.url)) { a.src = this.surah.url; a.load(); }
        await seekable(a);
        if (token !== this.token) return;
        a.currentTime = t.from / 1000;
      } else {
        const n = await r.book.pageOf(key);
        let urls = null; try { urls = (await Q.pageAudio(n, this.rec.a))[key]; } catch {}
        if (token !== this.token) return;
        a.src = (urls && urls[0]) || Q.fallbackAudio(this.rec.a, key); a.load();
        this.surah = null;
      }
      a.playbackRate = settings.reciteRate || 1;
      await a.play();
      if (token !== this.token) return;
      this.state = 'play';
      a.onended = () => { if (!this.rec.q && this.state === 'play') this.ayahDone(); };
    } catch (e) {
      if (token !== this.token) return;
      this.state = 'stop'; r.app.log('القارئ: ' + (e.message || e));
      r.app.toast(e?.name === 'NotAllowedError' ? 'المس الشاشة مرة ثم أعد التشغيل' : 'تعذّر تشغيل التلاوة — تحقق من الاتصال', 3000);
      r.ctrl?.redraw();
    }
  }
  pause(auto = false) { if (this.state !== 'play' && this.state !== 'wait') return; this.audio.pause(); this.state = 'pause'; this.auto = auto; this.r.ctrl?.redraw(); }
  resume() { if (this.state !== 'pause') return; this.auto = false; this.state = 'play'; this.audio.play().catch(() => { this.state = 'pause'; }); this.r.ctrl?.redraw(); }
  stop() { this.token = {}; this.state = 'stop'; try { this.audio.pause(); } catch {} this.word = null; this.r.onRecite(null); }
  toggle(key) { if (this.state === 'play' || this.state === 'wait') this.pause(); else if (this.state === 'pause') this.resume(); else this.play(key); }
  // one ayah finished: repeat it, wait (pause after each ayah), or go on
  ayahDone() {
    const rep = settings.reciteRepeat || 1;
    if (++this.reps < rep) { this.replay(); return; }
    const wait = settings.recitePause ?? 0;
    const next = Q.nextKey(this.key);
    if (!next) { this.stop(); return; }
    if (wait > 0) { this.audio.pause(); this.state = 'wait'; this.pauseUntil = performance.now() + wait * 1000; this.nextAfter = next; this.r.ctrl?.redraw(); return; }
    if (wait < 0) { this.audio.pause(); this.state = 'pause'; this.key = next; this.r.onRecite(next); this.r.app.toast('⏸ اضغط ▶ للآية التالية', 1800); this.resumeAt = next; this.r.ctrl?.redraw(); return; }
    this.continueTo(next);
  }
  replay() {
    if (this.rec.q && this.surah?.ayahs[this.key]) this.audio.currentTime = this.surah.ayahs[this.key].from / 1000;
    else { this.audio.currentTime = 0; this.audio.play().catch(() => {}); }
  }
  continueTo(next) {
    // same surah, Quran.com recording: the file plays on by itself
    if (this.rec.q && this.surah && +next.split(':')[0] === this.surah.s && this.surah.ayahs[next]) {
      this.key = next; this.reps = 0; this.r.onRecite(next);
      if (this.audio.paused) { this.audio.currentTime = this.surah.ayahs[next].from / 1000; this.state = 'play'; this.audio.play().catch(() => {}); }
      return;
    }
    this.play(next);
  }
  update(now) {
    if (this.state === 'wait' && now >= this.pauseUntil) { this.state = 'play'; this.continueTo(this.nextAfter); this.r.ctrl?.redraw(); }
    if (this.state === 'pause' && this.resumeAt && !this.audio.paused) this.resumeAt = null;
    if (this.state !== 'play' || !this.rec.q || !this.surah) return;
    const t = this.audio.currentTime * 1000, cur = this.surah.ayahs[this.key];
    if (!cur) return;
    if (t >= cur.to - 25) { this.ayahDone(); return; }
    const w = cur.words.find(([, a, b]) => t >= a && t < b);
    const wp = w ? w[0] : null;
    if (wp !== this.word) { this.word = wp; this.r.onWord(this.key, wp); }
  }
}
function seekable(a) {
  return new Promise(res => {
    if (a.readyState >= 1) return res();
    const done = () => { a.removeEventListener('loadedmetadata', done); res(); };
    a.addEventListener('loadedmetadata', done); setTimeout(done, 8000);
  });
}

// ---------------------------------------------------------------- read aloud (your own books)
class Speaker {
  constructor(r) { this.r = r; this.on = false; }
  get playing() { return this.on; }
  start(page, i = 0) {
    const syn = window.speechSynthesis; if (!syn) { this.r.app.toast('القراءة الصوتية غير متاحة في هذا المتصفح', 2500); return; }
    this.on = true; this.page = page; this.i = i; this.say();
  }
  say() {
    const r = this.r, lay = r.layouts.get(this.page), sents = lay?.sentences || [];
    if (!this.on) return;
    if (this.i >= sents.length) {   // next page (the other side of the spread, or turn)
      const nextPage = this.page + 1;
      if (nextPage > r.book.count) { this.stop(); return; }
      if (!r.shown(nextPage)) r.turn(1, () => { this.page = nextPage; this.i = 0; this.say(); });
      else { this.page = nextPage; this.i = 0; setTimeout(() => this.say(), 50); }
      return;
    }
    const s = sents[this.i];
    r.onSentence(this.page, s);
    const u = new SpeechSynthesisUtterance(s.text);
    u.lang = /[؀-ۿ]/.test(s.text) ? 'ar-SA' : 'en-US';
    u.rate = settings.reciteRate || 1;
    u.onend = () => { if (this.on && this.u === u) { this.i++; this.say(); } };
    u.onerror = () => { if (this.on && this.u === u) { this.i++; setTimeout(() => this.say(), 100); } };
    this.u = u; speechSynthesis.cancel(); speechSynthesis.speak(u);
    r.ctrl?.redraw();
  }
  pause() { this.on = false; this.u = null; try { speechSynthesis.cancel(); } catch {} this.r.ctrl?.redraw(); }
  stop() { this.pause(); this.r.onSentence(null); }
  toggle(page) { this.on ? this.pause() : this.start(page, this.page === page ? this.i : 0); }
}

// ---------------------------------------------------------------- word wrap for the side panels
function wrap(ctx, str, maxW) {
  const out = [];
  for (const para of String(str).split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const w of para.split(/\s+/)) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
  }
  return out;
}
const softTex = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
    const r = g.createLinearGradient(0, 0, 0, 64); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.22, 'rgba(255,255,255,1)'); r.addColorStop(0.78, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 64);
    const e = g.createLinearGradient(0, 0, 128, 0); e.addColorStop(0, 'rgba(0,0,0,1)'); e.addColorStop(0.08, 'rgba(0,0,0,0)'); e.addColorStop(0.92, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = e; g.fillRect(0, 0, 128, 64);
    t = new THREE.CanvasTexture(c); return t;
  };
})();

// ---------------------------------------------------------------- the reader window
export class ReaderWindow {
  constructor(mgr, { book = 'quran', page = 0, item = null } = {}) {
    this.mgr = mgr; this.app = mgr.app; this.kind = 'reader'; this.id = ++rid;
    this.gazeOff = true;               // reading: looking at the text never clicks it
    this.bookId = book; this.itemId = item;
    this.group = new THREE.Group(); this.group.userData.window = this;
    this.theme = THEMES[settings.readerNight ? 'night' : 'day'];
    this.layouts = new Map(); this.cache = new Map();
    this.focusKey = null; this.reciteKey = null;
    this.tafsir = { R: settings.tafsirR || 'muyassar', L: settings.tafsirL || 'saadi' };
    this.tafPage = { R: 0, L: 0 };
    this.build();
    this.start(page);
  }
  // ---- 3D
  build() {
    const g = this.group;
    this.spine = new THREE.Group(); g.add(this.spine);
    // leather covers behind the pages
    const coverM = new THREE.MeshBasicMaterial({ color: settings.readerNight ? 0x0f2a24 : 0x1d4a3d });
    const edgeM = new THREE.MeshBasicMaterial({ color: 0xc9a55a });
    this.hinge = {};
    for (const side of ['R', 'L']) {
      const s = side === 'R' ? 1 : -1, h = new THREE.Group();
      h.rotation.y = -s * OPEN; this.spine.add(h); this.hinge[side] = h;
      const cover = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.014, PH + 0.022, 0.006), coverM);
      cover.position.set(s * (PW / 2 + 0.006), 0, -0.022); h.add(cover);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.016, PH + 0.024, 0.002), edgeM);
      trim.position.set(s * (PW / 2 + 0.006), 0, -0.026); h.add(trim);
      // the stack of pages under this one (thicker on the side you have read more of)
      const stack = new THREE.Mesh(new THREE.BoxGeometry(PW, PH, 1), new THREE.MeshBasicMaterial({ color: 0xf1e6c8 }));
      stack.position.set(s * PW / 2, 0, -0.0045); stack.scale.z = 0.006; h.add(stack); h.userData.stack = stack;
      const tex = new THREE.CanvasTexture(document.createElement('canvas'));
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      const page = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat);
      page.position.x = s * PW / 2; h.add(page);
      page.userData.interact = {
        type: 'surface', window: this, scroll: () => true,
        toPx: uv => [uv.x * CW, (1 - uv.y) * CH],
        scrollBy: dx => this.swipe(dx),
        click: hit => this.tapPage(side, hit),
        hover: (on, hit) => this.hoverPage(side, on, hit),
      };
      h.userData.page = page;
      // highlights: the recited ayah (a few line strips), the recited word, the line you are on
      const hl = [];
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: softTex(), color: this.theme.hl, transparent: true, opacity: this.theme.hlOp, depthWrite: false, toneMapped: false }));
        m.visible = false; m.position.z = 0.0012; m.renderOrder = 2; page.add(m); hl.push(m);
      }
      const word = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: softTex(), color: this.theme.word, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false }));
      word.visible = false; word.position.z = 0.0016; word.renderOrder = 3; page.add(word);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: softTex(), color: this.theme.line, transparent: true, opacity: this.theme.lineOp, depthWrite: false, toneMapped: false }));
      line.visible = false; line.position.z = 0.001; line.renderOrder = 1; page.add(line);
      h.userData.hl = hl; h.userData.word = word; h.userData.line = line;
    }
    // the turning page (front and back)
    this.flip = new THREE.Group(); this.spine.add(this.flip); this.flip.visible = false;
    const fg = new THREE.PlaneGeometry(PW, PH, 16, 1);
    this.flipFront = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.FrontSide }));
    const bg = fg.clone(); const uv = bg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    this.flipBack = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.BackSide }));
    this.flip.add(this.flipFront, this.flipBack);
    this.flipBase = fg.attributes.position.array.slice();
    // side panels: two tafsir books
    const bw = PW * Math.cos(OPEN), TW = 0.44;
    this.side = {};
    for (const side of ['R', 'L']) {
      const s = side === 'R' ? 1 : -1;
      const p = new CanvasPanel(TW, PH, (ctx, W, H, pp) => this.drawTafsir(side, ctx, W, H, pp), { pxPerM: 2000 });
      p.mesh.position.set(s * (bw + 0.045 + TW / 2 * Math.cos(0.42)), 0, PW * Math.sin(OPEN) + TW / 2 * Math.sin(0.42));
      p.mesh.rotation.y = -s * 0.42;
      g.add(p.mesh); this.side[side] = p;
    }
    // the ayah floating above the book
    this.float = new CanvasPanel(1.3, 0.26, (ctx, W, H) => this.drawFloat(ctx, W, H), { pxPerM: 1400 });
    this.float.mesh.userData.interact = null;
    this.float.mesh.position.set(0, PH / 2 + 0.2, -0.04);
    g.add(this.float.mesh);
    // controls under the book
    this.ctrl = new CanvasPanel(1.02, 0.115, (ctx, W, H, p) => this.drawCtrl(ctx, W, H, p), { pxPerM: 1500 });
    this.ctrl.mesh.position.set(0, -PH / 2 - 0.085, 0.07); this.ctrl.mesh.rotation.x = -0.22;
    g.add(this.ctrl.mesh);
    this.menu = new CanvasPanel(1.02, 0.56, (ctx, W, H, p) => this.drawMenu(ctx, W, H, p), { pxPerM: 1300 });
    this.menu.mesh.position.set(0, -PH / 2 - 0.085 + 0.36, 0.14); this.menu.mesh.renderOrder = 950; this.menu.mesh.material.depthTest = false;
    this.menuOpen = null;
    // move it by the bar, close it with ✕
    const { mesh: bar, hit } = makeBar(0.24, 0.024);
    hit.userData.interact = { type: 'drag', window: this, hover: on => { bar.userData.drawHover(on); return true; } };
    bar.position.set(0, -PH / 2 - 0.185, 0.1); bar.rotation.x = -0.22; g.add(bar);
    this.closeBtn = new IconButton('close', 0.05, () => this.mgr.close(this));
    this.closeBtn.mesh.position.set(-0.17, -PH / 2 - 0.185, 0.104); this.closeBtn.mesh.rotation.x = -0.22; g.add(this.closeBtn.mesh);
    this.applyLayout();
  }
  // floating ayah and side panels follow the book's options
  applyLayout() {
    const quran = !this.book || !!this.book.quran, showT = settings.readerTafsir !== false && quran;
    this.side.R.mesh.visible = showT; this.side.L.mesh.visible = showT;
    this.float.mesh.visible = settings.readerFloat !== false && quran;
    // in space the ayah floats far and big, in the sky in front of you
    const space = settings.environment === 'space';
    this.float.mesh.position.set(0, space ? PH / 2 + 0.75 : PH / 2 + 0.2, space ? -2.4 : -0.04);
    this.float.mesh.scale.setScalar(space ? 2.6 : 1);
    this.mgr.refreshTargets?.();
  }
  async start(page) {
    try {
      this.book = this.bookId === 'quran' ? new QuranBook() : await openBook(this.bookId, this.itemId, this.app);
      await this.book.open?.();
    } catch (e) { this.app.toast('تعذّر فتح الكتاب: ' + (e.message || e), 3500); this.app.log('القراءة: ' + (e.message || e)); this.mgr.close(this); return; }
    this.rtl = this.book.rtl;
    this.recite = this.book.quran ? new Recitation(this) : null;
    this.speaker = this.book.quran ? null : new Speaker(this);
    const saved = progress.get(this.book.id);
    this.applyLayout();
    await this.show(page || saved?.page || 1);
    if (this.book.quran && !saved) this.app.toast('📖 المصحف · اقرص الصفحة واسحب لتقليبها · ▶ للتلاوة', 4000);
  }
  // the spread that shows page n: right = odd page in an Arabic book, left = odd page in an English one
  firstOf(n) { n = Math.max(1, Math.min(this.book.count, n)); return n % 2 ? n : n - 1; }
  pageAt(side) { const f = this.first; return (side === 'R') === this.rtl ? f : f + 1; }
  shown(n) { return n === this.first || n === this.first + 1; }
  pageOfKey(key) { for (const n of [this.first, this.first + 1]) { const l = this.layouts.get(n); if (l?.lines?.some(x => x.words.some(w => w.key === key))) return n; } return this.lastPageOfKey?.[key] || this.first; }
  // a page drawn once and kept (the last few), shared by the spread, the turning page and the prefetch
  render(n, side) {
    const k = n + side + (settings.readerNight ? 'n' : 'd');
    let p = this.cache.get(k);
    if (p) { this.cache.delete(k); this.cache.set(k, p); return p.then(c => { if (c.layout) this.layouts.set(n, c.layout); return c; }); }
    p = (async () => {
      const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
      const ctx = cv.getContext('2d');
      let layout = null;
      if (n < 1 || n > this.book.count) paper(ctx, side, this.theme);
      else {
        try { layout = await this.book.draw(ctx, n, side, this.theme, CW, CH); }
        catch (e) {
          paper(ctx, side, this.theme);
          text(ctx, 'تعذّر تحميل الصفحة ' + n, CW / 2, CH / 2 - 30, 34, { color: this.theme.ink, weight: 700 });
          text(ctx, 'تحقق من الاتصال ثم اقلب الصفحة مجدداً', CW / 2, CH / 2 + 30, 26, { color: this.theme.dim });
          this.app.log('صفحة ' + n + ': ' + (e.message || e));
          setTimeout(() => this.cache.delete(k), 0);
        }
      }
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      if (layout) this.layouts.set(n, layout);
      return { cv, tex, layout, n };
    })();
    p.then(c => { p.done = c; this.evict(); });
    this.cache.set(k, p);
    return p;
  }
  evict() {
    if (this.cache.size <= 7) return;
    const used = new Set([this.hinge.R.userData.page.material.map, this.hinge.L.userData.page.material.map, this.flipFront.material.map, this.flipBack.material.map]);
    for (const [k, p] of this.cache) {
      if (this.cache.size <= 7) break;
      if (p.done && !used.has(p.done.tex)) { this.cache.delete(k); p.done.tex.dispose(); }
    }
  }
  setTex(side, c) { const m = this.hinge[side].userData.page.material; m.map = c.tex; m.needsUpdate = true; }
  async show(n) {
    const first = this.firstOf(n);
    const token = this.showToken = {};
    const [a, b] = await Promise.all([this.render(first, this.rtl ? 'R' : 'L'), this.render(first + 1, this.rtl ? 'L' : 'R')]);
    if (token !== this.showToken) return;
    this.first = first;
    this.setTex(this.rtl ? 'R' : 'L', a); this.setTex(this.rtl ? 'L' : 'R', b);
    this.afterShow();
    this.prefetch();
  }
  afterShow() {
    const f = this.first, frac = this.book.count > 1 ? (f - 1) / (this.book.count - 1) : 0;
    // the pages you have read pile up on the side they were turned to (the right one in an Arabic book)
    const done = this.rtl ? 'R' : 'L', todo = this.rtl ? 'L' : 'R';
    const pile = (side, d) => { const st = this.hinge[side].userData.stack; st.scale.z = d; st.position.z = -0.0015 - d / 2; };
    pile(done, 0.002 + 0.016 * frac); pile(todo, 0.002 + 0.016 * (1 - frac));
    progress.set(this.book.id, f, this.book.count, this.book.title);
    if (this.book.quran) {
      this.book.keys(f).then(ks => { if (!this.focusKey || !this.onSpread(this.focusKey)) this.setFocus(ks[0], false); });
    }
    this.updateHighlights();
    this.ctrl.redraw();
    this.mgr.changed();
  }
  onSpread(key) { return [this.first, this.first + 1].some(n => this.layouts.get(n)?.lines?.some(l => l.words.some(w => w.key === key))); }
  prefetch() {
    const f = this.first;
    setTimeout(() => {
      if (this.disposed) return;
      if (f + 2 <= this.book.count) { this.render(f + 2, this.rtl ? 'R' : 'L'); this.render(f + 3, this.rtl ? 'L' : 'R'); }
      if (f > 2) { this.book.load?.(f - 1)?.catch?.(() => {}); this.book.load?.(f - 2)?.catch?.(() => {}); }
    }, 400);
  }
  // ---- turning pages
  async turn(dir, then) {
    if (this.turning || !this.book) return;
    const next = this.first + dir * 2;
    if (next < 1 || next > this.book.count) { blip('error', settings.sounds); return; }
    this.turning = true;
    // forward in an Arabic book: the left page lifts and lands on the right
    const fromSide = (dir > 0) === this.rtl ? 'L' : 'R', toSide = fromSide === 'L' ? 'R' : 'L';
    const back = await this.render(next + (toSide === (this.rtl ? 'R' : 'L') ? 0 : 1), toSide);
    const under = await this.render(next + (fromSide === (this.rtl ? 'R' : 'L') ? 0 : 1), fromSide);
    const front = this.hinge[fromSide].userData.page.material.map;
    this.flipFront.material.map = front; this.flipFront.material.needsUpdate = true;
    this.flipBack.material.map = back.tex; this.flipBack.material.needsUpdate = true;
    const s = fromSide === 'R' ? 1 : -1;
    this.flipFront.position.x = this.flipBack.position.x = s * PW / 2;
    this.setTex(fromSide, under);
    this.clearHighlights();
    this.flip.visible = true;
    blip('grab', settings.sounds);
    const t0 = performance.now(), dur = 520;
    this.flipAnim = { t0, dur, s, done: () => {
      this.flip.visible = false; this.setTex(toSide, back); this.first = next; this.turning = false;
      this.afterShow(); this.prefetch(); then?.();
    } };
  }
  updateFlip(now) {
    const f = this.flipAnim; if (!f) return;
    let t = Math.min(1, (now - f.t0) / f.dur); const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    // from leaning on its side, over the spine (towards you), to the other side
    this.flip.rotation.y = -f.s * (OPEN + e * (Math.PI - 2 * OPEN));
    // the free edge lags a little: the page bends while it turns
    const pos = this.flipFront.geometry.attributes.position, base = this.flipBase, bend = Math.sin(Math.PI * t) * 0.07;
    for (let i = 0; i < pos.count; i++) { const x = base[i * 3], xn = f.s > 0 ? (x + PW / 2) / PW : (PW / 2 - x) / PW; pos.setZ(i, -bend * xn * xn); }
    pos.needsUpdate = true;
    this.flipBack.geometry.attributes.position.copyArray(pos.array); this.flipBack.geometry.attributes.position.needsUpdate = true;
    if (t >= 1) { this.flipAnim = null; f.done(); }
  }
  swipe(dx) {
    if (this.turning || performance.now() - (this.swipeAt || 0) < 700) return;
    this.swipeAcc = (this.swipeAcc || 0) + dx;
    if (Math.abs(this.swipeAcc) > 160) {
      // hand moving right (dx < 0) = forward in an Arabic book
      const dir = (this.swipeAcc < 0) === this.rtl ? 1 : -1;
      this.swipeAcc = 0; this.swipeAt = performance.now();
      this.turn(dir);
    }
  }
  next() { this.turn(1); }
  prev() { this.turn(-1); }
  async goTo(n) { this.recite?.stop(); this.speaker?.stop(); await this.show(n); }
  async goToKey(key) { const n = await this.book.pageOf(key); await this.show(n); this.setFocus(key); }
  // ---- pointing at the page
  hit2px(hit) { return [hit.uv.x * CW, (1 - hit.uv.y) * CH]; }
  lineAt(side, hit) {
    const lay = this.layouts.get(this.pageAt(side)); if (!lay) return null;
    const [, y] = this.hit2px(hit);
    return lay.lines.find(l => y >= l.y0 && y < l.y1) || null;
  }
  hoverPage(side, on, hit) {
    const ud = this.hinge[side].userData;
    if (!on || !hit?.uv || settings.readerLine === false) { if (this.lineSide === side) { ud.line.visible = false; this.lineSide = null; } return true; }
    const l = this.lineAt(side, hit);
    if (l && (l.words.length || l.text)) {
      if (this.lineSide && this.lineSide !== side) this.hinge[this.lineSide].userData.line.visible = false;
      this.lineSide = side;
      const x0 = l.words.length ? Math.min(...l.words.map(w => w.x0)) : l.x0, x1 = l.words.length ? Math.max(...l.words.map(w => w.x1)) : l.x1;
      this.place(ud.line, x0 - 14, l.y0 + 4, x1 + 14, l.y1 - 4);
      ud.line.visible = true;
    } else ud.line.visible = false;
    this.lookedAt = performance.now();
    return true;
  }
  tapPage(side, hit) {
    if (!hit?.uv) return false;
    const l = this.lineAt(side, hit); if (!l) return true;
    const [x] = this.hit2px(hit);
    const w = l.words.find(q => x >= q.x0 - 6 && x <= q.x1 + 6) || l.words[0];
    if (this.book.quran && w?.key) {
      blip('tap', settings.sounds);
      if (this.recite.playing || this.recite.state === 'wait') this.recite.play(w.key);
      else this.setFocus(w.key);
    } else if (w?.s != null && this.speaker) { blip('tap', settings.sounds); this.speaker.start(this.pageAt(side), w.s); }
    return true;
  }
  // a rectangle on the page canvas → a highlight strip on the page
  place(m, x0, y0, x1, y1) {
    m.scale.set((x1 - x0) / CW * PW, (y1 - y0) / CH * PH, 1);
    m.position.x = ((x0 + x1) / 2 / CW - 0.5) * PW; m.position.y = (0.5 - (y0 + y1) / 2 / CH) * PH;
  }
  clearHighlights() { for (const s of ['R', 'L']) { const u = this.hinge[s].userData; u.hl.forEach(m => { m.visible = false; }); u.word.visible = false; u.line.visible = false; } }
  // light up an ayah (all its words, across lines and both pages) or a sentence of a book
  updateHighlights() {
    for (const side of ['R', 'L']) {
      const u = this.hinge[side].userData, lay = this.layouts.get(this.pageAt(side));
      u.hl.forEach(m => { m.visible = false; }); u.word.visible = false;
      if (!lay) continue;
      let k = 0;
      const key = this.reciteKey || (this.book?.quran ? this.focusKey : null);
      for (const l of lay.lines) {
        const ws = key ? l.words.filter(w => w.key === key) : this.sentence && this.sentence.page === this.pageAt(side) ? l.words.filter(w => w.s === this.sentence.i) : [];
        if (!ws.length || k >= u.hl.length) continue;
        const m = u.hl[k++];
        m.material.opacity = this.reciteKey || this.sentence ? this.theme.hlOp : this.theme.hlOp * 0.55;
        this.place(m, Math.min(...ws.map(w => w.x0)) - 8, l.y0 + 6, Math.max(...ws.map(w => w.x1)) + 8, l.y1 - 6);
        m.visible = true;
        if (this.reciteKey && this.word != null) {
          const w = ws.find(q => q.pos === this.word && !q.end);
          if (w) { this.place(u.word, w.x0 - 6, l.y0 + 10, w.x1 + 6, l.y1 - 8); u.word.visible = true; }
        }
      }
    }
  }
  // ---- recitation / reading aloud events
  onRecite(key) {
    this.reciteKey = key; this.word = null;
    if (key) {
      this.setFocus(key, false);
      if (!this.onSpread(key)) {
        // the next ayah is on the next spread: turn the page (or jump there)
        const nextFirst = this.first + 2;
        this.book.keys(nextFirst).then(async ks => {
          const ks2 = await this.book.keys(nextFirst + 1);
          if (ks.includes(key) || ks2.includes(key)) this.turn(1, () => this.updateHighlights());
          else this.goToKeyQuiet(key);
        });
      }
    }
    this.updateHighlights(); this.ctrl.redraw();
  }
  async goToKeyQuiet(key) { const n = await this.book.pageOf(key); await this.show(n); this.updateHighlights(); }
  onWord(key, pos) { this.word = pos; this.updateHighlights(); }
  onSentence(page, s) {
    this.sentence = page ? { page, i: s.i } : null;
    this.updateHighlights();
  }
  setFocus(key, redrawAll = true) {
    if (!key) return;
    const changed = key !== this.focusKey;
    this.focusKey = key;
    if (changed) { this.tafPage = { R: 0, L: 0 }; this.loadTafsir('R'); this.loadTafsir('L'); this.loadFloat(); }
    this.updateHighlights();
  }
  // ---- tafsir panels
  async loadTafsir(side) {
    const key = this.focusKey; if (!key || !this.book?.quran) return;
    const id = this.tafsir[side];
    this.taf = this.taf || {};
    this.taf[side] = { key, id, text: null };
    this.side[side].redraw();
    try { const t = await Q.tafsirText(id, key); if (this.taf[side].key === key && this.taf[side].id === id) this.taf[side].text = t || 'لا يوجد تفسير لهذه الآية في هذا الكتاب'; }
    catch (e) { if (this.taf[side].key === key) this.taf[side].text = 'تعذّر التحميل — تحقق من الاتصال'; }
    this.side[side].redraw();
  }
  drawTafsir(side, ctx, W, H, p) {
    roundRect(ctx, 0, 0, W, H, 40); ctx.fillStyle = settings.readerNight ? 'rgba(10,14,24,0.9)' : 'rgba(18,24,34,0.86)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(214,180,110,0.55)'; ctx.stroke();
    const T = Q.TAFSIRS.find(t => t.id === this.tafsir[side]) || Q.TAFSIRS[0];
    // title chip: tap to choose another book
    const hov = p.isHover('src');
    roundRect(ctx, 30, 26, W - 60, 74, 37); ctx.fillStyle = hov ? 'rgba(214,180,110,0.35)' : 'rgba(214,180,110,0.16)'; ctx.fill();
    text(ctx, T.name + '  ▾', W / 2, 64, 30, { weight: 800, color: '#f3dfae', maxWidth: W - 90, fit: true });
    p.region(30, 26, W - 60, 74, () => { blip('tap', settings.sounds); this.openMenu('tafsir' + side); }, 'src');
    const key = this.taf?.[side]?.key || this.focusKey;
    if (key) { const [s, a] = key.split(':').map(Number); text(ctx, 'سورة ' + Q.SURAHS[s - 1][0] + ' · الآية ' + Q.arNum(a), W / 2, 132, 26, { color: 'rgba(240,228,200,0.75)', weight: 700 }); }
    const body = this.taf?.[side]?.text;
    if (!body) { text(ctx, key ? 'جاري التحميل…' : 'اختر آية بالنقر عليها', W / 2, H / 2, 30, { color: 'rgba(240,228,200,0.7)' }); return; }
    const ltr = T.ltr, fs = 33, lh = fs * 1.85, top = 168, bottom = H - 96;
    ctx.save(); ctx.font = `${fs}px ${Q.BFONT}`; ctx.direction = ltr ? 'ltr' : 'rtl';
    const wc = (this.wrapCache ||= {});
    if (!wc[side] || wc[side].body !== body || wc[side].w !== W) wc[side] = { body, w: W, lines: wrap(ctx, body, W - 76) };
    const lines = wc[side].lines;
    const per = Math.max(1, Math.floor((bottom - top) / lh)), pages = Math.max(1, Math.ceil(lines.length / per));
    this.tafPage[side] = Math.min(this.tafPage[side], pages - 1);
    ctx.fillStyle = '#f2ead6'; ctx.textAlign = ltr ? 'left' : 'right'; ctx.textBaseline = 'middle';
    lines.slice(this.tafPage[side] * per, this.tafPage[side] * per + per).forEach((l, i) => ctx.fillText(l, ltr ? 38 : W - 38, top + lh * (i + 0.5)));
    ctx.restore();
    if (pages > 1) {
      text(ctx, Q.arNum(this.tafPage[side] + 1) + ' / ' + Q.arNum(pages), W / 2, H - 50, 26, { color: 'rgba(240,228,200,0.75)', weight: 700 });
      [['up', W - 90, -1, 'chevR'], ['dn', 90, 1, 'chevL']].forEach(([id, x, d, ic]) => {
        const hv = p.isHover(id); ctx.beginPath(); ctx.arc(x, H - 50, 32, 0, 7); ctx.fillStyle = hv ? 'rgba(214,180,110,0.45)' : 'rgba(214,180,110,0.18)'; ctx.fill();
        icon(ctx, d < 0 ? 'chevR' : 'chevL', x, H - 50, 30, '#f3dfae');
        p.region(x - 50, H - 92, 100, 84, () => { blip('tap', settings.sounds); this.tafPage[side] = Math.max(0, Math.min(pages - 1, this.tafPage[side] + d)); this.side[side].redraw(); }, id);
      });
    }
  }
  // ---- the floating ayah
  async loadFloat() {
    const key = this.focusKey; if (!key || !this.book?.quran) return;
    this.floatText = { key, text: await this.book.ayahText(key) };
    this.float.redraw();
  }
  drawFloat(ctx, W, H) {
    const f = this.floatText; if (!f?.text) return;
    // a soft dark oval behind the words (fades out before the panel's edges)
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(W / 2, H / 2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, 'rgba(8,12,24,0.5)'); g.addColorStop(0.7, 'rgba(8,12,24,0.3)'); g.addColorStop(1, 'rgba(8,12,24,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.fill(); ctx.restore();
    const [s, a] = f.key.split(':').map(Number);
    ctx.save(); ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let fs = 64, lines;
    for (; fs > 26; fs -= 4) { ctx.font = `${fs}px ${Q.QFONT}`; lines = wrap(ctx, f.text + ' ﴿' + Q.arNum(a) + '﴾', W - 100); if (lines.length * fs * 1.7 <= H - 70) break; }
    ctx.shadowColor = 'rgba(255,214,130,0.9)'; ctx.shadowBlur = 22; ctx.fillStyle = '#fff4d8';
    const top = (H - 50 - lines.length * fs * 1.7) / 2;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, top + fs * 1.7 * (i + 0.5)));
    ctx.shadowBlur = 0;
    ctx.font = `700 26px ${Q.BFONT}`; ctx.fillStyle = 'rgba(255,226,160,0.85)';
    ctx.fillText('سورة ' + Q.SURAHS[s - 1][0] + ' · ' + Q.arNum(a), W / 2, H - 24);
    ctx.restore();
  }
  // ---- controls
  drawCtrl(ctx, W, H, p) {
    roundRect(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2); ctx.fillStyle = 'rgba(14,18,28,0.82)'; ctx.fill();
    glass(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2);
    if (!this.book) { text(ctx, 'جاري فتح الكتاب…', W / 2, H / 2, H * 0.32, { weight: 700 }); return; }
    const playing = this.book.quran ? (this.recite.playing || this.recite.state === 'wait') : this.speaker?.playing;
    const btns = [
      ['next', 'chevL', () => this.next()],
      ['play', playing ? 'pause' : 'play', () => this.togglePlay(), true],
      ['prev', 'chevR', () => this.prev()],
    ];
    const bw = H * 0.86;
    // left: next (Arabic book: next page is to the left) · play · previous
    btns.forEach(([id, ic, act, strong], i) => {
      const cx = H * 0.62 + i * (bw + 8), cy = H / 2, hov = p.isHover(id);
      ctx.beginPath(); ctx.arc(cx, cy, bw * 0.46, 0, 7); ctx.fillStyle = strong ? (hov ? '#ffe2a0' : 'rgba(255,214,130,0.9)') : hov ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'; ctx.fill();
      icon(ctx, this.rtl ? ic : ({ chevL: 'chevR', chevR: 'chevL' }[ic] || ic), cx, cy, bw * 0.46, strong ? '#2a1d05' : COLORS.text);
      p.region(cx - bw / 2, 0, bw, H, () => { blip('tap', settings.sounds); act(); this.ctrl.redraw(); }, id);
    });
    // middle: where you are
    const n = this.first || 1;
    let title = this.book.title, sub = '';
    if (this.book.quran) {
      const s = Q.surahOfPage(n);
      title = 'سورة ' + Q.SURAHS[s - 1][0];
      sub = 'الصفحة ' + Q.arNum(n) + ' · الجزء ' + Q.arNum(Q.juzOfPage(n)) + (this.recite.rec ? ' · ' + this.recite.rec.name : '');
    } else sub = 'الصفحة ' + n + (this.book.count > 1 ? ' من ' + this.book.count : '');
    const mx = H * 0.62 + 3 * (bw + 8) - bw / 2 + 10, rx = W - H * 0.62 - 4 * (bw + 6);
    const hm = p.isHover('where');
    if (hm) { roundRect(ctx, mx, 8, rx - mx, H - 16, (H - 16) / 2); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill(); }
    text(ctx, title, (mx + rx) / 2, H * 0.36, H * 0.27, { weight: 800, maxWidth: rx - mx - 20, fit: true });
    text(ctx, sub, (mx + rx) / 2, H * 0.72, H * 0.19, { color: COLORS.dim, weight: 600, maxWidth: rx - mx - 20, fit: true });
    p.region(mx, 0, rx - mx, H, () => { blip('tap', settings.sounds); this.openMenu(this.book.quran ? 'index' : 'pages'); }, 'where');
    // right: reciter · options · night · shelf
    const right = [
      this.book.quran ? ['rec', 'mic', () => this.openMenu('reciter')] : ['rec', 'sound', () => this.openMenu('voice')],
      ['opt', 'sliders', () => this.openMenu('options')],
      ['night', settings.readerNight ? 'sun' : 'moon', () => this.setNight(!settings.readerNight)],
      ['shelf', 'stack', () => { this.app.openShelf?.(); }],
    ];
    right.forEach(([id, ic, act], i) => {
      const cx = W - H * 0.62 - i * (bw + 6), cy = H / 2, hov = p.isHover(id), on = this.menuOpen && this.menuOpen.startsWith(id === 'rec' ? 'reciter' : id === 'opt' ? 'options' : '-');
      ctx.beginPath(); ctx.arc(cx, cy, bw * 0.44, 0, 7); ctx.fillStyle = hov || on ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'; ctx.fill();
      icon(ctx, ic, cx, cy, bw * 0.44);
      p.region(cx - bw / 2, 0, bw, H, () => { blip('tap', settings.sounds); act(); this.ctrl.redraw(); }, id);
    });
  }
  togglePlay() {
    if (this.book.quran) this.recite.toggle(this.recite.resumeAt || this.focusKey || this.layouts.get(this.first)?.lines.find(l => l.words.length)?.words[0]?.key || '1:1');
    else this.speaker.toggle(this.pageAt(this.rtl ? 'R' : 'L'));
    this.ctrl.redraw();
  }
  setNight(on) {
    saveSettings({ readerNight: on });
    this.theme = THEMES[on ? 'night' : 'day'];
    for (const s of ['R', 'L']) { const u = this.hinge[s].userData; u.hl.forEach(m => { m.material.color.setHex(this.theme.hl); }); u.word.material.color.setHex(this.theme.word); u.line.material.color.setHex(this.theme.line); u.line.material.opacity = this.theme.lineOp; }
    this.show(this.first);
    this.ctrl.redraw();
  }
  // ---- the pop-up menu: surah index, reciters, tafsir books, options
  openMenu(kind) {
    if (this.menuOpen === kind) { this.closeMenu(); return; }
    this.menuOpen = kind; this.menuPage = 0;
    if (!this.menu.mesh.parent) this.group.add(this.menu.mesh);
    this.menu.redraw(); this.mgr.refreshTargets?.();
  }
  closeMenu() { this.menuOpen = null; this.group.remove(this.menu.mesh); this.mgr.refreshTargets?.(); this.ctrl.redraw(); }
  drawMenu(ctx, W, H, p) {
    const kind = this.menuOpen; if (!kind) return;
    roundRect(ctx, 0, 0, W, H, 44); ctx.fillStyle = 'rgba(12,16,26,0.94)'; ctx.fill(); glass(ctx, 0, 0, W, H, 44);
    const close = () => { const hv = p.isHover('x'); ctx.beginPath(); ctx.arc(64, 56, 32, 0, 7); ctx.fillStyle = hv ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'; ctx.fill(); icon(ctx, 'close', 64, 56, 28); p.region(24, 16, 80, 80, () => { blip('close', settings.sounds); this.closeMenu(); }, 'x'); };
    const grid = (items, cols, rows, onPick, isOn, title, sub) => {
      text(ctx, title, W - 50, 58, 38, { align: 'right', weight: 800 });
      if (sub) text(ctx, sub, W - 50, 102, 24, { align: 'right', color: COLORS.dim });
      close();
      const per = cols * rows, pages = Math.max(1, Math.ceil(items.length / per));
      this.menuPage = Math.min(this.menuPage, pages - 1);
      const top = 128, pad = 34, g = 12, cw = (W - pad * 2 - g * (cols - 1)) / cols, ch = (H - top - 80 - g * (rows - 1)) / rows;
      items.slice(this.menuPage * per, this.menuPage * per + per).forEach((it, i) => {
        const c = i % cols, r = Math.floor(i / cols), x = W - pad - (c + 1) * cw - c * g, y = top + r * (ch + g), id = 'i' + i, hv = p.isHover(id), on = isOn?.(it);
        roundRect(ctx, x, y, cw, ch, Math.min(26, ch / 2)); ctx.fillStyle = on ? 'rgba(255,214,130,0.88)' : hv ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.07)'; ctx.fill();
        text(ctx, it.label, x + cw / 2, y + ch * (it.sub ? 0.4 : 0.52), Math.min(30, ch * 0.4), { weight: 800, color: on ? '#2a1d05' : COLORS.text, maxWidth: cw - 16, fit: true, dir: 'auto' });
        if (it.sub) text(ctx, it.sub, x + cw / 2, y + ch * 0.74, Math.min(20, ch * 0.26), { color: on ? '#4a3a15' : COLORS.dim, maxWidth: cw - 12, fit: true, dir: 'auto' });
        p.region(x, y, cw, ch, () => { blip('tap', settings.sounds); onPick(it); }, id);
      });
      if (pages > 1) {
        text(ctx, Q.arNum(this.menuPage + 1) + ' / ' + Q.arNum(pages), W / 2, H - 40, 26, { color: COLORS.dim, weight: 700 });
        [['pgR', W / 2 + 130, -1, 'chevR'], ['pgL', W / 2 - 130, 1, 'chevL']].forEach(([id, x, d, ic]) => {
          const hv = p.isHover(id); ctx.beginPath(); ctx.arc(x, H - 40, 28, 0, 7); ctx.fillStyle = hv ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'; ctx.fill(); icon(ctx, ic, x, H - 40, 26);
          p.region(x - 46, H - 80, 92, 80, () => { blip('tap', settings.sounds); this.menuPage = (this.menuPage + d + pages) % pages; this.menu.redraw(); }, id);
        });
      }
    };
    if (kind === 'index') {
      const items = Q.SURAHS.map(([name, n, page], i) => ({ label: Q.arNum(i + 1) + '. ' + name, sub: Q.arNum(n) + ' آية · ص ' + Q.arNum(page), page, s: i + 1 }));
      const juz = Q.JUZ_PAGES.map((page, i) => ({ label: 'الجزء ' + Q.arNum(i + 1), sub: 'ص ' + Q.arNum(page), page }));
      grid([...items, ...juz], 5, 5, it => { this.closeMenu(); this.goTo(it.page); }, it => it.s ? Q.surahOfPage(this.first) === it.s : false, 'فهرس السور', 'اختر سورة أو جزءاً');
    } else if (kind === 'pages') {
      const n = this.book.count, step = Math.max(1, Math.ceil(n / 50)), items = [];
      for (let i = 1; i <= n; i += step) items.push({ label: 'صفحة ' + i, page: i });
      grid(items, 5, 5, it => { this.closeMenu(); this.goTo(it.page); }, it => this.shown(it.page), this.book.title, 'انتقل إلى صفحة');
    } else if (kind === 'reciter') {
      const items = Q.RECITERS.map(r => ({ label: r.name, sub: r.q ? 'الكلمة تضيء مع التلاوة' : 'آية بآية', id: r.id }));
      grid(items, 4, 4, it => { this.recite.setReciter(it.id); this.menu.redraw(); this.ctrl.redraw(); }, it => it.id === this.recite.rec.id, 'القارئ', 'اختر صوت التلاوة');
    } else if (kind === 'voice') {
      const items = [0.75, 0.9, 1, 1.15, 1.3].map(v => ({ label: '× ' + v, sub: v === 1 ? 'عادية' : v < 1 ? 'أبطأ' : 'أسرع', v }));
      grid(items, 5, 1, it => { saveSettings({ reciteRate: it.v }); this.menu.redraw(); }, it => (settings.reciteRate || 1) === it.v, 'القراءة الصوتية', 'سرعة الصوت');
    } else if (kind.startsWith('tafsir')) {
      const side = kind.slice(6);
      grid(Q.TAFSIRS.map(t => ({ label: t.name, id: t.id })), 4, 4, it => {
        this.tafsir[side] = it.id; saveSettings({ ['tafsir' + side]: it.id }); this.tafPage[side] = 0; this.loadTafsir(side); this.closeMenu();
      }, it => it.id === this.tafsir[side], side === 'R' ? 'التفسير على اليمين' : 'التفسير على اليسار', 'اختر كتاباً');
    } else if (kind === 'options') {
      const pz = settings.recitePause ?? 0, rp = settings.reciteRepeat || 1, rate = settings.reciteRate || 1;
      const items = [
        { label: 'وقفة بعد كل آية', sub: pz < 0 ? 'حتى أضغط ▶' : pz ? Q.arNum(pz) + ' ث' : 'بلا وقفة', act: () => { const o = [0, 2, 4, 8, -1]; saveSettings({ recitePause: o[(o.indexOf(pz) + 1) % o.length] }); } },
        { label: 'تكرار الآية', sub: rp > 1 ? '× ' + Q.arNum(rp) : 'مرة واحدة', act: () => { const o = [1, 2, 3, 5, 10]; saveSettings({ reciteRepeat: o[(o.indexOf(rp) + 1) % o.length] }); } },
        { label: 'سرعة التلاوة', sub: '× ' + rate, act: () => { const o = [1, 1.15, 1.3, 0.8, 0.9]; saveSettings({ reciteRate: o[(o.indexOf(rate) + 1) % o.length] }); if (this.recite) this.recite.audio.playbackRate = settings.reciteRate; } },
        { label: 'إيقاف عند الالتفات', sub: settings.readerLookAway !== false ? 'يعمل' : 'متوقف', act: () => saveSettings({ readerLookAway: settings.readerLookAway === false }) },
        { label: 'تمييز السطر بالنظر', sub: settings.readerLine !== false ? 'يعمل' : 'متوقف', act: () => saveSettings({ readerLine: settings.readerLine === false }) },
        { label: 'التفسير بجانبي المصحف', sub: settings.readerTafsir !== false ? 'ظاهر' : 'مخفي', act: () => { saveSettings({ readerTafsir: settings.readerTafsir === false }); this.applyLayout(); } },
        { label: 'الآية العائمة', sub: settings.readerFloat !== false ? 'ظاهرة' : 'مخفية', act: () => { saveSettings({ readerFloat: settings.readerFloat === false }); this.applyLayout(); } },
        { label: 'بيئة القراءة', sub: { space: 'الفضاء', library: 'المكتبة', viewOffice: 'المكتب', reading: 'غرفة القراءة' }[settings.environment] || 'اختر', act: () => { const o = ['space', 'library', 'viewOffice', 'reading']; const k = o[(o.indexOf(settings.environment) + 1) % o.length]; saveSettings({ environment: k }); this.app.renderEnvChoices?.(); this.applyLayout(); } },
        { label: 'صوت المكان', sub: { rain: 'مطر', fire: 'مدفأة', night: 'ليل هادئ', off: 'بلا صوت' }[settings.ambient || 'off'], act: () => { const o = ['off', 'rain', 'fire', 'night']; const v = o[(o.indexOf(settings.ambient || 'off') + 1) % o.length]; saveSettings({ ambient: v }); this.app.ambient?.set(v); } },
        { label: 'الوضع الليلي', sub: settings.readerNight ? 'يعمل' : 'متوقف', act: () => this.setNight(!settings.readerNight) },
        { label: 'تكبير', sub: 'الكتاب أكبر', act: () => this.scaleBy(1.12) },
        { label: 'تصغير', sub: 'الكتاب أصغر', act: () => this.scaleBy(1 / 1.12) },
      ];
      grid(items, 4, 3, it => { it.act(); this.menu.redraw(); this.ctrl.redraw(); }, null, 'خيارات القراءة', 'تُحفظ لكل مرة');
    }
  }
  // ---- per frame
  update(dt, now) {
    this.updateFlip(now);
    this.recite?.update(now);
    // stop when you look away from the book (and go on when you look back)
    if (this.recite && settings.readerLookAway !== false && now - (this.lookCheck || 0) > 250) {
      this.lookCheck = now;
      const looking = this.isLookedAt();
      if (looking) this.lastLook = now;
      if (this.recite.state === 'play' && !looking && now - (this.lastLook || now) > 2200) { this.recite.pause(true); this.app.toast('⏸ توقفت التلاوة — انظر إلى المصحف لتتابع', 2200); }
      else if (this.recite.state === 'pause' && this.recite.auto && looking) { this.recite.resume(); }
    }
  }
  isLookedAt() {
    const ray = this._ray || (this._ray = new THREE.Raycaster());
    ray.set(new THREE.Vector3(0, 0, 0), this.app.headForward);
    const t = [this.hinge.R.userData.page, this.hinge.L.userData.page, this.side.R.mesh, this.side.L.mesh, this.ctrl.mesh, this.float.mesh].filter(m => m.visible);
    return ray.intersectObjects(t, false).length > 0;
  }
  busy() { return !!this.flipAnim || !!this.recite?.playing; }
  scaleBy(f) { this.group.scale.setScalar(THREE.MathUtils.clamp(this.group.scale.x * f, 0.4, 4)); this.mgr.changed(); }
  serialize() { const g = this.group; return { kind: 'reader', ref: { book: this.bookId, item: this.itemId, page: this.first || 1 }, p: g.position.toArray().map(v => +v.toFixed(3)), q: g.quaternion.toArray().map(v => +v.toFixed(4)), s: +g.scale.x.toFixed(3) }; }
  dispose() {
    this.disposed = true;
    this.recite?.stop(); this.speaker?.stop();
    for (const p of this.cache.values()) p.then(c => c.tex.dispose());
    this.cache.clear();
    [this.side.R, this.side.L, this.float, this.ctrl, this.menu].forEach(p => p.dispose());
    this.closeBtn.dispose();
    this.group.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  }
}
