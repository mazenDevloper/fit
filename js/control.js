// visionOS 27-style system pieces: the three-panel Control Center (opened by looking up at the chevron,
// from the launcher or by voice) and notifications that grow when you look at them.
import * as THREE from 'three';
import { CanvasPanel, glass, text, icon, roundRect, COLORS, blip } from './ui.js';
import { settings, saveSettings } from './config.js';
import { ENVS, ENV_ORDER, envKey } from './envs.js';

const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const p2 = n => String(n).padStart(2, '0');
const UP = new THREE.Vector3(0, 1, 0);

// Places a group d metres along the horizontal direction you face, at height y, facing you.
function placeAhead(app, group, d, y) {
  const f = app.headForward.clone(); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
  group.position.set(f.x * d, y, f.z * d);
  group.lookAt(0, y, 0);
}

// A round coloured toggle with a short label under it (on = colour, off = grey).
function roundToggle(ctx, p, cx, cy, r, ic, label, on, colors, act, id) {
  const hov = p.isHover(id);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = r * 0.3;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  const [a, b] = on ? colors : ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.12)'];
  g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fill(); ctx.restore();
  if (hov) { ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 4; ctx.stroke(); }
  icon(ctx, ic, cx, cy, r * 0.95, '#fff');
  text(ctx, label, cx, cy + r + 30, 25, { weight: 700, maxWidth: r * 2.6, fit: true });
  p.region(cx - r * 1.3, cy - r * 1.1, r * 2.6, r * 2.6, () => { blip('tap', settings.sounds); act(); }, id);
}

export class ControlCenter {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group(); this.group.visible = false;
    const mk = (w, h, fn) => { const c = new CanvasPanel(w, h, fn, { pxPerM: 1300 }); c.mesh.material.depthTest = false; c.mesh.renderOrder = 950; this.group.add(c.mesh); return c; };
    // left → right as you see them: environment · quick controls · status
    this.env = mk(0.42, 0.56, (ctx, W, H, p) => this.drawEnv(ctx, W, H, p));
    this.quick = mk(0.56, 0.56, (ctx, W, H, p) => this.drawQuick(ctx, W, H, p));
    this.status = mk(0.42, 0.56, (ctx, W, H, p) => this.drawStatus(ctx, W, H, p));
    // three panels on a gentle arc around you
    [[this.env, -0.5, 0.32], [this.quick, 0, 0], [this.status, 0.5, -0.32]].forEach(([c, x, ry]) => { c.mesh.position.set(x, 0, Math.abs(x) * 0.18); c.mesh.rotation.y = ry; });
    this.battery = null;
    try { navigator.getBattery?.().then(b => { this.battery = b; b.addEventListener('levelchange', () => this.redraw()); b.addEventListener('chargingchange', () => this.redraw()); }); } catch {}
    window.MadarIOS?.on?.('battery', b => { this.battery = { level: b.level, charging: b.charging }; this.redraw(); });
  }
  get targets() { return this.group.visible ? [this.env.mesh, this.quick.mesh, this.status.mesh] : []; }
  redraw() { if (!this.group.visible) return; this.env.redraw(); this.quick.redraw(); this.status.redraw(); }
  open() {
    placeAhead(this.app, this.group, settings.viewMode !== 'sbs' ? 1.6 : 1.15, 0.06);
    this.group.visible = true; this.redraw(); this.app.interaction?.setTargets(); blip('open', settings.sounds);
  }
  close() { this.group.visible = false; this.app.interaction?.setTargets(); }
  toggle() { this.group.visible ? this.close() : this.open(); }
  update(now) {
    if (!this.group.visible) return;
    if (now - (this.tick || 0) > 1000) { this.tick = now; this.status.redraw(); }   // the clock and countdowns
  }
  frame(ctx, W, H, title) {
    roundRect(ctx, 0, 0, W, H, 56); ctx.fillStyle = 'rgba(14,16,24,0.6)'; ctx.fill();
    glass(ctx, 0, 0, W, H, 56);
    text(ctx, title, W - 46, 58, 32, { align: 'right', weight: 800, color: COLORS.dim });
  }
  drawStatus(ctx, W, H) {
    this.frame(ctx, W, H, 'الحالة');
    const d = new Date(), h = d.getHours() % 12 || 12;
    text(ctx, `${h}:${p2(d.getMinutes())}`, W / 2, 170, 110, { weight: 800, dir: 'ltr' });
    text(ctx, AR_DAYS[d.getDay()] + ' ' + d.toLocaleDateString('ar', { day: 'numeric', month: 'long' }), W / 2, 250, 32, { weight: 700, color: COLORS.dim });
    const rows = [];
    const b = this.battery;
    if (b) rows.push(['🔋', 'البطارية', Math.round(b.level * 100) + '%' + (b.charging ? ' ⚡' : '')]);
    const ev = this.app.sports?.island?.nextEvent?.();
    if (ev) { const s = Math.max(0, Math.floor((ev.at - Date.now()) / 1000)); rows.push(['🕌', ev.title, s >= 3600 ? Math.floor(s / 3600) + ':' + p2(Math.floor(s / 60) % 60) + ':' + p2(s % 60) : p2(Math.floor(s / 60)) + ':' + p2(s % 60)]); }
    const live = this.app.sports?.liveMine?.() || [];
    rows.push(['⚽', 'مباريات الآن', live.length ? live.length + ' مباشرة' : 'لا يوجد']);
    rows.push(['🪟', 'النوافذ', String(this.app.windows.windows.length)]);
    rows.push(['🌡', 'التبريد', settings.coolMax ? 'أقصى' : settings.cool ? 'يعمل' : 'متوقف']);
    rows.forEach(([e, l, v], i) => {
      const y = 320 + i * 72;
      roundRect(ctx, 30, y - 30, W - 60, 60, 30); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
      text(ctx, e + ' ' + l, W - 56, y, 28, { align: 'right', weight: 700, maxWidth: W * 0.58, fit: true });
      text(ctx, v, 56, y, 28, { align: 'left', weight: 800, dir: 'ltr', color: COLORS.accent });
    });
  }
  drawQuick(ctx, W, H, p) {
    this.frame(ctx, W, H, 'التحكم السريع');
    const a = this.app;
    const items = [
      ['eye', 'النظر', settings.dwell, ['#818cf8', '#4f46e5'], () => saveSettings({ dwell: !settings.dwell })],
      ['hand', 'اليد', settings.handsEnabled, ['#fbbf24', '#ea580c'], () => saveSettings({ handsEnabled: !settings.handsEnabled })],
      ['sound', 'الأصوات', settings.sounds, ['#f472b6', '#db2777'], () => saveSettings({ sounds: !settings.sounds })],
      ['snow', 'التبريد', settings.coolMax, ['#67e8f9', '#0891b2'], () => { saveSettings({ coolMax: !settings.coolMax, cool: settings.cool || !settings.coolMax }); a.renderer.resize(); }],
      ['sun', 'رسم ذكي', settings.smartRender !== false, ['#fbbf24', '#d97706'], () => saveSettings({ smartRender: settings.smartRender === false })],
      ['curve', 'منحنية', !!settings.curveAll, ['#60a5fa', '#2563eb'], () => a.windows.setCurveAll(!settings.curveAll)],
      ['ball', 'الجزيرة', settings.island !== false, ['#4ade80', '#15803d'], () => saveSettings({ island: settings.island === false })],
      ['target', 'التمركز', false, ['#2dd4bf', '#0d9488'], () => { a.recenter(); this.close(); }],
      ['stack', 'ترتيب', false, ['#a78bfa', '#7c3aed'], () => { a.windows.arrange(); this.close(); }],
    ];
    const cols = 3, r = 66, cw = (W - 60) / cols, top = 170, rh = 190;
    items.forEach(([ic, l, on, col, act], i) => {
      const c = i % cols, row = Math.floor(i / cols);
      roundToggle(ctx, p, W - 30 - cw * (c + 0.5), top + row * rh, r, ic, l, on, col, () => { act(); this.redraw(); }, 'q' + i);
    });
  }
  drawEnv(ctx, W, H, p) {
    this.frame(ctx, W, H, 'البيئة');
    const cur = envKey(settings.environment), list = ENV_ORDER, rh = Math.min(64, (H - 110) / list.length);
    list.forEach((k, i) => {
      const y = 96 + i * rh, id = 'e' + k, on = k === cur, hov = p.isHover(id);
      roundRect(ctx, 26, y + 3, W - 52, rh - 6, (rh - 6) / 2);
      ctx.fillStyle = on ? 'rgba(255,255,255,0.9)' : hov ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)'; ctx.fill();
      text(ctx, ENVS[k].label, W / 2, y + rh / 2 + 1, Math.min(27, rh * 0.42), { weight: 800, color: on ? '#151821' : COLORS.text, maxWidth: W - 80, fit: true });
      p.region(26, y, W - 52, rh, () => { blip('tap', settings.sounds); saveSettings({ environment: k }); this.app.renderEnvChoices?.(); this.redraw(); }, id);
    });
  }
}

// The small chevron that appears when you look up; dwell on it (or pinch) to open the Control Center.
export class LookUp {
  constructor(app) {
    this.app = app;
    this.panel = new CanvasPanel(0.11, 0.07, (ctx, W, H, p) => {
      const hov = p.isHover('cc');
      roundRect(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2); ctx.fillStyle = hov ? 'rgba(255,255,255,0.55)' : 'rgba(30,34,46,0.6)'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = H * 0.09; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(W * 0.32, H * 0.62); ctx.lineTo(W / 2, H * 0.38); ctx.lineTo(W * 0.68, H * 0.62); ctx.stroke();
      p.region(0, 0, W, H, () => { blip('tap', settings.sounds); this.app.control.open(); this.mesh.visible = false; }, 'cc');
    }, { pxPerM: 1200 });
    this.mesh = this.panel.mesh; this.mesh.visible = false;
    this.mesh.material.depthTest = false; this.mesh.renderOrder = 960;
  }
  get targets() { return this.mesh.visible ? [this.mesh] : []; }
  update() {
    const f = this.app.headForward, pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
    const want = pitch > 0.42 && !this.app.control.group.visible && !this.app.launcher.group.visible;
    if (want && !this.mesh.visible) {   // appear where you look, then stay put so it can be looked at
      const h = f.clone(); h.y = 0; h.normalize();
      this.mesh.position.copy(h.multiplyScalar(1.1)).add(new THREE.Vector3(0, 0.62, 0));
      this.mesh.lookAt(0, 0, 0);
      this.mesh.visible = true; this.app.interaction?.setTargets();
    } else if (!want && this.mesh.visible && pitch < 0.3) { this.mesh.visible = false; this.app.interaction?.setTargets(); }
  }
}

// Notifications: a small pill appears up-right in your view and stays there; look at it and it grows to show
// the details and its buttons. Unlooked, it leaves after a while.
export class Notifier {
  constructor(app) {
    this.app = app; this.queue = []; this.cur = null;
    this.panel = new CanvasPanel(0.5, 0.26, (ctx, W, H, p) => this.draw(ctx, W, H, p), { pxPerM: 1300 });
    this.mesh = this.panel.mesh; this.mesh.visible = false;
    this.mesh.material.depthTest = false; this.mesh.renderOrder = 970;
    this.grow = 0;
  }
  get targets() { return this.mesh.visible ? [this.mesh] : []; }
  // n = { icon: emoji, title, body, actions: [[label, fn]] }
  push(n) { this.queue.push(n); if (!this.cur) this.next(); }
  next() {
    this.cur = this.queue.shift() || null;
    if (!this.cur) { this.mesh.visible = false; this.app.interaction?.setTargets(); return; }
    // anchored in the room, up and to the right of where you look now
    const f = this.app.headForward.clone(); f.y = 0; f.normalize();
    const right = new THREE.Vector3().crossVectors(f, UP).normalize();
    this.mesh.position.copy(f.multiplyScalar(1.2)).add(right.multiplyScalar(0.32)).add(new THREE.Vector3(0, 0.3, 0));
    this.mesh.lookAt(0, this.mesh.position.y, 0);
    this.t0 = performance.now(); this.lookT = 0; this.grow = 0; this.seen = false;
    this.mesh.visible = true; this.panel.redraw(); this.app.interaction?.setTargets();
    blip('open', settings.sounds);
  }
  draw(ctx, W, H, p) {
    const n = this.cur; if (!n) return;
    const g = this.grow, ph = H * (0.34 + 0.66 * g);   // pill height grows to the full card
    const y0 = 0, w = W * (0.62 + 0.38 * g), x0 = (W - w) / 2;
    roundRect(ctx, x0, y0, w, ph, Math.min(ph / 2, 60)); ctx.fillStyle = 'rgba(20,22,30,0.88)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 3; ctx.stroke();
    const th = H * 0.34;
    text(ctx, (n.icon || '🔔') + ' ' + n.title, W / 2, y0 + th / 2 + 2, th * 0.4, { weight: 800, maxWidth: w - 50, fit: true, dir: 'auto' });
    if (g < 0.6) return;
    ctx.globalAlpha = (g - 0.6) / 0.4;
    if (n.body) text(ctx, n.body, W / 2, y0 + th + H * 0.12, H * 0.09, { weight: 600, color: '#d5ddef', maxWidth: w - 60, fit: true, dir: 'auto' });
    const acts = [...(n.actions || []), ['إغلاق', () => {}]], bw = (w - 40 - (acts.length - 1) * 14) / acts.length, by = ph - H * 0.2;
    acts.forEach(([l, fn], i) => {
      const x = x0 + 20 + i * (bw + 14), id = 'a' + i, hov = p.isHover(id);
      roundRect(ctx, x, by, bw, H * 0.15, H * 0.075); ctx.fillStyle = hov ? 'rgba(255,255,255,0.4)' : i === 0 && acts.length > 1 ? 'rgba(124,196,255,0.4)' : 'rgba(255,255,255,0.12)'; ctx.fill();
      text(ctx, l, x + bw / 2, by + H * 0.075 + 1, H * 0.065, { weight: 800, maxWidth: bw - 16, fit: true });
      p.region(x, by, bw, H * 0.15, () => { blip('tap', settings.sounds); try { fn(); } catch {} this.next(); }, id);
    });
    ctx.globalAlpha = 1;
  }
  update(now) {
    if (!this.cur) return;
    // looking at it? (the head's direction within ~9° of the pill)
    const w = this.mesh.getWorldPosition(new THREE.Vector3()).normalize();
    const looking = w.dot(this.app.headForward) > Math.cos(9 * Math.PI / 180);
    if (looking) { this.lookT = this.lookT || now; this.seen = true; } else this.lookT = 0;
    const want = looking && now - this.lookT > 250 ? 1 : this.seen && now - this.lastLook < 2500 ? 1 : 0;
    if (looking) this.lastLook = now;
    const g = this.grow + Math.sign(want - this.grow) * Math.min(Math.abs(want - this.grow), 0.12);
    if (g !== this.grow) { this.grow = g; this.panel.redraw(); }
    // unlooked: away after 7 s; once opened, after 5 s of looking elsewhere
    if ((!this.seen && now - this.t0 > 7000) || (this.seen && !looking && now - this.lastLook > 5000)) this.next();
  }
}
