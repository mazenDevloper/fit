// «كاميرا الجسم»: the front camera watches you train (laptop, or the phone standing in front of you) - MediaPipe
// body pose, joint angles → reps for every exercise and form corrections. Everything runs on the device.
const MODEL = new URL('../assets/pose_landmarker_lite.task', import.meta.url).href;
const WASM = new URL('../lib/mediapipe/wasm', import.meta.url).href;
// MediaPipe body landmarks
const L = { nose: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };
export const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

// how each exercise is seen: the signal, the thresholds (hysteresis) and its direction; form rules
export const CAM = {
  squat: { sig: 'knee', dir: 'down', enter: 112, exit: 155, form: m => m.trunk > 50 ? 'ارفع صدرك — ظهرك مستقيم' : null, depth: [115, 'انزل أكثر قليلاً'] },
  lunge: { sig: 'knee', dir: 'down', enter: 112, exit: 155, form: m => m.trunk > 30 ? 'جذعك مستقيم' : null },
  jacks: { sig: 'arms', dir: 'up', enter: 120, exit: 50 },
  knees: { sig: 'hip', dir: 'down', enter: 120, exit: 155 },
  calf: { sig: 'rise', dir: 'up', enter: 0.025, exit: 0.008 },
  pushup: { sig: 'elbow', dir: 'down', enter: 100, exit: 150, form: m => m.body < 155 ? 'شدّ بطنك — جسمك خط مستقيم' : null },
  plank: { sig: null, form: m => m.body < 160 ? 'لا ترفع الأرداف ولا تُنزلها' : null },
  curl: { sig: 'elbow', dir: 'down', enter: 70, exit: 140, form: m => m.upperArm > 35 ? 'ثبّت مرفقيك بجانب جسمك' : null },
  press: { sig: 'elbow', dir: 'up', enter: 155, exit: 105, form: m => m.trunk > 18 ? 'لا تقوّس ظهرك' : null },
  lateral: { sig: 'arms', dir: 'up', enter: 72, exit: 30, form: m => m.arms > 110 ? 'إلى مستوى الكتف فقط' : null },
  row: { sig: 'elbow', dir: 'down', enter: 100, exit: 150 },
  chestpress: { sig: 'elbow', dir: 'up', enter: 150, exit: 105 },
  pushdown: { sig: 'elbow', dir: 'up', enter: 150, exit: 95, form: m => m.upperArm > 35 ? 'المرفقان ثابتان بجانبك' : null },
  neck: { sig: null },
};

const ang = (a, b, c) => {   // angle at b (degrees)
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y); if (!d) return 180;
  return Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / d))) * 180 / Math.PI;
};
const fromVertical = (top, bottom) => Math.abs(Math.atan2(top.x - bottom.x, bottom.y - top.y)) * 180 / Math.PI;   // 0 = upright

export class PoseCam {
  constructor() { this.on = false; this.pts = null; this.state = 'rest'; this.ext = null; }
  async start() {
    if (this.on || this.starting) return this.on;
    this.starting = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      const v = this.video = document.createElement('video'); v.playsInline = true; v.muted = true; v.srcObject = this.stream; await v.play();
      const vision = await import('../lib/mediapipe/vision_bundle.mjs');
      const fs = await vision.FilesetResolver.forVisionTasks(WASM);
      const make = delegate => vision.PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numPoses: 1 });
      try { this.lm = await make('GPU'); } catch { this.lm = await make('CPU'); }
      this.on = true;
    } catch (e) { this.stop(); this.error = e.message || String(e); }
    this.starting = false;
    return this.on;
  }
  stop() { this.on = false; try { this.stream?.getTracks().forEach(t => t.stop()); } catch {} this.stream = null; try { this.lm?.close(); } catch {} this.lm = null; this.pts = null; }
  // the latest pose (≈15 per second) and its measurements
  read(now) {
    if (!this.on || !this.video || this.video.readyState < 2) return null;
    if (now - (this.at || 0) < 66) return this.m;
    this.at = now;
    let r; try { r = this.lm.detectForVideo(this.video, now); } catch { return this.m; }
    const p = r?.landmarks?.[0];
    if (!p) { this.pts = null; this.m = { seen: false }; return this.m; }
    const k = this.video.videoWidth / Math.max(1, this.video.videoHeight);
    this.pts = p.map(q => ({ x: q.x * k, y: q.y, v: q.visibility ?? 1 }));
    const P = this.pts, vis = (...i) => i.every(j => P[j].v > 0.5);
    const side = (P[L.ls].v + P[L.le].v + P[L.lh].v + P[L.lk].v) >= (P[L.rs].v + P[L.re].v + P[L.rh].v + P[L.rk].v) ? 'l' : 'r';
    const g = n => P[L[side + n]];
    const m = { seen: true, full: vis(L.ls, L.rs, L.lh, L.rh, L.lk, L.rk, L.la, L.ra), upper: vis(L.ls, L.rs, L.le, L.re, L.lw, L.rw) };
    m.knee = Math.min(ang(P[L.lh], P[L.lk], P[L.la]), ang(P[L.rh], P[L.rk], P[L.ra]));
    m.elbow = (ang(P[L.ls], P[L.le], P[L.lw]) + ang(P[L.rs], P[L.re], P[L.rw])) / 2;
    m.arms = (ang(P[L.lh], P[L.ls], P[L.le]) + ang(P[L.rh], P[L.rs], P[L.re])) / 2;   // arm raised from the side
    m.hip = Math.min(ang(P[L.ls], P[L.lh], P[L.lk]), ang(P[L.rs], P[L.rh], P[L.rk]));
    m.body = ang(g('s'), g('h'), g('a'));   // shoulder–hip–ankle: 180 = a straight line
    m.trunk = fromVertical({ x: (P[L.ls].x + P[L.rs].x) / 2, y: (P[L.ls].y + P[L.rs].y) / 2 }, { x: (P[L.lh].x + P[L.rh].x) / 2, y: (P[L.lh].y + P[L.rh].y) / 2 });
    m.upperArm = Math.max(fromVertical(P[L.le], P[L.ls]) * (P[L.le].y > P[L.ls].y ? 1 : 0), 0);
    // rising on the toes: the nose goes up relative to a slow baseline
    this.base = this.base == null ? P[L.nose].y : this.base * 0.985 + P[L.nose].y * 0.015;
    m.rise = this.base - P[L.nose].y;
    this.m = m; return m;
  }
  // one rep when the signal crosses «enter» and comes back past «exit»; returns { rep, ext } (ext = the deepest value)
  rep(spec, m) {
    if (!spec?.sig || !m?.seen || m[spec.sig] == null) return null;
    const v = m[spec.sig], down = spec.dir === 'down';
    if (this.state === 'rest') { if (down ? v < spec.enter : v > spec.enter) { this.state = 'in'; this.ext = v; } return null; }
    this.ext = down ? Math.min(this.ext, v) : Math.max(this.ext, v);
    if (down ? v > spec.exit : v < spec.exit) { this.state = 'rest'; return { rep: true, ext: this.ext }; }
    return null;
  }
  reset() { this.state = 'rest'; this.ext = null; }
  // a stick figure of what the camera sees (mirrored, like a mirror)
  draw(ctx, x, y, w, h) {
    ctx.save(); ctx.beginPath(); ctx.roundRect?.(x, y, w, h, 24); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    const P = this.pts; if (!P) { ctx.restore(); return; }
    const xs = P.map(q => q.x), ys = P.map(q => q.y), minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const s = Math.min((w - 40) / Math.max(0.05, maxx - minx), (h - 40) / Math.max(0.05, maxy - miny));
    const X = q => x + w / 2 - ((q.x - (minx + maxx) / 2) * s), Y = q => y + h / 2 + (q.y - (miny + maxy) / 2) * s;
    ctx.lineCap = 'round'; ctx.lineWidth = 7;
    for (const [a, b] of BONES) { if (P[a].v < 0.4 || P[b].v < 0.4) continue; ctx.strokeStyle = 'rgba(159,231,192,0.95)'; ctx.beginPath(); ctx.moveTo(X(P[a]), Y(P[a])); ctx.lineTo(X(P[b]), Y(P[b])); ctx.stroke(); }
    ctx.fillStyle = '#fff1e6'; for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) if (P[i].v > 0.4) { ctx.beginPath(); ctx.arc(X(P[i]), Y(P[i]), i ? 7 : 14, 0, 7); ctx.fill(); }
    ctx.restore();
  }
}
