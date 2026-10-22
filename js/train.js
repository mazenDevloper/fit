// The coach's other modes: air boxing (pads to punch, bars to duck), eye & neck exercises (a light to follow, targets
// to turn your head to), and the treadmill (a trail moving at your speed, or a 360° video, with a pacer walking ahead).
import * as THREE from 'three';
import { text, icon, roundRect, COLORS, blip } from './ui.js';
import { settings, saveSettings } from './config.js';
import { say, sayNumber } from './coach.js';

const arNum = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const W8 = 'https://studio.c-p.workers.dev';
const fmt = s => { s = Math.max(0, Math.floor(s)); return arNum(Math.floor(s / 60)) + ':' + arNum(String(s % 60).padStart(2, '0')); };
function button(ctx, p, x, y, w, h, label, act, id, strong, ic) {
  const hov = p.isHover(id);
  roundRect(ctx, x, y, w, h, Math.min(30, h / 2));
  ctx.fillStyle = strong ? (hov ? '#ffd2a8' : 'rgba(255,150,80,0.92)') : hov ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'; ctx.fill();
  if (ic) icon(ctx, ic, x + w / 2, y + h * 0.36, h * 0.3, strong ? '#2a1405' : COLORS.text);
  text(ctx, label, x + w / 2, y + (ic ? h * 0.76 : h / 2), Math.min(26, h * 0.3), { weight: 800, color: strong ? '#2a1405' : COLORS.text, maxWidth: w - 12, fit: true });
  p.region(x, y, w, h, () => { blip('tap', settings.sounds); act(); }, id);
}
// the head (eyes) in the windows' world, and where it looks
function headPose(app) {
  const root = app.windows.root; root.updateMatrixWorld();
  const h = app.windows.headLocal();
  const f = app.headForward.clone();
  return { h, f };
}

// ---------------------------------------------------------------- air boxing
const PADS = [
  { key: 'jab', name: 'مستقيمة يسرى', hand: 'L', at: [0.14, 0.02, 0.5], col: 0x3b82f6 },
  { key: 'cross', name: 'مستقيمة يمنى', hand: 'R', at: [-0.14, 0.02, 0.5], col: 0xef4444 },
  { key: 'hookL', name: 'خطّاف أيسر', hand: 'L', at: [0.3, 0.0, 0.42], col: 0x60a5fa },
  { key: 'hookR', name: 'خطّاف أيمن', hand: 'R', at: [-0.3, 0.0, 0.42], col: 0xf87171 },
  { key: 'upL', name: 'صاعدة يسرى', hand: 'L', at: [0.1, -0.2, 0.45], col: 0x93c5fd },
  { key: 'upR', name: 'صاعدة يمنى', hand: 'R', at: [-0.1, -0.2, 0.45], col: 0xfca5a5 },
];
export class Boxing {
  constructor(coach) {
    this.c = coach; this.app = coach.app;
    this.world = new THREE.Group(); this.app.windows.root.add(this.world);
    coach.world = this.world;
    this.pads = []; this.bars = []; this.score = 0; this.combo = 0; this.best = settings.boxBest || 0; this.state = 'ready'; this.time = 90; this.kcal = 0; this.hits = 0;
    this.padGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.05, 32); this.padGeo.rotateX(Math.PI / 2);
    this.ringGeo = new THREE.RingGeometry(0.095, 0.107, 40);
    this.prevHand = [null, null];
    say('الملاكمة في الهواء. اضرب الوسادات بقبضتك، وانخفض لتتفادى العارضة');
  }
  start() { this.clear(); this.state = 'play'; this.score = 0; this.combo = 0; this.time = 90; this.spawnT = 1.5; this.barT = 9; this.kcal = 0; this.hits = 0; say('الجولة الأولى. ابدأ'); }
  clear() { [...this.pads, ...this.bars].forEach(o => { this.world.remove(o.mesh); o.mesh.material?.dispose?.(); }); this.pads = []; this.bars = []; this.app.windows.refreshTargets(); }
  // pads appear where your fists can reach them (around your head, facing you)
  spawn() {
    const t = PADS[Math.floor(Math.random() * PADS.length)];
    const { h } = headPose(this.app), yaw = this.app.windows.forwardYaw();
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    // at = [left(+)/right(-), up, forward]
    const pos = new THREE.Vector3(h.x + fx * t.at[2] - rx * t.at[0], h.y + t.at[1] - 0.12, h.z + fz * t.at[2] - rz * t.at[0]);
    const mat = new THREE.MeshStandardMaterial({ color: t.col, emissive: t.col, emissiveIntensity: 0.35, roughness: 0.4 });
    const mesh = new THREE.Mesh(this.padGeo, mat);
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.position.z = 0.03; mesh.add(ring);
    mesh.position.copy(pos); mesh.lookAt(h.x, h.y - 0.12, h.z);
    mesh.scale.setScalar(0.01);
    const pad = { mesh, t, life: 0, ring };
    mesh.userData.interact = { type: 'button', window: this.c, click: () => { this.hit(pad, 1); return true; }, hover: () => true };
    this.world.add(mesh); this.pads.push(pad); this.app.windows.refreshTargets();
    if (Math.random() < 0.5) say(t.hand === 'L' ? 'يسار' : 'يمين', { rate: 1.3 });
  }
  hit(pad, power) {
    if (!this.pads.includes(pad)) return;
    this.combo++; this.hits++;
    this.score += Math.round(10 * (1 + Math.min(this.combo, 10) * 0.1) * power);
    blip('tap', true);
    try { navigator.vibrate?.(30); window.MadarIOS?.send('rumble', { s: 0.7, ms: 60 }); } catch {}
    if (this.combo % 5 === 0) say('سلسلة ' + this.combo, { rate: 1.2 });
    this.kill(pad, true);
  }
  kill(pad, burst) {
    this.world.remove(pad.mesh); pad.mesh.material.dispose(); this.pads = this.pads.filter(x => x !== pad); this.app.windows.refreshTargets();
    if (burst) {
      const fl = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.2, 32), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      fl.position.copy(pad.mesh.position); fl.quaternion.copy(pad.mesh.quaternion); this.world.add(fl);
      this.bars.push({ mesh: fl, flash: 0 });
    }
  }
  // a bar swinging at your head height: duck under it (head down) in time
  spawnBar() {
    const { h } = headPose(this.app), yaw = this.app.windows.forwardYaw();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0x7a4a00, roughness: 0.5 }));
    mesh.position.set(h.x - Math.sin(yaw) * 3.5, h.y + 0.02, h.z - Math.cos(yaw) * 3.5); mesh.rotation.y = yaw;
    this.world.add(mesh); this.bars.push({ mesh, yaw, start: h.clone(), bar: true, d: 3.5, baseY: this.c.motion.height() });
    say('انخفض!', { rate: 1.3 });
  }
  update(dt, now) {
    for (const b of [...this.bars]) {
      if (b.flash != null) { b.flash += dt; b.mesh.scale.setScalar(1 + b.flash * 4); b.mesh.material.opacity = Math.max(0, 0.9 - b.flash * 3); if (b.flash > 0.3) { this.world.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); this.bars = this.bars.filter(x => x !== b); } continue; }
      b.d -= dt * 2.6;
      b.mesh.position.set(b.start.x - Math.sin(b.yaw) * b.d, b.start.y + 0.02, b.start.z - Math.cos(b.yaw) * b.d);
      if (b.d < 0.15) {
        // ducked? the head went down (ARKit) or bent forward/down
        const dropped = window.MadarIOS ? (b.baseY - this.c.motion.height()) > 0.14 : this.app.headForward.y < -0.42;
        if (dropped) { this.score += 25; say('ممتاز', { rate: 1.2 }); } else { this.combo = 0; blip('error', true); say('أصابتك', { rate: 1.2 }); }
        this.world.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); this.bars = this.bars.filter(x => x !== b);
      }
    }
    if (this.state !== 'play') return;
    this.time -= dt; this.kcal += 7.8 * (settings.weight || 75) / 3600 * dt; this.c.secs += dt; this.c.kcal += 7.8 * (settings.weight || 75) / 3600 * dt;
    if (this.time <= 0) {
      this.state = 'over'; this.clear();
      if (this.score > this.best) { this.best = this.score; saveSettings({ boxBest: this.score }); say('رقم قياسي جديد! ' + this.score + ' نقطة'); } else say('انتهت الجولة. ' + this.score + ' نقطة');
      return;
    }
    this.spawnT -= dt; this.barT -= dt;
    if (this.spawnT <= 0 && this.pads.length < 3) { this.spawn(); this.spawnT = Math.max(0.55, 1.2 - this.hits * 0.01); }
    if (this.barT <= 0) { this.spawnBar(); this.barT = 7 + Math.random() * 5; }
    for (const pad of [...this.pads]) {
      pad.life += dt; pad.mesh.scale.setScalar(Math.min(1, pad.life * 6));
      pad.ring.material.opacity = 0.8 * (1 - pad.life / 1.6);
      if (pad.life > 1.6) { this.combo = 0; this.kill(pad, false); }
    }
    // punches: a fist moving forward fast (hand tracking) into a pad
    const I = this.app.interaction, slots = this.app.hands.slots || [];
    slots.forEach((s, i) => {
      if (!s?.active) { this.prevHand[i] = null; return; }
      const p = I.pointers[i], pos = p.dir.clone().multiplyScalar(Math.max(0.2, s.depth || 0.4));
      const prev = this.prevHand[i]; this.prevHand[i] = { pos, t: now };
      if (!prev) return;
      const speed = pos.distanceTo(prev.pos) / Math.max(0.016, (now - prev.t) / 1000);
      if (speed < 1.1) return;
      // the pad nearest to where the fist is aimed
      this.app.windows.root.updateMatrixWorld();
      for (const pad of this.pads) {
        const wp = pad.mesh.getWorldPosition(new THREE.Vector3()).normalize();
        if (wp.angleTo(p.dir) < 0.22) { this.hit(pad, Math.min(2, speed / 1.5)); break; }
      }
    });
  }
  drawPanel(ctx, W, H, p, top) {
    text(ctx, 'الملاكمة في الهواء', W / 2, top + 40, 40, { weight: 800 });
    ctx.save(); ctx.shadowColor = 'rgba(255,90,60,0.7)'; ctx.shadowBlur = 26;
    text(ctx, arNum(this.score), W / 2, top + 170, 130, { weight: 800, color: '#fff1e6' }); ctx.restore();
    text(ctx, 'نقطة · الأفضل ' + arNum(this.best), W / 2, top + 260, 26, { color: COLORS.dim, weight: 700 });
    text(ctx, (this.state === 'play' ? fmt(this.time) : fmt(90)) + '  ·  سلسلة ' + arNum(this.combo) + '  ·  ' + arNum(Math.round(this.kcal)) + ' سعرة', W / 2, top + 312, 26, { weight: 700 });
    text(ctx, 'الأزرق بيدك اليسرى والأحمر باليمنى · العارضة الصفراء: انخفض', W / 2, top + 362, 22, { color: '#9fe7c0', maxWidth: W - 60, fit: true });
    text(ctx, this.app.hands.slots?.some(s => s.active) ? '✋ أرى يديك' : 'أظهر يديك للكاميرا — أو انظر للوسادة واضغط', W / 2, top + 400, 21, { color: COLORS.dim, maxWidth: W - 60, fit: true });
    const bw = (W - 72) / 2, y = H - 150;
    button(ctx, p, W - 30 - bw, y, bw, 116, this.state === 'play' ? 'إيقاف' : 'ابدأ الجولة', () => { this.state === 'play' ? (this.state = 'over', this.clear()) : this.start(); }, 'bx', true, this.state === 'play' ? 'pause' : 'play');
    button(ctx, p, 30, y, bw, 116, 'صحة', () => this.c.toHealth({ type: 'boxing' }), 'bh', false, 'heart');
  }
  dispose() { this.clear(); this.app.windows.root.remove(this.world); this.c.world = null; this.padGeo.dispose(); this.ringGeo.dispose(); }
}

// ---------------------------------------------------------------- eyes and neck
const EYE_PATTERNS = [['يمين ويسار', t => [Math.sin(t * 1.3) * 0.75, 0]], ['أعلى وأسفل', t => [0, Math.sin(t * 1.3) * 0.45]], ['دائرة', t => [Math.cos(t) * 0.6, Math.sin(t) * 0.4]], ['رقم ٨', t => [Math.sin(t) * 0.7, Math.sin(t * 2) * 0.3]], ['قريب وبعيد', t => [0, 0, 1 + 0.75 * Math.sin(t * 0.8)]]];
const NECK = [['انظر يميناً', 'yaw', -55], ['انظر يساراً', 'yaw', 55], ['انظر للأعلى', 'pitch', 35], ['انظر للأسفل', 'pitch', -40], ['أمِل رأسك لليمين', 'roll', -30], ['أمِل رأسك لليسار', 'roll', 30]];
export class EyesNeck {
  constructor(coach) {
    this.c = coach; this.app = coach.app; this.part = 'eyes'; this.state = 'ready'; this.i = 0; this.t = 0; this.done = 0;
    this.world = new THREE.Group(); this.app.renderer.scene.add(this.world);
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 24, 16), new THREE.MeshBasicMaterial({ color: 0x9fe7ff }));
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: haloTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x6fd0ff }));
    this.orb.add(halo); this.halo = halo; this.world.add(this.orb); this.orb.visible = false;
    this.target = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.12, 48), new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    this.world.add(this.target); this.target.visible = false;
    this.prog = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.16, 48, 1, Math.PI / 2, 0.001), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.target.add(this.prog);
    say('تمارين العين والرقبة. اختر العين أو الرقبة ثم ابدأ');
  }
  start(part) {
    this.part = part || this.part; this.state = 'play'; this.i = 0; this.t = 0; this.done = 0; this.hold = 0;
    this.yaw0 = this.app.windows.forwardYaw(); this.q0 = this.app.renderQ.clone();
    if (this.part === 'eyes') say('تابع النقطة بعينيك فقط، دون أن تحرك رأسك. ' + EYE_PATTERNS[0][0]);
    else say(NECK[0][0] + ' ببطء، واثبت ثلاث ثوانٍ');
  }
  update(dt, now) {
    this.orb.visible = this.state === 'play' && this.part === 'eyes';
    this.target.visible = this.state === 'play' && this.part === 'neck';
    if (this.state !== 'play') return;
    this.t += dt; this.c.secs += dt; this.c.kcal += 1.5 * (settings.weight || 75) / 3600 * dt;
    const yaw = this.yaw0, fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    if (this.part === 'eyes') {
      const [, f] = EYE_PATTERNS[this.i], [x, y, z = 1] = f(this.t * 1.4);
      const d = 1.6 * z;
      this.orb.position.copy(fwd.clone().multiplyScalar(d)).addScaledVector(right, x * d * 0.55).add(new THREE.Vector3(0, y * d * 0.55, 0));
      this.halo.lookAt(0, 0, 0);
      // the head should stay still
      if (this.app.renderQ.angleTo(this.q0) > 0.2 && now - (this.warnAt || 0) > 6000) { this.warnAt = now; say('ثبّت رأسك، حرّك عينيك فقط', { cut: false }); }
      if (this.t > 16) { this.i++; this.t = 0; this.q0 = this.app.renderQ.clone(); if (this.i >= EYE_PATTERNS.length) { this.finish('أغمض عينيك عشر ثوانٍ وأرخهما. أحسنت'); return; } say(EYE_PATTERNS[this.i][0]); }
    } else {
      const [name, axis, deg] = NECK[this.i], a = THREE.MathUtils.degToRad(deg);
      // where the target sits (yaw / pitch); the roll target is shown straight ahead, tilted
      let dir = fwd.clone();
      if (axis === 'yaw') dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      if (axis === 'pitch') dir = fwd.clone().multiplyScalar(Math.cos(a)).add(new THREE.Vector3(0, Math.sin(a), 0));
      this.target.position.copy(dir.multiplyScalar(1.4)); this.target.lookAt(0, 0, 0);
      if (axis === 'roll') this.target.rotateZ(a);
      // how close the head is to the asked position
      const e = new THREE.Euler().setFromQuaternion(this.app.renderQ, 'YXZ');
      const cur = axis === 'yaw' ? e.y - yaw : axis === 'pitch' ? e.x : e.z;
      const diff = Math.abs(Math.atan2(Math.sin(cur - a), Math.cos(cur - a)));
      const ok = diff < THREE.MathUtils.degToRad(axis === 'roll' ? 12 : 10);
      this.hold = ok ? this.hold + dt : Math.max(0, this.hold - dt * 2);
      this.target.material.color.setHex(ok ? 0xffd36b : 0x34d399);
      this.prog.geometry.dispose(); this.prog.geometry = new THREE.RingGeometry(0.13, 0.16, 48, 1, Math.PI / 2, Math.max(0.001, Math.min(1, this.hold / 3) * Math.PI * 2));
      if (this.hold >= 3) {
        this.done++; sayNumber(this.done); blip('tap', true); this.hold = 0; this.i++;
        if (this.i >= NECK.length) { this.finish('ممتاز. عُد بنظرك للأمام وأرخِ كتفيك'); return; }
        setTimeout(() => say(NECK[this.i]?.[0] || '', { cut: false }), 900);
      }
    }
  }
  finish(msg) { this.state = 'over'; say(msg); saveSettings({ eyeBreakAt: Date.now() }); }
  drawPanel(ctx, W, H, p, top) {
    text(ctx, 'العين والرقبة', W / 2, top + 40, 40, { weight: 800 });
    const bw = (W - 72) / 2;
    button(ctx, p, W - 30 - bw, top + 80, bw, 96, '👁 تمارين العين', () => this.start('eyes'), 'pe', this.part === 'eyes');
    button(ctx, p, 30, top + 80, bw, 96, 'تمارين الرقبة', () => this.start('neck'), 'pn', this.part === 'neck', null);
    const now = this.state === 'play' ? (this.part === 'eyes' ? EYE_PATTERNS[this.i]?.[0] : NECK[this.i]?.[0]) : this.state === 'over' ? 'انتهى — أحسنت' : 'استعد';
    ctx.save(); ctx.shadowColor = 'rgba(110,210,255,0.7)'; ctx.shadowBlur = 24; text(ctx, now || '', W / 2, top + 270, 54, { weight: 800, color: '#e6f8ff', maxWidth: W - 60, fit: true }); ctx.restore();
    text(ctx, this.part === 'eyes' ? 'تابع النقطة المضيئة بعينيك فقط · ٥ حركات' : 'وجّه رأسك نحو الحلقة واثبت ٣ ثوانٍ · ' + arNum(this.done) + ' / ٦', W / 2, top + 340, 24, { color: COLORS.dim, maxWidth: W - 60, fit: true });
    text(ctx, 'قاعدة ٢٠-٢٠-٢٠: كل ٢٠ دقيقة يذكّرك مدار أن تنظر بعيداً ٢٠ ثانية', W / 2, top + 392, 21, { color: '#9fe7c0', maxWidth: W - 60, fit: true });
    button(ctx, p, W - 30 - bw, H - 150, bw, 116, this.state === 'play' ? 'إيقاف' : 'ابدأ', () => { this.state === 'play' ? (this.state = 'over') : this.start(); }, 'ex', true, this.state === 'play' ? 'pause' : 'play');
    button(ctx, p, 30, H - 150, bw, 116, settings.eyeBreak !== false ? 'التذكير يعمل' : 'التذكير متوقف', () => saveSettings({ eyeBreak: settings.eyeBreak === false }), 'eb', false, 'clock');
  }
  dispose() { this.app.renderer.scene.remove(this.world); this.orb.geometry.dispose(); this.target.geometry.dispose(); }
}
let halo = null;
function haloTex() {
  if (halo) return halo;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.4)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); halo = new THREE.CanvasTexture(c); return halo;
}

// ---------------------------------------------------------------- treadmill
const ROUTES = [['trail', 'طريق ريفي', null], ['ghost-road', 'درب نيوزيلندا 360°', 'ghost-road.mp4'], ['alaska', 'تحليق فوق ألاسكا 360°', 'alaska.mp4'], ['tolmin', 'جبال تولمين 360°', 'tolmin.mp4'], ['ny-ferry', 'عبّارة نيويورك 360°', 'ny-ferry.mp4']];
// MET of walking / running at a speed (km/h) — ACSM-style table
const metAt = v => v < 3.2 ? 2.3 : v < 4.8 ? 3.0 : v < 5.6 ? 3.5 : v < 6.4 ? 4.3 : v < 7.2 ? 5.0 : v < 8 ? 7.0 : v < 9.7 ? 8.3 : v < 11.3 ? 9.8 : 11.0;
export class Treadmill {
  constructor(coach) {
    this.c = coach; this.app = coach.app;
    this.speed = settings.treadSpeed || 5; this.route = settings.treadRoute || 'trail'; this.state = 'ready';
    this.km = 0; this.secs = 0; this.kcal = 0; this.steps = 0;
    this.c.figure.yaw.rotation.y = Math.PI;   // the pacer walks ahead of you, the same way
    this.c.figure.root.position.set(-0.55, -1.55, -1.1);   // a little to the left, so the road ahead stays clear
    this.c.figure.setMuscles([], ['quads', 'hamstrings', 'glutes', 'calves'], 0.8);
    if (this.c.loaded) this.c.figure.play('walk', 0.9);
    else setTimeout(() => this.c.loaded && this.c.figure.play('walk', 0.9), 2500);
    this.buildTrail();
    say('جهاز المشي. اضبط السرعة لتطابق جهازك، ثم ابدأ');
  }
  // a trail through fields and trees that moves towards you at your speed
  buildTrail() {
    const g = this.world = new THREE.Group(); g.visible = false; this.app.renderer.scene.add(g);
    this.app.immersiveScene = g;   // the room / passthrough step aside while it runs
    const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float y = vP.y; vec3 c = mix(vec3(0.85,0.9,0.95), vec3(0.35,0.58,0.92), smoothstep(0.0, 0.5, y)); c = mix(c, vec3(1.0,0.86,0.62), pow(max(0.0, dot(vP, normalize(vec3(0.5,0.18,-1.0)))), 24.0)); if (y < 0.0) c = vec3(0.3,0.42,0.22); gl_FragColor = vec4(c,1.0); }' }));
    g.add(sky);
    const ct = document.createElement('canvas'); ct.width = 512; ct.height = 512; const x = ct.getContext('2d');
    x.fillStyle = '#4f7a35'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${40 + Math.random() * 60},${90 + Math.random() * 70},${30 + Math.random() * 30},0.5)`; x.fillRect(Math.random() * 512, Math.random() * 512, 2, 4); }
    const path = x.createLinearGradient(170, 0, 342, 0); path.addColorStop(0, 'rgba(160,130,90,0)'); path.addColorStop(0.12, '#b39a72'); path.addColorStop(0.88, '#b39a72'); path.addColorStop(1, 'rgba(160,130,90,0)');
    x.fillStyle = path; x.fillRect(170, 0, 172, 512);
    for (let i = 0; i < 1600; i++) { x.fillStyle = `rgba(${90 + Math.random() * 60},${70 + Math.random() * 40},${40},0.35)`; x.fillRect(190 + Math.random() * 132, Math.random() * 512, 3, 3); }
    this.ground = new THREE.CanvasTexture(ct); this.ground.colorSpace = THREE.SRGBColorSpace; this.ground.wrapS = this.ground.wrapT = THREE.RepeatWrapping; this.ground.repeat.set(1, 12); this.ground.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 160), new THREE.MeshBasicMaterial({ map: this.ground }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -1.55, -70); g.add(ground);
    const far = new THREE.Mesh(new THREE.CircleGeometry(88, 48), new THREE.MeshBasicMaterial({ color: 0x46703a })); far.rotation.x = -Math.PI / 2; far.position.y = -1.6; g.add(far);
    // hills on the horizon
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, h = new THREE.Mesh(new THREE.ConeGeometry(14 + Math.random() * 12, 10 + Math.random() * 14, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.3 + Math.random() * 0.05, 0.25, 0.32 + Math.random() * 0.08) })); h.position.set(Math.sin(a) * 75, 2, Math.cos(a) * 75); g.add(h); }
    // trees on both sides (one draw call for crowns, one for trunks)
    const n = 90; this.trees = [];
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 2.6, 8), new THREE.MeshLambertMaterial({ color: 0x2f6b2f }), n);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2a }), n);
    for (let i = 0; i < n; i++) this.trees.push({ x: (i % 2 ? 1 : -1) * (3 + Math.random() * 5), z: -Math.random() * 100, s: 0.7 + Math.random() * 0.8 });
    g.add(crown, trunk); this.crown = crown; this.trunk = trunk;
    g.add(new THREE.HemisphereLight(0xdfefff, 0x4a6a30, 1.2)); const sun = new THREE.DirectionalLight(0xfff0d8, 1.4); sun.position.set(5, 8, -6); g.add(sun);
    this.placeTrees();
  }
  placeTrees() {
    const m = new THREE.Matrix4();
    this.trees.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, -1.55 + 1.2 * t.s + 1.3 * t.s, t.z), new THREE.Quaternion(), new THREE.Vector3(t.s, t.s, t.s)); this.crown.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, -1.55 + 0.6 * t.s, t.z), new THREE.Quaternion(), new THREE.Vector3(t.s, t.s, t.s)); this.trunk.setMatrixAt(i, m);
    });
    this.crown.instanceMatrix.needsUpdate = true; this.trunk.instanceMatrix.needsUpdate = true;
  }
  setRoute(id) {
    this.route = id; saveSettings({ treadRoute: id });
    const r = ROUTES.find(x => x[0] === id);
    if (this.video) { this.app.windows.close(this.video); this.video = null; }
    if (r?.[2]) { this.video = this.app.windows.open({ kind: 'video', url: W8 + '/m/' + r[2], name: r[1], proj: '360' }); }
    this.world.visible = this.state === 'play' && !r?.[2];
  }
  start() {
    if (this.state === 'play') { this.state = 'pause'; this.c.figure.action && (this.c.figure.action.paused = true); say('توقف'); this.world.visible = false; this.video?.video?.pause(); return; }
    this.state = 'play'; this.setRoute(this.route); this.c.figure.action && (this.c.figure.action.paused = false);
    this.video?.video?.play().catch(() => {});
    say('انطلق بسرعة ' + this.speed + ' كيلومتر في الساعة');
  }
  setSpeed(v) {
    this.speed = Math.round(THREE.MathUtils.clamp(v, 1, 16) * 2) / 2; saveSettings({ treadSpeed: this.speed });
    this.c.figure.play(this.speed >= 7.5 ? 'run' : 'walk', this.speed >= 7.5 ? this.speed / 10 : this.speed / 5.2);
  }
  update(dt, now) {
    // steps from the bounce of your head (cadence → an estimate of your speed)
    const m = this.c.motion.update(now, 'bounce');
    if (m?.rep && this.state === 'play') { this.steps++; (this.stepTimes ||= []).push(now); while (this.stepTimes.length > 12) this.stepTimes.shift(); }
    if (this.state !== 'play') return;
    const v = this.speed / 3.6;   // m/s
    this.secs += dt; this.c.secs += dt; this.km += v * dt / 1000;
    const k = metAt(this.speed) * (settings.weight || 75) / 3600 * dt; this.kcal += k; this.c.kcal += k;
    if (this.world.visible) {
      this.ground.offset.y += v * dt / (160 / 12);
      for (const t of this.trees) { t.z += v * dt; if (t.z > 6) { t.z -= 106; t.x = (Math.random() < 0.5 ? 1 : -1) * (3 + Math.random() * 5); } }
      this.placeTrees();
    }
    // a 360° video plays at your pace
    const vv = this.video?.video; if (vv) vv.playbackRate = THREE.MathUtils.clamp(this.speed / 5, 0.5, 2);
    if (Math.floor(this.km * 10) !== this.lastTenth) { const was = this.lastTenth; this.lastTenth = Math.floor(this.km * 10); if (was != null && this.lastTenth % 5 === 0) say(arNum(this.lastTenth / 10) + ' كيلومتر'); }
  }
  cadence() { const s = this.stepTimes || []; if (s.length < 6) return 0; return (s.length - 1) / ((s[s.length - 1] - s[0]) / 60000); }
  drawPanel(ctx, W, H, p, top) {
    text(ctx, 'جهاز المشي', W / 2, top + 40, 40, { weight: 800 });
    // speed with − / +
    ctx.save(); ctx.shadowColor = 'rgba(80,200,140,0.7)'; ctx.shadowBlur = 24; text(ctx, arNum(this.speed), W / 2, top + 150, 110, { weight: 800, color: '#eafff3' }); ctx.restore();
    text(ctx, 'كم/س', W / 2, top + 222, 26, { color: COLORS.dim, weight: 700 });
    [['sp-', W / 2 - 200, -0.5, 'minus'], ['sp+', W / 2 + 200, 0.5, 'plus']].forEach(([id, x, d, ic]) => {
      const hov = p.isHover(id); ctx.beginPath(); ctx.arc(x, top + 140, 54, 0, 7); ctx.fillStyle = hov ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'; ctx.fill(); icon(ctx, ic, x, top + 140, 46);
      p.region(x - 60, top + 80, 120, 120, () => { blip('tap', settings.sounds); this.setSpeed(this.speed + d); }, id);
    });
    const cad = this.cadence();
    text(ctx, fmt(this.secs) + '  ·  ' + arNum(this.km.toFixed(2)) + ' كم  ·  ' + arNum(Math.round(this.kcal)) + ' سعرة', W / 2, top + 278, 27, { weight: 700 });
    text(ctx, cad ? 'خطواتك ' + arNum(Math.round(cad)) + ' في الدقيقة' : 'السعرات حسب وزنك ' + arNum(settings.weight || 75) + ' كغ', W / 2, top + 318, 22, { color: COLORS.dim });
    // routes
    const rw = (W - 60) / 3, rh = 60;
    ROUTES.slice(0, 3).forEach(([id, l], i) => { const x = W - 30 - (i + 1) * rw; button(ctx, p, x + 4, top + 350, rw - 8, rh, l, () => this.setRoute(id), 'r' + id, this.route === id); });
    ROUTES.slice(3).forEach(([id, l], i) => { const x = W - 30 - (i + 1) * rw; button(ctx, p, x + 4, top + 418, rw - 8, rh, l, () => this.setRoute(id), 'r' + id, this.route === id); });
    button(ctx, p, W / 2 - rw / 2 + 4 - rw - 4, top + 418, rw - 8, rh, '⚖️ جلب الوزن', () => this.c.fetchWeight(), 'wt', false);
    const bw = (W - 72) / 2;
    button(ctx, p, W - 30 - bw, H - 150, bw, 116, this.state === 'play' ? 'إيقاف' : 'ابدأ', () => this.start(), 'go', true, this.state === 'play' ? 'pause' : 'play');
    button(ctx, p, 30, H - 150, bw, 116, 'حفظ في صحة', () => this.c.toHealth({ type: this.speed >= 7.5 ? 'running' : 'walking', km: +this.km.toFixed(2) }), 'hl', false, 'heart');
  }
  dispose() {
    if (this.video) { try { this.app.windows.close(this.video); } catch {} }
    this.app.renderer.scene.remove(this.world); if (this.app.immersiveScene === this.world) this.app.immersiveScene = null;
    this.ground.dispose(); this.c.figure.stopClip(); this.c.figure.yaw.rotation.y = 0; this.c.figure.root.position.set(0, -1.55, -0.2);
  }
}
