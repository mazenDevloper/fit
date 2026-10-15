// Gesture engine: hand rays + head gaze, hover, pinch-click, drag with push/pull, two-hand scale/rotate,
// long-pinch launcher, two-hand long-pinch recenter, gaze dwell, and real screen taps.
import * as THREE from 'three';
import { settings } from './config.js';
import { blip } from './ui.js';

const FWD = new THREE.Vector3(0, 0, -1);
const LONG_PRESS = 650, RECENTER_PRESS = 900, ZOOM_HOLD = 550;

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
    this.pointers.forEach(p => app.renderer.overlay.add(p.cursor));
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
    const top = hits.find(h => h.object.renderOrder >= 900 && h.object.userData.interact && this.isLive(h.object));
    if (top) return top;
    for (const h of hits) if (h.object.userData.interact && this.isLive(h.object)) return h;
    return null;
  }
  setHover(p, hit) {
    const obj = hit ? hit.object : null;
    if (p.hoverObj && p.hoverObj !== obj) p.hoverObj.userData.interact?.hover?.(false, null);
    if (obj) obj.userData.interact.hover?.(true, hit);
    p.hoverObj = obj;
  }
  castOn(mesh, dir) {
    this.raycaster.set(new THREE.Vector3(0, 0, 0), dir);
    return this.raycaster.intersectObject(mesh, false)[0] || null;
  }
  hand3d(slot) { return new THREE.Vector3(slot.tx * slot.depth, slot.ty * slot.depth, -slot.depth); }
  clickable(hit) {
    if (!hit) return false;
    const it = hit.object.userData.interact;
    if (it.type === 'button' || it.type === 'resize') return true;
    if (it.type === 'panel') return it.panel.isButtonAt(hit);
    if (it.type === 'surface') return true;   // video, web page: gaze can tap them too
    return false;
  }
  // Tap the corner circle (gaze, screen tap, quick press) → move the pointer to resize → tap again or hold still.
  beginResizeMode(win) {
    const p = this.pointers.find(x => x.active && x.hit) || this.pointers.find(x => x.active);
    if (!p) return;
    this.rm = { win, p, d0: p.dir.clone(), s0: win.group.scale.x, a0: win.aspect, t: performance.now(), still: performance.now(), moved: false, last: p.dir.clone() };
    blip('grab', settings.sounds);
    this.app.toast(win.canReshape ? 'حرّك المؤشر: يمين/يسار للعرض · أعلى/أسفل للارتفاع · انقر أو اثبت للإنهاء' : 'حرّك المؤشر للتكبير والتصغير · انقر أو اثبت للإنهاء', 3500);
    return true;
  }
  updateResizeMode(now) {
    const r = this.rm, p = r.p;
    if (!p.active) { this.endResizeMode(); return; }
    const ang = v => [Math.atan2(v.x, -v.z), Math.asin(THREE.MathUtils.clamp(v.y, -1, 1))];
    const [y0, x0] = ang(r.d0), [y1, x1] = ang(p.dir);
    const dx = -(y1 - y0), dy = x1 - x0;    // right = +dx, up = +dy
    if (p.dir.angleTo(r.last) > 0.006) { r.still = now; r.last.copy(p.dir); if (p.dir.angleTo(r.d0) > 0.03) r.moved = true; }
    const w = r.win;
    if (w.canReshape) {
      const W = r.s0 * Math.exp(dx * 2.2), H = (r.s0 / r.a0) * Math.exp(-dy * 2.2);
      w.group.scale.setScalar(THREE.MathUtils.clamp(W, 0.25, 8));
      w.reshapeAt = performance.now();
      w.setAspect(THREE.MathUtils.clamp(W / H, 0.5, 3.4));
    } else w.group.scale.setScalar(THREE.MathUtils.clamp(r.s0 * Math.exp((dx + dy) * 2.2), 0.25, 8));
    if ((r.moved && now - r.still > 1400) || (!r.moved && now - r.t > 6000)) this.endResizeMode();
  }
  endResizeMode() { const w = this.rm?.win; this.rm = null; if (w) { w.onDragEnd?.(); w.updateRadius?.(); this.app.windows.changed(); blip('close', settings.sounds); } }

  click(hit) {
    if (this.rm) { this.endResizeMode(); return true; }   // a click finishes "tap the circle" resizing
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
    const wp = obj.getWorldPosition(new THREE.Vector3());
    p.drag = { win, obj, local: wp.applyQuaternion(rq.clone().invert()), depth0: slot ? slot.depth : 0.45, target: new THREE.Vector3() };
    blip('grab', settings.sounds);
  }
  reanchor() {
    for (const o of this.pointers) if (o.drag) { const slot = this.app.hands.slots[o.i]; const rq = new THREE.Quaternion().setFromUnitVectors(FWD, o.dir); o.drag.local = o.drag.obj.getWorldPosition(new THREE.Vector3()).applyQuaternion(rq.invert()); o.drag.depth0 = slot.depth; }
  }
  beginScale(win) {
    const a = this.app.hands.slots[0], b = this.app.hands.slots[1];
    if (!a.active || !b.active) return;
    const pa = this.hand3d(a), pb = this.hand3d(b);
    this.scaleMode = { win, s0: win.group.scale.x, d0: Math.max(0.04, pa.distanceTo(pb)), a0: Math.atan2(pb.x - pa.x, pb.z - pa.z), r0: win.rot || 0 };
  }
  updateDrag(p, slot) {
    const d = p.drag; if (!d) return;
    const rq = new THREE.Quaternion().setFromUnitVectors(FWD, p.dir);
    const len0 = d.local.length();
    // Push/pull: moving the hand away or closer changes the distance (small dead zone against depth noise).
    let dd = slot ? slot.depth - d.depth0 : 0;
    dd = Math.sign(dd) * Math.max(0, Math.abs(dd) - 0.02);
    const len = THREE.MathUtils.clamp(len0 + dd * 3.2, 0.45, 9);
    d.target.copy(d.local).multiplyScalar(len / len0).applyQuaternion(rq);   // world position
    const parent = d.obj.parent;
    const localTarget = parent ? parent.worldToLocal(d.target.clone()) : d.target;
    d.obj.position.lerp(localTarget, 0.42);
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

  // Pointer stabiliser: small head tremors are filtered out of every pointer (hands and gaze), while
  // deliberate head turns pass straight through. The view itself is never delayed.
  stableQ(dt) {
    const R = this.app.renderQ, S = this.sq || (this.sq = R.clone());
    const ang = S.angleTo(R);
    if (ang > 0.35) { S.copy(R); return S; }                 // big jump (recenter): snap
    // < ~0.4° per frame: hold almost still; faster movement follows proportionally.
    const k = THREE.MathUtils.clamp((ang - 0.003) / 0.03, 0, 1);
    const a = 0.04 + 0.96 * k * k;
    S.slerp(R, Math.min(1, a * Math.max(1, dt * 60)));
    return S;
  }
  update(dt, now) {
    const Q = settings.stabilizer === false ? this.app.renderQ : this.stableQ(dt);
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
      if (p.prevDir && p.prevDir.angleTo(p.dir) > 0.004) p.moveT = now;
      (p.prevDir || (p.prevDir = new THREE.Vector3())).copy(p.dir);
      (p.hist || (p.hist = [])).push({ t: now, d: p.dir.clone() });
      while (p.hist.length > 12) p.hist.shift();
      const hit = p.drag ? null : this.cast(p.dir);
      p.hit = hit;
      if (!p.drag) this.setHover(p, hit);
      const pinch = s.pinch;
      if (pinch && !p.wasPinch) {
        p.t0 = now; p.start = [s.tx, s.ty]; p.moved = 0; p.fired = false;
        // Pinching pulls the index finger and moves the pointer: aim with where it was ~90 ms before.
        let pre = null; for (const h of p.hist) if (now - h.t >= 90) pre = h;
        const aimHit = pre && !p.drag ? (this.cast(pre.d) || hit) : hit;
        p.downObj = aimHit ? aimHit.object : null; p.downHit = aimHit;
        p.surf = null; p.pendingDrag = null; p.world = null;
        const it = hit && hit.object.userData.interact;
        const other = this.pointers[1 - i];
        const otherWin = other.drag?.win || other.surf?.win || other.pendingDrag?.object.userData.interact.window;
        if (it && it.window && otherWin === it.window) {
          // Both hands on one window: grab it with two hands to scale (and move it with the first hand).
          if (!other.drag) { const h = other.pendingDrag || this.cast(other.dir); other.surf = null; other.pendingDrag = null; if (h) this.startDrag(other, h, slots[1 - i]); }
          if (other.drag) { this.beginScale(other.drag.win); p.scaleHelper = true; p.fired = true; other.fired = true; p.downObj = null; }
        } else if (it && it.type === 'resize' && it.window) {
          p.zoom = { win: it.window, s0: it.window.group.scale.x, a0: it.window.aspect, x0: s.tx, y0: s.ty, corner: true }; p.fired = true;
          blip('grab', settings.sounds);
        } else if (it && it.type === 'drag') this.startDrag(p, hit, s);
        else if (it && it.type === 'surface' && it.scroll && it.scroll()) {
          // Pinch-drag inside an interactive page scrolls it, like a finger on a touch screen.
          p.surf = { win: it.window, mesh: hit.object, last: it.toPx(hit.uv), total: 0 };
        } else if (it && it.type === 'surface' && it.window) {
          p.pendingDrag = hit;   // becomes a window drag once the hand moves
        } else {
          const other = this.pointers[1 - i];
          if (other.drag) { this.beginScale(other.drag.win); p.scaleHelper = true; p.fired = true; p.downObj = null; }
        }
      }
      if (pinch) {
        p.moved = Math.max(p.moved, Math.hypot(s.tx - p.start[0], s.ty - p.start[1]));
        // One-hand resize: pinch a window and hold still briefly, then move the hand up (bigger) or down (smaller).
        // (Windows resize from their corner handle; pinch-hold resize is kept for 3D models only.)
        const zwin = p.drag?.win?.kind === 'model' ? p.drag.win : null;
        if (!p.zoom && zwin && !p.scaleHelper && !this.scaleMode && p.moved < 0.02 && now - p.t0 > ZOOM_HOLD) {
          if (p.drag) this.endDrag(p);
          p.surf = null; p.pendingDrag = null; p.fired = true;
          p.zoom = { win: zwin, s0: zwin.group.scale.x, y0: s.ty };
          blip('grab', settings.sounds);
          this.app.toast('تكبير: ارفع يدك للتكبير وأنزلها للتصغير', 1800);
        }
        if (p.zoom) {
          const z = p.zoom, lim = z.win.kind === 'model' ? [0.1, 12] : [0.25, 8];
          // Corner of pages and panels: sideways = width only, up/down = height only (like a desktop window).
          // Videos and shared screens keep their picture's shape, so they scale evenly.
          const reshape = z.corner && z.win.canReshape;
          let f;
          if (reshape) {
            const W = z.s0 * Math.exp((s.tx - z.x0) * 2.4), H = (z.s0 / z.a0) * Math.exp(-(s.ty - z.y0) * 2.4);
            f = Math.log(W / z.s0);
            z.win.reshapeAt = performance.now();
            z.win.setAspect(THREE.MathUtils.clamp(W / H, 0.5, 3.4));
          } else f = z.corner ? ((s.tx - z.x0) - (s.ty - z.y0)) * 2.6 : (s.ty - z.y0) * 3.2;
          const target = THREE.MathUtils.clamp(z.s0 * Math.exp(f), lim[0], lim[1]);
          z.win.group.scale.setScalar(z.win.group.scale.x + (target - z.win.group.scale.x) * 0.35);
          this.drawCursor(p, null, 1, true);
        }
        // Pinch in empty space and move: grab the world (move through it, or orbit the chosen model).
        if (!p.downObj && !p.drag && !p.surf && !p.pendingDrag && !p.zoom && !p.scaleHelper && !this.pointers[1 - i].wasPinch && p.moved > 0.05) {
          const c = this.app.controls;
          if (p.world) {
            const dx = s.tx - p.world.tx, dd = s.depth - p.world.depth;
            if (c.orbit) c.orbitBy(-dx * 2.6);
            else c.moveBy(-dx * 2.2, -dd * 5);
          } else { p.fired = true; if (c.orbit || settings.moveEnabled) blip('grab', settings.sounds); }
          p.world = { tx: s.tx, depth: s.depth };
        }
        if (p.pendingDrag && !p.drag && p.moved > 0.035) { this.startDrag(p, p.pendingDrag, s); p.pendingDrag = null; p.fired = true; }
        if (p.surf) {
          const h = this.castOn(p.surf.mesh, p.dir);
          if (h && h.uv) {
            const it = p.surf.mesh.userData.interact, cur = it.toPx(h.uv);
            const dx = p.surf.last[0] - cur[0], dy = p.surf.last[1] - cur[1];
            if (Math.abs(dx) + Math.abs(dy) > 0.5) {
              { const ax = Math.abs(dx), ay = Math.abs(dy); const sx = ax > ay * 1.4 ? dx * 2.2 : ay > ax * 1.4 ? 0 : dx * 1.6, sy = ay > ax * 1.4 ? dy * 1.6 : ax > ay * 1.4 ? 0 : dy * 1.6; it.scrollBy(sx, sy, cur); } p.surf.total += Math.abs(dx) + Math.abs(dy); p.surf.last = cur;
              const v = dy * 1.6 / Math.max(dt, 0.008); p.surf.vel = (p.surf.vel || 0) * 0.6 + v * 0.4;
            }
            if (p.surf.total > 14) p.fired = true;   // it was a scroll, not a tap
          }
        }
        if (p.drag) this.updateDrag(p, s);
        else if (!p.downObj && !p.fired && !p.scaleHelper && p.moved < 0.05 && now - p.t0 > LONG_PRESS) {
          const other = this.pointers[1 - i];
          const bothEmpty = other.active && other.wasPinch && !other.downObj;
          if (!bothEmpty) { p.fired = true; this.app.toggleLauncher(); }
        }
      } else if (p.wasPinch) this.release(p, now, hit);
      p.wasPinch = pinch;
      let hprog = 0;
      if (settings.handDwell !== false && !pinch && !p.drag && this.clickable(hit)) {
        const dwell = settings.handDwellMs || 2000;
        // Only something you moved onto counts — never a button that simply appeared under a resting hand.
        if (!p.still || p.still.obj !== hit.object || p.still.dir.angleTo(p.dir) > 0.022) p.still = { obj: hit.object, dir: p.dir.clone(), t: now, done: false, armed: now - (p.moveT || 0) < 700 };
        else if (!p.still.armed) { if (now - (p.moveT || 0) < 120) { p.still.armed = true; p.still.t = now; } }
        else if (!p.still.done) {
          hprog = Math.max(0, (now - p.still.t - 250) / (dwell - 250));
          if (hprog >= 1) { p.still.done = true; hprog = 0; this.click(hit); blip('tap', settings.sounds); }
        }
      } else p.still = null;
      this.drawCursor(p, hit, s.strength, pinch, hprog);
    }

    if (this.rm) this.updateResizeMode(now);
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
      if (m.win.pivot) m.win.rot = m.r0 - (Math.atan2(pb.x - pa.x, pb.z - pa.z) - m.a0);
    }

    // Head gaze pointer when no hands are visible.
    const g = this.pointers[2];
    g.active = !anyHand;
    if (g.active) {
      const gp = this.app.gaze?.point;
      if (gp && settings.viewMode === 'desktop' && settings.eyeTrack) {
        const [tx, ty] = this.app.controls.screenDir(gp.x * this.app.orientation.width, gp.y * this.app.orientation.height);
        g.dir.set(tx, ty, -1).normalize().applyQuaternion(Q);
      } else g.dir.copy(FWD).applyQuaternion(Q);
      const hit = this.cast(g.dir);
      g.hit = hit;
      this.setHover(g, hit);
      if (g.prevDir && g.prevDir.angleTo(g.dir) > 0.002) g.moveT = now;
      (g.prevDir || (g.prevDir = new THREE.Vector3())).copy(g.dir);
      let prog = 0;
      if (settings.dwell && this.clickable(hit)) {
        const itg = hit.object.userData.interact;
        const region = itg.type === 'panel' ? itg.panel.hitRegion(hit)?.id : itg.type === 'surface' && hit.uv ? Math.round(hit.uv.x * 20) + ':' + Math.round(hit.uv.y * 14) : 'b';
        if (g.dwellObj !== hit.object || g.dwellRegion !== region) { g.dwellObj = hit.object; g.dwellRegion = region; g.dwellT = now; g.dwellDone = false; g.armed = now - (g.moveT || 0) < 700; }
        // A menu that opens right under your gaze isn't clicked by itself: look slightly, then the countdown starts.
        if (!g.armed) { if (now - (g.moveT || 0) < 120) { g.armed = true; g.dwellT = now; } }
        else if (!g.dwellDone) {
          prog = (now - g.dwellT) / (settings.dwellMs || 3000);
          if (prog >= 1) { g.dwellDone = true; prog = 0; this.click(hit); blip('tap', settings.sounds); }
        }
      } else { g.dwellObj = null; g.dwellRegion = null; }
      this.drawCursor(g, hit, 0, false, prog);
    } else { if (g.hoverObj) this.setHover(g, null); g.cursor.visible = false; g.dwellObj = null; }
  }

  release(p, now, hit) {
    if (p.zoom) { const w = p.zoom.win; p.zoom = null; w.onDragEnd?.(); w.updateRadius?.(); this.app.windows.changed(); p.downObj = null; p.surf = null; p.pendingDrag = null; return; }
    if (p.scaleHelper) { p.scaleHelper = false; this.scaleMode = null; this.reanchor(); this.app.windows.changed(); p.downObj = null; return; }
    if (p.surf && p.surf.total > 14 && Math.abs(p.surf.vel || 0) > 250 && p.surf.win.fling) p.surf.win.fling(Math.max(-4000, Math.min(4000, p.surf.vel)));
    p.surf = null; p.pendingDrag = null; p.world = null;
    if (p.drag) { this.endDrag(p); return; }
    if (!p.fired && p.downObj && p.moved < 0.07 && now - p.t0 < 1000) {
      // Click whatever is under the pointer now if it is the same object, else the original target.
      this.click(p.downHit);   // the spot aimed at before pinching, not where the pinch dragged it
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
