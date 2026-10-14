// Non-headset controls.
// Phone mode: two virtual sticks (move / look), buttons, and direct touch on windows.
// Laptop mode: keyboard + mouse, front camera hand gestures, full screen.
// Game controllers work in every mode (Quest-style).
import * as THREE from 'three';
import { settings, saveSettings, pxPerMm } from './config.js';
import { blip } from './ui.js';

const STICK_R = 40;

export class Controls {
  constructor(app) {
    this.app = app;
    this.nav = new THREE.Vector3();          // how far the viewer moved with sticks / keys
    this.look = { yaw: 0, pitch: 0 };         // extra look from the right stick, keys and mouse
    this.sticks = { move: { x: 0, y: 0, id: null }, look: { x: 0, y: 0, id: null } };
    this.touches = new Map();
    this.keys = new Set();
    this.pad = { prev: [] };
    this.padPtr = { tx: 0, ty: 0, down: false, last: -1e9, active(now) { return this.down || now - this.last < 1500; } };
    this.el = document.getElementById('controls');
    this.el.querySelectorAll('.joy').forEach(j => this.bindStick(j, this.sticks[j.dataset.stick]));
    this.el.querySelectorAll('[data-act]').forEach(b => {
      const go = e => { e.preventDefault(); e.stopPropagation(); blip('tap', settings.sounds); this.action(b.dataset.act); };
      b.addEventListener('touchend', go, { passive: false });
      b.addEventListener('click', go);
      b.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
      b.addEventListener('mousedown', e => e.stopPropagation());
    });
    this.bindDesktop();
    this.sync();
  }
  get mode() { return settings.viewMode; }
  get direct() { return this.mode !== 'sbs'; }        // phone + laptop: point and touch directly
  sync() {
    this.el.hidden = !this.direct;
    this.el.dataset.mode = this.mode;
    this.app.stage.classList.toggle('direct', this.direct);
    document.body.classList.toggle('direct', this.direct);
  }
  action(a) {
    const app = this.app;
    if (a === 'menu') app.toggleLauncher();
    else if (a === 'recenter') { this.reset(); app.recenter(); }
    else if (a === 'exit') app.exit();
    else if (a === 'headset') app.setViewMode('sbs');
    else if (a === 'up' || a === 'down') this.nav.y += a === 'up' ? 0.15 : -0.15;
    else if (a === 'full') app.toggleFullscreen();
    else if (a === 'screen') app.showLocalScreen();
  }
  reset() { this.nav.set(0, 0, 0); this.look.yaw = 0; this.look.pitch = 0; this.orbit = null; }
  // Orbit: inputs that would turn the view instead carry you around the chosen model.
  toggleOrbit(win) {
    if (this.orbit && this.orbit.win === win) { this.orbit = null; this.app.toast('أُلغي الدوران حول المجسم'); return; }
    this.orbit = { win };
    this.app.toast(settings.viewMode === 'sbs' ? 'دوران: اقرص في الفراغ واسحب يميناً ويساراً' : 'دوران: عصا النظر أو الأسهم أو السحب', 3500);
  }
  yawVectors() {
    const yaw = Math.atan2(-this.app.headForward.x, -this.app.headForward.z);
    return [new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))];
  }
  // Move the viewer: right / forward in metres (used by hand "grab the world" dragging).
  moveBy(r, f) {
    if (!settings.moveEnabled) return;
    const [right, fwd] = this.yawVectors();
    this.nav.addScaledVector(right, r).addScaledVector(fwd, f);
  }
  orbitBy(a) { this.orbitDelta = (this.orbitDelta || 0) + a; }

  bindStick(base, st) {
    const knob = base.querySelector('.knob');
    const move = t => {
      const r = base.getBoundingClientRect();
      const s = this.app.orientation.toStage(t.clientX, t.clientY);
      const c = this.app.orientation.toStage(r.left + r.width / 2, r.top + r.height / 2);
      let dx = (s.x - c.x) / (base.offsetWidth / 2), dy = (s.y - c.y) / (base.offsetWidth / 2);
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      st.x = dx; st.y = dy;
      knob.style.transform = `translate(${dx * STICK_R}px, ${dy * STICK_R}px)`;
    };
    const stop = e => e.preventDefault() || e.stopPropagation();
    base.addEventListener('touchstart', e => { stop(e); const t = e.changedTouches[0]; st.id = t.identifier; move(t); }, { passive: false });
    base.addEventListener('touchmove', e => { stop(e); for (const t of e.changedTouches) if (t.identifier === st.id) move(t); }, { passive: false });
    const end = e => { stop(e); for (const t of e.changedTouches) if (t.identifier === st.id) { st.x = st.y = 0; st.id = null; knob.style.transform = ''; } };
    base.addEventListener('touchend', end, { passive: false });
    base.addEventListener('touchcancel', end, { passive: false });
  }

  // ---- Direct touch / mouse on windows: behaves like a pinching hand at that point ----
  touchDown(list) { for (const t of list) this.touches.set(t.identifier, this.app.orientation.toStage(t.clientX, t.clientY)); }
  touchMove(list) { for (const t of list) if (this.touches.has(t.identifier)) this.touches.set(t.identifier, this.app.orientation.toStage(t.clientX, t.clientY)); }
  touchUp(list) { for (const t of list) this.touches.delete(t.identifier); }
  screenDir(x, y) {
    const m = this.app.renderer.monoTan(), W = this.app.orientation.width, H = this.app.orientation.height;
    return [(x / W * 2 - 1) * m.x, (1 - y / H * 2) * m.y];
  }
  // Which pointer drives the "hand" slots this frame: touches > mouse > game controller > (real hands).
  applyTouches(now) {
    const slots = this.app.hands.slots;
    const pts = this.direct ? [...this.touches.values()].slice(0, 2) : [];
    if (pts.length || this.touchWas) {
      slots.forEach((s, i) => {
        const p = pts[i];
        if (p) {
          const [tx, ty] = this.screenDir(p.x, p.y);
          Object.assign(s, { active: true, seen: now + 400, pinch: true, strength: 1, depth: 0.45, tx, ty, pts: null });
        } else if (s.pinch) { s.pinch = false; s.strength = 0; s.seen = now + 60; }
        else s.active = false;
      });
      this.touchWas = pts.length > 0;
      if (this.touchWas) return true;
    }
    // Mouse (any mode) and controller: one pointer in slot 0 while in use.
    const v = this.mouse.active(now) ? this.mouse : this.padPtr.active(now) ? this.padPtr : null;
    if (v || this.virtWas) {
      const s = slots[0];
      if (v) Object.assign(s, { active: true, seen: now + 300, pinch: v.down, strength: v.down ? 1 : 0, depth: 0.45, tx: v.tx, ty: v.ty, pts: null });
      else if (s.pinch) { s.pinch = false; s.strength = 0; s.seen = now + 60; }
      else s.active = false;
      slots[1].active = false;
      this.virtWas = !!v || s.pinch;
      return true;
    }
    return false;
  }
  // Screen point → view direction (tan) for the current mode; in headset mode, through the lens of that eye.
  pointTan(x, y) {
    if (this.direct) return this.screenDir(x, y);
    const W = this.app.orientation.width, H = this.app.orientation.height, px = pxPerMm();
    const right = x >= W / 2;
    const cx = W / 2 + (right ? 1 : -1) * settings.lensSep * 0.5 * px, cy = H / 2 - settings.vOffset * px;
    const ox = (x - cx) / px / settings.screenToLens, oy = -(y - cy) / px / settings.screenToLens;
    const r2 = ox * ox + oy * oy, k = 1 + settings.k1 * r2 + settings.k2 * r2 * r2;
    return [ox * k, oy * k];
  }

  // ---- Laptop: keyboard, mouse, wheel ----
  bindDesktop() {
    const st = this.app.stage;
    let drag = null;
    const mouse = this.mouse = { tx: 0, ty: 0, down: false, last: -1e9, active(now) { return this.down || now - this.last < 2500; } };
    const isMouse = e => e.pointerType === 'mouse' || e.pointerType === 'pen';
    const setMouse = e => {
      const p = this.app.orientation.toStage(e.clientX, e.clientY);
      [mouse.tx, mouse.ty] = this.pointTan(p.x, p.y);
      mouse.last = performance.now();
      return p;
    };
    st.addEventListener('pointerdown', e => {
      if (!this.app.active || !isMouse(e)) return;
      e.preventDefault();
      if (e.button === 2) { this.app.toggleLauncher(); return; }          // right click = menu
      if (e.button !== 0) return;
      setMouse(e);
      const dir = new THREE.Vector3(mouse.tx, mouse.ty, -1).normalize().applyQuaternion(this.app.renderQ);
      // On a window or button: press like a pinch (click, drag, scroll). On empty space in phone/laptop: drag to look.
      if (this.app.interaction.cast(dir) || !this.direct) { mouse.down = true; drag = 'press'; }
      else drag = { x: e.clientX, y: e.clientY };
    });
    st.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('pointermove', e => {
      if (!this.app.active || !isMouse(e)) return;
      if (drag && drag !== 'press') {
        if (this.orbit) this.orbitBy(-(e.clientX - drag.x) * 0.006);
        else this.look.yaw -= (e.clientX - drag.x) * 0.0035;
        this.look.pitch = THREE.MathUtils.clamp(this.look.pitch - (e.clientY - drag.y) * 0.0035, -1.3, 1.3);
        drag.x = e.clientX; drag.y = e.clientY;
        return;
      }
      setMouse(e);
    });
    window.addEventListener('pointerup', e => { if (!isMouse(e)) return; mouse.down = false; drag = null; });
    st.addEventListener('wheel', e => {
      if (!this.app.active) return;
      e.preventDefault();
      const hit = this.app.interaction.pointers.find(p => p.active && p.hit)?.hit;
      const it = hit && hit.object.userData.interact, w = it && it.window;
      if (w && w.send && w.bridge && !e.ctrlKey) w.send({ type: 'scroll', dx: e.deltaX, dy: e.deltaY, x: 512, y: 320 });
      else if (w && w.scaleBy) w.scaleBy(e.deltaY < 0 ? 1.06 : 1 / 1.06);
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (!this.app.active) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ' || k === 'enter') { e.preventDefault(); this.app.onRealTap(); }
      else if (k === 'm' || k === 'tab') { e.preventDefault(); this.app.toggleLauncher(); }
      else if (k === 'r') { this.reset(); this.app.recenter(); }
      else if (k === 'f') this.app.toggleFullscreen();
      else if (k === 'c' && settings.viewMode === 'desktop') { if (!settings.eyeTrack) this.app.toggleEyeTrack(); else this.app.gaze.calibrate(); }
      else if (k === '+' || k === '=' || k === '-') {
        const hit = this.app.interaction.pointers.find(p => p.active && p.hit)?.hit;
        const w = hit && hit.object.userData.interact.window;
        if (w && w.scaleBy) w.scaleBy(k === '-' ? 1 / 1.12 : 1.12);
      }
      else if (k === 'escape' && !document.fullscreenElement) this.app.exit();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  update(dt) {
    const app = this.app, K = this.keys;
    let mx = 0, my = 0, lx = 0, ly = 0, up = 0;
    if (this.mode === 'mono') { mx = this.sticks.move.x; my = this.sticks.move.y; lx = this.sticks.look.x; ly = this.sticks.look.y; }
    // Keyboard (any mode): WASD move, arrows look, Q/E down/up.
    if (K.has('w')) my -= 1; if (K.has('s')) my += 1; if (K.has('a')) mx -= 1; if (K.has('d')) mx += 1;
    if (K.has('arrowleft')) lx -= 1; if (K.has('arrowright')) lx += 1; if (K.has('arrowup')) ly -= 1; if (K.has('arrowdown')) ly += 1;
    if (K.has('e')) up += 1; if (K.has('q')) up -= 1;
    this.pollPad(dt, (m, l) => { if (m) { mx = m[0]; my = m[1]; } if (l) { lx = l[0]; ly = l[1]; } });
    const dz = v => Math.abs(v) < 0.12 ? 0 : v;
    mx = dz(mx); my = dz(my); lx = dz(lx); ly = dz(ly);
    if (this.orbit && !this.orbit.win.group.parent) this.orbit = null;
    if (this.orbit) { this.orbitBy(-lx * 1.3 * dt); lx = 0; }
    this.look.yaw -= lx * 1.9 * dt;
    if (this.orbitDelta) {
      // Carry the viewer around the model and turn with it, so it stays in front.
      const a = this.orbitDelta; this.orbitDelta = 0;
      const c = this.orbit ? this.orbit.win.group.position : null;
      if (c) {
        const v = this.app.slam.pos.clone().add(this.nav).sub(c);
        v.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
        this.nav.copy(c).add(v).sub(this.app.slam.pos);
        this.look.yaw += a;
      }
    }
    this.look.pitch = THREE.MathUtils.clamp(this.look.pitch - ly * 1.4 * dt, -1.3, 1.3);
    const yaw = Math.atan2(-app.headForward.x, -app.headForward.z);
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const speed = 1.4;
    if (settings.moveEnabled) {
      this.nav.addScaledVector(right, mx * speed * dt).addScaledVector(fwd, -my * speed * dt);
      this.nav.y += up * speed * 0.6 * dt;
    }
    // The world moves opposite to the viewer (sticks/keys + walking).
    app.windows.root.position.copy(app.slam.pos).add(this.nav).negate();
  }
  // Apply look offset to the head rotation (yaw around world up, pitch around the view's right axis).
  applyLook(q) {
    if (!this.look.yaw && !this.look.pitch) return q;
    const yq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.look.yaw);
    const pq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.look.pitch);
    return q.premultiply(yq).multiply(pq);
  }

  // ---- Game controllers (PlayStation DualSense/DualShock, Xbox, MFi) — standard mapping ----
  //  ✕/A select (hold = grab/drag/scroll at the pointer)   ○/B back   △/Y keyboard   □/X recenter
  //  L1/R1 smaller/bigger   L2/R2 scroll page   left stick move   right stick turn (snap in headset) / look
  //  D-pad ↑↓ up/down, ←→ turn   Options/Menu launcher   Share/View environment   L3 recenter   R3 orbit
  pollPad(dt, set) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const gp = pads.find(p => p.connected) || null;
    if (!gp) { if (this.pad.id) { this.app.toast('انفصلت يد التحكم'); this.pad.id = null; } this.padPtr.down = false; return; }
    if (gp.id !== this.pad.id) {
      this.pad.id = gp.id; this.pad.prev = [];
      const ps = /054c|dualsense|dualshock|wireless controller|playstation/i.test(gp.id);
      this.pad.ps = ps;
      this.app.toast((ps ? 'يد بلايستيشن' : 'يد تحكم') + ' متصلة · ✕ اختيار · ○ رجوع · Options القائمة', 4500);
      this.app.log('يد تحكم: ' + gp.id.slice(0, 60));
      if (!settings.padGuideShown) { settings.padGuideShown = true; saveSettings({}); setTimeout(() => this.app.windows.open({ kind: 'panel', panel: 'pad' }), 600); }
    }
    const ax = gp.axes, b = gp.buttons.map(x => x.pressed), val = i => (gp.buttons[i] && gp.buttons[i].value) || 0;
    const dz = v => Math.abs(v) < 0.15 ? 0 : v;
    const now = performance.now();
    const any = b.some(Boolean) || ax.some(v => Math.abs(v) > 0.3);
    if (any) this.padPtr.last = now;
    // Movement and look
    let rx = dz(ax[2] || 0), ry = dz(ax[3] || 0);
    if (!this.direct) {
      // Headset: right stick X snaps 30° (comfortable), right stick Y scrolls the page you point at.
      if (Math.abs(rx) > 0.7 && !this.pad.snapped) { this.pad.snapped = true; if (this.orbit) this.orbitBy(-Math.sign(rx) * Math.PI / 6); else this.look.yaw -= Math.sign(rx) * Math.PI / 6; this.rumble(gp, 0.15, 30); }
      if (Math.abs(rx) < 0.3) this.pad.snapped = false;
      if (ry) this.scrollPointed(ry * 900 * dt);
      rx = 0; ry = 0;
    }
    set([dz(ax[0] || 0), dz(ax[1] || 0)], [rx, ry]);
    // Triggers scroll (analog)
    const tr = val(7) - val(6);
    if (Math.abs(tr) > 0.05) this.scrollPointed(tr * 1400 * dt);
    const edge = i => b[i] && !this.pad.prev[i];
    // ✕ acts as a pinch at the pointer: tap = click, hold = drag / scroll / resize-hold.
    this.padPtr.down = !!b[0];
    if (edge(0)) this.rumble(gp, 0.25, 25);
    if (edge(1)) { const a = this.app; if (a.launcher.group.visible) a.launcher.close(); else if (a.calibration.group.visible) a.calibration.close(); else { const kb = a.windows.windows.find(w => w.kind === 'keyboard'); if (kb) a.windows.close(kb); else this.pointedWindow()?.goBack?.(); } }
    if (edge(3)) this.app.windows.open({ kind: 'keyboard' });
    if (edge(2) || edge(10)) { this.reset(); this.app.recenter(); this.rumble(gp, 0.3, 60); }
    if (edge(9) || edge(16)) this.app.toggleLauncher();
    if (edge(8)) this.app.cycleEnvironment();
    if (edge(11)) { const w = this.pointedWindow(); if (w && w.kind === 'model') this.toggleOrbit(w); }
    if (edge(4) || edge(5)) { const w = this.pointedWindow(); if (w && w.scaleBy) { w.scaleBy(edge(5) ? 1.15 : 1 / 1.15); this.rumble(gp, 0.2, 20); } }
    if (b[12]) this.nav.y += 0.8 * dt; if (b[13]) this.nav.y -= 0.8 * dt;
    if (edge(14) || edge(15)) this.look.yaw += edge(14) ? Math.PI / 6 : -Math.PI / 6;
    this.pad.prev = b;
  }
  pointedWindow() {
    const p = this.app.interaction.pointers.find(x => x.active && x.hit);
    return p ? p.hit.object.userData.interact.window : null;
  }
  // Scroll whatever page or shared screen the pointer is on, at the pointer's position.
  scrollPointed(dy) {
    const p = this.app.interaction.pointers.find(x => x.active && x.hit);
    const it = p && p.hit.object.userData.interact;
    if (it && it.scroll && it.scroll() && it.scrollBy && it.toPx && p.hit.uv) { it.scrollBy(0, dy, it.toPx(p.hit.uv)); return; }
    const w = it && it.window;
    if (w && w.send && w.bridge) w.send({ type: 'scroll', dx: 0, dy, x: 512, y: 320 });
  }
  rumble(gp, strength, ms) {
    try { gp.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength }); } catch {}
  }
}
