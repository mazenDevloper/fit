// Runs AlvaAR (visual SLAM, WebAssembly) off the main thread and returns camera poses.
import { AlvaAR } from './alva_ar.js';
let alva = null;
self.onmessage = async (e) => {
  const d = e.data;
  try {
    if (d.type === 'init') {
      alva = await AlvaAR.Initialize(d.w, d.h, d.fov);
      self.postMessage({ type: 'ready' });
    } else if (d.type === 'frame' && alva) {
      const img = new ImageData(new Uint8ClampedArray(d.buf), d.w, d.h);
      const pose = alva.findCameraPose(img);
      self.postMessage({ type: 'pose', pose: pose ? Array.from(pose) : null, buf: d.buf }, [d.buf]);
    } else if (d.type === 'reset' && alva) {
      alva.reset();
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
