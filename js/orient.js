// Keeps the MR stage in landscape no matter how iOS reports orientation, and tracks head rotation.
import * as THREE from 'three';

export class StageOrientation {
  constructor(stage) {
    this.stage = stage;
    this.gx = 0; this.gy = 0;
    this.sign = 1;            // calibrates accelerometer sign against the browser's own orientation
    this.physical = 90;       // last known physical landscape side (90 or -90)
    this.width = 0; this.height = 0; this.rotation = 0; this.screenAngle = 90;
    this.listeners = new Set();
    this._onMotion = e => this.onMotion(e);
    this._onResize = () => this.layout();
    window.addEventListener('devicemotion', this._onMotion);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', () => setTimeout(this._onResize, 250));
    window.visualViewport?.addEventListener('resize', this._onResize);
    this.layout();
  }
  browserAngle() {
    let a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (typeof window.orientation === 'number' ? window.orientation : 0);
    if (a === 270) a = -90;
    return a;
  }
  onMotion(e) {
    const g = e.accelerationIncludingGravity; if (!g || g.x == null) return;
    this.gx = this.gx * 0.8 + g.x * 0.2;
    this.gy = this.gy * 0.8 + g.y * 0.2;
    const landscapeView = innerWidth > innerHeight;
    const a = this.browserAngle();
    if (landscapeView && Math.abs(this.gx) > 6 && (a === 90 || a === -90)) {
      this.sign = a === 90 ? (this.gx < 0 ? 1 : -1) : (this.gx > 0 ? 1 : -1);
    }
    if (Math.abs(this.gx) > 4.5 && Math.abs(this.gx) > Math.abs(this.gy)) {
      const side = this.gx * this.sign < 0 ? 90 : -90;
      if (side !== this.physical) { this.physical = side; this.layout(); }
    }
  }
  layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = this.stage.style;
    if (vw >= vh) {
      this.rotation = 0;
      this.width = vw; this.height = vh;
      const a = this.browserAngle();
      this.screenAngle = (a === 90 || a === -90) ? a : this.physical;
      s.width = vw + 'px'; s.height = vh + 'px'; s.transform = 'none';
    } else {
      // Rotation lock is on (or the page has not rotated yet): rotate the stage ourselves.
      this.rotation = this.physical;
      this.width = vh; this.height = vw;
      this.screenAngle = this.physical;
      s.width = vh + 'px'; s.height = vw + 'px';
      s.transform = this.physical === 90
        ? `translate(${vw}px,0) rotate(90deg)`
        : `translate(0,${vh}px) rotate(-90deg)`;
    }
    this.listeners.forEach(fn => fn(this));
  }
  onChange(fn) { this.listeners.add(fn); }
  // Map a real touch point (viewport px) into stage px.
  toStage(x, y) {
    if (this.rotation === 90) return { x: y, y: window.innerWidth - x };
    if (this.rotation === -90) return { x: window.innerHeight - y, y: x };
    return { x, y };
  }
}

const zee = new THREE.Vector3(0, 0, 1);
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const DEG = Math.PI / 180;

export class HeadTracker {
  constructor(orientation) {
    this.orientation = orientation;
    this.raw = new THREE.Quaternion();
    this.samples = [];
    this.yawOffset = 0;
    this.hasData = false;
    this.euler = new THREE.Euler();
    this.q0 = new THREE.Quaternion();
    this._on = e => this.onOrient(e);
    window.addEventListener('deviceorientation', this._on);
  }
  onOrient(e) {
    if (e.alpha == null) return;
    this.hasData = true;
    const orient = this.orientation.screenAngle * DEG;
    this.euler.set(e.beta * DEG, e.alpha * DEG, -e.gamma * DEG, 'YXZ');
    const q = new THREE.Quaternion().setFromEuler(this.euler);
    q.multiply(q1);
    q.multiply(this.q0.setFromAxisAngle(zee, -orient));
    const now = performance.now();
    this.samples.push({ t: now, q });
    while (this.samples.length > 2 && now - this.samples[0].t > 400) this.samples.shift();
    this.raw.copy(q);
  }
  // Pose at (now - delayMs), with recenter offset applied.
  pose(delayMs, out) {
    const t = performance.now() - delayMs;
    let q = this.raw;
    const s = this.samples;
    if (delayMs > 0 && s.length > 1) {
      let i = s.length - 1;
      while (i > 0 && s[i - 1].t > t) i--;
      if (i > 0) {
        const a = s[i - 1], b = s[i];
        const f = THREE.MathUtils.clamp((t - a.t) / Math.max(1, b.t - a.t), 0, 1);
        q = a.q.clone().slerp(b.q, f);
      } else q = s[0].q;
    }
    const yq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.yawOffset);
    return out.copy(yq).multiply(q);
  }
  currentYaw() {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.raw);
    return Math.atan2(-f.x, -f.z);
  }
  recenter() { this.yawOffset = this.currentYaw(); }
}
