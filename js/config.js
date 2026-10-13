// Settings store, viewer presets and persistent layout.
const KEY = 'madar.settings.v1';
const LAYOUT_KEY = 'madar.layout.v1';
const LINKS_KEY = 'madar.links.v1';

export const VIEWER_PRESETS = {
  vrbox:     { label: 'علبة VR عامة',      lensSep: 63,   screenToLens: 39.5, k1: 0.22, k2: 0.10 },
  cardboard: { label: 'Cardboard v2',       lensSep: 64,   screenToLens: 39.3, k1: 0.34, k2: 0.55 },
  light:     { label: 'عدسات خفيفة',       lensSep: 62,   screenToLens: 45,   k1: 0.10, k2: 0.00 },
  none:      { label: 'بدون تصحيح عدسات',  lensSep: 62,   screenToLens: 45,   k1: 0.00, k2: 0.00 },
};

export const DEFAULTS = {
  preset: 'vrbox',
  lensSep: 63,          // mm between lens centres
  screenToLens: 39.5,   // mm, sets the field of view (smaller = bigger image)
  k1: 0.22, k2: 0.10,   // radial distortion
  ipd: 64,              // mm, eye separation used for virtual content
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
  v: 2,
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
  { id: 'l1', title: 'فيديو تجريبي من يوتيوب', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
];
export function loadLinks() {
  try { const v = JSON.parse(safeGet(LINKS_KEY) || 'null'); return Array.isArray(v) ? v : DEFAULT_LINKS.slice(); }
  catch { return DEFAULT_LINKS.slice(); }
}
export function saveLinks(l) { safeSet(LINKS_KEY, JSON.stringify(l)); }

// CSS pixels per millimetre on iPhone screens (points per inch / 25.4).
export function pxPerMm() {
  const dpr = window.devicePixelRatio || 2;
  const ppi = dpr >= 3 ? 153 : 163;
  return ppi / 25.4;
}
