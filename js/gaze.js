// Eye tracking for laptop mode: MediaPipe Face Landmarker (iris + head pose) with a 9-point calibration.
// Produces a smoothed screen point (0..1) that drives the gaze cursor; a deliberate long blink clicks.
import { settings, saveSettings } from './config.js';

const LOCAL_MODEL = new URL('../assets/face_landmarker.task', import.meta.url).href;
const CDN_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

class Smooth {
  constructor(minCut = 0.8, beta = 0.6) { this.minCut = minCut; this.beta = beta; this.x = null; this.dx = 0; this.t = 0; }
  a(c, dt) { const tau = 1 / (2 * Math.PI * c); return 1 / (1 + tau / dt); }
  f(x, t) {
    if (this.x == null) { this.x = x; this.t = t; return x; }
    const dt = Math.max(1e-3, (t - this.t) / 1000); this.t = t;
    this.dx += this.a(1, dt) * ((x - this.x) / dt - this.dx);
    this.x += this.a(this.minCut + this.beta * Math.abs(this.dx), dt) * (x - this.x);
    return this.x;
  }
}

// Least squares with a little ridge: rows of features → target.
function solve(F, y, lambda = 1e-3) {
  const n = F[0].length, A = Array.from({ length: n }, () => new Array(n).fill(0)), b = new Array(n).fill(0);
  F.forEach((f, r) => { for (let i = 0; i < n; i++) { b[i] += f[i] * y[r]; for (let j = 0; j < n; j++) A[i][j] += f[i] * f[j]; } });
  for (let i = 0; i < n; i++) A[i][i] += lambda;
  for (let i = 0; i < n; i++) {                 // Gauss-Jordan
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    const d = A[i][i] || 1e-9;
    for (let j = 0; j < n; j++) A[i][j] /= d; b[i] /= d;
    for (let r = 0; r < n; r++) if (r !== i) { const k = A[r][i]; for (let j = 0; j < n; j++) A[r][j] -= k * A[i][j]; b[r] -= k * b[i]; }
  }
  return b;
}

export class GazeTracker {
  constructor(app) {
    this.app = app;
    this.state = 'off';      // off | loading | ready | error
    this.point = null;       // smoothed {x, y} in 0..1 screen space, or null when no face
    this.feat = null;
    this.sx = new Smooth(); this.sy = new Smooth();
    this.last = 0; this.lastVideoTime = -1;
    this.blinkStart = 0; this.onBlinkClick = null;
    this.calib = null;
  }
  get on() { return this.state === 'ready'; }
  async start() {
    if (this.state === 'loading' || this.state === 'ready') return;
    this.state = 'loading';
    this.app.toast('تتبع العين: جاري التحميل…', 3000);
    try {
      const vision = await import('../lib/mediapipe/vision_bundle.mjs');
      const fileset = await vision.FilesetResolver.forVisionTasks(new URL('../lib/mediapipe/wasm', import.meta.url).href);
      let buf = null;
      for (const u of [LOCAL_MODEL, CDN_MODEL]) {
        try { const r = await fetch(u); if (r.ok) { const b = new Uint8Array(await r.arrayBuffer()); if (b.length > 1e6) { buf = b; break; } } } catch {}
      }
      if (!buf) throw new Error('تعذّر تنزيل نموذج الوجه');
      const make = delegate => vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: buf, delegate }, runningMode: 'VIDEO', numFaces: 1,
        outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      });
      try { this.lm = await make('GPU'); } catch { this.lm = await make('CPU'); }
      this.state = 'ready';
      this.app.log('تتبع العين: جاهز');
      if (!settings.gazeModel) this.calibrate();
      else this.app.toast('تتبع العين يعمل · انظر إلى زر 3 ثوانٍ أو أغمض عينيك لحظة للنقر', 4500);
    } catch (e) {
      this.state = 'error'; this.app.log('تتبع العين: ' + (e.message || e));
      this.app.toast('تعذّر تشغيل تتبع العين', 3500);
    }
  }
  stop() { this.state = this.lm ? 'off' : 'off'; this.point = null; this.endCalib(); }

  features(lm, mat) {
    const P = i => lm[i];
    const eye = (iris, a, b, top, bot) => {
      const L = P(a).x < P(b).x ? P(a) : P(b), R = L === P(a) ? P(b) : P(a);
      return [(P(iris).x - L.x) / ((R.x - L.x) || 1e-4), (P(iris).y - P(top).y) / ((P(bot).y - P(top).y) || 1e-4)];
    };
    const e1 = eye(468, 33, 133, 159, 145), e2 = eye(473, 362, 263, 386, 374);
    let yaw = 0, pitch = 0;
    if (mat) { const m = mat.data || mat; yaw = Math.atan2(m[8], m[10]); pitch = Math.asin(Math.max(-1, Math.min(1, -m[9]))); }
    // Face position in the image also matters when the head moves.
    const nose = P(1);
    return [(e1[0] + e2[0]) / 2, (e1[1] + e2[1]) / 2, yaw, pitch, nose.x, nose.y, 1];
  }
  update(video, now) {
    if (!this.on || !video || video.readyState < 2 || video.currentTime === this.lastVideoTime || now - this.last < 45) return;
    this.last = now; this.lastVideoTime = video.currentTime;
    let r; try { r = this.lm.detectForVideo(video, now); } catch { return; }
    const lm = r && r.faceLandmarks && r.faceLandmarks[0];
    if (!lm || lm.length < 478) { this.point = null; return; }
    const f = this.features(lm, r.facialTransformationMatrixes && r.facialTransformationMatrixes[0]);
    this.feat = f;
    // Long blink (both eyes closed ~0.35-1.2 s) = click.
    const bs = r.faceBlendshapes && r.faceBlendshapes[0] && r.faceBlendshapes[0].categories;
    if (bs) {
      const g = n => (bs.find(c => c.categoryName === n) || {}).score || 0;
      const closed = g('eyeBlinkLeft') > 0.55 && g('eyeBlinkRight') > 0.55;
      if (closed && !this.blinkStart) this.blinkStart = now;
      if (!closed && this.blinkStart) {
        const d = now - this.blinkStart; this.blinkStart = 0;
        if (d > 350 && d < 1200 && settings.blinkClick && !this.calib) this.onBlinkClick?.();
      }
      if (closed) return;    // keep the last point while the eyes are closed
    }
    if (this.calib) { this.calib.sample(f, now); return; }
    const M = settings.gazeModel;
    if (!M) { this.point = null; return; }
    const dot = (w) => w.reduce((s, wi, i) => s + wi * f[i], 0);
    const x = Math.min(1, Math.max(0, dot(M.x))), y = Math.min(1, Math.max(0, dot(M.y)));
    this.point = { x: this.sx.f(x, now), y: this.sy.f(y, now) };
  }

  // 9 dots across the screen; ~1.3 s each.
  calibrate() {
    if (!this.on) { this.start(); return; }
    const ov = document.getElementById('gazeCal'), dot = ov.querySelector('.dot'), msg = ov.querySelector('.msg');
    const pts = [[0.5, 0.5], [0.1, 0.12], [0.5, 0.12], [0.9, 0.12], [0.9, 0.5], [0.9, 0.88], [0.5, 0.88], [0.1, 0.88], [0.1, 0.5]];
    const F = [], X = [], Y = [];
    let i = -1, t0 = 0, acc = [];
    ov.hidden = false; msg.textContent = 'انظر إلى النقطة دون تحريك رأسك';
    const next = now => {
      if (acc.length > 3) { const n = acc.length; const avg = acc[0].map((_, k) => acc.reduce((s, a) => s + a[k], 0) / n); F.push(avg); X.push(pts[i][0]); Y.push(pts[i][1]); }
      i++; acc = []; t0 = now;
      if (i >= pts.length) { this.finishCalib(F, X, Y); return; }
      dot.style.left = pts[i][0] * 100 + '%'; dot.style.top = pts[i][1] * 100 + '%';
      dot.classList.remove('go'); void dot.offsetWidth; dot.classList.add('go');
    };
    this.calib = { sample: (f, now) => { if (now - t0 > 550) acc.push(f); if (now - t0 > 1350) next(now); } };
    next(performance.now());
  }
  finishCalib(F, X, Y) {
    this.endCalib();
    if (F.length < 6) { this.app.toast('لم تكتمل المعايرة، تأكد أن وجهك ظاهر للكاميرا', 3500); return; }
    saveSettings({ gazeModel: { x: solve(F, X), y: solve(F, Y) } });
    this.sx = new Smooth(); this.sy = new Smooth();
    this.app.toast('تمت معايرة العين · انظر إلى زر 3 ثوانٍ أو أغمض عينيك لحظة للنقر', 4500);
    this.app.log('تتبع العين: تمت المعايرة');
  }
  endCalib() { this.calib = null; const ov = document.getElementById('gazeCal'); if (ov) ov.hidden = true; }
}
