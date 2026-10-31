// «المركز» in Madar: the living-room side of Madar ⇄ DriveCast. One WebSocket to the server's hub (all the work
// is on the server: titles, thumbnails, islands, suggestions); Madar only reports what it plays and draws what
// arrives. Continue watching across places, send anything to the car / TV / phone, DriveCast's library and
// dashboard inside Madar, a TV remote, and Madar's scenes / notes / plan / summaries reaching DriveCast.
import { deviceIdentity, settings } from './config.js';

export const HUB = 'https://studio.c-p.workers.dev/hub';
const WS = HUB.replace(/^http/, 'ws') + '/ws';
const KIND_AR = { car: 'السيارة', tv: 'التلفاز', phone: 'الهاتف', tablet: 'التابلت', madar: 'مدار', computer: 'الكمبيوتر' };
export const fmtTime = t => { t = Math.max(0, Math.round(t || 0)); return (t >= 3600 ? Math.floor(t / 3600) + ':' + String(Math.floor(t / 60) % 60).padStart(2, '0') : Math.floor(t / 60)) + ':' + String(t % 60).padStart(2, '0'); };
// a single HTTP op (for pages without the socket, e.g. «مدار 2D»)
export function hubOp(op) { return fetch(HUB + '/op', { method: 'POST', body: JSON.stringify(op) }).then(r => r.json()).catch(() => null); }

export class HubClient {
  constructor(app) {
    this.app = app; this.state = {}; this.devices = []; this.listeners = new Set(); this.backoff = 2000;
    const me = deviceIdentity();
    this.me = { id: 'madar-' + me.code, name: 'مدار · ' + (me.name || 'الغرفة'), kind: 'madar', app: 'madar' };
    if (settings.hub !== false) this.connect();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && (!this.ws || this.ws.readyState > 1)) this.connect(); });
    setInterval(() => this.tick(), 15000);
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(e) { this.listeners.forEach(f => { try { f(e); } catch {} }); }
  connect() {
    clearTimeout(this.retry);
    try { this.ws?.close(); } catch {}
    const q = new URLSearchParams(this.me);
    let ws; try { ws = new WebSocket(WS + '?' + q); } catch { return this.later(); }
    this.ws = ws;
    ws.onopen = () => { this.backoff = 2000; this.ping = setInterval(() => this.send({ op: 'ping' }), 50000); };
    ws.onclose = () => { clearInterval(this.ping); if (this.ws === ws) this.later(); };
    ws.onerror = () => {};
    ws.onmessage = e => { let d; try { d = JSON.parse(e.data); } catch { return; } this.onMessage(d); };
  }
  later() { this.retry = setTimeout(() => this.connect(), this.backoff); this.backoff = Math.min(60000, this.backoff * 2); }
  send(o) { if (this.ws?.readyState === 1) { this.ws.send(JSON.stringify(o)); return true; } return false; }
  // a write that must not be lost: the socket, or the plain HTTP op
  op(o) { if (!this.send(o)) hubOp(o); }
  get online() { return this.ws?.readyState === 1; }
  others() { return this.devices.filter(d => d.id !== this.me.id); }
  onMessage(d) {
    if (d.type === 'hello') { this.state = d.state || {}; this.devices = d.devices || []; this.emit(d); this.greet(); return; }
    if (d.type === 'devices') { this.devices = d.devices || []; }
    if (d.type === 'set') this.state[d.key] = d.value;
    if (d.type === 'resume') { (this.state.resume ||= {})[d.item.id] = d.item; if (d.item.done) delete this.state.resume[d.item.id]; }
    if (d.type === 'msg') this.onMsg(d.msg || {}, d.from || {});
    this.emit(d);
  }
  // ---- arriving from DriveCast (or another Madar)
  onMsg(m, from) {
    const app = this.app, who = from.name || KIND_AR[from.kind] || 'جهاز';
    if (m.type === 'open' && m.item) {
      if (!app.active) { app.toast?.('📥 من ' + who + ': ' + (m.item.title || ''), 4000); this.pending = m.item; return; }
      app.notify({ icon: '📥', title: 'من ' + who, body: (m.item.title || '') + (m.item.t > 30 ? ' · من ' + fmtTime(m.item.t) : ''), actions: [['افتح', () => this.open(m.item)]] });
      if (m.now) this.open(m.item);
    } else if (m.type === 'control') this.control(m.action, m.value);
    else if (m.type === 'island' && m.item) app.notify({ icon: m.item.icon || '🔔', title: m.item.title, body: m.item.sub || '' });
    else if (m.type === 'scene' && m.name) app.extras?.openScene(m.name);
    else if (m.type === 'match') app.plus?.onMatch(m);
    else if (m.type === 'shared' && m.code) { app.toast?.('🟢 ' + (m.name || who) + ' استيقظ — شاشته أمامك', 3000); app.connectMirror?.(String(m.code)); }
    else if (m.type === 'clip' && m.text) app.welcome?.clip(String(m.text), who);
    else if (m.type === 'rc') app.remote?.rc(m, from);
    else if (m.type === 'ping') { try { const a = new AudioContext(), o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); o.stop(a.currentTime + 0.6); } catch {} app.toast?.('🔔 ' + who + ' يبحث عن مدار', 3000); }
    else if (m.type === 'say' && m.text) { try { const u = new SpeechSynthesisUtterance(String(m.text)); u.lang = 'ar-SA'; speechSynthesis.speak(u); } catch {} app.toast?.('💬 ' + String(m.text).slice(0, 80), 4000); }
    else if (m.type === 'sleep' && m.minutes > 0) { clearTimeout(this._sleep); this._sleep = setTimeout(() => document.querySelectorAll('video,audio').forEach(v => v.pause()), m.minutes * 60000); app.toast?.('😴 يتوقف بعد ' + m.minutes + ' دقيقة', 3000); }
    else if (m.type === 'toast') app.toast?.(String(m.text || '').slice(0, 80), 3000);
  }
  // open anything that came from a device / the library
  open(it) {
    const app = this.app, W = app.windows, mode = it?.mode;
    if (!it) return;
    if (it.kind === 'yt') return W.open({ kind: 'web', url: 'https://www.youtube.com/watch?v=' + it.id, title: it.title || 'YouTube', start: it.t || 0, aspect: it.short ? 0.6 : 0 });
    if (it.kind === 'iptv' || it.kind === 'video' || it.kind === '360') {
      if (mode === 'save') return this.fileToLibrary(it, false);
      return W.open({ kind: 'video', url: it.url || it.id, name: it.title || '', start: it.t || 0, proj: it.kind === '360' ? '360' : null });
    }
    if (it.kind === 'article') return app.readWeb?.(it.url);
    if (it.kind === 'scene') return app.extras?.openScene(it.name || it.title);
    if (it.kind === 'web') {
      if (mode === 'read' || mode === 'listen') return app.readWeb?.(it.url);
      if (mode === 'summary') return app.extras?.summarize(it.url, it.title);
      return W.open({ kind: 'web', url: it.url, title: it.title || '' });
    }
    if (it.kind === 'pdf' || it.kind === 'image' || it.kind === 'file') return this.fileToLibrary(it, true);
    if (it.kind === 'map') {
      const q = it.lat != null ? it.lat + ',' + it.lon : encodeURIComponent(it.url || it.title || '');
      if (mode === 'save') { app.toast('📍 حُفظ المكان', 2000); return; }
      return W.open({ kind: 'web', url: 'https://www.google.com/maps?q=' + q + '&z=15&output=embed', title: '🗺 ' + (it.title || 'خريطة'), direct: true });
    }
    if (it.kind === 'text') {
      if (mode === 'speak') { try { const u = new SpeechSynthesisUtterance(it.text); u.lang = 'ar-SA'; speechSynthesis.speak(u); } catch {} return; }
      return W.open({ kind: 'widget', type: 'note', data: { text: it.text || it.title } });
    }
    if (it.url) return W.open({ kind: 'web', url: it.url, title: it.title || '' });
  }
  // a shared file (on the server) into Madar's library, then shown the way you chose
  async fileToLibrary(it, show) {
    const app = this.app;
    try {
      app.toast('⬇️ ' + (it.title || 'ملف'), 3000);
      const r = await fetch(it.url); const blob = await r.blob();
      const { importFiles } = await import('./db.js');
      const made = await importFiles([new File([blob], it.title || it.url.split('/').pop(), { type: blob.type || it.type || '' })]);
      const m = made[0]; if (!m) { app.toast('نوع الملف غير مدعوم', 2500); return; }
      app.renderLibrary?.(); app.launcher?.refresh?.();
      if (!show || it.mode === 'save') { app.toast('💾 حُفظ في المكتبة: ' + m.name, 2500); return; }
      if (m.type === 'doc') return app.openReader('doc', m.id);
      if (m.type === 'image') {
        if (it.mode === 'frame') { app.extras?.widget('photos'); return; }
        if (it.mode === 'env') { const { importEnvironment } = await import('./db.js'); const e = await importEnvironment([new File([blob], it.title || 'env.jpg', { type: blob.type })]); if (e) await app.gallery.applyMine(e.id); return; }
        const w = app.windows.open({ kind: 'image', itemId: m.id, name: m.name });
        if (it.mode === 'spatial') setTimeout(() => w?.toggleSpatial?.(), 1500);
        return w;
      }
      return app.windows.open({ kind: m.type, itemId: m.id, name: m.name });
    } catch (e) { app.toast('تعذّر فتح الملف: ' + (e.message || e), 3000); }
  }
  control(action, value) {
    const vids = this.app.windows.windows.filter(w => w.kind === 'video' || w.yt);
    const w = vids[vids.length - 1]; if (!w) return;
    if (action === 'toggle' || action === 'play' || action === 'pause') this.app.extras?.togglePlay(w);
    else if (action === 'vol+' || action === 'vol-') w.stepVolume?.(action === 'vol+' ? 0.1 : -0.1);
    else if (action === 'seek' && w.video) w.video.currentTime = Math.max(0, w.video.currentTime + (+value || 0));
  }
  // ---- what Madar plays: reported every 15 s (where you stopped + watching time for the suggestions)
  itemOf(w) {
    if (w.kind === 'web' && w.yt) return { id: w.yt, kind: 'yt', title: w.ytTitle || w.title || '', t: Math.round(w.ytState?.times?.[0] || 0), dur: Math.round(w.ytState?.dur || 0), playing: !!w.ytState?.playing };
    if (w.kind === 'video' && w.url && /^https?:/.test(w.url) && !w.stream && !w.remote) {
      const v = w.video, live = !isFinite(v.duration);
      return { id: w.url, kind: w.proj === '360' ? '360' : live || /\.m3u8|\/live\//i.test(w.url) ? 'iptv' : 'video', url: w.url, title: w.name || decodeURIComponent(w.url.split('/').pop().split('?')[0]).slice(0, 80), t: live ? 0 : Math.round(v.currentTime || 0), dur: live ? 0 : Math.round(v.duration || 0), playing: !v.paused };
    }
    return null;
  }
  tick() {
    if (!this.online || !this.app.active || document.hidden) return;
    for (const w of this.app.windows.windows) {
      const it = this.itemOf(w); if (!it || !it.playing) continue;
      const { playing, ...item } = it;
      if (item.kind !== 'iptv' && item.t < 20) continue;
      this.send({ op: 'resume', item });
      this.send({ op: 'stat', item, minutes: 0.25, place: 'room' });
    }
  }
  // on entering Madar: «continue from the car / the TV»
  greet() {
    if (this.greeted || !this.app.active) return;
    this.greeted = true;
    if (this.pending) { const p = this.pending; this.pending = null; this.app.notify({ icon: '📥', title: 'وصل أثناء غيابك', body: p.title || '', actions: [['افتح', () => this.open(p)]] }); return; }
    const inbox = (this.state.inbox || []).filter(x => Date.now() - (x.at || 0) < 3 * 864e5 && !x.seenBy?.includes(this.me.id));
    if (inbox.length) { const x = inbox[0]; this.app.notify({ icon: '🕒', title: 'محفوظ لوقت لاحق (' + inbox.length + ')', body: x.title || x.url || '', actions: [['افتح', () => { this.open(x); this.op({ op: 'set', key: 'inbox', value: (this.state.inbox || []).filter(y => y !== x) }); }]] }); }
    const r = Object.values(this.state.resume || {}).filter(x => x.from?.id !== this.me.id && Date.now() - x.at < 12 * 3600e3).sort((a, b) => b.at - a.at)[0];
    if (r) this.app.notify({ icon: '▶', title: 'تابع من ' + (r.from?.name || KIND_AR[r.from?.kind] || 'جهازك'), body: (r.title || '') + ' · من ' + fmtTime(r.t), actions: [['أكمل', () => this.open(r)]] });
  }
  enter() { this.greeted = false; if (this.online) this.greet(); else this.connect(); }
  // ---- «أرسل إلى»
  canSend(w) { return !!(this.itemOf(w) || (w.kind === 'web' && w.url) || (w.kind === 'image' && w.itemId)); }
  targetName() { const o = this.others(); return o.length ? o.length + ' أجهزة' : 'لا أجهزة متصلة'; }
  sendWindow(w) {
    const it = this.itemOf(w) || (w.kind === 'web' ? { id: w.url, kind: 'web', url: w.pageUrl || w.url, title: w.title || '' } : null);
    if (!it) { this.app.toast('لا يمكن إرسال هذه النافذة', 2000); return; }
    this.pick(dev => { const { playing, ...item } = it; this.op({ op: 'send', to: dev.id, msg: { type: 'open', item, now: true } }); this.app.toast('📤 أُرسل إلى ' + dev.name, 2000); });
  }
  pick(fn) {
    const o = this.others();
    if (!o.length) { this.app.toast('افتح DriveCast على السيارة أو التلفاز أو الهاتف أولاً', 3000); return; }
    if (o.length === 1) return fn(o[0]);
    this.app.notify({ icon: '📤', title: 'أرسل إلى', body: '', actions: o.slice(0, 3).map(d => [d.name || KIND_AR[d.kind] || d.kind, () => fn(d)]) });
  }
  remoteTarget() { const o = this.others(); return o.find(d => d.kind === 'tv') || o.find(d => d.app === 'drivecast') || o[0]; }
  remote(action, value) { const d = this.remoteTarget(); if (!d) { this.app.toast('لا يوجد جهاز DriveCast متصل', 2000); return; } this.op({ op: 'send', to: d.id, msg: { type: 'control', action, value } }); }
  // ---- Madar's things that reach DriveCast
  set(key, value) { this.op({ op: 'set', key, value }); }
  push(key, item, max) { this.op({ op: 'push', key, item, max }); }
  context() { return (this.state.history || []).slice(0, 8).map(h => `- ${h.title || h.id} (${KIND_AR[h.from?.kind] || h.from?.name || ''})`).join('\n'); }
}
export { KIND_AR };
