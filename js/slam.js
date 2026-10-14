// Experimental walking (6DoF): visual SLAM in a worker gives the head's position; the gyro keeps rotation.
// The whole world is shifted opposite to the head, so windows and models stay fixed in the room.
import * as THREE from 'three';
import { settings } from './config.js';

const W = 480, H = 270;   // frame size sent to SLAM (stage orientation)

export class Slam {
  constructor(app) {
    this.app = app;
    this.state = 'off';          // off | loading | init | tracking | lost | error
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.base = new THREE.Vector3();
    this.align = null;
    this.pendingQ = new THREE.Quaternion();
    this.busy = false;
    this.last = 0;
    this.lostSince = 0;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }
  get on() { return this.state !== 'off' && this.state !== 'error'; }

  start() {
    if (this.on) return;
    this.state = 'loading';
    this.app.toast('المشي: جاري التحميل…', 3000);
    try {
      this.worker = new Worker(new URL('../lib/alva/slam-worker.js', import.meta.url), { type: 'module' });
    } catch (e) { this.fail(e); return; }
    this.worker.onmessage = e => this.onMessage(e.data);
    this.worker.onerror = e => this.fail(e.message || e);
    const t = this.app.renderer.camTan();
    const fovV = 2 * Math.atan(t.y) * 180 / Math.PI;
    this.worker.postMessage({ type: 'init', w: W, h: H, fov: fovV });
    this.app.log('تشغيل المشي التجريبي');
  }
  stop() {
    this.worker?.terminate(); this.worker = null;
    this.state = 'off'; this.busy = false; this.align = null;
    this.pos.set(0, 0, 0); this.target.set(0, 0, 0); this.base.set(0, 0, 0);
  }
  fail(err) {
    this.app.log('تعذّر المشي: ' + err);
    this.stop(); this.state = 'error';
    this.app.toast('تعذّر تشغيل المشي على هذا الجهاز', 4000);
  }
  onMessage(d) {
    if (d.type === 'ready') {
      this.state = 'init';
      this.app.toast('تحرّك خطوة يميناً ثم يساراً ببطء لتثبيت العالم', 6000); this.app.log('المشي: بانتظار التثبيت');
    } else if (d.type === 'pose') {
      this.busy = false;
      this.onPose(d.pose);
    } else if (d.type === 'error') this.fail(d.message);
  }
  onPose(pose) {
    const now = performance.now();
    if (!pose) {
      if (this.state === 'tracking') { this.state = 'lost'; this.lostSince = now; }
      if (this.state === 'lost' && now - this.lostSince > 1500) {
        // SLAM restarts its map: continue from where we are.
        this.base.copy(this.pos); this.align = null; this.state = 'init';
        this.app.toast('فُقد التتبع — تحرّك ببطء أمام أشياء واضحة', 2500); this.app.log('المشي: فُقد التتبع');
      }
      return;
    }
    if (!this.align) { this.align = this.pendingQ.clone(); this.origin = new THREE.Vector3(pose[12], -pose[13], -pose[14]); }
    if (this.state !== 'tracking') { if (this.state === 'init') { this.app.toast('تم تثبيت العالم — يمكنك المشي حول المجسمات', 3000); this.app.log('المشي: يعمل'); } this.state = 'tracking'; }
    const t = new THREE.Vector3(pose[12], -pose[13], -pose[14]).sub(this.origin);
    this.target.copy(t.applyQuaternion(this.align).multiplyScalar(settings.walkScale)).add(this.base);
  }
  // Called every frame.
  update(video, now, headQ) {
    if (!this.on) return;
    this.pos.lerp(this.target, 0.3);
    if (this.state === 'loading' || this.busy || !video || video.readyState < 2 || now - this.last < 45) return;
    this.last = now;
    // Draw the camera frame in stage orientation.
    const r = this.app.renderer.videoRotation();
    const c = this.ctx;
    c.save();
    // Same mapping as the passthrough shader: r=90 turns the portrait frame counter-clockwise.
    if (r === 90) { c.translate(0, H); c.rotate(-Math.PI / 2); c.drawImage(video, 0, 0, H, W); }
    else if (r === -90) { c.translate(W, 0); c.rotate(Math.PI / 2); c.drawImage(video, 0, 0, H, W); }
    else c.drawImage(video, 0, 0, W, H);
    c.restore();
    const img = c.getImageData(0, 0, W, H);
    if (!this.align) this.pendingQ.copy(headQ);
    this.busy = true;
    this.worker.postMessage({ type: 'frame', w: W, h: H, buf: img.data.buffer }, [img.data.buffer]);
  }
}
