// Gesture engine: hand rays + head gaze, hover, pinch-click, drag with push/pull, two-hand scale/rotate,
// long-pinch launcher, two-hand long-pinch recenter, gaze dwell, and real screen taps.
import * as THREE from 'three';
import { settings } from './config.js';
import { blip } from './ui.js';

const FWD = new THREE.Vector3(0, 0, -1);
const LONG_PRESS = 650, RECENTER_PRESS = 900, DWELL = 1100;

function makeCursor(color) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
  const prog = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.45, 48, 1, Math.PI / 2, 0.001), new THREE.MeshBasicMaterial({ color: 0x7cc4ff, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
  [ring, dot, prog].forEach(m => { m.renderOrder = 1000; g.add(m); });
  g.userData = { ring, dot, prog, progVal: 0 };
  g.visible = false;
  return g;
}

export class Interaction {
  constructor(app) {
    this.app = app;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0.05; this.raycaster.far = 30;
    this.targets = [];
    this.pointers = [0, 1, 2].map(i => ({
      i, kind: i < 2 ? 'hand' : 'gaze', active: false,
      dir: new THREE.Vector3(), hit: null, hoverObj: null,
      pinch: false, wasPinch: false, t0: 0, start: [0, 0], moved: 0, downObj: null, downHit: null,
      drag: null, fired: false, dwellObj: null, dwellT: 0, dwellRegion: null,
      cursor: makeCursor(i < 2 ? 0x7cc4ff : 0xffffff),
    }));
    this.pointers.forEach(p => app.renderer.scene.add(p.cursor));
    this.scaleMode = null;
    this.recenterFired = false;
  }
  setTargets() { this.targets = [...this.app.windows.targets, ...this.app.systemTargets()]; }
  forget(win) {
    for (const p of this.pointers) {
      if (p.drag && p.drag.win === win) p.drag = null;
      if (p.hoverObj && !p.hoverObj.parent) p.hoverObj = null;
      if (p.downObj && !p.downObj.parent) p.downObj = null;
    }
    if (this.scaleMode && this.scaleMode.win === win) this.scaleMode = null;
  }
  isLive(obj) {
    for (let o = obj; o; o = o.parent) { if (!o.visible) return false; if (o.type === 'Scene') return true; }
    return false;
  }
  cast(dir) {
    this.raycaster.set(new THREE.Vector3(0, 0, 0), dir);
    const hits = this.raycaster.intersectObjects(this.targets, false);
    for (const h of hits) if (h.object.userData.interact && this.isLive(h.object)) return h;
    return null;
  }
  setHover(p, hit) {
    const obj = hit ? hit.object : null;
    if (p.hoverObj && p.hoverObj !== obj) p.hoverObj.userData.interact?.hover?.(false, null);
    if (obj) obj.userData.interact.hover?.(true, hit);
    p.hoverObj = obj;
  }
  hand3d(slot) { return new THREE.Vector3(slot.tx * slot.depth, slot.ty * slot.depth, -slot.depth); }
  clickable(hit) {
    if (!hit) return false;
    const it = hit.object.userData.interact;
    if (it.type === 'button') return true;
    if (it.type === 'panel') return it.panel.isButtonAt(hit);
    return false;
  }
  click(hit) {
    if (!hit) return false;
    const it = hit.object.userData.interact;
    const done = it.click ? it.click(hit) : false;
    if (done && it.type === 'button') blip('tap', settings.sounds);
    return done;
  }

  startDrag(p, hit, slot) {
    const win = hit.object.userData.interact.window;
    if (!win) return;
    // Second hand grabbing the same object → two-hand scale/rotate instead of a second drag.
    const other = this.pointers.find(o => o !== p && o.kind === 'hand' && o.drag && o.drag.win === win);
    if (other) { this.beginScale(win); p.scaleHelper = true; p.fired = true; return; }
    const obj = win.group;
    const rq = new THREE.Quaternion().setFromUnitVectors(FWD, p.dir);
    p.drag = { win, obj, local: obj.position.clone().applyQuaternion(rq.clone().invert()), depth0: slot ? slot.depth : 0.45, target: obj.position.clone() };
    blip('grab', settings.sounds);
  }
  reanchor() {
    for (const o of this.pointers) if (o.drag) { const slot = this.app.hands.slots[o.i]; const rq = new THREE.Quaternion().setFromUnitVectors(FWD, o.dir); o.drag.local = o.drag.obj.position.clone().applyQuaternion(rq.invert()); o.drag.depth0 = slot.depth; }
  }
  beginScale(win) {
    const a = this.app.hands.slots[0], b = this.app.hands.slots[1];
    if (!a.active || !b.active) return;
    const pa = this.hand3d(a), pb = this.hand3d(b);
    this.scaleMode = { win, s0: win.group.scale.x, d0: Math.max(0.04, pa.distanceTo(pb)), a0: Math.atan2(pb.x - pa.x, pb.z - pa.z), r0: win.pivot ? win.pivot.rotation.y : 0 };
  }
  updateDrag(p, slot) {
    const d = p.drag; if (!d) return;
    const rq = new THREE.Quaternion().setFromUnitVectors(FWD, p.dir);
    const len0 = d.local.length();
    const push = slot ? (slot.depth - d.depth0) * 4.0 : 0;
    const len = THREE.MathUtils.clamp(len0 + push, 0.45, 9);
    d.target.copy(d.local).multiplyScalar(len / len0).applyQuaternion(rq);
    d.obj.position.lerp(d.target, 0.5);
    if (d.win.kind !== 'model') d.obj.lookAt(0, 0, 0);
  }
  endDrag(p) {
    if (!p.drag) return;
    p.drag.win.onDragEnd?.();
    this.app.windows.changed();
    p.drag = null;
    this.scaleMode = null;
    this.reanchor();
  }

  update(dt, now) {
    const Q = this.app.renderQ;
    const slots = this.app.hands.slots;
    const handsOn = settings.handsEnabled && this.app.hands.state === 'ready';
    let anyHand = false;

    for (let i = 0; i < 2; i++) {
      const p = this.pointers[i], s = slots[i];
      p.active = handsOn && s.active;
      if (!p.active) {
        if (p.wasPinch) this.release(p, now, null);
        if (p.hoverObj) this.setHover(p, null);
        p.cursor.visible = false; p.wasPinch = false; continue;
      }
      anyHand = true;
      p.dir.set(s.tx, s.ty, -1).normalize().applyQuaternion(Q);
      const hit = p.drag ? null : this.cast(p.dir);
      p.hit = hit;
      if (!p.drag) this.setHover(p, hit);
      const pinch = s.pinch;
      if (pinch && !p.wasPinch) {
        p.t0 = now; p.start = [s.tx, s.ty]; p.moved = 0; p.fired = false;
        p.downObj = hit ? hit.object : null; p.downHit = hit;
        if (hit && hit.object.userData.interact.type === 'drag') this.startDrag(p, hit, s);
        else {
          const other = this.pointers[1 - i];
          if (other.drag) { this.beginScale(other.drag.win); p.scaleHelper = true; p.fired = true; p.downObj = null; }
        }
      }
      if (pinch) {
        p.moved = Math.max(p.moved, Math.hypot(s.tx - p.start[0], s.ty - p.start[1]));
        if (p.drag) this.updateDrag(p, s);
        else if (!p.downObj && !p.fired && !p.scaleHelper && p.moved < 0.05 && now - p.t0 > LONG_PRESS) {
          const other = this.pointers[1 - i];
          const bothEmpty = other.active && other.wasPinch && !other.downObj;
          if (!bothEmpty) { p.fired = true; this.app.toggleLauncher(); }
        }
      } else if (p.wasPinch) this.release(p, now, hit);
      p.wasPinch = pinch;
      this.drawCursor(p, hit, s.strength, pinch);
    }

    // Two empty-space pinches held together → recenter.
    const [h0, h1] = this.pointers;
    if (h0.active && h1.active && h0.wasPinch && h1.wasPinch && !h0.downObj && !h1.downObj && !h0.drag && !h1.drag) {
      if (!this.recenterFired && now - Math.max(h0.t0, h1.t0) > RECENTER_PRESS) { this.recenterFired = true; h0.fired = h1.fired = true; this.app.recenter(); }
    } else this.recenterFired = false;

    // Two-hand scale/rotate.
    if (this.scaleMode && slots[0].active && slots[1].active && h0.wasPinch && h1.wasPinch) {
      const m = this.scaleMode, pa = this.hand3d(slots[0]), pb = this.hand3d(slots[1]);
      const f = pa.distanceTo(pb) / m.d0;
      const s = THREE.MathUtils.clamp(m.s0 * f, m.win.kind === 'model' ? 0.1 : 0.25, m.win.kind === 'model' ? 12 : 8);
      m.win.group.scale.setScalar(m.win.group.scale.x + (s - m.win.group.scale.x) * 0.5);
      if (m.win.pivot) m.win.pivot.rotation.y = m.r0 - (Math.atan2(pb.x - pa.x, pb.z - pa.z) - m.a0);
    }

    // Head gaze pointer when no hands are visible.
    const g = this.pointers[2];
    g.active = !anyHand;
    if (g.active) {
      g.dir.copy(FWD).applyQuaternion(Q);
      const hit = this.cast(g.dir);
      g.hit = hit;
      this.setHover(g, hit);
      let prog = 0;
      if (settings.dwell && this.clickable(hit)) {
        const region = hit.object.userData.interact.type === 'panel' ? hit.object.userData.interact.panel.hitRegion(hit)?.id : 'b';
        if (g.dwellObj !== hit.object || g.dwellRegion !== region) { g.dwellObj = hit.object; g.dwellRegion = region; g.dwellT = now; g.dwellDone = false; }
        if (!g.dwellDone) {
          prog = (now - g.dwellT) / DWELL;
          if (prog >= 1) { g.dwellDone = true; prog = 0; this.click(hit); blip('tap', settings.sounds); }
        }
      } else { g.dwellObj = null; g.dwellRegion = null; }
      this.drawCursor(g, hit, 0, false, prog);
    } else { if (g.hoverObj) this.setHover(g, null); g.cursor.visible = false; g.dwellObj = null; }
  }

  release(p, now, hit) {
    if (p.scaleHelper) { p.scaleHelper = false; this.scaleMode = null; this.reanchor(); this.app.windows.changed(); p.downObj = null; return; }
    if (p.drag) { this.endDrag(p); return; }
    if (!p.fired && p.downObj && p.moved < 0.07 && now - p.t0 < 1000) {
      // Click whatever is under the pointer now if it is the same object, else the original target.
      const h = hit && hit.object === p.downObj ? hit : p.downHit;
      this.click(h);
    }
    p.downObj = null; p.downHit = null;
  }

  // A genuine tap on the screen (e.g. the headset's button) clicks the current target.
  realTap() {
    const p = this.pointers.find(x => x.active && x.hit) || this.pointers.find(x => x.active);
    if (p && p.hit) { this.click(p.hit); blip('tap', settings.sounds); return true; }
    return false;
  }

  drawCursor(p, hit, strength, pinch, prog = 0) {
    const c = p.cursor, u = c.userData;
    c.visible = true;
    const dist = hit ? hit.distance : 2.2;
    c.position.copy(p.dir).multiplyScalar(hit ? dist - 0.01 : dist);
    c.quaternion.copy(this.app.renderQ);
    const base = (p.kind === 'gaze' ? 0.0075 : 0.009) * dist;
    c.scale.setScalar(base * (pinch ? 0.75 : 1));
    u.ring.material.opacity = hit ? 0.95 : 0.45;
    u.dot.scale.setScalar(0.35 + 0.65 * strength);
    u.dot.material.opacity = pinch ? 1 : (p.kind === 'gaze' ? 0.9 : 0.55);
    const pv = Math.round(prog * 40) / 40;
    if (pv !== u.progVal) {
      u.progVal = pv;
      u.prog.geometry.dispose();
      u.prog.geometry = new THREE.RingGeometry(1.15, 1.45, 48, 1, Math.PI / 2, Math.max(0.001, pv * Math.PI * 2));
    }
    u.prog.visible = pv > 0;
  }
}
