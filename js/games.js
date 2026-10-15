// Built-in 3D game: «فرقعة البالونات» — balloons float up around your room; aim with your finger, eyes,
// mouse or controller and pinch / ✕ / tap to pop them before the minute ends. Gold balloons are worth 3.
import * as THREE from 'three';
import { CanvasPanel, IconButton, makeBar, glass, text, roundRect, COLORS, blip } from './ui.js';
import { settings, saveSettings } from './config.js';

let gid = 1000;
const COLORS_B = [0xff5d73, 0x4fc3ff, 0x7cf0a8, 0xffb74d, 0xb388ff];

export class BalloonGame {
  constructor(mgr) {
    this.mgr = mgr; this.kind = 'game'; this.id = ++gid;
    this.group = new THREE.Group(); this.group.userData.window = this;
    this.world = new THREE.Group();          // balloons live around the player, not on the panel
    mgr.root.add(this.world);
    this.balloons = []; this.parts = [];
    this.state = 'ready'; this.score = 0; this.time = 60; this.best = settings.balloonBest || 0;
    this.panel = new CanvasPanel(0.62, 0.3, (ctx, W, H, p) => this.draw(ctx, W, H, p), { pxPerM: 1800 });
    this.panel.mesh.userData.interact.window = this;
    this.group.add(this.panel.mesh);
    const { mesh: bar, hit } = makeBar(0.14, 0.016);
    hit.userData.interact = { type: 'drag', window: this, hover: on => { bar.userData.drawHover(on); return true; } };
    bar.position.set(0, -0.172, 0.002); this.group.add(bar);
    this.closeBtn = new IconButton('close', 0.034, () => this.mgr.close(this));
    this.closeBtn.mesh.position.set(-0.1, -0.172, 0.004); this.group.add(this.closeBtn.mesh);
    this.geo = new THREE.SphereGeometry(0.11, 24, 18); this.geo.scale(1, 1.18, 1);
    this.stringGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.28, 4);
  }
  draw(ctx, W, H, p) {
    glass(ctx, 0, 0, W, H, 40);
    text(ctx, 'فرقعة البالونات', W - 40, 58, 44, { align: 'right', weight: 800 });
    text(ctx, 'النقاط ' + this.score, W - 40, 128, 40, { align: 'right', weight: 800, color: COLORS.accent });
    text(ctx, (this.state === 'play' ? Math.ceil(this.time) : 60) + ' ث', W / 2, 128, 40, { weight: 800, dir: 'rtl' });
    text(ctx, 'الأفضل ' + this.best, 140, 128, 32, { color: COLORS.dim, weight: 700 });
    const label = this.state === 'play' ? 'إيقاف' : this.state === 'over' ? 'مرة أخرى' : 'ابدأ';
    const hov = p.isHover('go');
    roundRect(ctx, W / 2 - 160, H - 140, 320, 90, 45); ctx.fillStyle = hov ? '#ffffff' : 'rgba(255,255,255,0.85)'; ctx.fill();
    text(ctx, label, W / 2, H - 94, 40, { weight: 800, color: '#141824' });
    p.region(W / 2 - 160, H - 140, 320, 90, () => { blip('tap', settings.sounds); this.state === 'play' ? this.end() : this.start(); }, 'go');
    if (this.state === 'over') text(ctx, this.score >= this.best && this.score > 0 ? 'رقم قياسي جديد!' : 'أحسنت', W / 2, 190, 34, { color: '#ffd166', weight: 800 });
    else text(ctx, 'وجّه إصبعك أو نظرك إلى البالون واقرص (أو ✕) لفرقعته', W / 2, 190, 26, { color: COLORS.dim, maxWidth: W - 60 });
  }
  start() {
    this.clear(); this.state = 'play'; this.score = 0; this.time = 60; this.spawnT = 0; this.panel.redraw();
    this.mgr.app.toast('ابدأ! بالونات حولك — التفت يميناً ويساراً', 2500);
  }
  end() {
    this.state = 'over'; this.clear();
    if (this.score > this.best) { this.best = this.score; saveSettings({ balloonBest: this.best }); }
    this.panel.redraw(); blip('close', settings.sounds);
  }
  clear() { this.balloons.forEach(b => this.world.remove(b.mesh)); this.balloons = []; this.mgr.refreshTargets(); }
  spawn() {
    const h = this.mgr.headLocal(), yaw = this.mgr.forwardYaw() + (Math.random() - 0.5) * 2.2;
    const d = 1.5 + Math.random() * 1.6, gold = Math.random() < 0.12;
    const mat = new THREE.MeshStandardMaterial({ color: gold ? 0xffd166 : COLORS_B[(Math.random() * COLORS_B.length) | 0], roughness: 0.25, metalness: gold ? 0.6 : 0.05, emissive: gold ? 0x332200 : 0x000000 });
    const mesh = new THREE.Mesh(this.geo, mat);
    const s = new THREE.Mesh(this.stringGeo, new THREE.MeshBasicMaterial({ color: 0xdddddd })); s.position.y = -0.27; mesh.add(s);
    mesh.position.set(h.x - Math.sin(yaw) * d, h.y - 0.9 - Math.random() * 0.3, h.z - Math.cos(yaw) * d);
    const b = { mesh, gold, vy: 0.18 + Math.random() * 0.22 + this.score * 0.002, sway: Math.random() * 6, life: 0 };
    mesh.userData.interact = { type: 'button', window: this, click: () => { this.pop(b); return true; }, hover: on => { mesh.scale.setScalar(on ? 1.12 : 1); return true; } };
    this.world.add(mesh); this.balloons.push(b); this.mgr.refreshTargets();
  }
  pop(b) {
    if (this.state !== 'play' || !this.balloons.includes(b)) return;
    this.score += b.gold ? 3 : 1; blip('tap', true);
    // Confetti burst
    const pos = b.mesh.position.clone(), col = b.mesh.material.color.getHex();
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.02), new THREE.MeshBasicMaterial({ color: i % 2 ? col : 0xffffff, side: THREE.DoubleSide, transparent: true }));
      m.position.copy(pos); this.world.add(m);
      this.parts.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 1.4, (Math.random() - 0.5) * 1.6), t: 0 });
    }
    this.world.remove(b.mesh); b.mesh.material.dispose();
    this.balloons = this.balloons.filter(x => x !== b); this.mgr.refreshTargets(); this.panel.redraw();
    try { navigator.getGamepads?.()[0]?.vibrationActuator?.playEffect('dual-rumble', { duration: 40, strongMagnitude: 0.3, weakMagnitude: 0.3 }); } catch {}
  }
  update(dt, now) {
    for (const p of this.parts) { p.t += dt; p.v.y -= 2.2 * dt; p.m.position.addScaledVector(p.v, dt); p.m.rotation.x += dt * 8; p.m.material.opacity = Math.max(0, 1 - p.t / 0.9); }
    this.parts = this.parts.filter(p => { if (p.t > 0.9) { this.world.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); return false; } return true; });
    if (this.state !== 'play') return;
    this.time -= dt;
    if (this.time <= 0) { this.end(); return; }
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.balloons.length < 9) { this.spawn(); this.spawnT = Math.max(0.35, 1.1 - this.score * 0.015); }
    const h = this.mgr.headLocal();
    for (const b of [...this.balloons]) {
      b.life += dt; b.mesh.position.y += b.vy * dt; b.mesh.position.x += Math.sin(b.life * 1.3 + b.sway) * 0.05 * dt;
      if (b.mesh.position.y > h.y + 1.6) { this.world.remove(b.mesh); this.balloons = this.balloons.filter(x => x !== b); this.mgr.refreshTargets(); }
    }
    if (((this.time * 10) | 0) !== this.lastDrawT) { this.lastDrawT = (this.time * 10) | 0; if (this.lastDrawT % 5 === 0) this.panel.redraw(); }
  }
  scaleBy(f) { this.group.scale.multiplyScalar(f); }
  serialize() { return { ref: null }; }
  dispose() { this.clear(); this.parts.forEach(p => this.world.remove(p.m)); this.mgr.root.remove(this.world); this.panel.dispose(); this.closeBtn.dispose(); this.geo.dispose(); }
}
