// Madar v98: the rest of visionOS (look to scroll, the assistant orb you look at to talk, hand-palm Home and
// Control Center, live captions with translation, spatial audio, travel mode, article summaries, Multiview with
// audio that follows your eyes, visual intelligence, drawing in the air, sharing your space, progressive
// immersion) + widgets you place in the room (weather, timer, sticky note, photo frame, now playing, verse of the
// day, scenes, assistant history, usage) + the thermal guard (ten measures that keep the iPhone cool).
import * as THREE from 'three';
import { CanvasPanel, IconButton, makeBar, glass, text, icon, roundRect, COLORS, blip } from './ui.js';
import { settings, saveSettings, loadLayout, pairedDevices } from './config.js';
import { registerKind, spatialize } from './windows.js';
import { listItems, getItem, importFiles } from './db.js';
import { ENVS, envKey, isImmersive } from './envs.js';
import { HUB, fmtTime } from './hub.js';

const W8 = 'https://studio.c-p.workers.dev';
const p2 = n => String(n).padStart(2, '0');
const post = (path, body) => fetch(W8 + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
const speak = t => { try { if (settings.sounds === false && settings.voiceAnswers === false) return; const u = new SpeechSynthesisUtterance(t); u.lang = 'ar-SA'; u.rate = 1.05; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {} };
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
function wrapLines(ctx, str, maxW, font) {
  ctx.font = font.replace(/(\d+(\.\d+)?)px/, (m, n) => (n * 1.12) + 'px'); const out = [];   // text() draws 12 % larger
  for (const para of String(str).split('\n')) { let cur = ''; for (const w of para.split(/\s+/)) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; } out.push(cur); }
  return out;
}
const btn = (ctx, p, x, y, w, h, label, act, id, on = false) => {
  const hv = p.isHover(id);
  roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = on ? 'rgba(124,196,255,0.85)' : hv ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.12)'; ctx.fill();
  text(ctx, label, x + w / 2, y + h / 2 + 1, h * 0.42, { weight: 800, color: on ? '#06222b' : COLORS.text, maxWidth: w - 12, fit: true, dir: 'auto' });
  p.region(x, y, w, h, () => { blip('tap', settings.sounds); act(); }, id);
};

// ======================================================================== widgets in the room
const SIZES = { xs: [0.2, 0.12], s: [0.3, 0.3], m: [0.48, 0.3], l: [0.62, 0.44] };
const DEFAULT_SIZE = { dcmedia: 'l', dcdash: 'm', remote: 's', weather: 's', timer: 's', note: 's', photos: 'm', nowplaying: 'm', verse: 'm', scenes: 'm', aihist: 'l', usage: 's', text: 'l', today: 'm' };
const W_TITLE = { dcmedia: 'مكتبتي', today: 'يومك', dcdash: 'لوحة DriveCast', remote: 'ريموت', weather: 'الطقس', timer: 'المؤقت', note: 'ملاحظة', photos: 'إطار الصور', nowplaying: 'يُعرض الآن', verse: 'آية اليوم', scenes: 'المشاهد', aihist: 'سجل المساعد', usage: 'استخدامك', text: '' };
const WX = { 0: ['☀️', 'صافٍ'], 1: ['🌤', 'صافٍ غالباً'], 2: ['⛅', 'غائم جزئياً'], 3: ['☁️', 'غائم'], 45: ['🌫', 'ضباب'], 48: ['🌫', 'ضباب'], 51: ['🌦', 'رذاذ'], 53: ['🌦', 'رذاذ'], 55: ['🌦', 'رذاذ'], 61: ['🌧', 'مطر خفيف'], 63: ['🌧', 'مطر'], 65: ['🌧', 'مطر غزير'], 80: ['🌦', 'زخات'], 81: ['🌧', 'زخات'], 82: ['⛈', 'زخات قوية'], 95: ['⛈', 'عاصفة رعدية'], 96: ['⛈', 'عاصفة'], 99: ['⛈', 'عاصفة'] };
let weather = null, weatherAt = 0, verse = null;

let wid = 0;
export class Widget {
  constructor(mgr, { type = 'note', size = null, data = {} } = {}) {
    this.mgr = mgr; this.app = mgr.app; this.kind = 'widget'; this.id = 'w' + (++wid); this.type = type; this.size = size || DEFAULT_SIZE[type] || 's'; this.data = { ...data };
    this.group = new THREE.Group(); this.group.userData.window = this;
    this.build();
    this.start();
  }
  build() {
    if (this.panel) { this.group.remove(this.panel.mesh); this.panel.dispose(); this.btns?.forEach(b => { this.group.remove(b.mesh); b.dispose(); }); this.bar && this.group.remove(this.bar); }
    const [w, h] = SIZES[this.size];
    this.panel = new CanvasPanel(w, h, (ctx, W, H, p) => this.draw(ctx, W, H, p), { pxPerM: 1500 });
    this.group.add(this.panel.mesh);
    const { mesh: bar, hit } = makeBar(Math.min(0.16, w * 0.5), 0.018); this.bar = bar;
    hit.userData.interact = { type: 'drag', window: this, hover: on => { bar.userData.drawHover(on); return true; } };
    bar.position.set(0, -h / 2 - 0.03, 0.002); this.group.add(bar);
    const mk = (ic, x, fn) => { const b = new IconButton(ic, 0.036, fn); b.mesh.position.set(x, -h / 2 - 0.03, 0.004); this.group.add(b.mesh); return b; };
    this.btns = [mk('close', -Math.min(0.16, w * 0.5) / 2 - 0.035, () => this.mgr.close(this)),
      mk('stack', Math.min(0.16, w * 0.5) / 2 + 0.035, () => this.cycleSize())];
    this.mgr.refreshTargets?.();
  }
  // visionOS widgets come in sizes - including extra small
  cycleSize() { const o = ['xs', 's', 'm', 'l']; this.size = o[(o.indexOf(this.size) + 1) % o.length]; this.build(); this.mgr.changed(); }
  redraw() { this.panel?.redraw(); }
  start() {
    const t = this.type;
    if (t === 'weather') this.loadWeather();
    if (t === 'verse') this.loadVerse();
    if (t === 'photos') this.loadPhotos();
    if (t === 'dcmedia') this.loadLibrary();
    if (t === 'dcdash') this.loadDash();
    if (t === 'today') { this.loadToday(); this.todayT = setInterval(() => this.loadToday(), 60000); }
    if (t === 'dcmedia' || t === 'dcdash' || t === 'remote') this.unhub = this.app.hub?.on(() => this.redraw());
  }
  async loadLibrary() {
    try { this.lib = await (await fetch(HUB + '/library')).json(); } catch { this.lib = { ok: false }; }
    // this device's own files (videos, photos, models, recordings) beside DriveCast's
    try { this.local = (await listItems()).slice(0, 60).map(x => ({ id: x.id, title: x.name, local: x, thumb: null, kind: x.type })); } catch { this.local = []; }
    this.thumbs ||= new Map(); this.redraw();
  }
  async loadToday() { try { this.today = (await (await fetch(HUB + '/today')).json()).items || []; } catch { this.today = this.today || []; } this.redraw(); }
  async loadDash() { try { const [a, b] = await Promise.all([fetch(HUB + '/islands?device=' + encodeURIComponent(this.app.hub?.me.id || '')).then(r => r.json()), fetch(HUB + '/suggest?place=room').then(r => r.json())]); this.dash = { islands: a.islands || [], suggest: b.items || [], today: b.today }; } catch { this.dash = { islands: [], suggest: [] }; } this.redraw(); }
  thumb(url) {
    if (!url) return null; this.thumbs ||= new Map();
    let t = this.thumbs.get(url);
    if (!t) { t = { img: null }; this.thumbs.set(url, t); const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { t.img = im; clearTimeout(this.thT); this.thT = setTimeout(() => this.redraw(), 120); }; im.src = 'https://studio.c-p.workers.dev/img?u=' + encodeURIComponent(url); }
    return t.img;
  }
  frame(ctx, W, H, title) {
    roundRect(ctx, 0, 0, W, H, Math.min(W, H) * 0.12); ctx.fillStyle = this.type === 'note' ? 'rgba(250,204,21,0.92)' : 'rgba(20,24,34,0.78)'; ctx.fill();
    glass(ctx, 0, 0, W, H, Math.min(W, H) * 0.12);
    if (title && this.size !== 'xs') text(ctx, title, W - H * 0.08, H * 0.1, H * 0.065, { align: 'right', weight: 800, color: this.type === 'note' ? '#3b2f05' : COLORS.dim });
  }
  draw(ctx, W, H, p) {
    const t = this.type, xs = this.size === 'xs', f = H / 100;
    this.frame(ctx, W, H, t === 'text' ? this.data.title : t === 'dcmedia' ? '' : W_TITLE[t]);
    if (t === 'weather') {
      const w = weather;
      if (!w) { text(ctx, '…', W / 2, H / 2, f * 20); return; }
      const [e, l] = WX[w.code] || ['🌡', ''];
      if (xs) { text(ctx, e + ' ' + Math.round(w.t) + '°', W / 2, H / 2, f * 40, { weight: 800, dir: 'ltr' }); return; }
      text(ctx, e, W * 0.26, H * 0.42, f * 26);
      text(ctx, Math.round(w.t) + '°', W * 0.66, H * 0.42, f * 25, { weight: 800, dir: 'ltr' });
      text(ctx, l + ' · ' + (w.city || ''), W / 2, H * 0.68, f * 9, { weight: 700, maxWidth: W - 20, fit: true });
      text(ctx, '↑' + Math.round(w.hi) + '°  ↓' + Math.round(w.lo) + '°  💧' + w.hum + '%', W / 2, H * 0.84, f * 8.5, { color: COLORS.dim, dir: 'ltr' });
      if (this.size === 'm' || this.size === 'l') (w.next || []).slice(0, 4).forEach((h, i) => text(ctx, h.h + ' ' + (WX[h.c]?.[0] || '') + Math.round(h.t) + '°', W * (0.12 + i * 0.25), H * 0.2, f * 7, { dir: 'ltr', color: COLORS.dim }));
    } else if (t === 'timer') {
      const d = this.data, now = Date.now();
      const left = d.mode === 'watch' ? (d.running ? now - d.startAt : 0) + (d.acc || 0) : d.running ? Math.max(0, d.endAt - now) : (d.left ?? (d.total || 300000));
      const s = Math.floor(left / 1000), str = (s >= 3600 ? Math.floor(s / 3600) + ':' : '') + p2(Math.floor(s / 60) % 60) + ':' + p2(s % 60);
      text(ctx, str, W / 2, xs ? H / 2 : H * 0.36, f * (xs ? 44 : 26), { weight: 800, dir: 'ltr', color: d.running ? '#7cc4ff' : COLORS.text });
      if (xs) { p.region(0, 0, W, H, () => this.timerToggle(), 'tg'); return; }
      const bw = (W - 40) / 4, by = H * 0.6, bh = H * 0.15;
      if (d.mode !== 'watch') [1, 5, 10, 25].forEach((m, i) => btn(ctx, p, 12 + i * (bw + 5), by, bw, bh, m + 'د', () => this.timerSet(m), 'm' + m));
      btn(ctx, p, 12, H * 0.8, (W - 34) / 3, bh, d.running ? 'إيقاف' : 'ابدأ', () => this.timerToggle(), 'go', d.running);
      btn(ctx, p, 17 + (W - 34) / 3, H * 0.8, (W - 34) / 3, bh, '↺', () => { Object.assign(d, { running: false, left: d.total || 300000, acc: 0 }); this.mgr.changed(); this.redraw(); }, 'rs');
      btn(ctx, p, 22 + (W - 34) * 2 / 3, H * 0.8, (W - 34) / 3, bh, d.mode === 'watch' ? 'مؤقت' : 'ساعة إيقاف', () => { d.mode = d.mode === 'watch' ? 'timer' : 'watch'; d.running = false; d.acc = 0; this.redraw(); }, 'md');
    } else if (t === 'dcmedia') {
      // one shelf for everything: continue (any device), saved, playlists, this device's files, «later» inbox
      const tabs = [['cont', 'تابع'], ['saved', 'المحفوظة'], ['pl', 'القوائم'], ['local', 'هنا'], ['inbox', 'لاحقاً']], tab = this.data.tab || 'cont';
      text(ctx, 'مكتبتي', W - 22, H * 0.085, f * 5, { align: 'right', weight: 800, color: COLORS.dim });
      tabs.forEach(([k, l], i) => btn(ctx, p, 16 + i * (W * 0.135 + 6), H * 0.04, W * 0.135, H * 0.09, l, () => { this.data.tab = k; this.data.pl = null; this.page = 0; this.redraw(); }, 't' + k, tab === k));
      if (!this.lib) { text(ctx, '…', W / 2, H / 2, f * 10); return; }
      const hubRes = Object.values(this.app.hub?.state.resume || {}).sort((a, b) => b.at - a.at).map(r => ({ ...r, from: r.from }));
      let list = tab === 'cont' ? [...hubRes, ...(this.lib.continue || []).filter(c => !hubRes.some(r => r.id === c.id)).map(c => ({ ...c, kind: 'yt' }))]
        : tab === 'local' ? (this.local || [])
        : tab === 'inbox' ? (this.app.hub?.state.inbox || []).map(x => ({ ...x, title: x.title || x.url || x.text }))
        : tab === 'saved' ? (this.lib.saved || []).map(v => ({ ...v, kind: 'yt' }))
        : this.data.pl ? ((this.lib.playlists || []).find(x => x.id === this.data.pl)?.videos || []).map(v => ({ ...v, kind: 'yt' }))
        : (this.lib.playlists || []).map(x => ({ id: x.id, title: x.name + ' (' + x.videos.length + ')', thumb: x.videos[0]?.thumb, isPl: true }));
      if (!list.length) { text(ctx, this.lib.ok === false ? 'تعذّر الوصول إلى DriveCast' : 'لا شيء هنا بعد', W / 2, H / 2, f * 6, { color: COLORS.dim }); return; }
      const cols = 3, rows = 2, per = cols * rows, pages = Math.ceil(list.length / per); this.page = Math.min(this.page || 0, pages - 1);
      const cw = (W - 40) / cols, ch = (H * 0.78) / rows;
      list.slice(this.page * per, this.page * per + per).forEach((it, i) => {
        const c = i % cols, r = Math.floor(i / cols), x = W - 20 - (c + 1) * cw, y = H * 0.16 + r * ch, id = 'v' + i, hv = p.isHover(id);
        roundRect(ctx, x + 6, y + 6, cw - 12, ch - 12, 18); ctx.fillStyle = hv ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)'; ctx.fill();
        const im = this.thumb(it.thumb), tw = cw - 24, th = Math.min(ch * 0.58, tw * 9 / 16);
        if (im) { ctx.save(); roundRect(ctx, x + 12, y + 12, tw, th, 12); ctx.clip(); const k = Math.max(tw / im.width, th / im.height); ctx.drawImage(im, x + 12 + (tw - im.width * k) / 2, y + 12 + (th - im.height * k) / 2, im.width * k, im.height * k); ctx.restore(); }
        else { roundRect(ctx, x + 12, y + 12, tw, th, 12); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill(); text(ctx, it.isPl ? '📂' : '▶', x + cw / 2, y + 12 + th / 2, th * 0.3); }
        if (it.t > 30 && it.dur) { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x + 12, y + 8 + th, tw, 5); ctx.fillStyle = '#e11d48'; ctx.fillRect(x + 12, y + 8 + th, tw * Math.min(1, it.t / it.dur), 5); }
        text(ctx, it.title || it.id, x + cw - 16, y + 30 + th, f * 3.6, { align: 'right', weight: 700, maxWidth: tw, dir: 'auto' });
        const sub = it.from?.name ? 'من ' + it.from.name + (it.t ? ' · ' + fmtTime(it.t) : '') : it.channel || (it.t ? 'من ' + fmtTime(it.t) : '');
        if (sub) text(ctx, sub, x + cw - 16, y + 30 + th + f * 4.6, f * 3, { align: 'right', color: COLORS.dim, maxWidth: tw, dir: 'auto' });
        p.region(x + 6, y + 6, cw - 12, ch - 12, () => { blip('tap', settings.sounds); if (it.isPl) { this.data.pl = it.id; this.page = 0; this.redraw(); } else if (it.local) { this.app.windows.open({ kind: it.local.type, itemId: it.local.id, name: it.local.name }); } else this.app.hub?.open(it); }, id);
        if (!it.isPl && this.app.hub?.others().length) { const bx = x + 14, by = y + ch - 12 - H * 0.075; btn(ctx, p, bx, by, cw * 0.3, H * 0.065, '📺 أرسل', () => this.app.hub.pick(d => { this.app.hub.op({ op: 'send', to: d.id, msg: { type: 'open', item: it, now: true } }); this.app.toast('📤 ' + d.name, 1500); }), 's' + i); }
      });
      if (pages > 1) btn(ctx, p, 16, H * 0.9, W * 0.12, H * 0.08, (this.page + 1) + '/' + pages, () => { this.page = (this.page + 1) % pages; this.redraw(); }, 'pg');
    } else if (t === 'today') {
      // «يومك»: the same list as DriveCast's hub - matches, prayers, reminders, Madar's plan
      const L = (this.today || []).slice(0, xs ? 2 : this.size === 's' ? 4 : 7);
      if (!this.today) { text(ctx, '…', W / 2, H / 2, f * 10); return; }
      if (!L.length) { text(ctx, 'يوم هادئ', W / 2, H * 0.55, f * 8, { color: COLORS.dim }); return; }
      const rh = (H * 0.78) / Math.max(4, L.length), IC = { match: '⚽', azan: '🕌', iqamah: '🕋', reminder: '⏰', plan: '💪', timer: '⏱' };
      L.forEach((x, i) => {
        const y = H * 0.18 + i * rh;
        roundRect(ctx, 12, y + 2, W - 24, rh - 4, (rh - 4) / 2); ctx.fillStyle = x.live ? 'rgba(225,29,72,0.45)' : 'rgba(255,255,255,0.07)'; ctx.fill();
        text(ctx, (IC[x.kind] || '•') + ' ' + x.title, W - 26, y + rh / 2, rh * 0.34, { align: 'right', weight: 800, maxWidth: W * 0.62, dir: 'auto' });
        const tm = x.live ? (x.sub || 'مباشر') : new Date(x.at).toLocaleTimeString('ar-OM', { hour: 'numeric', minute: '2-digit' });
        text(ctx, tm, 26, y + rh / 2, rh * 0.3, { align: 'left', color: x.live ? '#fff' : '#cfd6e6', maxWidth: W * 0.3, dir: 'auto' });
      });
    } else if (t === 'dcdash') {
      const d = this.dash, hub = this.app.hub;
      text(ctx, (hub?.online ? '🟢 ' : '⚪ ') + (hub?.others().map(x => x.name).join(' · ') || 'لا أجهزة متصلة'), W - 20, H * 0.2, f * 4.5, { align: 'right', color: COLORS.dim, maxWidth: W - 40, dir: 'auto' });
      if (!d) { text(ctx, '…', W / 2, H / 2, f * 10); return; }
      const items = [...d.islands, ...d.suggest.slice(0, 2).map(s => ({ id: 's' + s.id, icon: '✨', title: s.title, sub: 'مقترح لك الآن', action: { type: 'open', item: s } }))].slice(0, xs ? 2 : 5);
      const rh = (H * 0.72) / Math.max(4, items.length);
      items.forEach((it, i) => {
        const y = H * 0.27 + i * rh, id = 'i' + i;
        roundRect(ctx, 14, y + 3, W - 28, rh - 6, (rh - 6) / 2); ctx.fillStyle = p.isHover(id) ? 'rgba(255,255,255,0.25)' : it.tint ? it.tint + '55' : 'rgba(255,255,255,0.08)'; ctx.fill();
        const left = it.at ? Math.max(0, Math.round((it.at - Date.now()) / 60000)) : null;
        text(ctx, (it.icon || '•') + ' ' + it.title, W - 30, y + rh / 2, rh * 0.32, { align: 'right', weight: 800, maxWidth: W * 0.62, dir: 'auto' });
        text(ctx, left != null ? (left >= 60 ? Math.floor(left / 60) + ' س ' + (left % 60) + ' د' : left + ' د') : (it.sub || ''), 30, y + rh / 2, rh * 0.28, { align: 'left', color: '#e6ecf8', maxWidth: W * 0.3, dir: 'auto' });
        if (it.action?.item) p.region(14, y, W - 28, rh, () => { blip('tap', settings.sounds); this.app.hub?.open(it.action.item); }, id);
      });
      if (!items.length) text(ctx, 'لا جديد الآن', W / 2, H * 0.6, f * 7, { color: COLORS.dim });
    } else if (t === 'remote') {
      const hub = this.app.hub, tgt = hub?.remoteTarget();
      text(ctx, tgt ? '→ ' + tgt.name : 'لا جهاز DriveCast متصل', W / 2, H * 0.24, f * 7, { weight: 700, color: tgt ? '#7cc4ff' : COLORS.dim, dir: 'auto', maxWidth: W - 20 });
      const keys = [['⏮', 'prev'], ['⏯', 'toggle'], ['⏭', 'next'], ['−10', 'back'], ['🔉', 'vol-'], ['🔊', 'vol+']];
      const bw = (W - 40) / 3, bh = H * 0.24;
      keys.forEach(([l, a], i) => btn(ctx, p, 14 + (i % 3) * (bw + 6), H * 0.36 + Math.floor(i / 3) * (bh + 8), bw, bh, l, () => hub?.remote(a), 'k' + i));
    } else if (t === 'note') {
      const lines = wrapLines(ctx, this.data.text || 'اضغط 🎙 وتكلّم…', W - 40, `700 ${f * 9}px system-ui`);
      lines.slice(0, xs ? 2 : 8).forEach((l, i) => text(ctx, l, W - 20, H * (xs ? 0.35 : 0.24) + i * f * 11.5, f * 8.5, { align: 'right', weight: 700, color: '#2b2203', dir: 'auto' }));
      if (!xs) { btn(ctx, p, W - 20 - W * 0.4, H * 0.82, W * 0.4, H * 0.13, '🎙 إملاء', () => this.app.extras.dictateInto(this), 'mic'); btn(ctx, p, 20, H * 0.82, W * 0.3, H * 0.13, 'مسح', () => { this.data.text = ''; this.mgr.changed(); this.redraw(); }, 'clr'); }
    } else if (t === 'photos') {
      const b = this.bitmap;
      if (!b) { text(ctx, this.noPhotos ? 'لا صور في مكتبتك' : '…', W / 2, H / 2, f * 10, { color: COLORS.dim }); return; }
      const k = Math.max(W / b.width, H / b.height), dw = b.width * k, dh = b.height * k;
      ctx.save(); roundRect(ctx, 0, 0, W, H, Math.min(W, H) * 0.12); ctx.clip(); ctx.drawImage(b, (W - dw) / 2, (H - dh) / 2, dw, dh); ctx.restore();
      p.region(0, 0, W, H, () => this.nextPhoto(), 'nx');
    } else if (t === 'nowplaying') {
      const list = this.app.extras.mediaWindows();
      if (!list.length) { text(ctx, 'لا شيء يُعرض الآن', W / 2, H / 2, f * 10, { color: COLORS.dim }); return; }
      const rh = Math.min(H * 0.26, (H * 0.84) / list.length);
      list.slice(0, 4).forEach((w, i) => {
        const y = H * 0.17 + i * rh, playing = this.app.extras.isPlaying(w), muted = w.isMuted?.();
        text(ctx, (w.kind === 'video' ? '🎞 ' : '🌐 ') + (w.name || w.title || w.url || 'نافذة'), W - 20, y + rh / 2, rh * 0.32, { align: 'right', weight: 700, maxWidth: W * 0.55, dir: 'auto' });
        btn(ctx, p, 14, y + rh * 0.15, W * 0.16, rh * 0.7, playing ? 'إيقاف' : 'تشغيل', () => { this.app.extras.togglePlay(w); setTimeout(() => this.redraw(), 300); }, 'p' + i);
        btn(ctx, p, 20 + W * 0.16, y + rh * 0.15, W * 0.16, rh * 0.7, muted ? '🔇' : '🔊', () => { w.setVolume?.(w.vol ?? 1, !muted); this.redraw(); }, 'm' + i, !muted);
      });
    } else if (t === 'verse') {
      const v = verse;
      if (!v) { text(ctx, '…', W / 2, H / 2, f * 12); return; }
      const lines = wrapLines(ctx, v.text, W - 50, `600 ${f * (xs ? 8 : 10)}px "Amiri", "Geeza Pro", serif`);
      const top = xs ? H * 0.3 : H * 0.28, lh = f * (xs ? 10 : 13);
      lines.slice(0, xs ? 2 : 4).forEach((l, i) => text(ctx, l, W / 2, top + i * lh, f * (xs ? 8 : 10), { weight: 600, color: '#f5e6c4' }));
      if (!xs) {
        text(ctx, 'سورة ' + v.surah + ' · الآية ' + v.n, W * 0.62, H * 0.8, f * 7.5, { color: COLORS.dim });
        btn(ctx, p, 16, H * 0.73, W * 0.22, H * 0.15, this.app.extras.versePlaying ? 'إيقاف' : '▶ استمع', () => this.app.extras.playVerse(v), 'pl');
      }
    } else if (t === 'scenes') {
      const sc = store.get('madar.scenes.v1', {}), names = Object.keys(sc);
      btn(ctx, p, 16, H * 0.06, W * 0.36, H * 0.13, '+ احفظ الحالي', () => { this.app.extras.saveScene(); this.redraw(); }, 'sv');
      if (!names.length) { text(ctx, 'احفظ ترتيب نوافذك الحالي كمشهد', W / 2, H * 0.55, f * 8, { color: COLORS.dim }); return; }
      const cols = 2, cw = (W - 36) / cols, rh = H * 0.17;
      names.slice(0, 8).forEach((n, i) => { const c = i % cols, r = Math.floor(i / cols); btn(ctx, p, W - 14 - (c + 1) * cw + 4, H * 0.24 + r * (rh + 6), cw - 8, rh, n + ' (' + sc[n].windows.length + ')', () => this.app.extras.openScene(n), 'sc' + i); });
    } else if (t === 'aihist') {
      const log = store.get('madar.ai.log', []).slice().reverse(), per = 4, pages = Math.max(1, Math.ceil(log.length / per));
      this.page = Math.min(this.page || 0, pages - 1);
      if (!log.length) { text(ctx, 'لا محادثات بعد — انظر إلى كرة المساعد وتكلّم', W / 2, H / 2, f * 7.5, { color: COLORS.dim, maxWidth: W - 30 }); return; }
      const rh = (H * 0.78) / per;
      log.slice(this.page * per, this.page * per + per).forEach((e, i) => {
        const y = H * 0.15 + i * rh;
        roundRect(ctx, 12, y + 3, W - 24, rh - 6, 14); ctx.fillStyle = p.isHover('a' + i) ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'; ctx.fill();
        text(ctx, '🗣 ' + e.q, W - 26, y + rh * 0.3, rh * 0.2, { align: 'right', weight: 800, maxWidth: W - 60, dir: 'auto' });
        text(ctx, e.a, W - 26, y + rh * 0.66, rh * 0.18, { align: 'right', color: '#cfd8ea', maxWidth: W - 60, dir: 'auto' });
        p.region(12, y, W - 24, rh, () => { blip('tap', settings.sounds); this.app.askAssistant(e.q); }, 'a' + i);
      });
      if (pages > 1) { btn(ctx, p, 14, H * 0.9, W * 0.14, H * 0.08, '◀', () => { this.page = (this.page + 1) % pages; this.redraw(); }, 'pg'); text(ctx, (this.page + 1) + '/' + pages, W * 0.26, H * 0.94, f * 5, { dir: 'ltr', color: COLORS.dim }); }
    } else if (t === 'usage') {
      const u = this.app.extras.usage();
      const rows = [['اليوم', u.today + ' د'], ['هذه الجلسة', u.session + ' د'], ['الأسبوع', u.week + ' د'], ['الحرارة', u.heat]];
      rows.slice(0, xs ? 1 : 4).forEach(([l, v], i) => { const y = H * (xs ? 0.55 : 0.28 + i * 0.18); text(ctx, l, W - 20, y, f * 8, { align: 'right', color: COLORS.dim, weight: 700 }); text(ctx, v, 20, y, f * 9, { align: 'left', weight: 800, dir: 'auto' }); });
    } else if (t === 'text') {
      const lines = (this.data.lines || []).flatMap(l => wrapLines(ctx, '• ' + l, W - 50, `600 ${f * 6.2}px system-ui`));
      const per = Math.floor((H * 0.8) / (f * 8.2)), pages = Math.max(1, Math.ceil(lines.length / per));
      this.page = Math.min(this.page || 0, pages - 1);
      lines.slice(this.page * per, this.page * per + per).forEach((l, i) => text(ctx, l, W - 25, H * 0.2 + i * f * 8.2, f * 6.2, { align: 'right', weight: 600, dir: 'auto', color: '#e6ecf8' }));
      if (pages > 1) btn(ctx, p, 14, H * 0.88, W * 0.18, H * 0.09, (this.page + 1) + '/' + pages + ' ◀', () => { this.page = (this.page + 1) % pages; this.redraw(); }, 'pg');
    }
  }
  // ---- timer
  timerSet(m) { const d = this.data; d.mode = 'timer'; d.total = m * 60000; d.left = d.total; d.running = true; d.endAt = Date.now() + d.total; d.done = false; this.mgr.changed(); this.redraw(); this.app.extras.syncIslands(); }
  timerToggle() {
    const d = this.data, now = Date.now();
    if (d.mode === 'watch') { if (d.running) { d.acc = (d.acc || 0) + now - d.startAt; d.running = false; } else { d.startAt = now; d.running = true; } }
    else if (d.running) { d.left = Math.max(0, d.endAt - now); d.running = false; }
    else { d.endAt = now + (d.left ?? d.total ?? 300000); d.running = true; d.done = false; }
    this.mgr.changed(); this.redraw();
  }
  // ---- weather (Open-Meteo, no key; your location if you allow it, Salalah otherwise)
  async loadWeather(force) {
    if (!force && weather && Date.now() - weatherAt < 30 * 60e3) { this.redraw(); return; }
    let lat = 17.0194, lon = 54.0897, city = 'صلالة';
    const g = settings.geo; if (g) { lat = g[0]; lon = g[1]; city = g[2] || ''; }
    else try { const pos = await new Promise((ok, bad) => navigator.geolocation.getCurrentPosition(ok, bad, { timeout: 6000, maximumAge: 36e5 })); lat = pos.coords.latitude; lon = pos.coords.longitude; city = ''; saveSettings({ geo: [lat, lon, ''] }); } catch {}
    try {
      const r = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,relative_humidity_2m&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2`)).json();
      const now = new Date(), hi = r.hourly.time.findIndex(t => new Date(t) > now);
      weather = { t: r.current.temperature_2m, code: r.current.weather_code, hum: r.current.relative_humidity_2m, hi: r.daily.temperature_2m_max[0], lo: r.daily.temperature_2m_min[0], city,
        next: [3, 6, 9, 12].map(k => ({ h: r.hourly.time[hi + k]?.slice(11, 13) + ':00', t: r.hourly.temperature_2m[hi + k], c: r.hourly.weather_code[hi + k] })) };
      weatherAt = Date.now();
    } catch {}
    this.redraw();
  }
  // ---- verse of the day (alquran.cloud: text + Mishary Alafasy's recitation)
  async loadVerse(next) {
    const day = Math.floor(Date.now() / 864e5) + (this.data.shift || 0);
    if (!next && verse && verse.day === day) { this.redraw(); return; }
    const n = (day * 7919) % 6236 + 1;
    try {
      const d = (await (await fetch('https://api.alquran.cloud/v1/ayah/' + n + '/ar.alafasy')).json()).data;
      verse = { day, n: d.numberInSurah, surah: d.surah.name.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '').replace(/^سورة\s*/, ''), text: d.text, audio: d.audio };
    } catch {}
    this.redraw();
  }
  // ---- photo frame: your library's photos, one every 10 s (tap for the next)
  async loadPhotos() { try { this.photos = (await listItems()).filter(i => i.type === 'image').map(i => i.id); } catch { this.photos = []; } this.noPhotos = !this.photos.length; this.pi = -1; this.nextPhoto(); }
  async nextPhoto() {
    if (!this.photos?.length) { this.redraw(); return; }
    this.pi = (this.pi + 1) % this.photos.length; this.photoAt = performance.now();
    try { const it = await getItem(this.photos[this.pi]); const b = await createImageBitmap(it.files[0].blob, { resizeWidth: 900, resizeQuality: 'medium' }); this.bitmap?.close?.(); this.bitmap = b; } catch {}
    this.redraw();
  }
  update(dt, now) {
    const t = this.type, every = { timer: 250, nowplaying: 1000, usage: 30000, weather: 60000, photos: 10000, dcdash: 30000, dcmedia: 60000, remote: 5000 }[t];
    if (!every || now - (this.drawnAt || 0) < every) return;
    this.drawnAt = now;
    if (t === 'photos') { this.nextPhoto(); return; }
    if (t === 'weather') { this.loadWeather(); return; }
    if (t === 'dcdash') { this.loadDash(); return; }
    if (t === 'timer') { const d = this.data; if (d.mode !== 'watch' && d.running && Date.now() >= d.endAt && !d.done) { d.done = true; d.running = false; d.left = 0; this.app.extras.timerDone(this); } }
    this.redraw();
  }
  scaleBy(f) { this.group.scale.setScalar(THREE.MathUtils.clamp(this.group.scale.x * f, 0.4, 4)); this.mgr.changed(); }
  onDragEnd() {}
  serialize() { const g = this.group; return { kind: 'widget', ref: { type: this.type, size: this.size, data: ['photos', 'nowplaying', 'dcdash', 'remote'].includes(this.type) ? {} : this.type === 'dcmedia' ? { tab: this.data.tab } : this.data }, p: g.position.toArray().map(v => +v.toFixed(3)), q: g.quaternion.toArray().map(v => +v.toFixed(4)), s: +g.scale.x.toFixed(3), ek: this.envPin || undefined }; }
  dispose() { this.panel.dispose(); this.btns.forEach(b => b.dispose()); this.bitmap?.close?.(); this.unhub?.(); clearInterval(this.todayT); }
}

// ======================================================================== the assistant orb (visionOS 27)
const ORB_FRAG = `uniform float uT; uniform float uOn; varying vec3 vN; varying vec3 vV;
void main(){ float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  vec3 a = vec3(0.35,0.55,1.0), b = vec3(0.95,0.35,0.85), c = vec3(0.3,0.95,0.85);
  float s = 0.5 + 0.5 * sin(vN.y * 6.0 + uT * 2.0) * cos(vN.x * 5.0 - uT * 1.6);
  vec3 col = mix(mix(a, b, s), c, 0.5 + 0.5 * sin(uT + vN.z * 4.0));
  gl_FragColor = vec4(col * (0.55 + fr * 1.4) * (1.0 + uOn * 0.6), 0.55 + fr * 0.45); }`;
class Orb {
  constructor(ex) {
    this.ex = ex; this.app = ex.app;
    this.u = { uT: { value: 0 }, uOn: { value: 0 } };
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.055, 32, 24), new THREE.ShaderMaterial({ uniforms: this.u, transparent: true, depthWrite: false,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }', fragmentShader: ORB_FRAG }));
    this.mesh.renderOrder = 5;
    this.mesh.userData.interact = { type: 'button', click: () => { this.talk(); return true; }, hover: () => true };
    this.mesh.visible = false;
  }
  place() {
    const app = this.app, f = app.headForward.clone(); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    const world = f.multiplyScalar(0.95).add(right.multiplyScalar(0.42)).add(new THREE.Vector3(0, -0.18, 0));
    const root = app.windows.root; root.updateMatrixWorld();
    this.mesh.position.copy(root.worldToLocal(world)); saveSettings({ orbPos: this.mesh.position.toArray().map(v => +v.toFixed(3)) });
  }
  show(on) {
    const root = this.app.windows.root;
    if (on && !this.mesh.parent) root.add(this.mesh);
    this.mesh.visible = on;
    if (on) { if (settings.orbPos) this.mesh.position.fromArray(settings.orbPos); else this.place(); }
    this.ex.refresh();
  }
  talk() { if (this.app.voice?.madarMode === 'assist') return; blip('open', settings.sounds); this.app.listen('assist'); }
  update(now) {
    if (!this.mesh.visible) return;
    const listening = this.app.voice?.madarMode === 'assist';
    this.u.uT.value = now / 1000; this.u.uOn.value += ((listening ? 1 : 0) - this.u.uOn.value) * 0.1;
    this.mesh.scale.setScalar(1 + (listening ? 0.12 * Math.sin(now / 160) : 0.03 * Math.sin(now / 700)));
    // look at it (and keep looking) to start talking - no "Hey Siri"
    const g = this.app.interaction.pointers[2], on = g.active && g.hoverObj === this.mesh;
    if (on) { this.lookT = this.lookT || now; if (!this.fired && now - this.lookT > 650) { this.fired = true; this.talk(); } }
    else { this.lookT = 0; this.fired = false; }
  }
}

// ======================================================================== palm Home / flip → Control Center (visionOS 2)
class PalmUI {
  constructor(ex) {
    this.ex = ex; this.app = ex.app; this.st = [{}, {}];
    this.home = new CanvasPanel(0.07, 0.07, (ctx, W, H, p) => {
      ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 3, 0, 7); ctx.fillStyle = p.isHover('h') ? 'rgba(255,255,255,0.75)' : 'rgba(40,44,58,0.8)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 4; ctx.stroke();
      icon(ctx, 'home', W / 2, H / 2, W * 0.5, p.isHover('h') ? '#141824' : '#fff');
      p.region(0, 0, W, H, () => this.act('home'), 'h');
    }, { pxPerM: 1400 });
    this.status = new CanvasPanel(0.26, 0.075, (ctx, W, H, p) => {
      roundRect(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2); ctx.fillStyle = p.isHover('s') ? 'rgba(80,90,120,0.95)' : 'rgba(30,34,46,0.88)'; ctx.fill();
      const d = new Date(), b = this.app.control?.battery;
      text(ctx, `${d.getHours() % 12 || 12}:${p2(d.getMinutes())}` + (b ? '   🔋' + Math.round(b.level * 100) + '%' : '') + '   ⌃', W / 2, H / 2 + 1, H * 0.38, { weight: 800, dir: 'ltr' });
      p.region(0, 0, W, H, () => this.act('cc'), 's');
    }, { pxPerM: 1400 });
    for (const m of [this.home.mesh, this.status.mesh]) { m.material.depthTest = false; m.renderOrder = 985; m.visible = false; this.app.renderer.scene.add(m); }
  }
  act(what) { this.hide(); blip('tap', settings.sounds); if (what === 'home') this.app.toggleLauncher(); else this.app.control.open(); }
  hide() { if (this.home.mesh.visible || this.status.mesh.visible) { this.home.mesh.visible = this.status.mesh.visible = false; this.ex.refresh(); } this.shown = null; }
  update(now) {
    if (settings.palmMenu === false || !settings.handsEnabled) { this.hide(); return; }
    const slots = this.app.hands.slots;
    for (let i = 0; i < 2; i++) {
      const s = slots[i], st = this.st[i], pts = s.pts;
      if (!s.active || !pts || now - (s.ptsTime || 0) > 300) { st.openAt = 0; continue; }
      const d = (a, b) => Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
      const ext = [[8, 6], [12, 10], [16, 14], [20, 18]].filter(([t, pp]) => d(0, t) > d(0, pp) * 1.18).length + (d(4, 17) > d(3, 17) * 1.05 ? 1 : 0);
      const open = ext >= 5 && !s.pinch;
      const side = Math.sign((pts[5][0] - pts[0][0]) * (pts[17][1] - pts[0][1]) - (pts[5][1] - pts[0][1]) * (pts[17][0] - pts[0][0]));
      if (open) {
        if (!st.openAt) { st.openAt = now; st.side0 = side; st.flipped = false; }
        if (side !== st.side0 && now - st.openAt < 2500) st.flipped = true;
        st.lastOpen = now;
        if (now - st.openAt > 450) this.showAt(i, s, st.flipped ? 'status' : 'home');
      } else {
        // pinching with the same hand while its button shows = press it (look at the palm, then tap)
        if (this.shown?.i === i && s.pinch && now - (st.lastOpen || 0) < 1500) { this.act(this.shown.what === 'home' ? 'home' : 'cc'); }
        st.openAt = 0;
        if (this.shown?.i === i && now - (st.lastOpen || 0) > 1500) this.hide();
      }
    }
  }
  showAt(i, s, what) {
    const panel = what === 'home' ? this.home : this.status, other = what === 'home' ? this.status : this.home;
    const Q = this.app.renderQ, depth = Math.max(0.25, s.depth);
    const pos = new THREE.Vector3(s.tx * depth, s.ty * depth + 0.09, -depth).applyQuaternion(Q);
    panel.mesh.position.lerp(pos, panel.mesh.visible ? 0.4 : 1); panel.mesh.quaternion.copy(Q);
    if (!panel.mesh.visible || other.mesh.visible) { other.mesh.visible = false; panel.mesh.visible = true; panel.redraw(); this.ex.refresh(); }
    this.shown = { i, what };
  }
  get targets() { return [this.home.mesh, this.status.mesh].filter(m => m.visible); }
}

// ======================================================================== live captions (+ translation)
class Captions {
  constructor(ex) {
    this.ex = ex; this.app = ex.app; this.on = false; this.lines = []; this.interim = '';
    this.panel = new CanvasPanel(0.95, 0.15, (ctx, W, H) => {
      if (!this.on) return;
      roundRect(ctx, 0, 0, W, H, 26); ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fill();
      const all = [...this.lines.slice(-2), ...(this.interim ? [{ t: this.interim, dim: true }] : [])].slice(-2);
      if (!all.length) text(ctx, '🎧 أستمع… (' + (settings.capLang === 'en-US' ? 'English → عربي' : 'عربي') + ')', W / 2, H / 2, H * 0.24, { color: COLORS.dim });
      all.forEach((l, i) => text(ctx, l.t, W / 2, H * (all.length === 1 ? 0.5 : 0.3 + i * 0.42), H * 0.25, { weight: 700, color: l.dim ? '#c9cfdb' : '#fff', maxWidth: W - 40, fit: true, dir: 'auto' }));
    }, { pxPerM: 1300 });
    this.panel.mesh.userData.interact = null; this.panel.mesh.material.depthTest = false; this.panel.mesh.renderOrder = 990; this.panel.mesh.visible = false;
    this.app.renderer.overlay.add(this.panel.mesh);
  }
  toggle(lang) {
    if (lang) saveSettings({ capLang: lang });
    if (this.on && !lang) { this.stop(); this.app.toast('أُوقفت الترجمة النصية', 1800); return; }
    this.stop(true); this.start();
  }
  start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { this.app.toast('التعرف على الكلام غير متاح هنا', 2500); return; }
    this.app.stopVoice(); this.on = true; this.panel.mesh.visible = true; this.lines = []; this.interim = '';
    const rec = new SR(); rec.lang = settings.capLang || 'ar-SA'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.final(r[0].transcript.trim()); else interim += r[0].transcript;
      }
      this.interim = interim.trim().slice(-90); this.panel.redraw();
    };
    rec.onerror = e => { if (e.error === 'not-allowed') { this.app.toast('المس الشاشة للسماح بالميكروفون', 3000); this.stop(); } };
    rec.onend = () => { if (this.on && this.rec === rec) { try { rec.start(); } catch {} } };
    try { rec.start(); this.rec = rec; } catch { this.stop(); }
    this.panel.redraw();
    this.app.toast('💬 الترجمة النصية: ' + (rec.lang === 'en-US' ? 'الإنجليزية مترجمة للعربية' : 'العربية'), 2500);
  }
  async final(t) {
    if (!t) return;
    const item = { t }; this.lines.push(item); if (this.lines.length > 6) this.lines.shift(); this.interim = ''; this.panel.redraw();
    if ((settings.capLang || 'ar-SA') === 'en-US') {
      try { const r = await post('/translate', { text: t, from: 'english', to: 'arabic' }); if (r.ok) { item.t = r.text; this.panel.redraw(); } } catch {}
    }
  }
  stop(quiet) {
    this.on = false; const r = this.rec; this.rec = null; try { r?.stop(); } catch {}
    this.panel.mesh.visible = false;
    if (!quiet && settings.voice && this.app.active) setTimeout(() => this.app.startVoice(), 500);
  }
  update(Q) { if (!this.on) return; this.panel.mesh.position.set(0, -0.36, -1.15).applyQuaternion(Q); this.panel.mesh.quaternion.copy(Q); }
}

// ======================================================================== drawing in the air (Freeform / Notes with your hand)
const INKS = [0x7cc4ff, 0xff5fd6, 0xfacc15, 0x4ade80, 0xffffff, 0xf87171];
class Sketch {
  constructor(ex) {
    this.ex = ex; this.app = ex.app; this.on = false; this.group = new THREE.Group(); this.strokes = []; this.cur = [null, null];
    this.ink = settings.ink ?? 0;
  }
  attach() { if (!this.group.parent) { this.app.windows.root.add(this.group); this.load(); } }
  toggle(force) { this.on = force ?? !this.on; this.attach(); this.app.toast(this.on ? '✏️ الرسم في الهواء: اقرص وحرّك يدك · «لون» لتغيير اللون · «تراجع» · «امسح الرسم»' : 'انتهى الرسم', this.on ? 4500 : 1500); }
  color() { this.ink = (this.ink + 1) % INKS.length; saveSettings({ ink: this.ink }); this.app.toast('اللون التالي', 1000); }
  update(now) {
    if (!this.on) return;
    const I = this.app.interaction, slots = this.app.hands.slots, root = this.app.windows.root; root.updateMatrixWorld();
    for (let i = 0; i < 2; i++) {
      const p = I.pointers[i], s = slots[i];
      const drawing = p.active && s.pinch && !p.drag && !p.downObj;
      if (drawing) {
        const world = p.dir.clone().multiplyScalar(0.7 + Math.max(-0.2, Math.min(0.4, (s.depth - 0.45) * 1.5)));
        const pt = root.worldToLocal(world.clone());
        let c = this.cur[i];
        if (!c) { c = this.cur[i] = { pts: [], col: INKS[this.ink], line: new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: INKS[this.ink] })) }; this.group.add(c.line); }
        if (!c.pts.length || c.pts[c.pts.length - 1].distanceTo(pt) > 0.006) { c.pts.push(pt); c.line.geometry.setFromPoints(c.pts); }
      } else if (this.cur[i]) { this.finish(this.cur[i]); this.cur[i] = null; }
    }
  }
  tube(pts, col) {
    if (pts.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(pts);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(400, pts.length * 3), 0.0045, 6, false), new THREE.MeshStandardMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.45), roughness: 0.4 }));
    return m;
  }
  finish(c) {
    this.group.remove(c.line); c.line.geometry.dispose();
    const m = this.tube(c.pts, c.col); if (!m) return;
    this.group.add(m); this.strokes.push({ m, pts: c.pts, col: c.col }); this.save();
  }
  undo() { const s = this.strokes.pop(); if (s) { this.group.remove(s.m); s.m.geometry.dispose(); this.save(); } }
  clear() { this.strokes.forEach(s => { this.group.remove(s.m); s.m.geometry.dispose(); }); this.strokes = []; this.save(); this.app.toast('مُسح الرسم', 1500); }
  save() { store.set('madar.sketch.v1', this.strokes.slice(-150).map(s => ({ c: s.col, p: s.pts.flatMap(v => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]) }))); }
  load() {
    for (const s of store.get('madar.sketch.v1', [])) {
      const pts = []; for (let i = 0; i < s.p.length; i += 3) pts.push(new THREE.Vector3(s.p[i], s.p[i + 1], s.p[i + 2]));
      const m = this.tube(pts, s.c); if (m) { this.group.add(m); this.strokes.push({ m, pts, col: s.c }); }
    }
  }
}

// ======================================================================== progressive immersion (the Digital Crown)
const MASK_FRAG = `uniform vec3 uC; uniform float uCos; varying vec3 vW; void main(){ if (dot(normalize(vW), uC) > uCos) discard; gl_FragColor = vec4(0.0); }`;
class Portal {
  constructor(ex) {
    this.ex = ex; this.app = ex.app;
    this.u = { uC: { value: new THREE.Vector3(0, 0, -1) }, uCos: { value: 0 } };
    const m = this.mask = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 16), new THREE.ShaderMaterial({ uniforms: this.u, side: THREE.BackSide, colorWrite: false, depthWrite: true,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * w; }', fragmentShader: MASK_FRAG }));
    m.frustumCulled = false; this.maskScene = new THREE.Scene(); this.maskScene.add(m);
    this.app.renderer.portal = this;
  }
  get level() { return settings.immersion ?? 1; }
  set(level) {
    level = Math.max(0, Math.min(1, level));
    const f = this.app.headForward.clone(); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    this.u.uC.value.copy(f); saveSettings({ immersion: level, portalDir: f.toArray().map(v => +v.toFixed(3)) });
    if (level > 0 && level < 1 && !isImmersive(settings.environment)) saveSettings({ environment: 'night' });
    this.app.toast('الانغماس ' + Math.round(level * 100) + '%', 1400);
  }
  active() { const l = this.level; return l > 0.01 && l < 0.99 && isImmersive(settings.environment); }
  // put the environments on layer 1 (the camera sees layers 0 + 1; the portal pass sees only 1)
  tag(now) {
    if (now - (this.taggedAt || 0) < 1500) return; this.taggedAt = now;
    const R = this.app.renderer;
    [...R.eyes, R.center].forEach(c => c.layers.enable(1));
    this.app.globalLights?.forEach(([l]) => l.layers.enableAll());
    for (const g of Object.values(this.app.envs)) g.traverse(o => { if (o.isLight) { o.layers.enableAll(); if (o.shadow) o.shadow.camera.layers.enableAll(); } else if (o !== g && !o.layers.isEnabled(1)) { o.layers.set(1); } });
    if (settings.portalDir) this.u.uC.value.fromArray(settings.portalDir);
    this.u.uCos.value = Math.cos(this.level * Math.PI);
  }
  // called by the renderer between the passthrough and the scene
  pass(r, cam, scene) {
    this.mask.position.setFromMatrixPosition(cam.matrixWorld); this.mask.updateMatrixWorld();
    r.render(this.maskScene, cam);
    const keep = cam.layers.mask; cam.layers.set(1);
    r.render(scene, cam);
    cam.layers.mask = keep; cam.layers.disable(1);
    r.clearDepth();
    r.render(scene, cam);
    cam.layers.enable(1);
  }
}

// ======================================================================== the manager
export class Extras {
  constructor(app) {
    this.app = app;
    registerKind('widget', (m, sp) => new Widget(m, sp), { dist: 1.3, y: 0.1, scale: 1 });
    this.orb = new Orb(this); this.palm = new PalmUI(this); this.captions = new Captions(this); this.sketch = new Sketch(this); this.portal = new Portal(this);
    this.sessionAt = 0; this.heat = { warned: 0, batt: false, auto: false };
    window.MadarIOS?.on?.('thermal', p => this.onThermal(p.level));
  }
  get targets() { return [...(this.orb.mesh.visible ? [this.orb.mesh] : []), ...this.palm.targets]; }
  refresh() { this.app.interaction?.setTargets(); }
  enter() {
    this.sessionAt = performance.now(); this.sketch.attach();
    if (settings.orb) this.orb.show(true);
  }
  exit() { this.captions.stop(true); this.sketch.on = false; this.palm.hide(); this.logUsage(); }
  // ---------------------------------------------------------------- per frame
  update(dt, now) {
    const app = this.app;
    this.orb.update(now); this.palm.update(now); this.captions.update(app.renderQ); this.sketch.update(now);
    if (this.portal.active()) this.portal.tag(now);
    this.lookScroll(dt, now);
    if (now - (this.slowAt || 0) > 150) { this.slowAt = now; this.spatialAudio(); this.multiviewAudio(now); this.focusTick(); }
    if (settings.travel) this.travel(dt);
    if (now - (this.thermalAt || 0) > 2000) { this.thermalAt = now; this.thermalGuard(now); }
    if (this.shotPending) this.takeShot();
  }
  // ---------------------------------------------------------------- look to scroll (visionOS 26)
  lookScroll(dt, now) {
    if (settings.lookScroll === false) return;
    const g = this.app.interaction.pointers[2], hit = g.active ? g.hit : null, it = hit?.object.userData.interact;
    if (!it || it.type !== 'surface' || !hit.uv || !it.scroll?.() || !it.scrollBy) { this.ls = null; return; }
    const v = hit.uv.y, zone = v > 0.86 ? -1 : v < 0.14 ? 1 : 0;
    if (!zone) { this.ls = null; return; }
    if (!this.ls || this.ls.zone !== zone || this.ls.obj !== hit.object) { this.ls = { zone, obj: hit.object, t: now }; return; }
    const held = now - this.ls.t; if (held < 450) return;
    const speed = Math.min(1, (held - 450) / 900) * 900 * dt * zone;
    it.scrollBy(0, speed, it.toPx ? it.toPx(hit.uv) : [512, 320]);
  }
  // ---------------------------------------------------------------- spatial audio: each window's sound comes from where it is
  spatialAudio() {
    if (settings.spatialAudio === false) return;
    const inv = this.app.renderQ.clone().invert(), v = new THREE.Vector3();
    for (const w of this.app.windows.windows) {
      const el = w.video; if (!el || el.paused || w.sphere) continue;
      const pan = spatialize(el); if (!pan) continue;
      w.group.getWorldPosition(v).applyQuaternion(inv);
      const x = THREE.MathUtils.clamp(v.x / Math.max(0.4, v.length()) * 1.1, -0.9, 0.9);
      pan.pan.value += (x - pan.pan.value) * 0.5;
    }
  }
  // ---------------------------------------------------------------- travel mode: in a car / bus / plane the room turns with the vehicle
  travel(dt) {
    const app = this.app, yaw = app.windows.forwardYaw();
    if (this.tYaw == null) { this.tYaw = yaw; this.tBase = app.windows.root.rotation.y - yaw; }
    let d = yaw - this.tYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.tYaw += d * Math.min(1, dt / 6);   // slow turns (the vehicle) follow, quick looks around don't
    app.windows.root.rotation.y = this.tBase + this.tYaw;
  }
  toggleTravel() {
    const on = !settings.travel; saveSettings({ travel: on, ...(on ? { walk: false } : {}) }); this.tYaw = null;
    if (on) this.app.slam?.stop?.();
    this.app.toast(on ? '🚗 وضع السفر: النوافذ تدور مع السيارة، لا مع كل التفاتة' : 'وضع السفر متوقف', 2500);
  }
  // ---------------------------------------------------------------- Multiview: a 2×2 grid, the sound follows your eyes
  mediaWindows() { return this.app.windows.windows.filter(w => w.kind === 'video' || (w.kind === 'web' && !w.asleep)); }
  isPlaying(w) { return w.video ? !w.video.paused : w.yt ? !!w.ytState?.playing : true; }
  togglePlay(w) { if (w.video) { w.userPaused = !w.video.paused; w.video.paused ? w.video.play().catch(() => {}) : w.video.pause(); } else if (w.yt) w.ytToggle(); else w.mediaToggle?.(); }
  toggleMultiview() {
    const M = this.app.windows;
    if (this.mv) { for (const [w, t] of this.mv.saved) if (M.windows.includes(w)) { w.group.position.copy(t.p); w.group.quaternion.copy(t.q); w.group.scale.setScalar(t.s); w.setVolume?.(w.vol ?? 1, false); w.onDragEnd?.(); } this.mv = null; M.changed(); this.app.toast('انتهى العرض المتعدد', 1500); return; }
    const list = this.mediaWindows().slice(0, 4);
    if (list.length < 2) { this.app.toast('افتح فيديوهين أو بثّين على الأقل', 2500); return; }
    this.mv = { saved: new Map(list.map(w => [w, { p: w.group.position.clone(), q: w.group.quaternion.clone(), s: w.group.scale.x }])), focus: list[0], t: 0 };
    const yaw = M.forwardYaw(), h = M.headLocal(), cols = list.length > 2 ? 2 : list.length;
    list.forEach((w, i) => {
      const c = i % cols, r = Math.floor(i / cols), rows = Math.ceil(list.length / cols);
      const a = yaw + (c - (cols - 1) / 2) * -0.36, y = ((rows - 1) / 2 - r) * 0.5, d = 2.3;
      w.group.position.set(h.x - Math.sin(a) * d, h.y + y, h.z - Math.cos(a) * d); w.group.lookAt(h.x, h.y + y, h.z);
      w.group.scale.setScalar(0.85); w.headLock = false; w.onDragEnd?.();
      w.setVolume?.(w.vol ?? 1, i !== 0);
    });
    M.changed(); this.app.toast('📺 عرض متعدد — الصوت يتبع النافذة التي تنظر إليها', 3000);
  }
  multiviewAudio(now) {
    if (!this.mv) return;
    const I = this.app.interaction, looked = [I.pointers[2], I.pointers[0], I.pointers[1]].find(p => p.active && p.hoverObj)?.hoverObj;
    let w = null; for (let o = looked; o && !w; o = o.parent) w = o.userData.window || null;
    if (!w || !this.mv.saved.has(w)) { this.mv.cand = null; return; }
    if (this.mv.cand !== w) { this.mv.cand = w; this.mv.t = now; return; }
    if (w !== this.mv.focus && now - this.mv.t > 700) { this.mv.focus = w; for (const x of this.mv.saved.keys()) x.setVolume?.(x.vol ?? 1, x !== w); }
  }
  // ---------------------------------------------------------------- focus: everything except what you look at fades
  toggleFocus() { this.focus = !this.focus; if (!this.focus) this.applyFocus(null); this.app.toast(this.focus ? '🎯 وضع التركيز' : 'انتهى التركيز', 1500); }
  focusTick() {
    const I = this.app.interaction, looked = [I.pointers[2], I.pointers[0], I.pointers[1]].find(p => p.active && p.hoverObj)?.hoverObj;
    let w = null; for (let o = looked; o && !w; o = o.parent) w = o.userData.window || null;
    if (w) { this.lookedWin = w; this.lookedAt = performance.now(); }
    if (!this.focus) return;
    if (w) this.focusWin = w;
    this.applyFocus(this.focusWin);
  }
  applyFocus(sel) {
    for (const w of this.app.windows.windows) {
      const dim = sel && w !== sel ? 0.25 : 1;
      if (w.mat?.uniforms?.uDim && w.kind !== 'video') w.mat.uniforms.uDim.value = dim;
      w.css?.forEach(c => { if (c?.f) c.f.style.opacity = dim; });
      w.group.traverse(o => { if (o.material && o !== w.content && 'opacity' in o.material && o.material.transparent) { o.userData.op0 ??= o.material.opacity; o.material.opacity = o.userData.op0 * (dim < 1 ? 0.35 : 1); } });
    }
  }
  // ---------------------------------------------------------------- the assistant's history (visionOS 27 «Siri app»)
  logAnswer(q, a) { const l = store.get('madar.ai.log', []); l.push({ q, a, t: Date.now() }); store.set('madar.ai.log', l.slice(-200)); this.app.windows.windows.forEach(w => w.type === 'aihist' && w.redraw()); this.app.hub?.push('ai', { q, a }, 50); }
  // ---------------------------------------------------------------- visual intelligence: «ما هذا؟»
  async lookAndAsk(q) {
    const app = this.app, v = app.camVideo;
    if (!v || v.readyState < 2 || !v.videoWidth) { app.toast(window.MadarIOS ? 'في تطبيق الآيفون: استخدم Safari لهذه الميزة الآن' : 'الكاميرا غير جاهزة', 2500); return; }
    app.notify({ icon: '👁', title: 'أنظر…', body: q });
    const k = Math.min(1, 900 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement('canvas');
    c.width = v.videoWidth * k; c.height = v.videoHeight * k; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    try {
      const r = await post('/vision/ask', { image: c.toDataURL('image/jpeg', 0.82), q });
      if (!r.ok) throw new Error(r.error || '');
      app.notifier.cur = null; app.notifier.queue = [];
      app.notify({ icon: '👁', title: 'ما أراه', body: r.say }); speak(r.say); this.logAnswer('👁 ' + q, r.say);
    } catch (e) { app.toast('تعذّر التعرف: ' + (e.message || 'الشبكة'), 2500); }
  }
  // ---------------------------------------------------------------- Safari's summary
  async summarize(url, title) {
    const app = this.app; app.toast('📝 تلخيص الصفحة…', 4000);
    try {
      const r = await post('/summarize', { url });
      if (!r.ok) throw new Error(r.error || 'لا يوجد ملخص');
      const w = app.windows.open({ kind: 'widget', type: 'text', data: { title: '📝 ملخص: ' + (r.title || title || ''), lines: r.points } });
      speak(r.points.slice(0, 2).join('. '));
      app.hub?.push('briefs', { id: url, title: r.title || title || '', lines: r.points, url }, 30);
      return w;
    } catch (e) { app.toast('تعذّر التلخيص: ' + (e.message || e), 3000); }
  }
  // ---------------------------------------------------------------- dictation into a note
  dictateInto(w) { this.dictTarget = w; this.app.listen('dictate'); }
  takeDictation(t) { const m = this.noteTarget; this.noteTarget = null; if (m && this.app.windows.windows.includes(m)) { m.addNote(t); this.app.windows.changed(); return true; } const w = this.dictTarget; this.dictTarget = null; if (!w || !this.app.windows.windows.includes(w)) return false; w.data.text = ((w.data.text || '') + ' ' + t).trim(); w.redraw(); this.app.windows.changed(); this.syncNotes(); return true; }
  // Madar's live things as islands in DriveCast (the car, the phone): running timers
  syncIslands() { const now = Date.now(); this.app.hub?.set('islands', this.app.windows.windows.filter(w => w.type === 'timer' && w.data.running && w.data.mode !== 'watch' && w.data.endAt > now).map(w => ({ id: 'timer:' + w.id, kind: 'timer', icon: '⏰', title: 'مؤقت مدار', at: w.data.endAt, until: w.data.endAt + 60000, tint: '#7c3aed' }))); }
  timerDone(w) { this.syncIslands(); blip('open', settings.sounds); setTimeout(() => blip('open', settings.sounds), 400); speak('انتهى المؤقت'); this.app.notify({ icon: '⏰', title: 'انتهى المؤقت', body: '' }); }
  playVerse(v) {
    const a = this.app.media.audioEl();
    if (this.versePlaying) { a.pause(); this.versePlaying = false; }
    else { a.src = v.audio; a.play().then(() => { this.versePlaying = true; }).catch(() => {}); a.onended = () => { this.versePlaying = false; }; }
    this.app.windows.windows.forEach(w => w.type === 'verse' && setTimeout(() => w.redraw(), 300));
  }
  widget(type, data) {
    const old = this.app.windows.windows.find(w => w.kind === 'widget' && w.type === type && !['note', 'text', 'timer'].includes(type));
    if (old) { this.app.windows.close(old); return null; }
    return this.app.windows.open({ kind: 'widget', type, data });
  }
  // ---------------------------------------------------------------- scenes: save / restore whole layouts
  saveScene(name) {
    const sc = store.get('madar.scenes.v1', {}); name = name || 'مشهد ' + (Object.keys(sc).length + 1);
    sc[name] = { windows: this.app.windows.serialize(), env: settings.environment, at: Date.now() }; store.set('madar.scenes.v1', sc);
    this.app.toast('💾 حُفظ «' + name + '»', 2000); this.syncScenes(); return name;
  }
  syncScenes() { const sc = store.get('madar.scenes.v1', {}); this.app.hub?.set('scenes', Object.entries(sc).map(([n, v]) => ({ name: n, count: v.windows.length, env: v.env, at: v.at, media: v.windows.filter(w => w.ref?.url).slice(0, 4).map(w => ({ url: w.ref.url, title: w.ref.title || '' })) }))); }
  syncNotes() { this.app.hub?.set('notes', this.app.windows.windows.filter(w => w.type === 'note' && w.data.text).map(w => ({ id: w.id, text: w.data.text }))); }
  openScene(name) {
    const sc = store.get('madar.scenes.v1', {}), k = Object.keys(sc).find(n => n === name || n.includes(name) || name.includes(n));
    if (!k) { this.app.toast('لا يوجد مشهد بهذا الاسم', 2000); return; }
    const keep = this.app.windows.windows.filter(w => w.kind === 'widget' && w.type === 'scenes');
    [...this.app.windows.windows].forEach(w => { if (!keep.includes(w)) this.app.windows.close(w); });
    if (sc[k].env) saveSettings({ environment: sc[k].env });
    this.app.windows.restore(sc[k].windows.filter(s => !(s.kind === 'widget' && s.ref?.type === 'scenes')));
    this.app.toast('🎬 «' + k + '»', 1800);
  }
  // ---------------------------------------------------------------- share your space with Madar on another device in the room
  async shareSpace() {
    const app = this.app, devs = pairedDevices().filter(d => d.kind !== 'tv');
    if (!devs.length) { app.toast('أضف الجهاز الآخر في «الأجهزة» أولاً', 2500); return; }
    const yaw = app.windows.forwardYaw(), h = app.windows.headLocal();
    const wins = app.windows.serialize().filter(s => s.ref && !s.ref.item).map(s => { const p = new THREE.Vector3().fromArray(s.p).sub(h).applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw); return { ...s, p: p.toArray().map(v => +v.toFixed(3)), q: undefined }; });
    let ok = 0;
    for (const d of devs) { try { const c = await app.devices.open(d.code); c.send({ type: 'scene', windows: wins, env: settings.environment }); setTimeout(() => c.close(), 2000); ok++; } catch {} }
    app.toast(ok ? '👥 شاركت مساحتك مع ' + ok + ' جهاز' : 'لم يُعثر على الجهاز الآخر', 2500);
  }
  receiveScene(d, from) {
    const app = this.app; if (!Array.isArray(d.windows)) return;
    const go = () => {
      const yaw = app.windows.forwardYaw(), h = app.windows.headLocal();
      const list = d.windows.map(s => { const p = new THREE.Vector3().fromArray(s.p).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(h); return { ...s, p: p.toArray() }; });
      app.windows.restore(list);
      for (const w of app.windows.windows) if (w.kind !== 'model') w.group.lookAt(h);
      if (d.env) saveSettings({ environment: d.env });
    };
    app.notify({ icon: '👥', title: (from?.name || 'جهاز') + ' يشاركك مساحته', body: d.windows.length + ' نوافذ', actions: [['انضم', go]] });
  }
  // ---------------------------------------------------------------- a picture of everything you see
  shot() { this.shotPending = true; }
  takeShot() {
    this.shotPending = false;
    const src = this.app.renderer.renderer.domElement, sbs = settings.viewMode === 'sbs', w = sbs ? src.width / 2 : src.width, h = src.height;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    try { c.getContext('2d').drawImage(src, 0, 0, w, h, 0, 0, w, h); } catch { return; }
    c.toBlob(async b => {
      if (!b) return;
      const d = new Date(), name = 'مشهد مدار ' + d.toLocaleDateString('ar') + ' ' + d.toTimeString().slice(0, 5).replace(':', '-') + '.jpg';
      try { await importFiles([new File([b], name, { type: 'image/jpeg' })]); this.app.toast('📸 حُفظت لقطة المشهد في المكتبة', 2200); this.app.renderLibrary?.(); } catch {}
    }, 'image/jpeg', 0.9);
  }
  // ---------------------------------------------------------------- usage
  logUsage() {
    if (!this.sessionAt) return;
    const m = (performance.now() - this.sessionAt) / 60000, key = new Date().toISOString().slice(0, 10), u = store.get('madar.usage.v1', {});
    u[key] = Math.round(((u[key] || 0) + m) * 10) / 10; store.set('madar.usage.v1', u); this.sessionAt = 0;
  }
  usage() {
    const u = store.get('madar.usage.v1', {}), session = this.sessionAt ? (performance.now() - this.sessionAt) / 60000 : 0, today = (u[new Date().toISOString().slice(0, 10)] || 0) + session;
    let week = session; for (let i = 0; i < 7; i++) week += u[new Date(Date.now() - i * 864e5).toISOString().slice(0, 10)] || 0;
    const th = this.app.thermal, heat = th === 'critical' ? '🔥 حرجة' : th === 'serious' ? '🌡 مرتفعة' : th === 'fair' ? 'دافئ' : settings.coolMax ? '❄️ تبريد أقصى' : 'طبيعية';
    return { today: Math.round(today), session: Math.round(session), week: Math.round(week), heat };
  }
  // ================================================================ the thermal guard (10 measures, see thermalGuard + app/windows)
  onThermal(level) {
    // 1) the iPhone itself says it's getting hot: maximum cooling at once, back to normal when it has cooled
    if ((level === 'serious' || level === 'critical') && !settings.coolMax) { this.heat.auto = true; saveSettings({ coolMax: true, cool: true }); this.app.renderer.resize(); this.app.notify({ icon: '🌡', title: 'حماية حرارية', body: 'الجهاز ساخن — فعّلتُ التبريد الأقصى تلقائياً' }); }
    if (level === 'nominal' && this.heat.auto) { this.heat.auto = false; saveSettings({ coolMax: false }); this.app.renderer.resize(); this.app.toast('برد الجهاز — عادت الجودة', 2000); }
  }
  thermalGuard(now) {
    const app = this.app;
    // 2) Safari has no temperature: long slow frames are the sign → cool down by itself
    const slow = (app.renderer.quality ?? 1) < 0.75;
    this.slowSince = slow ? this.slowSince || now : 0;
    if (slow && now - this.slowSince > 20000 && !settings.coolMax && settings.thermalAuto !== false) { this.heat.auto = true; saveSettings({ coolMax: true, cool: true }); app.renderer.resize(); app.toast('❄️ حماية حرارية: تبريد أقصى تلقائي', 2500); }
    // 3) low battery (not charging): the light mode
    const b = app.control?.battery;
    if (b && !b.charging && b.level < 0.2 && !this.heat.batt) { this.heat.batt = true; saveSettings({ lite: true }); app.toast('🔋 البطارية منخفضة — الوضع الخفيف', 2500); }
    // 4) 25 minutes with the camera on: a cooling break
    const mins = (performance.now() - (this.sessionAt || performance.now())) / 60000;
    if (mins > 25 && now - (this.heat.warned || 0) > 25 * 60000 && !isImmersive(settings.environment)) {
      this.heat.warned = now;
      app.notify({ icon: '🌡', title: 'استراحة تبريد', body: '٢٥ دقيقة مع الكاميرا — بيئة غامرة تقلل حرارة الكاميرا', actions: [['بيئة غامرة', () => saveSettings({ environment: 'night' })], ['تبريد أقصى', () => { saveSettings({ coolMax: true, cool: true }); app.renderer.resize(); }]] });
    }
    // 5) the camera: inside a virtual place it only feeds hand tracking → a small, slow picture (and back again)
    const imm = isImmersive(settings.environment) && !this.portal.active();
    if (imm !== this.camImm) { this.camImm = imm; app.coolCamera?.(imm); }
    // 6) web pages you haven't looked at for 10 minutes sleep (tap to wake)
    for (const w of app.windows.windows) {
      if (w.kind !== 'web' || w.asleep || !w.sleep) continue;
      const v = w.group.getWorldPosition(new THREE.Vector3()).normalize();
      if (v.dot(app.headForward) > 0.5) w.seenAt = now; else if (now - (w.seenAt || (w.seenAt = now)) > 10 * 60000) { w.sleep(); app.toast('💤 نامت صفحة لم تنظر إليها منذ ١٠ دقائق', 2000); }
    }
  }
  // ---------------------------------------------------------------- voice
  voice(t) {
    const has = (...w) => w.some(x => t.includes(x)), app = this.app;
    const after = (...w) => { for (const x of w) { const i = t.indexOf(x); if (i >= 0) return t.slice(i + x.length).replace(/^[\s:،]+/, '').trim(); } return ''; };
    if (has('ما هذا', 'ماذا أرى', 'ماذا ارى', 'شو هذا', 'ايش هذا', 'اقرأ هذا', 'ترجم هذا', 'ماذا أمامي', 'ماذا امامي')) { this.lookAndAsk(t); return true; }
    if (has('لخص', 'لخّص', 'ملخص')) { const w = [app.controls.pointedWindow(), ...[...app.windows.windows].reverse()].find(x => x?.kind === 'web'); if (w) this.summarize(w.url, w.title); else app.toast('افتح صفحة أولاً', 2000); return true; }
    if (has('ترجمة فورية', 'الترجمة الفورية', 'ترجمة نصية', 'الترجمة النصية', 'الترجمة')) { this.captions.toggle(has('انجليزي', 'إنجليزي', 'الانجليزية', 'الإنجليزية') ? 'en-US' : has('عربي') ? 'ar-SA' : null); return true; }
    if (has('عرض متعدد', 'شاشات متعددة', 'ملتي فيو')) { this.toggleMultiview(); return true; }
    if (has('شاهد معا', 'شاهد معاً', 'مشاهدة جماعية')) { app.together?.toggle(); return true; }
    if (has('قد المشاهدة', 'قُد المشاهدة')) { app.together?.leadNow(); return true; }
    if (has('وضع المباراة', 'المباراة')) { app.plus?.matchMode(); return true; }
    if (has('استلقاء', 'مستلقي', 'فوقي')) { app.plus?.toggleLying(); return true; }
    if (has('احفظ المساحة', 'احفظ كمساحة')) { app.plus?.saveSpace(); return true; }
    if (has('المساحة التالية', 'غير المساحة', 'غيّر المساحة')) { app.plus?.nextSpace(); return true; }
    if (has('مساحة الصباح')) { app.plus?.openSpace({ id: 'morning', name: 'الصباح' }); return true; }
    if (has('مساحة العمل')) { app.plus?.openSpace({ id: 'work', name: 'العمل' }); return true; }
    if (has('مساحة السهرة')) { app.plus?.openSpace({ id: 'evening', name: 'السهرة' }); return true; }
    if (has('يومي', 'جدولي', 'يومك')) { this.widget('today'); return true; }
    if (has('وضع السفر', 'السيارة', 'الطائرة')) { this.toggleTravel(); return true; }
    if (has('وضع التركيز', 'ركز')) { this.toggleFocus(); return true; }
    if (has('امسح الرسم')) { this.sketch.clear(); return true; }
    if (has('تراجع') && this.sketch.on) { this.sketch.undo(); return true; }
    if (has('لون') && this.sketch.on) { this.sketch.color(); return true; }
    if (has('ارسم', 'الرسم', 'رسم')) { this.sketch.toggle(); return true; }
    if (has('الانغماس', 'انغماس')) { const n = parseInt(t.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))); this.portal.set(isFinite(n) ? n / 100 : has('زد', 'كامل') ? Math.min(1, (this.portal.level || 0) + 0.25) : has('قلل', 'خفف') ? Math.max(0, this.portal.level - 0.25) : 0.5); return true; }
    if (has('كرة المساعد', 'المساعد العائم', 'ضع المساعد')) { const on = has('ضع') || !this.orb.mesh.visible; saveSettings({ orb: on }); this.orb.show(on); if (on && has('هنا', 'ضع')) this.orb.place(); return true; }
    if (has('سجل المساعد', 'محادثاتي')) { this.widget('aihist'); return true; }
    if (has('شارك مساحتي', 'شارك المساحة')) { this.shareSpace(); return true; }
    if (has('احفظ المشهد')) { this.saveScene(after('احفظ المشهد') || undefined); return true; }
    if (has('افتح المشهد', 'مشهد')) { const n = after('افتح المشهد', 'مشهد'); if (n) this.openScene(n); else this.widget('scenes'); return true; }
    if (has('لقطة للمشهد', 'صور المشهد', 'لقطة شاشة')) { this.shot(); return true; }
    if (has('مكتبة درايف', 'مكتبة DriveCast', 'درايف كاست', 'درايفكاست')) { this.widget('dcmedia'); return true; }
    if (has('لوحة السيارة', 'لوحة درايف')) { this.widget('dcdash'); return true; }
    if (has('ريموت', 'التحكم بالتلفاز')) { this.widget('remote'); return true; }
    if (has('أرسل إلى', 'ارسل الى', 'أرسل الى', 'ارسل إلى')) { const w = app.controls.pointedWindow() || [...app.windows.windows].reverse().find(x => app.hub?.canSend(x)); if (w) app.hub?.sendWindow(w); return true; }
    if (has('الطقس', 'الجو')) { this.widget('weather'); return true; }
    if (has('مؤقت', 'ساعة إيقاف')) { const n = parseInt(t.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))); const w = app.windows.open({ kind: 'widget', type: 'timer', data: { mode: has('ساعة إيقاف') ? 'watch' : 'timer' } }); if (isFinite(n) && w) w.timerSet(n); return true; }
    if (has('ملاحظة', 'ملاحظه')) {
      const x = after('ملاحظة', 'ملاحظه'), m = app.controls.pointedWindow();
      if (m?.kind === 'model' && x) { m.addNote(x); app.windows.changed(); return true; }
      const w = app.windows.open({ kind: 'widget', type: 'note', data: { text: x } }); if (!x && w) this.dictateInto(w); return true;
    }
    if (has('إطار الصور', 'صوري')) { this.widget('photos'); return true; }
    if (has('يعرض الآن', 'المشغل')) { this.widget('nowplaying'); return true; }
    if (has('آية اليوم', 'اية اليوم')) { this.widget('verse'); return true; }
    if (has('استخدامي', 'وقت الاستخدام')) { this.widget('usage'); return true; }
    return false;
  }
}
