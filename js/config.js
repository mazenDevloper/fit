// Settings store, viewer presets and persistent layout.
const KEY = 'madar.settings.v1';
const LAYOUT_KEY = 'madar.layout.v1';
const LINKS_KEY = 'madar.links.v1';

export const VIEWER_PRESETS = {
  vrbox:     { label: 'علبة VR عامة',      lensSep: 70,   screenToLens: 39.5, k1: 0.22, k2: 0.10 },
  cardboard: { label: 'Cardboard v2',       lensSep: 70,   screenToLens: 39.3, k1: 0.34, k2: 0.55 },
  light:     { label: 'عدسات خفيفة',       lensSep: 70,   screenToLens: 45,   k1: 0.10, k2: 0.00 },
  myglasses: { label: 'مع نظارتي الطبية',   lensSep: 70,   screenToLens: 40,   k1: 0.17, k2: 0.06 },
  none:      { label: 'بدون تصحيح عدسات',  lensSep: 70,   screenToLens: 45,   k1: 0.00, k2: 0.00 },
};

export const DEFAULTS = {
  preset: 'myglasses',
  lensSep: 70,          // mm between lens centres
  screenToLens: 40,     // mm, sets the field of view (smaller = bigger image)
  k1: 0.17, k2: 0.06,   // radial distortion
  ipd: 70,              // mm, eye separation used for virtual content
  restoreLayout: false,
  webOneSource: true,    // web pages in the headset: one copy drawn for both eyes (identical eyes, cooler iPhone)
  builtinBrowser: true,  // in the headset, open sites in a paired tablet's built-in browser (click anywhere, curve, 360)
  myTeams: [],           // favourite teams (synced from cplay2): [{name, country}]
  island: true,          // live match island at the top of the view
  allGoals: false,
  vSkew: 0,             // mm, right lens higher (+) or lower (-) than the left one
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
  dwellMs: 2000,
  handDwell: true,       // hold the hand pointer still on something to click (one finger = mouse)
  handDwellMs: 2000,
  stabilizer: true,      // filters small head tremors out of the pointers
  cool: true,            // cooler iPhone: 30 fps camera, lighter rendering
  coolMax: true,         // maximum cooling: always 30 fps drawing, lighter resolution and hand tracking
  moveEnabled: true,    // walk around the environment (sticks, keys, hand drag)
  eyeTrack: false,      // laptop mode: eye tracking with the front camera
  blinkClick: true,     // long blink = click
  gazeModel: null,      // eye calibration result
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
// v6: 2 s clicks, hand-hold click, stabiliser and cool mode on.
if (settings.v < 6) { Object.assign(settings, { dwellMs: 2000, handDwell: true, handDwellMs: 2000, stabilizer: true, cool: true, v: 6 }); safeSet(KEY, JSON.stringify(settings)); }
// v7: 7 cm between lenses, maximum cooling on.
if (settings.v < 7) { Object.assign(settings, { lensSep: 70, ipd: 70, cool: true, coolMax: true, v: 7 }); safeSet(KEY, JSON.stringify(settings)); }

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
    v.forEach(l => { l.url = l.url.replace('cplay3.netlify.app', 'cplay2.netlify.app'); });
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

// ---- This device's permanent identity: a fixed 6-digit number (its "remote number") and a name ----
const DEVICE_KEY = 'madar.device.v1';
export function deviceKind() {
  const u = navigator.userAgent;
  if (/PlayStation/i.test(u)) return 'playstation';
  if (/VIDAA|Hisense|Tizen|SMART-TV|SmartTV|Web0S|webOS|BRAVIA|Android TV|AFT/i.test(u)) return 'tv';
  if (/iPhone/.test(u)) return 'iphone';
  if (/iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) return 'ipad';
  if (/Android/.test(u)) return /Mobile/.test(u) ? 'phone' : 'tablet';
  return 'computer';
}
export const KIND_LABEL = { playstation: 'بلايستيشن', tv: 'تلفاز', iphone: 'آيفون', ipad: 'آيباد', phone: 'هاتف', tablet: 'تابلت', computer: 'كمبيوتر' };
export function deviceIdentity() {
  let d = null;
  try { d = JSON.parse(safeGet(DEVICE_KEY) || 'null'); } catch {}
  if (!d || !/^\d{6}$/.test(d.code)) {
    const kind = deviceKind();
    d = { code: String(Math.floor(100000 + Math.random() * 900000)), name: (KIND_LABEL[kind] || 'جهاز') + ' ' + (window.MadarAndroid ? 'مدار' : ''), kind };
    d.name = d.name.trim();
    safeSet(DEVICE_KEY, JSON.stringify(d));
  }
  return d;
}
export function saveDeviceIdentity(o) { const d = Object.assign(deviceIdentity(), o); safeSet(DEVICE_KEY, JSON.stringify(d)); return d; }
// Devices you added (paired): {code, name, kind, added}
const PAIRED_KEY = 'madar.paired.v1';
export function pairedDevices() { try { const v = JSON.parse(safeGet(PAIRED_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
export function savePaired(list) { safeSet(PAIRED_KEY, JSON.stringify(list)); }
export function addPaired(dev) {
  if (!dev || !/^\d{6}$/.test(dev.code) || dev.code === deviceIdentity().code) return false;
  const l = pairedDevices(), i = l.findIndex(x => x.code === dev.code);
  const rec = { code: dev.code, name: dev.name || ('جهاز ' + dev.code), kind: dev.kind || 'computer', added: Date.now(), browser: !!dev.browser };
  if (i >= 0) l[i] = Object.assign(l[i], { name: dev.name || l[i].name, kind: dev.kind || l[i].kind }, dev.browser != null ? { browser: !!dev.browser } : {}); else l.push(rec);
  savePaired(l); return true;
}
