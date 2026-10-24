// 2D → spatial photos, on the device: Depth Anything V2 (small, Apache-2.0) estimates how far every part of an
// ordinary picture is; the picture then becomes a relief, so each eye sees real depth and it shifts as you move.
// The model (27 MB) and the ONNX runtime are downloaded once and kept in the cache; nothing leaves the phone.
const MODEL = new URL('../assets/depth/da2-small-q8.onnx', import.meta.url).href;
const ORT = new URL('../lib/ort/ort.wasm.min.mjs', import.meta.url).href;
const WASM = new URL('../lib/ort/', import.meta.url).href;
const CACHE = 'madar-models-v1';
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

let session = null;
async function fetchModel(onStep) {
  let cache = null;
  try { cache = await caches.open(CACHE); const hit = await cache.match(MODEL); if (hit) return new Uint8Array(await hit.arrayBuffer()); } catch {}
  const r = await fetch(MODEL); if (!r.ok) throw new Error('تعذّر تنزيل نموذج العمق');
  const total = +r.headers.get('content-length') || 27.3e6, rd = r.body?.getReader();
  let buf;
  if (rd) {
    const parts = []; let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onStep?.('⬇️ نموذج العمق ' + Math.round(got / total * 100) + '% (مرة واحدة فقط)'); }
    buf = new Uint8Array(got); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
  } else buf = new Uint8Array(await r.arrayBuffer());
  try { await cache?.put(MODEL, new Response(buf.slice(), { headers: { 'content-type': 'application/octet-stream' } })); } catch {}
  return buf;
}
async function getSession(onStep) {
  if (session) return session;
  session = (async () => {
    const ort = await import(ORT);
    ort.env.wasm.wasmPaths = WASM;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    const model = await fetchModel(onStep);
    onStep?.('🧠 تجهيز النموذج…');
    const s = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return { ort, s };
  })();
  try { return await session; } catch (e) { session = null; throw e; }
}

// source: an image / canvas / video frame. Returns a grey PNG data URL (bright = near), `size` px wide.
export async function depthMap(source, { onStep, longSide = 392, size = 256 } = {}) {
  const { ort, s } = await getSession(onStep);
  onStep?.('🧊 تقدير العمق…');
  const sw = source.naturalWidth || source.videoWidth || source.width, sh = source.naturalHeight || source.videoHeight || source.height;
  const k = longSide / Math.max(sw, sh), m14 = v => Math.max(14, Math.round(v / 14) * 14);
  const W = m14(sw * k), H = m14(sh * k);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(source, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data, n = W * H, input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) input[ch * n + i] = (px[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
  const feeds = { [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, H, W]) };
  const out = (await s.run(feeds))[s.outputNames[0]];
  const d = out.data, oh = out.dims[out.dims.length - 2], ow = out.dims[out.dims.length - 1];
  // robust range (ignore the 1 % extremes), then a gentle curve so near things stand out
  const sorted = Float32Array.from(d).sort(), lo = sorted[Math.floor(d.length * 0.01)], hi = sorted[Math.floor(d.length * 0.99)];
  const dc = document.createElement('canvas'); dc.width = ow; dc.height = oh;
  const dg = dc.getContext('2d'), im = dg.createImageData(ow, oh);
  for (let i = 0; i < d.length; i++) { const v = Math.max(0, Math.min(1, (d[i] - lo) / Math.max(1e-6, hi - lo))); const b = Math.round(Math.pow(v, 0.85) * 255); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = 255; }
  dg.putImageData(im, 0, 0);
  const oc = document.createElement('canvas'); oc.width = size; oc.height = Math.max(2, Math.round(size * sh / sw));
  const og = oc.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(dc, 0, 0, oc.width, oc.height);
  return oc.toDataURL('image/png');
}

// depth maps of your library photos are kept, so a photo converted once opens spatial every time
const KEY = id => 'madar.depth.' + id;
export function cachedDepth(itemId) { try { return itemId ? localStorage.getItem(KEY(itemId)) : null; } catch { return null; } }
export function saveDepth(itemId, png) { try { if (itemId) localStorage.setItem(KEY(itemId), png); } catch {} }
export function forgetDepth(itemId) { try { localStorage.removeItem(KEY(itemId)); } catch {} }
