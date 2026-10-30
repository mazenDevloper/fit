// «مرحباً» in Madar: on entering, a glass card in front of you — the greeting of the hour, today's date (Gregorian +
// Hijri), the next prayer, your team's match, and every device on now (phone, TV, car, tablet) with a green dot.
// Also: the shared clipboard (a link copied on another device) and «وضع الصلاة» (videos pause at the azan).
import * as THREE from 'three';
import { settings } from './config.js';
import { blip, roundRect } from './ui.js';

const API = 'https://studio.c-p.workers.dev';
const KIND_AR = { tv: 'التلفاز', car: 'السيارة', phone: 'الهاتف', tablet: 'التابلت', computer: 'الكمبيوتر', madar: 'مدار' };
const FONT = 'system-ui, -apple-system, "SF Arabic", "Geeza Pro", sans-serif';
const speak = t => { try { const u = new SpeechSynthesisUtterance(t); u.lang = 'ar-SA'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {} };

// the device itself, drawn simply (no image files): phone, TV on a stand, car, tablet, headset, laptop
function deviceIcon(ctx, kind, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = s * 0.08; ctx.lineJoin = ctx.lineCap = 'round';
  const R = (x0, y0, w, h, r) => { roundRect(ctx, x0 * s, y0 * s, w * s, h * s, r * s); ctx.stroke(); };
  if (kind === 'tv') { R(-0.5, -0.38, 1, 0.62, 0.06); ctx.beginPath(); ctx.moveTo(-0.18 * s, 0.38 * s); ctx.lineTo(0.18 * s, 0.38 * s); ctx.moveTo(0, 0.24 * s); ctx.lineTo(0, 0.38 * s); ctx.stroke(); }
  else if (kind === 'car') { ctx.beginPath(); ctx.moveTo(-0.5 * s, 0.12 * s); ctx.lineTo(-0.42 * s, -0.08 * s); ctx.lineTo(-0.22 * s, -0.3 * s); ctx.lineTo(0.2 * s, -0.3 * s); ctx.lineTo(0.38 * s, -0.08 * s); ctx.lineTo(0.5 * s, 0.12 * s); ctx.closePath(); ctx.stroke(); [-0.27, 0.27].forEach(c => { ctx.beginPath(); ctx.arc(c * s, 0.17 * s, 0.11 * s, 0, 7); ctx.fill(); }); }
  else if (kind === 'tablet') R(-0.42, -0.32, 0.84, 0.64, 0.08);
  else if (kind === 'madar') { R(-0.5, -0.2, 0.44, 0.36, 0.14); R(0.06, -0.2, 0.44, 0.36, 0.14); ctx.beginPath(); ctx.moveTo(-0.06 * s, -0.05 * s); ctx.lineTo(0.06 * s, -0.05 * s); ctx.stroke(); }
  else if (kind === 'computer') { R(-0.42, -0.34, 0.84, 0.52, 0.05); ctx.beginPath(); ctx.moveTo(-0.52 * s, 0.28 * s); ctx.lineTo(0.52 * s, 0.28 * s); ctx.stroke(); }
  else R(-0.24, -0.44, 0.48, 0.88, 0.1);   // phone
  ctx.restore();
}

export class Welcome {
  constructor(app) { this.app = app; this.card = null; this.handled = {}; this.paused = null; }
  get W() { return this.app.windows; }

  // ---------------------------------------------------------------- the card
  async show() {
    let d; try { d = await (await fetch(API + '/hub/welcome', { cache: 'no-store' })).json(); } catch { return; }
    if (!d?.greet) return;
    this.data = d; this.close();
    const w = 1400, h = 760, c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.direction = 'rtl'; ctx.textAlign = 'right';
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(26,32,56,0.92)'); g.addColorStop(1, 'rgba(10,12,22,0.92)');
    ctx.fillStyle = g; roundRect(ctx, 4, 4, w - 8, h - 8, 70); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 3; ctx.stroke();
    const T = (s, x, y, size, color = '#fff', weight = 800, align = 'right') => { ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y); };
    T(d.greet + ' 👋', w - 70, 120, 78);
    T(`اليوم ${d.date.weekday} ${d.date.day} ${d.date.month} · ${d.date.hijri}`, w - 70, 190, 40, 'rgba(226,232,250,0.75)', 700);
    // prayer + match tiles
    const tile = (x, tint, a, b, c3) => { ctx.fillStyle = tint; roundRect(ctx, x, 235, 610, 190, 36); ctx.fill(); T(a, x + 580, 290, 30, 'rgba(255,255,255,0.7)', 700); T(b, x + 580, 355, 46); if (c3) T(c3, x + 580, 400, 28, 'rgba(255,255,255,0.6)', 600); };
    if (d.next) tile(w - 70 - 610, 'rgba(16,185,129,0.16)', 'الصلاة القادمة', `${d.next.title} · ${d.next.time}`, `بعد ${d.next.mins >= 60 ? Math.floor(d.next.mins / 60) + ' س ' : ''}${d.next.mins % 60} د`);
    if (d.match) { const m = d.match; tile(70, m.live ? 'rgba(244,63,94,0.18)' : 'rgba(56,189,248,0.14)', m.live ? '🔴 مباشر الآن' : 'مباراتك اليوم', `${m.home.name} ${m.live ? (m.score.away ?? 0) + '-' + (m.score.home ?? 0) : '× ' } ${m.away.name}`.replace('×  ', '× '), m.live ? (m.elapsed ? 'الدقيقة ' + m.elapsed : '') : m.time + (m.league ? ' · ' + m.league : '')); }
    // devices
    T('أجهزتك المتصلة', w - 70, 490, 30, 'rgba(255,255,255,0.55)', 700);
    const devs = (d.devices || []).slice(0, 5);
    devs.forEach((dv, i) => {
      const bw = 240, x = w - 70 - (i + 1) * bw - i * 18, y = 515;
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; roundRect(ctx, x, y, bw, 190, 34); ctx.fill();
      deviceIcon(ctx, dv.kind, x + bw / 2, y + 66, 92);
      ctx.fillStyle = '#34d399'; ctx.shadowColor = '#34d399'; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(x + bw / 2 + 52, y + 30, 13, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      T((KIND_AR[dv.kind] || dv.name) + (dv.id === this.app.hub?.me?.id ? ' · هنا' : ''), x + bw / 2, y + 150, 30, '#fff', 800, 'center');
      if (dv.playing?.title) T('▶ ' + dv.playing.title.slice(0, 18), x + bw / 2, y + 180, 20, 'rgba(255,255,255,0.55)', 600, 'center');
    });
    if (!devs.length) T('لا أجهزة أخرى متصلة الآن', w - 70, 560, 30, 'rgba(255,255,255,0.5)', 600);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4 * h / w), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }));
    mesh.renderOrder = 940;
    mesh.userData.interact = { type: 'button', click: () => { this.close(); return true; } };
    const W = this.W, yaw = W.forwardYaw(), hd = W.headLocal();
    mesh.position.set(hd.x - Math.sin(yaw) * 1.8, hd.y + 0.05, hd.z - Math.cos(yaw) * 1.8); mesh.lookAt(hd.x, hd.y + 0.05, hd.z);
    W.root.add(mesh); this.card = mesh; this.targets = [mesh]; this.app.interaction?.setTargets();
    blip('open', settings.sounds);
    if (settings.welcomeVoice !== false) speak(`${d.greet}. اليوم ${d.date.weekday} ${d.date.day} ${d.date.month}` + (d.next ? `. ${d.next.title} الساعة ${d.next.time}` : '') + (d.match?.live ? `. ${d.match.home.name} ${d.match.score.home ?? 0} ${d.match.away.name} ${d.match.score.away ?? 0}` : ''));
    clearTimeout(this.t); this.t = setTimeout(() => this.close(), 12000);
  }
  close() { if (!this.card) return; this.card.removeFromParent(); this.card.material.map.dispose(); this.card = null; this.targets = []; this.app.interaction?.setTargets(); }
  enter() { setTimeout(() => this.show(), 1800); }

  // ---------------------------------------------------------------- shared clipboard (from «المركز»)
  clip(text, from) {
    const a = this.app, url = /^https?:\/\/\S+$/i.test(text.trim());
    a.notify({ icon: '📋', title: 'من ' + from, body: text.slice(0, 90), important: true,
      actions: [...(url ? [['افتح', () => a.windows.open({ kind: 'web', url: text.trim(), title: text.trim() })]] : []), ['انسخ', () => navigator.clipboard?.writeText(text).catch(() => {})]] });
  }
  async sendClipboard() {
    try { const t = (await navigator.clipboard.readText()).trim(); if (!t) return this.app.toast('الحافظة فارغة', 1500); this.app.hub?.op({ op: 'send', to: 'all', msg: { type: 'clip', text: t.slice(0, 2000) } }); this.app.toast('📋 أُرسل إلى أجهزتك', 1800); }
    catch { this.app.toast('اسمح بقراءة الحافظة ثم أعد المحاولة', 2500); }
  }

  // ---------------------------------------------------------------- وضع الصلاة
  update(now) {
    if (now - (this.tick || 0) < 15000) return; this.tick = now;
    if (now - (this.fetchedAt || 0) > 5 * 60e3) { this.fetchedAt = now; fetch(API + '/hub/welcome').then(r => r.json()).then(d => { if (d?.next) this.next = { ...d.next, at: d.next.at }; }).catch(() => {}); }
    const p = this.next; if (!p?.at) return;
    const t = Date.now(), key = p.title + p.at;
    if (t >= p.at - 2 * 60e3 && t < p.at && !this.handled[key]) { this.handled[key] = 'soon'; this.app.notify({ icon: '🕌', title: 'أذان ' + p.title + ' بعد دقيقتين', body: 'ستتوقف الفيديوهات وحدها', important: true }); }
    if (t >= p.at && t < p.at + 3 * 60e3 && this.handled[key] !== 'azan') {
      this.handled[key] = 'azan';
      const playing = (this.app.extras?.mediaWindows?.() || []).filter(w => w.video && !w.video.paused);
      if (settings.prayerPause !== false) playing.forEach(w => { w.userPaused = true; w.video.pause(); });
      this.paused = playing;
      speak('حان الآن موعد أذان ' + p.title);
      this.app.notify({ icon: '🕌', title: 'حان أذان ' + p.title, body: playing.length ? 'أوقفنا الفيديو · تابع بعد الصلاة' : '', important: true,
        actions: playing.length ? [['تابع', () => this.resume()]] : [] });
    }
  }
  resume() { (this.paused || []).forEach(w => { w.userPaused = false; w.video?.play().catch(() => {}); }); this.paused = null; }
}
