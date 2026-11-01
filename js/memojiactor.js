// Your 3D Memoji inside Madar: it floats beside the welcome card and beside the assistant's answers, turns to look
// at you, blinks, and moves its mouth while Madar speaks. Edited in memoji.html («صمّم الميموجي»).
import * as THREE from 'three';
import { settings } from './config.js';

const SIZE = 0.12;   // the head's radius in metres
export class MemojiActor {
  constructor(app) { this.app = app; this.anchor = null; this.until = 0; this.ready = null; this.cfgKey = ''; }
  async load() {
    if (this.ready) return this.ready;
    this.ready = import('./memoji.js').then(M => {
      this.M = M; const { cfg } = M.load(); this.cfgKey = JSON.stringify(cfg);
      this.F = new M.Floating(cfg, M.envFor(this.app.renderer.renderer)); this.F.group.scale.setScalar(SIZE); this.F.group.visible = false;
      this.app.renderer.scene.add(this.F.group);
      // edited in another window / tab: rebuild
      addEventListener('storage', e => { if (e.key === M.KEY) this.refresh(); });
      addEventListener('message', e => { if (e.data?.type === 'madar-memoji') this.refresh(); });
      return this;
    });
    return this.ready;
  }
  refresh() { if (!this.M) return; const { cfg } = this.M.load(), k = JSON.stringify(cfg); if (k !== this.cfgKey) { this.cfgKey = k; this.F.rebuild(cfg); } }
  // float beside a panel (the welcome card, a notification) for a while; side: -1 = its left edge, +1 = right
  async show(anchor, ms = 9000, side = -1) {
    if (settings.memoji === false || !anchor) return;
    this.anchor = anchor; this.side = side; this.until = performance.now() + ms;   // the latest call wins, even while loading
    await this.load();
    if (this.anchor !== anchor) return;
    this.F.group.visible = true; this.pop = 0;
  }
  hide() { if (this.F) this.F.group.visible = false; this.anchor = null; }
  update(now) {
    const F = this.F; if (!F || !F.group.visible) return;
    const a = this.anchor;
    if (!a || !a.parent || !a.visible || now > this.until) { this.hide(); return; }
    // beside the panel, in its own plane, a little in front
    a.geometry.boundingBox || a.geometry.computeBoundingBox();
    // the panel's edge, then a head's width beyond it (in metres, whatever the panel's own scale)
    const bb = a.geometry.boundingBox, edge = a.localToWorld(new THREE.Vector3(this.side < 0 ? bb.min.x : bb.max.x, bb.min.y + (bb.max.y - bb.min.y) * 0.62, 0));
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(a.getWorldQuaternion(new THREE.Quaternion())), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(a.getWorldQuaternion(new THREE.Quaternion()));
    const goal = edge.add(right.multiplyScalar(this.side * SIZE * 1.45)).add(fwd.multiplyScalar(0.08));
    if (this.pop < 1) { this.pop = Math.min(1, this.pop + 0.06); F.group.position.copy(goal); }
    else F.group.position.lerp(goal, 0.15);
    const s = SIZE * (0.6 + 0.4 * (1 - Math.pow(1 - this.pop, 3)));   // pops in
    F.group.scale.setScalar(s);
    let talking = false; try { talking = speechSynthesis.speaking; } catch {}
    if (talking) this.until = Math.max(this.until, now + 1500);
    F.update(now, new THREE.Vector3(0, 0, 0), talking);
  }
}
