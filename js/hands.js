// Hand tracking with MediaPipe Hand Landmarker on the passthrough camera frames.
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MODEL_CACHE = 'madar-models-v1';
const LOCAL_MODEL = new URL('../assets/hand_landmarker.task', import.meta.url).href;

class OneEuro {
  constructor(minCutoff = 1.4, beta = 2.0, dCutoff = 1.0) { this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff; this.x = null; this.dx = 0; this.t = 0; }
  alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(x, t) {
    if (this.x == null) { this.x = x; this.t = t; return x; }
    const dt = Math.max(1e-3, (t - this.t) / 1000); this.t = t;
    const dx = (x - this.x) / dt;
    this.dx += this.alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += this.alpha(cutoff, dt) * (x - this.x);
    return this.x;
  }
  reset() { this.x = null; this.dx = 0; }
}

// Fetch the model once with progress, then keep it in Cache Storage for offline use.
async function loadModel(onProgress) {
  let cache = null;
  try { cache = await caches.open(MODEL_CACHE); const hit = await cache.match(MODEL_URL); if (hit) { onProgress(1); return new Uint8Array(await hit.arrayBuffer()); } } catch {}
  // Prefer a copy hosted next to the app, then Google's CDN.
  let res = null;
  for (const u of [LOCAL_MODEL, MODEL_URL]) {
    try { const r = await fetch(u, { mode: 'cors' }); if (r.ok && (+r.headers.get('content-length') || 1e7) > 1e6) { res = r; break; } } catch {}
  }
  if (!res) throw new Error('تعذّر تنزيل نموذج تتبع اليد');
  const total = +res.headers.get('content-length') || 7.8e6;
  const reader = res.body?.getReader();
  let buf;
  if (reader) {
    const chunks = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress(Math.min(0.99, got / total)); }
    buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
  } else buf = new Uint8Array(await res.arrayBuffer());
  try { await cache?.put(MODEL_URL, new Response(buf.slice(), { headers: { 'content-type': 'application/octet-stream' } })); } catch {}
  onProgress(1);
  return buf;
}

const BONES = [[0, 5], [0, 17], [5, 9], [9, 13], [13, 17], [0, 9], [5, 6], [9, 10]];

export class HandTracker {
  constructor() {
    this.state = 'idle';   // idle | loading | ready | error
    this.progress = 0;
    this.landmarker = null;
    this.listeners = new Set();
    this.slots = [this.newSlot(0), this.newSlot(1)];
    this.lastVideoTime = -1;
    this.lastDetect = 0;
    this.busy = false;
    this.error = '';
    this.delegate = '';
  }
  newSlot(i) {
    return { i, active: false, seen: 0, fx: new OneEuro(), fy: new OneEuro(), fd: new OneEuro(0.8, 0.6), tx: 0, ty: 0, depth: 0.45, pinch: false, pinchDist: 1, strength: 0, tips: [], conf: 0 };
  }
  onChange(fn) { this.listeners.add(fn); }
  emit() { this.listeners.forEach(fn => fn(this)); }

  async load() {
    if (this.state === 'loading' || this.state === 'ready') return;
    this.state = 'loading'; this.progress = 0; this.emit();
    try {
      const vision = await import('../lib/mediapipe/vision_bundle.mjs');
      const base = new URL('../lib/mediapipe/wasm', import.meta.url).href;
      const fileset = await vision.FilesetResolver.forVisionTasks(base);
      const model = await loadModel(p => { this.progress = p; this.emit(); });
      const make = delegate => vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: model, delegate },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      try { this.landmarker = await make('GPU'); this.delegate = 'GPU'; }
      catch (e) { console.warn('GPU delegate failed, using CPU', e); this.landmarker = await make('CPU'); this.delegate = 'CPU'; }
      this.state = 'ready';
    } catch (e) {
      console.error(e);
      this.error = String(e && e.message || e);
      this.state = 'error';
    }
    this.emit();
  }

  // Run detection on the newest camera frame (throttled). `mapper` converts landmarks to head-local tan space.
  update(video, now, mapper) {
    for (const s of this.slots) if (s.active && now - s.seen > 260) { s.active = false; s.pinch = false; s.fx.reset(); s.fy.reset(); s.fd.reset(); }
    if (this.state !== 'ready' || !video || video.readyState < 2) return;
    if (video.currentTime === this.lastVideoTime) return;
    const interval = this.delegate === 'GPU' ? 30 : 45;
    if (now - this.lastDetect < interval) return;
    this.lastVideoTime = video.currentTime;
    this.lastDetect = now;
    let res;
    try { res = this.landmarker.detectForVideo(video, now); } catch (e) { console.warn(e); return; }
    if (!res || !res.landmarks) return;
    const found = [];
    for (let h = 0; h < res.landmarks.length; h++) {
      const lm = res.landmarks[h], wl = res.worldLandmarks?.[h];
      const score = res.handedness?.[h]?.[0]?.score ?? res.handednesses?.[h]?.[0]?.score ?? 1;
      if (!lm || !wl || score < 0.5) continue;
      const pts = lm.map(p => mapper(p.x, p.y));                 // head-local tan coords [tx, ty]
      // Depth from bone lengths: metric length in the image plane / angular length.
      let metric = 0, angular = 0;
      for (const [a, b] of BONES) {
        metric += Math.hypot(wl[a].x - wl[b].x, wl[a].y - wl[b].y);
        angular += Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
      }
      const depth = Math.min(1.2, Math.max(0.15, metric / Math.max(angular, 1e-4)));
      const pinchDist = Math.hypot(wl[4].x - wl[8].x, wl[4].y - wl[8].y, wl[4].z - wl[8].z);
      const px = (pts[4][0] + pts[8][0]) / 2, py = (pts[4][1] + pts[8][1]) / 2;
      found.push({ px, py, depth, pinchDist, pts, score });
    }
    // Assign detections to slots by proximity so each hand keeps its identity.
    const used = new Set();
    for (const f of found) {
      let best = null, bd = 0.35;
      for (const s of this.slots) {
        if (!s.active || used.has(s)) continue;
        const d = Math.hypot(s.tx - f.px, s.ty - f.py);
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) best = this.slots.find(s => !s.active && !used.has(s));
      if (!best) continue;
      used.add(best);
      const s = best;
      if (!s.active) { s.fx.reset(); s.fy.reset(); s.fd.reset(); s.pinch = false; }
      s.active = true; s.seen = now; s.conf = f.score;
      s.tx = s.fx.filter(f.px, now);
      s.ty = s.fy.filter(f.py, now);
      s.depth = s.fd.filter(f.depth, now);
      s.pinchDist = f.pinchDist;
      // Hysteresis keeps pinch stable.
      if (!s.pinch && f.pinchDist < 0.026) s.pinch = true;
      else if (s.pinch && f.pinchDist > 0.045) s.pinch = false;
      s.strength = Math.max(0, Math.min(1, (0.07 - f.pinchDist) / 0.045));
      s.tips = [f.pts[4], f.pts[8]];
      s.pts = f.pts; s.ptsTime = now;   // all 21 joints, used for the hand occlusion mask
    }
  }
}
