// «Animoji»: your face drives the Memoji - the front camera, MediaPipe's face model (52 Apple-style blendshapes:
// jawOpen, eyeBlinkLeft…) and the head's rotation. Runs on the device, nothing leaves it.
const MODEL = new URL('../lib/mediapipe/face_landmarker.task', import.meta.url).href;
let lm = null, loading = null;
async function landmarker() {
  if (lm) return lm;
  loading ||= (async () => {
    const vision = await import('../lib/mediapipe/vision_bundle.mjs');
    const fileset = await vision.FilesetResolver.forVisionTasks(new URL('../lib/mediapipe/wasm', import.meta.url).href);
    const make = delegate => vision.FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true });
    try { lm = await make('GPU'); } catch { lm = await make('CPU'); }
    return lm;
  })();
  return loading;
}
// start: calls onFace({ jawOpen, eyeBlinkLeft, … }, { x, y, z } radians) every frame; returns stop()
export async function track(onFace, video = null) {
  const L = await landmarker();
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
  const v = video || Object.assign(document.createElement('video'), { muted: true, playsInline: true });
  v.srcObject = stream; await v.play();
  let on = true, last = -1;
  const loop = () => {
    if (!on) return;
    if (v.readyState >= 2 && v.currentTime !== last) {
      last = v.currentTime;
      const r = L.detectForVideo(v, performance.now());
      const cats = r.faceBlendshapes?.[0]?.categories;
      if (cats) {
        const bs = {}; for (const c of cats) bs[c.categoryName] = c.score;
        let rot = null; const m = r.facialTransformationMatrixes?.[0]?.data;
        if (m) { rot = { x: Math.asin(-Math.max(-1, Math.min(1, m[9]))), y: Math.atan2(m[8], m[10]), z: Math.atan2(m[1], m[5]) }; }
        onFace(bs, rot);
      }
    }
    requestAnimationFrame(loop);
  };
  loop();
  return () => { on = false; stream.getTracks().forEach(t => t.stop()); };
}
