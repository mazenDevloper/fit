// «يوتيوب مدار» and «DriveCast مدار»: the video in the middle and two glass panels that wrap around it -
// on the left your channels (a column of round pictures) and their latest videos (or DriveCast's library: continue
// watching, saved, your lists), on the right the suggestions for what plays now. Pick one and it plays in the same
// window. «وضع المشاهدة» hides the panels and dims the room; while a video plays and you don't look at them, they
// fade back (Apple's deference) and come back as soon as you look.
import * as THREE from 'three';
import { CanvasPanel, blip } from './ui.js';
import { label, SYS } from './vos.js';
import { panelGlass } from './ui.js';
import { settings, saveSettings } from './config.js';
import * as G from './google.js';

const IMG = u => 'https://studio.c-p.workers.dev/img?u=' + encodeURIComponent(u);
const HUB = 'https://studio.c-p.workers.dev';
const PW = 0.62, GAP = 0.13, ANG = 0.32, ROW = 112, PX = 1100;
const imgs = new Map();

export class YTView {
  constructor(win, mode = 'youtube') {
    this.win = win; this.app = win.mgr.app; this.mode = mode;
    this.left = { tab: mode === 'drivecast' ? 'continue' : 'subs', list: [], off: 0, msg: '' };
    this.right = { list: [], off: 0, msg: 'جاري جلب المقترحات…' };
    this.channels = []; this.chan = null; this.lib = null; this.watch = false; this.lookAt = performance.now();
    this.L = this.panel('L'); this.R = this.panel('R');
    this.place();
    this.loadLeft(); this.loadRight();
    win.mgr.refreshTargets();
  }
  panel(side) {
    const h = this.win.h;
    const p = new CanvasPanel(PW, h, (ctx, W, H, pp) => side === 'L' ? this.drawL(ctx, W, H, pp) : this.drawR(ctx, W, H, pp), { pxPerM: PX });
    p.mesh.material.depthWrite = false;
    // pinch-drag over a panel scrolls its list
    const st = side === 'L' ? this.left : this.right;
    p.mesh.userData.interact = {
      type: 'surface', scroll: () => true, toPx: uv => [uv.x * p.w, (1 - uv.y) * p.h],
      scrollBy: (dx, dy) => { st.off = Math.max(0, Math.min(Math.max(0, st.list.length * ROW - (p.h - 150)), st.off + dy)); this.lookAt = performance.now(); p.redraw(); },
      click: hit => p.onClick(hit), hover: (on, hit) => { if (on) this.lookAt = performance.now(); return p.onHover(on, hit); },
    };
    this.win.group.add(p.mesh);
    return p;
  }
  // wrap around the video: each panel turned a little toward you (like a curved ultra-wide)
  place() {
    const x = 0.5 + GAP + Math.cos(ANG) * PW / 2, z = Math.sin(ANG) * PW / 2;
    this.L.mesh.position.set(-x, 0, z); this.L.mesh.rotation.y = ANG;
    this.R.mesh.position.set(x, 0, z); this.R.mesh.rotation.y = -ANG;
  }
  get targets() { return [this.L.mesh, this.R.mesh].filter(m => m.visible); }

  // ---------------------------------------------------------------- data
  async loadLeft() {
    const s = this.left;
    try {
      if (this.mode === 'drivecast') {
        this.lib ||= await (await fetch(HUB + '/hub/library')).json();
        const L = this.lib;
        s.tabs = [['continue', 'تابع'], ['saved', 'المحفوظة'], ...(L.playlists || []).slice(0, 4).map(p => ['pl:' + p.id, p.name])];
        s.list = s.tab === 'continue' ? L.continue || [] : s.tab === 'saved' ? L.saved || [] : (L.playlists || []).find(p => 'pl:' + p.id === s.tab)?.videos || [];
        s.msg = s.list.length ? '' : 'لا شيء هنا بعد';
      } else if (!G.signedIn()) {
        s.list = []; s.msg = G.clientId() ? 'signin' : 'noclient';
      } else {
        s.tabs = [['subs', 'قنواتي'], ['liked', 'أعجبني'], ['popular', 'الشائع']];
        if (!this.channels.length) this.channels = await G.myChannels();
        if (this.chan) s.list = await G.channelVideos(this.chan.id);
        else if (s.tab === 'liked') s.list = await G.liked();
        else if (s.tab === 'popular') s.list = await G.popular();
        else {   // the latest from the channels you follow most
          const per = await Promise.all(this.channels.slice(0, 6).map(c => G.channelVideos(c.id).then(v => v.slice(0, 4)).catch(() => [])));
          s.list = per.flat();
        }
        s.msg = s.list.length ? '' : 'لا فيديوهات';
      }
    } catch (e) { s.list = []; s.msg = e.message === 'signin' ? 'signin' : 'تعذّر الجلب: ' + e.message; }
    s.off = 0; this.L.redraw();
  }
  async loadRight() {
    const s = this.right, id = this.win.yt;
    s.msg = 'جاري جلب المقترحات…'; this.R.redraw();
    let list = [];
    // 1) the server reads YouTube's own «up next» for this video (no sign-in needed)
    try { const r = await (await fetch(HUB + '/yt/related?v=' + id, { signal: AbortSignal.timeout?.(6000) })).json(); list = r.items || []; } catch {}
    // 2) signed in: videos like this one (its title), else what's popular
    if (!list.length && G.signedIn()) {
      try { const info = await G.videoInfo(id); if (info) { this.win.title ||= info.title; list = (await G.search(info.title.split(/[|\-–(]/)[0].slice(0, 80), 15)).filter(v => v.id !== id); } } catch {}
      if (!list.length) try { list = await G.popular(); } catch {}
    }
    if (!list.length && this.mode === 'drivecast') { try { this.lib ||= await (await fetch(HUB + '/hub/library')).json(); list = [...(this.lib.saved || []), ...(this.lib.continue || [])].filter(v => v.id !== id); } catch {} }
    s.list = list.slice(0, 30); s.off = 0; s.msg = list.length ? '' : (G.signedIn() ? 'لا مقترحات الآن' : 'سجّل الدخول بحساب Google لتظهر المقترحات');
    this.R.redraw();
  }
  play(v) {
    blip('tap', settings.sounds);
    this.win.ytLoad?.(v.id, v.title);
    this.loadRight();
  }

  // ---------------------------------------------------------------- drawing
  img(u, p) {
    if (!u) return null;
    let e = imgs.get(u);
    if (!e) { e = { im: null }; imgs.set(u, e); const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { e.im = im; clearTimeout(this.rt); this.rt = setTimeout(() => { this.L.redraw(); this.R.redraw(); }, 150); }; im.src = IMG(u); }
    return e.im;
  }
  header(ctx, W, title, tabs, cur, p, onTab) {
    label(ctx, title, W - 30, 46, 34, { weight: 800, color: '#fff', align: 'right' });
    if (!tabs) return 84;
    let x = W - 26;
    ctx.font = '700 24px -apple-system, system-ui, "SF Arabic", sans-serif';
    tabs.forEach(([k, name]) => {
      const tw = Math.min(170, ctx.measureText(name).width + 34), on = cur === k, hov = p.isHover('t' + k);
      if (x - tw < 20) return;
      ctx.beginPath(); ctx.roundRect(x - tw, 76, tw, 44, 22); ctx.fillStyle = on ? 'rgba(255,255,255,0.92)' : hov ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)'; ctx.fill();
      label(ctx, name, x - tw / 2, 98, 22, { weight: 700, color: on ? '#141824' : '#fff', maxWidth: tw - 16 });
      p.region(x - tw, 76, tw, 44, () => onTab(k), 't' + k);
      x -= tw + 10;
    });
    return 134;
  }
  rows(ctx, W, H, p, st, top, x0, pre) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, H - top - 10); ctx.clip();
    const tw = 168, th = 94;
    st.list.forEach((v, i) => {
      const y = top + i * ROW - st.off; if (y + ROW < top || y > H) return;
      const id = pre + i, hov = p.isHover(id), now = v.id === this.win.yt;
      if (hov || now) { ctx.beginPath(); ctx.roundRect(x0 + 8, y + 2, W - x0 - 16, ROW - 6, 18); ctx.fillStyle = now ? 'rgba(10,132,255,0.32)' : 'rgba(255,255,255,0.14)'; ctx.fill(); }
      const tx = W - 18 - tw, im = this.img(v.thumb, p);
      ctx.save(); ctx.beginPath(); ctx.roundRect(tx, y + 8, tw, th, 12); ctx.clip();
      if (im) { const s = Math.max(tw / im.width, th / im.height); ctx.drawImage(im, tx + (tw - im.width * s) / 2, y + 8 + (th - im.height * s) / 2, im.width * s, im.height * s); } else { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(tx, y + 8, tw, th); }
      ctx.restore();
      if (v.live) { ctx.fillStyle = SYS.red; ctx.beginPath(); ctx.roundRect(tx + 6, y + 14, 52, 22, 6); ctx.fill(); label(ctx, 'مباشر', tx + 32, y + 25, 14, { weight: 800, color: '#fff' }); }
      label(ctx, v.title || '', tx - 14, y + 34, 22, { weight: 700, color: '#fff', align: 'right', maxWidth: tx - x0 - 30, wrap: true });
      label(ctx, v.channel || '', tx - 14, y + 84, 18, { weight: 600, color: SYS.label2 || 'rgba(235,235,245,0.6)', align: 'right', maxWidth: tx - x0 - 30 });
      p.region(x0, Math.max(top, y), W - x0, ROW, () => this.play(v), id);
    });
    ctx.restore();
  }
  message(ctx, W, H, p, msg) {
    if (msg === 'signin' || msg === 'noclient') {
      label(ctx, msg === 'signin' ? 'ادخل بحسابك في يوتيوب' : 'الدخول بحساب Google', W / 2, H * 0.38, 30, { weight: 800, color: '#fff' });
      label(ctx, msg === 'signin' ? 'قنواتك وما أعجبك وأحدث فيديوهات من تتابعهم' : 'أضف Google Client ID في إعدادات مدار ← يوتيوب', W / 2, H * 0.38 + 46, 20, { weight: 600, color: 'rgba(235,235,245,0.7)', maxWidth: W - 60, wrap: true });
      if (msg === 'signin') {
        const bw = 300, bh = 64, bx = (W - bw) / 2, by = H * 0.38 + 100, hov = p.isHover('in');
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh / 2); ctx.fillStyle = hov ? '#fff' : 'rgba(255,255,255,0.9)'; ctx.fill();
        label(ctx, 'تسجيل الدخول بـ Google', W / 2, by + bh / 2, 24, { weight: 800, color: '#141824' });
        p.region(bx, by, bw, bh, () => G.signIn().then(() => { this.app.toast('✓ دخلت بحساب ' + (G.account() || 'Google'), 2500); this.loadLeft(); this.loadRight(); }).catch(e => this.app.toast(e.message, 3500)), 'in');
      }
      return;
    }
    label(ctx, msg, W / 2, H / 2, 22, { weight: 600, color: 'rgba(235,235,245,0.7)', maxWidth: W - 60, wrap: true });
  }
  drawL(ctx, W, H, p) {
    panelGlass(ctx, 0, 0, W, H, 44);
    const s = this.left, yt = this.mode !== 'drivecast';
    const title = yt ? (this.chan ? this.chan.name : 'يوتيوب' + (G.account() ? ' · ' + G.account() : '')) : 'DriveCast · مكتبتي';
    const top = this.header(ctx, W, title, s.tabs, this.chan ? null : s.tab, p, k => { s.tab = k; this.chan = null; this.loadLeft(); });
    // the channels: a column of round pictures on the outer edge
    let x0 = 0;
    if (yt && this.channels.length) {
      x0 = 92;
      ctx.save(); ctx.beginPath(); ctx.rect(0, top, x0, H - top); ctx.clip();
      this.channels.slice(0, Math.floor((H - top) / 84)).forEach((c, i) => {
        const cy = top + 40 + i * 84, id = 'c' + i, on = this.chan?.id === c.id, hov = p.isHover(id), im = this.img(c.pic, p);
        ctx.save(); ctx.beginPath(); ctx.arc(46, cy, 32, 0, 7); ctx.clip();
        if (im) ctx.drawImage(im, 14, cy - 32, 64, 64); else { ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill(); }
        ctx.restore();
        if (on || hov) { ctx.beginPath(); ctx.arc(46, cy, 35, 0, 7); ctx.lineWidth = 4; ctx.strokeStyle = on ? SYS.blue : 'rgba(255,255,255,0.7)'; ctx.stroke(); }
        p.region(6, cy - 40, 80, 80, () => { this.chan = on ? null : c; this.loadLeft(); }, id);
      });
      ctx.restore();
    }
    if (s.msg && !s.list.length) return this.message(ctx, W, H, p, s.msg);
    this.rows(ctx, W, H, p, s, top, x0, 'l');
  }
  drawR(ctx, W, H, p) {
    panelGlass(ctx, 0, 0, W, H, 44);
    const s = this.right;
    label(ctx, 'مقترحات', W - 30, 46, 34, { weight: 800, color: '#fff', align: 'right' });
    // «وضع المشاهدة» and sign out
    const bw = 190, bx = 24, hov = p.isHover('watch');
    ctx.beginPath(); ctx.roundRect(bx, 24, bw, 48, 24); ctx.fillStyle = this.watch ? SYS.blue : hov ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)'; ctx.fill();
    label(ctx, '◐ وضع المشاهدة', bx + bw / 2, 48, 20, { weight: 700, color: '#fff' });
    p.region(bx, 24, bw, 48, () => this.toggleWatch(), 'watch');
    if (s.msg && !s.list.length) return this.message(ctx, W, H, p, s.msg);
    this.rows(ctx, W, H, p, s, 92, 0, 'r');
  }
  toggleWatch(on = !this.watch) {
    this.watch = on; blip('tap', settings.sounds);
    if (on) { this.envBefore = settings.environment; if (settings.environment === 'passthrough') saveSettings({ environment: 'dim' }); this.app.renderEnvChoices?.(); }
    else if (this.envBefore) { saveSettings({ environment: this.envBefore }); this.app.renderEnvChoices?.(); this.envBefore = null; }
    this.app.toast(on ? 'وضع المشاهدة: انظر إلى الجانبين لتظهر القوائم' : 'انتهى وضع المشاهدة', 2000);
    this.lookAt = on ? 0 : performance.now(); this.R.redraw();
  }
  // follow the window's shape; fade while a video plays and you don't look at the panels
  update(now) {
    const h = this.win.h;
    if (Math.abs(h - this.L.heightM) > 0.01) { this.rebuild(); return; }
    const playing = this.win.ytState?.playing, idle = now - this.lookAt > (this.watch ? 2500 : 8000);
    const goal = !idle ? 1 : this.watch ? 0.06 : playing ? 0.4 : 1;
    for (const m of [this.L.mesh, this.R.mesh]) { const o = m.material.opacity; m.material.opacity = o + (goal - o) * 0.12; }
  }
  rebuild() { for (const p of [this.L, this.R]) { this.win.group.remove(p.mesh); p.dispose?.(); } this.L = this.panel('L'); this.R = this.panel('R'); this.place(); this.win.mgr.refreshTargets(); }
  dispose() { for (const p of [this.L, this.R]) { this.win.group.remove(p.mesh); p.dispose?.(); } if (this.watch) this.toggleWatch(false); }
}
