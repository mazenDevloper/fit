// «وضع الحفظ» (التسميع): the words from where you start are covered with the page's own paper; you recite, the
// microphone follows you word by word and uncovers each word as you say it. A wrong or skipped word is shown in red
// (only that word) and counted. A page you finish is saved as memorized - «كم صفحة حفظت؟» answers from it.
import * as THREE from 'three';
import { settings, saveSettings } from './config.js';
import { blip } from './ui.js';

// the Uthmani text and the spoken words compared without marks, wasla, small letters and hamza seats
export const plain = s => String(s || '')
  .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
  .replace(/ٱ/g, 'ا').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '')
  .replace(/[^ء-ي]/g, '');
function sim(a, b) {
  a = plain(a); b = plain(b); if (!a || !b) return 0; if (a === b) return 1;
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[m][n] / Math.max(m, n);
}
const OK = 0.62;

export class Hifz {
  constructor(reader) {
    this.r = reader; this.app = reader.mgr.app; this.on = false; this.errs = new Set(); this.errCount = 0; this.pageErr = {};
    this.masks = { R: [], L: [] }; this.red = { R: [], L: [] };
  }
  // the words of the spread in reading order (right page, then left), each with where it is drawn
  sequence() {
    const r = this.r, seq = [];
    for (const side of ['R', 'L']) {
      const n = r.pageAt(side), lay = r.layouts.get(n); if (!lay) continue;
      lay.lines.forEach((l, li) => l.words.forEach(w => seq.push({ side, n, line: l, li, w })));
    }
    return seq;
  }
  start() {
    const r = this.r;
    if (!r.book?.quran) return this.app.toast('وضع الحفظ للمصحف', 2000);
    r.recite?.stop?.();
    this.on = true; this.errCount = 0; this.errs.clear(); this.pageErr = {};
    this.seq = this.sequence();
    // start at the ayah you are on (or the top of the page)
    const k = r.focusKey ? this.seq.findIndex(x => x.w.key === r.focusKey) : -1;
    this.cur = Math.max(0, k);
    this.skipMarks();
    this.draw(); this.listen();
    blip('open', settings.sounds);
    this.app.toast('📖 وضع الحفظ: اقرأ من «' + (this.seq[this.cur]?.w.key || '') + '» — تظهر كل كلمة عندما تقولها', 4000);
  }
  stop(msg = true) {
    this.on = false; try { this.rec?.stop(); } catch {} this.rec = null;
    for (const s of ['R', 'L']) { this.masks[s].forEach(m => { m.visible = false; }); this.red[s].forEach(m => { m.visible = false; }); }
    if (msg) this.app.toast('انتهى وضع الحفظ' + (this.errCount ? ' — الأخطاء: ' + this.errCount : ' — بدون أخطاء 👏'), 3000);
  }
  toggle() { this.on ? this.stop() : this.start(); }
  skipMarks() { while (this.seq[this.cur]?.w.end) this.cur++; }

  // ---- covering: one strip of paper per line over the words not said yet; a red mark under each mistake
  mesh(side, pool, color, opacity, z) {
    const page = this.r.hinge[side].userData.page;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false, toneMapped: false }));
    m.position.z = z; m.renderOrder = 4; page.add(m); pool.push(m); return m;
  }
  draw() {
    const r = this.r, paper = new THREE.Color((r.theme.paper || ['#fdf8ea'])[0]);
    for (const side of ['R', 'L']) {
      const strips = new Map();
      this.seq.forEach((x, i) => {
        if (x.side !== side || i < this.cur) return;
        const s = strips.get(x.li) || { l: x.line, x0: Infinity, x1: -Infinity }; s.x0 = Math.min(s.x0, x.w.x0); s.x1 = Math.max(s.x1, x.w.x1); strips.set(x.li, s);
      });
      const pool = this.masks[side]; let k = 0;
      for (const s of strips.values()) {
        const m = pool[k] || this.mesh(side, pool, paper, 1, 0.0019); k++;
        m.material.color.copy(paper); r.place(m, s.x0 - 4, s.l.y0 + 4, s.x1 + 4, s.l.y1 - 2); m.visible = true;
      }
      for (; k < pool.length; k++) pool[k].visible = false;
      const red = this.red[side]; let j = 0;
      this.errs.forEach(i => { const x = this.seq[i]; if (!x || x.side !== side) return; const m = red[j] || this.mesh(side, red, 0xff3b30, 0.38, 0.0021); j++; r.place(m, x.w.x0 - 4, x.line.y0 + 8, x.w.x1 + 4, x.line.y1 - 6); m.visible = true; });
      for (; j < red.length; j++) red[j].visible = false;
    }
  }
  // ---- listening: each spoken word is compared with the next covered word (or the one after, if one was skipped)
  listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return this.app.toast('التعرف على الصوت غير متاح هنا', 3000);
    this.app.stopVoice?.();
    const rec = new SR(); this.rec = rec;
    rec.lang = 'ar-SA'; rec.continuous = true; rec.interimResults = true;
    const used = new Map();   // result index -> words already taken from it
    rec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const words = e.results[i][0].transcript.trim().split(/\s+/).filter(Boolean);
        const from = used.get(i) || 0;
        // an interim result may still change its last word: take it only when final
        const upto = e.results[i].isFinal ? words.length : Math.max(from, words.length - 1);
        for (let k = from; k < upto; k++) this.said(words[k]);
        used.set(i, Math.max(from, upto));
      }
    };
    rec.onend = () => { if (this.on && this.rec === rec) { try { rec.start(); } catch {} } };
    rec.onerror = e => { if (e.error === 'not-allowed') { this.app.toast('اسمح بالميكروفون ثم ابدأ مرة أخرى', 3000); this.stop(false); } };
    try { rec.start(); } catch {}
  }
  said(word) {
    if (!this.on || !plain(word)) return;
    const exp = this.seq[this.cur]; if (!exp) return;
    if (sim(word, exp.w.t) >= OK) return this.advance(1);
    // a word skipped: the said word is the next one → the skipped word is a mistake
    let n = this.cur + 1; while (this.seq[n]?.w.end) n++;
    if (this.seq[n] && sim(word, this.seq[n].w.t) >= OK) { this.mistake(this.cur); this.cur = n; return this.advance(1); }
    // a short word heard as part of the next («وَٱلْ…»): ignore tiny fragments
    if (plain(word).length <= 2) return;
    this.mistake(this.cur); this.advance(1);
  }
  mistake(i) {
    this.errs.add(i); this.errCount++; const x = this.seq[i]; this.pageErr[x.n] = (this.pageErr[x.n] || 0) + 1;
    blip('error', settings.sounds); this.app.toast('✗ ' + (x?.w.t || ''), 1500);
  }
  advance(k) {
    const before = this.seq[this.cur];
    this.cur += k; this.skipMarks();
    const now = this.seq[this.cur];
    if (before && (!now || now.n !== before.n)) this.pageDone(before.n);
    if (!now) return this.turn();
    this.draw();
  }
  pageDone(n) {
    const pages = { ...(settings.hifzPages || {}) }, e = this.pageErr[n] || 0;
    pages[n] = { at: Date.now(), errors: e, ok: e <= 1 };
    saveSettings({ hifzPages: pages });
    this.app.toast(e <= 1 ? '✓ صفحة ' + n + ' محفوظة' + (e ? ' (خطأ واحد)' : '') : 'صفحة ' + n + ': ' + e + ' أخطاء — أعدها', 2500);
  }
  // the spread is done: turn the page and go on
  async turn() {
    this.draw();
    await this.r.next?.();
    for (let t = 0; t < 30; t++) { await new Promise(res => setTimeout(res, 200)); if (this.r.layouts.get(this.r.pageAt('R')) && this.r.layouts.get(this.r.pageAt('L'))) break; }
    this.errs.clear(); this.seq = this.sequence(); this.cur = 0; this.skipMarks(); this.draw();
  }
}
export function hifzStats() {
  const p = settings.hifzPages || {}, ok = Object.entries(p).filter(([, v]) => v.ok).map(([k]) => +k).sort((a, b) => a - b);
  return { count: ok.length, pages: ok, last: Object.entries(p).sort((a, b) => b[1].at - a[1].at)[0] };
}
