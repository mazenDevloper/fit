// Your own books in the reader: PDF (pdf.js), EPUB (unzipped here), plain text / Markdown / HTML, web articles (the
// worker keeps only the article's text), and photographed paper pages (optionally read with OCR). Every book has the
// same face as the mushaf: pages drawn on a canvas + where each line / sentence sits (for the gaze line and read-aloud).
import { getItem, saveArticle } from './db.js';
import { readerFonts, BFONT } from './quran.js';
import { paper } from './reader.js';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
const JSZIP = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const WORKER = 'https://studio.c-p.workers.dev';
export const BOOK_KINDS = { pdf: 'PDF', epub: 'EPUB', txt: 'نص', md: 'نص', html: 'صفحة', web: 'مقال', images: 'صور' };
const isAr = s => /[؀-ۿ]/.test(s);

function script(src) {
  return new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('تعذّر تحميل ' + src.split('/').pop())); document.head.appendChild(s); });
}
let pdfjsP = null;
function pdfjs() {
  if (!pdfjsP) pdfjsP = import(/* @vite-ignore */ PDFJS + 'pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs'; return m; });
  return pdfjsP;
}

export async function openBook(kind, itemId, app) {
  await readerFonts();
  if (kind === 'web' && typeof itemId === 'string' && /^https?:/.test(itemId)) {
    const a = await fetchArticle(itemId);
    return new TextBook('web:' + itemId, a.title || itemId, a.blocks);
  }
  const item = await getItem(itemId);
  if (!item) throw new Error('الكتاب غير موجود في المكتبة');
  const f = item.files[0], fmt = item.format;
  if (fmt === 'pdf') { const b = new PdfBook(item); await b.load(); return b; }
  if (fmt === 'images') return new ImageBook(item);
  if (fmt === 'epub') { const { title, blocks } = await readEpub(f.blob); return new TextBook('doc:' + item.id, title || item.name, blocks); }
  if (fmt === 'web') { const a = JSON.parse(await f.blob.text()); return new TextBook('doc:' + item.id, a.title || item.name, a.blocks); }
  const raw = await f.blob.text();
  const blocks = fmt === 'html' ? htmlBlocks(new DOMParser().parseFromString(raw, 'text/html').body) : textBlocks(raw, fmt === 'md' || /^#{1,4}\s/m.test(raw));
  return new TextBook('doc:' + item.id, item.name, blocks);
}

// «اقرأ في مدار»: the article's text from the worker (headings and paragraphs), saved to the library as a book
export async function fetchArticle(url) {
  const r = await fetch(WORKER + '/read?url=' + encodeURIComponent(url));
  const a = await r.json();
  if (a.error || !a.blocks?.length) throw new Error(a.error || 'لم أجد نصاً للقراءة في هذه الصفحة');
  return a;
}
export async function saveWebArticle(url) { const a = await fetchArticle(url); return saveArticle(a); }

// ---------------------------------------------------------------- text → blocks
function textBlocks(raw, md) {
  const out = [];
  for (const para of raw.replace(/\r/g, '').split(/\n\s*\n/)) {
    const t = para.trim(); if (!t) continue;
    const h = md && /^(#{1,4})\s+(.*)$/s.exec(t);
    if (h) out.push({ tag: 'h' + Math.min(3, h[1].length), text: h[2].replace(/\s+/g, ' ') });
    else out.push({ tag: 'p', text: t.replace(/\s*\n\s*/g, ' ').replace(/[*_`]{1,3}/g, md ? '' : '$&') });
  }
  return out;
}
function htmlBlocks(root) {
  const out = [];
  const walk = el => {
    for (const n of el.children) {
      const tag = n.tagName.toLowerCase();
      if (['script', 'style', 'nav', 'footer', 'aside', 'svg', 'noscript', 'form'].includes(tag)) continue;
      if (/^h[1-6]$/.test(tag)) out.push({ tag: 'h' + Math.min(3, +tag[1]), text: n.textContent.replace(/\s+/g, ' ').trim() });
      else if (['p', 'li', 'blockquote', 'pre', 'dd', 'figcaption'].includes(tag)) out.push({ tag: tag === 'li' ? 'li' : 'p', text: n.textContent.replace(/\s+/g, ' ').trim() });
      else if (n.children.length) walk(n);
      else if (n.textContent.trim().length > 30) out.push({ tag: 'p', text: n.textContent.replace(/\s+/g, ' ').trim() });
    }
  };
  if (root) walk(root);
  return out.filter(b => b.text);
}
async function readEpub(blob) {
  if (!window.JSZip) await script(JSZIP);
  const zip = await window.JSZip.loadAsync(await blob.arrayBuffer());
  const container = await zip.file('META-INF/container.xml')?.async('text');
  const opfPath = /full-path="([^"]+)"/.exec(container || '')?.[1];
  if (!opfPath) throw new Error('ملف EPUB غير صالح');
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opf = new DOMParser().parseFromString(await zip.file(opfPath).async('text'), 'application/xml');
  const title = opf.getElementsByTagName('dc:title')[0]?.textContent || '';
  const man = {};
  for (const it of opf.getElementsByTagName('item')) man[it.getAttribute('id')] = it.getAttribute('href');
  const blocks = [];
  for (const ref of opf.getElementsByTagName('itemref')) {
    const href = man[ref.getAttribute('idref')]; if (!href) continue;
    const file = zip.file(decodeURIComponent(base + href)) || zip.file(base + href);
    if (!file) continue;
    const doc = new DOMParser().parseFromString(await file.async('text'), 'text/html');
    const b = htmlBlocks(doc.body);
    if (b.length && blocks.length) blocks.push({ tag: 'break' });
    blocks.push(...b);
    if (blocks.length > 40000) break;
  }
  return { title, blocks };
}

// ---------------------------------------------------------------- a text book: pages laid out once, drawn on demand
const STY = { h1: [50, 700, 1.5, 1.2], h2: [44, 700, 1.45, 1.0], h3: [39, 700, 1.4, 0.9], p: [34, 400, 1.78, 0.55], li: [34, 400, 1.7, 0.35] };
class TextBook {
  constructor(id, title, blocks) {
    this.id = id; this.title = title || 'كتاب';
    this.blocks = blocks.length ? blocks : [{ tag: 'p', text: 'لا يوجد نص' }];
    const ar = this.blocks.slice(0, 60).map(b => b.text || '').join(' ');
    this.rtl = isAr(ar) || !/[a-z]/i.test(ar);
    this.count = 1; this.pages = [];
  }
  async open() {
    const cv = document.createElement('canvas'); cv.width = 10; cv.height = 10;
    const ctx = cv.getContext('2d');
    const W = 900, H = 1350, x0 = 84, x1 = W - 84, top = 120, bottom = H - 104;
    let page = [], y = top, sent = 0, n = 0;
    const pages = [];
    const newPage = () => { pages.push({ lines: page, sents: sent }); page = []; y = top; };
    for (const b of this.blocks) {
      if (b.tag === 'break') { if (page.length) newPage(); continue; }
      const [fs, wt, lh, after] = STY[b.tag] || STY.p;
      const rtl = isAr(b.text) || !/[a-z]/i.test(b.text);
      ctx.font = `${wt} ${fs}px ${BFONT}`; ctx.direction = rtl ? 'rtl' : 'ltr';
      const words = (b.tag === 'li' ? '• ' + b.text : b.text).split(/\s+/).filter(Boolean);
      const space = ctx.measureText(' ').width;
      let line = [], w = 0;
      // sentences: a new one after . ! ? ؟ … ؛ (and at every heading)
      let sid = sent++;
      const flush = (last) => {
        if (!line.length) return;
        if (y + fs * lh > bottom) newPage();
        page.push({ y, fs, wt, lh, rtl, words: line, last, x0, x1 });
        y += fs * lh; line = []; w = 0;
      };
      for (const t of words) {
        const ww = ctx.measureText(t).width;
        if (line.length && w + ww > x1 - x0) flush(false);
        line.push({ t, w: ww, s: sid });
        w += ww + space;
        if (/[.!?؟…؛:]["»”)]?$/.test(t)) sid = sent++;
      }
      flush(true);
      y += fs * after;
      if (++n % 400 === 0) await new Promise(r => setTimeout(r, 0));
    }
    if (page.length) newPage();
    this.pages = pages; this.count = Math.max(1, pages.length);
  }
  async draw(ctx, n, side, th, W, H) {
    paper(ctx, side, th, W, H);
    ctx.save();
    ctx.font = `600 24px ${BFONT}`; ctx.fillStyle = th.dim; ctx.textBaseline = 'middle';
    ctx.direction = this.rtl ? 'rtl' : 'ltr'; ctx.textAlign = 'center';
    ctx.fillText(this.title.length > 60 ? this.title.slice(0, 58) + '…' : this.title, W / 2, 70);
    ctx.fillText(String(n), W / 2, H - 54);
    ctx.globalAlpha = 0.35; ctx.strokeStyle = th.gold; ctx.beginPath(); ctx.moveTo(84, 96); ctx.lineTo(W - 84, 96); ctx.stroke();
    ctx.restore();
    const pg = this.pages[n - 1]; if (!pg) return null;
    const layout = { lines: [], sentences: [] };
    const sents = new Map();
    for (const l of pg.lines) {
      ctx.font = `${l.wt} ${l.fs}px ${BFONT}`; ctx.direction = l.rtl ? 'rtl' : 'ltr'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = th.ink;
      const sum = l.words.reduce((a, w) => a + w.w, 0), space = ctx.measureText(' ').width;
      const gap = !l.last && l.words.length > 1 ? (l.x1 - l.x0 - sum) / (l.words.length - 1) : space;
      const base = l.y + l.fs * l.lh * 0.7;
      const rec = { y0: l.y, y1: l.y + l.fs * l.lh, words: [] };
      let x = l.rtl ? l.x1 : l.x0;
      for (const w of l.words) {
        ctx.textAlign = l.rtl ? 'right' : 'left';
        ctx.fillText(w.t, x, base);
        const a = l.rtl ? x - w.w : x, b = l.rtl ? x : x + w.w;
        rec.words.push({ x0: a, x1: b, s: w.s });
        if (!sents.has(w.s)) sents.set(w.s, []);
        sents.get(w.s).push(w.t);
        x += (l.rtl ? -1 : 1) * (w.w + gap);
      }
      layout.lines.push(rec);
    }
    for (const [i, ws] of sents) layout.sentences.push({ i, text: ws.join(' ') });
    return layout;
  }
  async pageOf() { return 1; }
}

// ---------------------------------------------------------------- PDF
class PdfBook {
  constructor(item) { this.item = item; this.id = 'doc:' + item.id; this.title = item.name; this.rtl = false; this.count = 1; }
  async load() {
    const m = await pdfjs();
    this.pdf = await m.getDocument({ data: new Uint8Array(await this.item.files[0].blob.arrayBuffer()) }).promise;
    this.count = this.pdf.numPages;
    // an Arabic book turns the other way
    try { const p = await this.pdf.getPage(Math.min(2, this.count)); const tc = await p.getTextContent(); const s = tc.items.map(i => i.str).join(' '); this.rtl = isAr(s) && (s.match(/[؀-ۿ]/g) || []).length > s.length * 0.2; } catch {}
  }
  async draw(ctx, n, side, th, W, H) {
    paper(ctx, side, th, W, H);
    const page = await this.pdf.getPage(n);
    const vp0 = page.getViewport({ scale: 1 });
    const k = Math.min((W - 60) / vp0.width, (H - 70) / vp0.height);
    const vp = page.getViewport({ scale: k * 1.5 });   // a little sharper, then scaled into the page
    const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp, background: 'rgba(0,0,0,0)' }).promise;
    const dw = vp0.width * k, dh = vp0.height * k, ox = (W - dw) / 2, oy = (H - dh) / 2;
    ctx.save();
    if (settingsNight(th)) { ctx.filter = 'invert(1) hue-rotate(180deg) brightness(0.92)'; }
    ctx.drawImage(c, ox, oy, dw, dh);
    ctx.restore();
    c.width = c.height = 1;
    // lines of text (for the gaze line and read-aloud)
    const layout = { lines: [], sentences: [] };
    try {
      const tc = await page.getTextContent();
      const vpk = page.getViewport({ scale: k });
      const rows = [];
      for (const it of tc.items) {
        if (!it.str.trim()) continue;
        const [x, y] = vpk.convertToViewportPoint(it.transform[4], it.transform[5]);
        const h = Math.hypot(it.transform[2], it.transform[3]) * k, w = it.width * k;
        let r = rows.find(q => Math.abs(q.y - y) < h * 0.5);
        if (!r) { r = { y, h, items: [] }; rows.push(r); }
        r.items.push({ x0: ox + x, x1: ox + x + w, t: it.str });
      }
      rows.sort((a, b) => a.y - b.y);
      let sid = 0, cur = [];
      for (const r of rows) {
        r.items.sort((a, b) => (this.rtl ? b.x0 - a.x0 : a.x0 - b.x0));
        const txt = r.items.map(i => i.t).join(' ').trim();
        const rec = { y0: oy + r.y - r.h * 1.05, y1: oy + r.y + r.h * 0.35, words: r.items.map(i => ({ x0: i.x0, x1: i.x1, s: sid })) };
        layout.lines.push(rec);
        cur.push(txt);
        if (/[.!?؟…:]["»”)]?$/.test(txt) || cur.join(' ').length > 260) { layout.sentences.push({ i: sid, text: cur.join(' ') }); cur = []; sid++; }
      }
      if (cur.length) layout.sentences.push({ i: sid, text: cur.join(' ') });
    } catch {}
    return layout;
  }
  async pageOf() { return 1; }
}
const settingsNight = th => th.paper[0] !== '#fdf8ea';

// ---------------------------------------------------------------- photographed pages
class ImageBook {
  constructor(item) { this.item = item; this.id = 'doc:' + item.id; this.title = item.name; this.count = item.files.length; this.rtl = true; this.ocr = new Map(); }
  async draw(ctx, n, side, th, W, H) {
    paper(ctx, side, th, W, H);
    const f = this.item.files[n - 1]; if (!f) return null;
    const url = URL.createObjectURL(f.blob);
    try {
      const img = new Image(); img.decoding = 'async';
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
      const k = Math.min((W - 50) / img.naturalWidth, (H - 60) / img.naturalHeight), dw = img.naturalWidth * k, dh = img.naturalHeight * k, ox = (W - dw) / 2, oy = (H - dh) / 2;
      ctx.drawImage(img, ox, oy, dw, dh);
      const o = this.ocr.get(n);
      if (o) return { lines: o.lines.map(l => ({ y0: oy + l.y0 * k, y1: oy + l.y1 * k, words: [{ x0: ox + l.x0 * k, x1: ox + l.x1 * k, s: l.s }] })), sentences: o.sentences };
      return { lines: [], sentences: [], img: { ox, oy, k } };
    } finally { URL.revokeObjectURL(url); }
  }
  // read the photographed text (Tesseract, Arabic + English): lines and sentences for the gaze line and read-aloud
  async recognize(n, onProgress) {
    if (!window.Tesseract) await script(TESS);
    const f = this.item.files[n - 1];
    const w = await window.Tesseract.createWorker(['ara', 'eng'], 1, { logger: m => m.progress && onProgress?.(m.progress) });
    try {
      const { data } = await w.recognize(f.blob);
      let sid = 0; const lines = [], sentences = [], cur = [];
      for (const l of data.lines || []) {
        const t = l.text.trim(); if (!t) continue;
        lines.push({ x0: l.bbox.x0, x1: l.bbox.x1, y0: l.bbox.y0, y1: l.bbox.y1, s: sid });
        cur.push(t);
        if (/[.!?؟…:]$/.test(t) || cur.join(' ').length > 220) { sentences.push({ i: sid, text: cur.join(' ') }); cur = []; sid++; }
      }
      if (cur.length) sentences.push({ i: sid, text: cur.join(' ') });
      this.ocr.set(n, { lines, sentences });
      this.rtl = isAr(sentences.map(s => s.text).join(' ')) || this.rtl;
    } finally { await w.terminate(); }
  }
  async pageOf() { return 1; }
}
