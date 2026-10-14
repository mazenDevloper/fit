// Settings store, viewer presets and persistent layout.
const KEY = 'madar.settings.v1';
const LAYOUT_KEY = 'madar.layout.v1';
const LINKS_KEY = 'madar.links.v1';

export const VIEWER_PRESETS = {
  vrbox:     { label: 'علبة VR عامة',      lensSep: 63,   screenToLens: 39.5, k1: 0.22, k2: 0.10 },
  cardboard: { label: 'Cardboard v2',       lensSep: 64,   screenToLens: 39.3, k1: 0.34, k2: 0.55 },
  light:     { label: 'عدسات خفيفة',       lensSep: 62,   screenToLens: 45,   k1: 0.10, k2: 0.00 },
  myglasses: { label: 'مع نظارتي الطبية',   lensSep: 63,   screenToLens: 40,   k1: 0.17, k2: 0.06 },
  none:      { label: 'بدون تصحيح عدسات',  lensSep: 62,   screenToLens: 45,   k1: 0.00, k2: 0.00 },
};

export const DEFAULTS = {
  preset: 'myglasses',
  lensSep: 63,          // mm between lens centres
  screenToLens: 40,     // mm, sets the field of view (smaller = bigger image)
  k1: 0.17, k2: 0.06,   // radial distortion
  ipd: 68,              // mm, eye separation used for virtual content
  vOffset: -6,          // mm, vertical shift of lens centres (negative = lower, for a phone sitting high so the camera is clear)
  camera: 'wide',       // 'wide' | 'ultra'
  camFov: 69,           // horizontal FOV of camera in degrees (real-scale passthrough)
  worldScale: 1,        // passthrough zoom (1 = real size)
  poseDelay: 40,        // ms, delay virtual pose to match camera latency
  dwell: true,          // gaze dwell click on buttons when no hands visible
  voice: false,
  sounds: true,
  environment: 'passthrough', // 'passthrough' | 'dim' | 'immersive'
  handsEnabled: true,
  sharpen: 0.55,        // global sharpening
  rxStrength: 1,        // how strongly the prescription shapes per-eye sharpening
  rxR: { sph: -0.75, cyl: -0.50, axis: 90 },   // from the user's glasses card
  rxL: { sph: 0.50, cyl: -3.00, axis: 65 },
  dwellMs: 3000,
  viewMode: 'sbs',      // 'sbs' = headset (two eyes), 'mono' = phone full screen with on-screen controls
  walk: false,          // experimental 6DoF walking
  walkScale: 1.5,       // metres per SLAM unit (monocular SLAM has no absolute scale)
  v: 4,
};

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

export const settings = Object.assign({}, DEFAULTS, JSON.parse(safeGet(KEY) || '{}'));
// v2: views sit lower and slightly larger by default; move users still on the old defaults.
if (!settings.v || settings.v < 2) {
  if (settings.vOffset === 0) settings.vOffset = DEFAULTS.vOffset;
  if (settings.preset === 'vrbox' && settings.screenToLens === 42) settings.screenToLens = 39.5;
  settings.v = 2;
  safeSet(KEY, JSON.stringify(settings));
}
// v3: eye distance measured from the user's photo (~68 mm); glasses-friendly lens profile.
if (settings.v < 3) {
  if (settings.ipd === 64) settings.ipd = 68;
  if (['vrbox', 'custom'].includes(settings.preset)) Object.assign(settings, { preset: 'myglasses', screenToLens: 40, k1: 0.17, k2: 0.06 });
  settings.v = 3;
  safeSet(KEY, JSON.stringify(settings));
}
// v4: per-eye prescription, sharpening, 3 s gaze click.
if (settings.v < 4) { Object.assign(settings, { sharpen: 0.55, rxStrength: 1, rxR: { sph: -0.75, cyl: -0.5, axis: 90 }, rxL: { sph: 0.5, cyl: -3, axis: 65 }, dwellMs: 3000, v: 4 }); safeSet(KEY, JSON.stringify(settings)); }
// v5: laptops/desktops start in laptop mode (front camera, keyboard and mouse).
if (settings.v < 5) {
  try { if (!('ontouchstart' in window) && matchMedia('(pointer: fine)').matches && typeof DeviceOrientationEvent?.requestPermission !== 'function') settings.viewMode = 'desktop'; } catch {}
  settings.v = 5; safeSet(KEY, JSON.stringify(settings));
}

const listeners = new Set();
export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function saveSettings(patch = {}) {
  Object.assign(settings, patch);
  safeSet(KEY, JSON.stringify(settings));
  listeners.forEach(fn => fn(settings));
}
export function applyPreset(name) {
  const p = VIEWER_PRESETS[name]; if (!p) return;
  saveSettings({ preset: name, lensSep: p.lensSep, screenToLens: p.screenToLens, k1: p.k1, k2: p.k2 });
}
export function resetSettings() {
  Object.keys(settings).forEach(k => delete settings[k]);
  saveSettings(Object.assign({}, DEFAULTS));
}

export function loadLayout() { try { return JSON.parse(safeGet(LAYOUT_KEY) || 'null'); } catch { return null; } }
export function saveLayout(l) { safeSet(LAYOUT_KEY, JSON.stringify(l)); }

export const DEFAULT_LINKS = [
  { id: 'cplay2', title: 'cplay2', url: 'https://cplay2.netlify.app/media' },
  { id: 'l1', title: 'فيديو تجريبي من يوتيوب', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
];
export function loadLinks() {
  try {
    const v = JSON.parse(safeGet(LINKS_KEY) || 'null');
    if (!Array.isArray(v)) return DEFAULT_LINKS.slice();
    if (!v.some(l => /cplay2\.netlify\.app/.test(l.url))) v.unshift(DEFAULT_LINKS[0]);
    return v;
  }
  catch { return DEFAULT_LINKS.slice(); }
}
export function saveLinks(l) { safeSet(LINKS_KEY, JSON.stringify(l)); }

// CSS pixels per millimetre on iPhone screens (points per inch / 25.4).
export function pxPerMm() {
  const dpr = window.devicePixelRatio || 2;
  const ppi = dpr >= 3 ? 153 : 163;
  return ppi / 25.4;
}
