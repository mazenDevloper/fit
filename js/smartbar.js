// «الشريط الذكي»: a glass bar fixed below your view (it stays in the room and only follows when you turn away).
// It sets Madar itself: the environment, immersion, the glass, sharpness, and the sound of what plays. Every item works the same way: select it (look + pinch, OK on a remote,
// a tap), then slide left / right - a pinch-drag on the bar, the remote's or the controller's arrows - to lower / raise.
import * as THREE from 'three';
import { CanvasPanel, icon, blip } from './ui.js';
import { material, label, SYS, GLASS, setGlass } from './vos.js';
import { ENVS, ENV_ORDER, envKey } from './envs.js';
import { redrawFrameGlass } from './windows.js';
import { settings, saveSettings } from './config.js';

const W_M = 1.15, H_M = 0.12, DOT = 0.085, DIST = 1.05, Y = -0.34, FOLLOW = 0.6, IDLE = 10000;   // metres; FOLLOW = how far you turn before it follows (rad); IDLE = folds back after
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class SmartBar {
  constructor(app) {
    this.app = app; this.active = null; this.acc = 0; this.activeAt = 0; this.yaw = null;
    this.panel = new CanvasPanel(W_M, H_M, (ctx, W, H, p) => this.draw(ctx, W, H, p), { pxPerM: 1400 });
    this.mesh = this.panel.mesh;
    this.mesh.material.depthTest = false; this.mesh.renderOrder = 955;
    const P = this.panel;
    // a "surface" that scrolls: a pinch-drag across the bar slides the selected item's value
    this.mesh.userData.interact = {
      type: 'surface', scroll: () => !!this.active, toPx: uv => [uv.x * P.w, (1 - uv.y) * P.h],
      scrollBy: dx => this.slide(dx), click: hit => P.onClick(hit), hover: (on, hit) => P.onHover(on, hit),
    };
    app.windows.root.add(this.mesh);   // the room's frame (same as the windows), so it stays put as you look around
    // folded: one small glass circle; looked at + pinched (or OK) it opens - the glass grows wider and taller into the bar
    this.dot = new CanvasPanel(DOT, DOT, (ctx, W, H, p) => {
      material(ctx, 2, 2, W - 4, H - 4, (W - 4) / 2);
      const hov = p.isHover('dot'); if (hov) { ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 3, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill(); }
      icon(ctx, 'sliders', W / 2, H / 2, W * 0.42, '#fff');
      p.region(0, 0, W, H, () => this.expand(), 'dot');
    }, { pxPerM: 1800 });
    this.dot.mesh.material.depthTest = false; this.dot.mesh.renderOrder = 956;
    app.windows.root.add(this.dot.mesh);
    const hv = this.mesh.userData.interact.hover;
    this.mesh.userData.interact.hover = (on, hit) => { if (on) this.usedAt = performance.now(); hv(on, hit); };
    this.expanded = false; this.k = 0; this.usedAt = 0;
  }
  get targets() { return !this.mesh.parent ? [] : this.expanded ? (this.mesh.visible ? [this.mesh] : []) : (this.dot.mesh.visible ? [this.dot.mesh] : []); }
  expand() { if (this.expanded) return; this.expanded = true; this.usedAt = performance.now(); blip('open', settings.sounds); this.dirty = true; this.app.interaction?.setTargets(); }
  fold() { if (!this.expanded) return; this.expanded = false; this.active = null; this.app.interaction?.setTargets(); }
  get on() { return settings.smartBar !== false; }

  // ---- what the bar holds now
  focus() {
    const a = this.app, ws = a.windows.windows;
    const pointed = a.controls?.pointedWindow?.();
    if (pointed && ws.includes(pointed)) this.last = pointed;
    if (this.last && !ws.includes(this.last)) this.last = null;
    return this.last || a.extras?.mediaWindows?.()[0] || ws.filter(w => w.kind === 'video' || w.kind === 'web').slice(-1)[0] || null;
  }
  items() {
    // Madar itself, not a window: the place you are in, how much of it, the glass, the sharpness - and the sound of
    // what plays
    const a = this.app, out = [];
    const cur = envKey(settings.environment), order = ENV_ORDER, i = Math.max(0, order.indexOf(cur));
    out.push({ id: 'env', ic: 'globe', name: 'البيئة', val: ENVS[cur]?.label || cur, f: i / Math.max(1, order.length - 1),
      step: d => { const k = order[(i + d + order.length) % order.length]; saveSettings({ environment: k }); a.renderEnvChoices?.(); a.control?.redraw(); } });
    const portal = a.extras?.portal;
    if (portal?.set) { const lv = portal.level ?? settings.immersion ?? 1; out.push({ id: 'imm', ic: 'sun', name: 'الانغماس', val: Math.round(lv * 100) + '%', f: lv,
      step: d => portal.set(clamp(Math.round(((portal.level ?? settings.immersion ?? 1) + d * 0.1) * 10) / 10, 0, 1)) }); }
    out.push({ id: 'glass', ic: 'stack', name: 'الزجاج', val: Math.round(GLASS * 100) + '%', f: (GLASS - 0.3) / 1.3,
      step: d => { setGlass(Math.round((GLASS + d * 0.1) * 10) / 10); saveSettings({ glass: GLASS }); this.repaintGlass(); } });
    out.push({ id: 'sharp', ic: 'eye', name: 'الحدة', val: Math.round(settings.sharpen * 100) + '%', f: settings.sharpen / 1.5,
      step: d => { saveSettings({ sharpen: clamp(Math.round((settings.sharpen + d * 0.05) * 100) / 100, 0, 1.5) }); a.renderer.applySettings(); } });
    const w = a.extras?.mediaWindows?.().find(x => x.video && !x.video.paused) || a.extras?.mediaWindows?.()[0];
    if (w?.setVolume) out.push({ id: 'vol', ic: w.isMuted?.() ? 'mute' : 'sound', name: 'الصوت', val: Math.round((w.vol ?? 1) * 100) + '%', f: w.vol ?? 1,
      step: d => w.setVolume((w.vol ?? 1) + d * 0.05, false) });
    return out;
  }
  // every glass surface drawn again with the new amount of glass
  repaintGlass() {
    const a = this.app;
    redrawFrameGlass();
    a.windows.windows.forEach(w => { try { w.toolbar?.redraw(); w.panel?.redraw(); w.more?.redraw(); if (w.panelKind) w.draw?.(); } catch {} });
    try { a.launcher?.panel?.redraw(); a.control?.redraw(); a.notifier?.panel?.redraw(); } catch {}
  }

  // ---- input: select, then slide
  select(id) {
    blip('tap', settings.sounds); this.usedAt = performance.now();
    this.active = this.active === id ? null : id; this.activeAt = performance.now(); this.acc = 0;
    if (this.active) this.app.toast('↔ مرّر يميناً لزيادة «' + (this.list.find(x => x.id === id)?.name || '') + '» ويساراً لإنقاصها', 2200);
    this.panel.redraw();
  }
  step(d) {
    const it = (this.list || []).find(x => x.id === this.active); if (!it) return false;
    it.step(d); this.activeAt = this.usedAt = performance.now(); blip('tap', settings.sounds);
    this.list = this.items(); this.panel.redraw(); return true;
  }
  // a pinch-drag: the content follows the hand, so a hand moving right gives dx < 0 → raise
  slide(dx) {
    if (!this.active) return;
    this.acc += -dx;
    while (Math.abs(this.acc) >= 46) { const d = Math.sign(this.acc); this.acc -= d * 46; this.step(d); }
  }
  // the remote's / controller's left-right arrows while an item is selected (for 8 s after the last use)
  takeArrow(dir) {
    if (!this.on || !this.expanded || !this.active || performance.now() - this.activeAt > 8000) return false;
    return this.step(dir);
  }

  draw(ctx, W, H, p) {
    const list = this.list || [];
    material(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2);
    const n = Math.max(1, list.length), cw = (W - 24) / n;
    list.forEach((it, i) => {
      const x = W - 12 - (i + 1) * cw, on = it.id === this.active, hov = p.isHover(it.id);   // right to left
      if (on || hov) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + 4, 10, cw - 8, H - 20, (H - 20) / 2) : ctx.rect(x + 4, 10, cw - 8, H - 20); ctx.fillStyle = on ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.18)'; ctx.fill(); }
      const fg = on ? '#141824' : '#fff';
      icon(ctx, it.ic, x + cw - H * 0.36, H / 2, H * 0.34, on ? SYS.blue : '#fff');
      label(ctx, it.name, x + cw - H * 0.66, H * 0.36, H * 0.2, { weight: 700, color: fg, align: 'right', maxWidth: cw - H * 0.75 });
      label(ctx, it.val, x + cw - H * 0.66, H * 0.66, H * 0.19, { weight: 600, color: on ? '#141824' : SYS.label2, align: 'right', dir: 'ltr', maxWidth: cw - H * 0.75 });
      // the selected item: a thin level line and the arrows that say "slide"
      if (on) {
        const lx = x + 18, lw = cw - 36, ly = H - 20;
        ctx.fillStyle = 'rgba(20,24,36,0.18)'; ctx.fillRect(lx, ly, lw, 4);
        ctx.fillStyle = SYS.blue; ctx.fillRect(lx, ly, lw * clamp(it.f ?? 0.5, 0, 1), 4);
        label(ctx, '‹', x + 14, H / 2, H * 0.34, { weight: 700, color: '#141824', dir: 'ltr' });
        label(ctx, '›', x + cw - 10, H / 2, H * 0.34, { weight: 700, color: '#141824', dir: 'ltr' });
      }
      p.region(x, 0, cw, H, () => this.select(it.id), it.id);
    });
  }

  update(now) {
    const a = this.app, show = this.on && a.active && !a.launcher?.group.visible && !a.windows.cinema;
    // open / fold: the glass grows from the circle into the bar (wider and taller), with a soft spring-like ease
    if (this.expanded && now - this.usedAt > IDLE && !this.panel.hover) this.fold();
    const goal = this.expanded ? 1 : 0, prevK = this.k;
    this.k += (goal - this.k) * Math.min(1, (now - (this.lastNow || now)) / 1000 * 9); this.lastNow = now;
    if (Math.abs(goal - this.k) < 0.002) this.k = goal;
    const e = 1 - Math.pow(1 - this.k, 3);
    const barOn = show && this.k > 0.01, dotOn = show && this.k < 0.35;
    if (this.mesh.visible !== barOn || this.dot.mesh.visible !== dotOn) { this.mesh.visible = barOn; this.dot.mesh.visible = dotOn; a.interaction?.setTargets(); }
    this.mesh.scale.set(DOT / W_M + (1 - DOT / W_M) * e, DOT / H_M * 0.9 + (1 - DOT / H_M * 0.9) * e, 1);
    this.mesh.material.opacity = Math.min(1, e * 1.6);
    this.dot.mesh.material.opacity = Math.max(0, 1 - this.k * 3);
    if (!show) return;
    // fixed in the room below your view; follows only when you turn away (lazy follow, like visionOS)
    const yaw = a.windows.forwardYaw();
    if (this.yaw == null) this.yaw = yaw;
    let d = yaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > FOLLOW) this.yaw += d * 0.08;
    const h = a.windows.headLocal?.() || new THREE.Vector3();
    this.mesh.position.set(h.x - Math.sin(this.yaw) * DIST, h.y + Y, h.z - Math.cos(this.yaw) * DIST);
    this.mesh.lookAt(h.x, h.y + Y * 0.4, h.z);
    this.dot.mesh.position.copy(this.mesh.position); this.dot.mesh.quaternion.copy(this.mesh.quaternion);
    if (this.active && now - this.activeAt > 12000) { this.active = null; this.dirty = true; }
    // the items follow what is open and what you point at; the values (a video's time) tick once a second
    if (now - (this.at || 0) > 1000 || this.dirty) {
      this.at = now; this.dirty = false;
      const list = this.items(), sig = list.map(x => x.id + x.val).join('|') + this.active;
      if (this.active && !list.some(x => x.id === this.active)) this.active = null;
      this.list = list;
      if (sig !== this.sig) { this.sig = sig; this.panel.redraw(); }
    }
  }
}
function fmt(s) { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
