// Phone mode controls (virtual joystick + buttons + direct touch) and game controller support for both modes.
import * as THREE from 'three';
import { settings } from './config.js';
import { blip } from './ui.js';

export class Controls {
  constructor(app) {
    this.app = app;
    this.nav = new THREE.Vector3();        // how far the viewer has moved with stick / joystick
    this.joy = { x: 0, y: 0, id: null };
    this.touches = new Map();               // finger id -> stage point, for direct touch on windows
    this.pad = { prev: [] };
    this.el = document.getElementById('controls');
    this.knob = this.el.querySelector('.knob');
    this.bindJoystick();
    this.el.querySelectorAll('[data-act]').forEach(b => {
      const go = e => { e.preventDefault(); e.stopPropagation(); blip('tap', settings.sounds); this.action(b.dataset.act); };
      b.addEventListener('touchend', go, { passive: false });
      b.addEventListener('click', go);
      b.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    });
    this.sync();
  }
  get mono() { return settings.viewMode === 'mono'; }
  sync() { this.el.hidden = !this.mono; }
  action(a) {
    const app = this.app;
    if (a === 'menu') app.toggleLauncher();
    else if (a === 'recenter') { this.nav.set(0, 0, 0); app.recenter(); }
    else if (a === 'exit') app.exit();
    else if (a === 'headset') app.setViewMode('sbs');
    else if (a === 'up' || a === 'down') this.nav.y += a === 'up' ? 0.15 : -0.15;
  }
  bindJoystick() {
    const base = this.el.querySelector('.joy');
    const move = t => {
      const r = base.getBoundingClientRect();
      const s = this.app.orientation.toStage(t.clientX, t.clientY);
      const c = this.app.orientation.toStage(r.left + r.width / 2, r.top + r.height / 2);
      // Rect is in viewport space; convert the centre too, so a rotated stage still works.
      let dx = (s.x - c.x) / (base.offsetWidth / 2), dy = (s.y - c.y) / (base.offsetWidth / 2);
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      this.joy.x = dx; this.joy.y = dy;
      this.knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
    };
    base.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); const t = e.changedTouches[0]; this.joy.id = t.identifier; move(t); }, { passive: false });
    base.addEventListener('touchmove', e => { e.preventDefault(); e.stopPropagation(); for (const t of e.changedTouches) if (t.identifier === this.joy.id) move(t); }, { passive: false });
    const end = e => { e.preventDefault(); e.stopPropagation(); for (const t of e.changedTouches) if (t.identifier === this.joy.id) { this.joy = { x: 0, y: 0, id: null }; this.knob.style.transform = ''; } };
    base.addEventListener('touchend', end, { passive: false });
    base.addEventListener('touchcancel', end, { passive: false });
  }
  // Touches on the scene itself act like pinching hands at that point (tap, drag, two-finger resize, scroll).
  touchDown(list) { for (const t of list) this.touches.set(t.identifier, this.app.orientation.toStage(t.clientX, t.clientY)); }
  touchMove(list) { for (const t of list) if (this.touches.has(t.identifier)) this.touches.set(t.identifier, this.app.orientation.toStage(t.clientX, t.clientY)); }
  touchUp(list) { for (const t of list) this.touches.delete(t.identifier); }
  // Returns true when touch is driving the pointers this frame (hand tracking is then skipped).
  applyTouches(now) {
    if (!this.mono) return false;
    const slots = this.app.hands.slots;
    const pts = [...this.touches.values()].slice(0, 2);
    if (!pts.length && !this.touchWas) return false;
    const m = this.app.renderer.monoTan(), W = this.app.orientation.width, H = this.app.orientation.height;
    slots.forEach((s, i) => {
      const p = pts[i];
      if (p) {
        Object.assign(s, { active: true, seen: now + 400, pinch: true, strength: 1, depth: 0.45,
          tx: (p.x / W * 2 - 1) * m.x, ty: (1 - p.y / H * 2) * m.y, pts: null });
      } else if (s.pinch) { s.pinch = false; s.strength = 0; s.seen = now + 60; }   // release on lift so taps click
      else s.active = false;
    });
    this.touchWas = pts.length > 0;
    return true;
  }
  update(dt) {
    const app = this.app;
    const yaw = app.head.currentYaw() - app.head.yawOffset;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    let mx = this.mono ? this.joy.x : 0, my = this.mono ? this.joy.y : 0;
    this.pollPad(dt, v => { mx = v[0]; my = v[1]; });
    const speed = 1.4;
    if (Math.abs(mx) > 0.12 || Math.abs(my) > 0.12) this.nav.addScaledVector(right, mx * speed * dt).addScaledVector(fwd, -my * speed * dt);
    // The world moves opposite to the viewer (stick + walking).
    app.windows.root.position.copy(app.slam.pos).add(this.nav).negate();
  }
  // Standard game controllers (Bluetooth), Quest-style: left stick move, right stick turn,
  // A = select, B = back, Menu = launcher, LB/RB = smaller/bigger for what you point at.
  pollPad(dt, setMove) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const gp = pads[0]; if (!gp) return;
    const ax = gp.axes, b = gp.buttons.map(x => x.pressed);
    const dz = v => Math.abs(v) < 0.15 ? 0 : v;
    setMove([dz(ax[0] || 0), dz(ax[1] || 0)]);
    const turn = dz(ax[2] || 0);
    if (turn) this.app.head.yawOffset -= turn * 1.8 * dt;
    const edge = i => b[i] && !this.pad.prev[i];
    if (edge(0)) this.app.onRealTap();
    if (edge(1)) { if (this.app.launcher.group.visible) this.app.launcher.close(); else if (this.app.calibration.group.visible) this.app.calibration.close(); }
    if (edge(9) || edge(8) || edge(3)) this.app.toggleLauncher();
    if (edge(4) || edge(5)) {
      const p = this.app.interaction.pointers.find(x => x.active && x.hit);
      const w = p && p.hit.object.userData.interact.window;
      if (w && w.scaleBy) w.scaleBy(edge(5) ? 1.15 : 1 / 1.15);
    }
    if (edge(10) || edge(11)) { this.nav.set(0, 0, 0); this.app.recenter(); }
    this.pad.prev = b;
  }
}
