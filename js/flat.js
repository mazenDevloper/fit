// «مدار 2D»: Madar as a flat phone / tablet app with a split screen - e.g. the live-stream site on 75 % and the
// live scores on 25 % (sports), a video beside the Quran, two web pages side by side. Each part shows one app:
// live scores, my matches, any website or web app, a video from the device. Drag the bar between parts to resize.
import { settings, loadLinks } from './config.js';
import { Sports, drawBoard, drawMatches } from './sports.js';

const KEY = 'madar.flat.v1';
const $ = s => document.querySelector(s);
const APPS = [
  { id: 'scores', name: 'النتائج المباشرة', icon: '⚽', color: '#16a34a', kind: 'scores' },
  { id: 'matches', name: 'مباريات فرقي', icon: '★', color: '#0ea5e9', kind: 'matches' },
  { id: 'live', name: 'البث المباشر', icon: '▶', color: '#e11d48', kind: 'web', url: 'https://web.dramalive.cc' },
  { id: 'youtube', name: 'يوتيوب', icon: 'Y', color: '#ff0033', kind: 'web', url: 'https://m.youtube.com/' },
  { id: 'shahid', name: 'شاهد', icon: 'ش', color: '#14b8a6', kind: 'web', url: 'https://shahid.mbc.net/ar' },
  { id: 'quran', name: 'القرآن', icon: 'ق', color: '#0f766e', kind: 'web', url: 'https://quran.com/ar' },
  { id: 'drivecast', name: 'DriveCast', icon: 'D', color: '#7c3aed', kind: 'web', url: 'https://drivecast.c-p.workers.dev/media' },
  { id: 'x', name: 'إكس', icon: 'X', color: '#111111', kind: 'web', url: 'https://x.com/' },
  { id: 'maps', name: 'خرائط', icon: 'M', color: '#4285f4', kind: 'web', url: 'https://www.google.com/maps' },
  { id: 'news', name: 'أخبار', icon: 'أ', color: '#1a73e8', kind: 'web', url: 'https://news.google.com/?hl=ar' },
  { id: 'wiki', name: 'ويكيبيديا', icon: 'W', color: '#555555', kind: 'web', url: 'https://ar.wikipedia.org/' },
  { id: 'claude', name: 'Claude', icon: 'C', color: '#d97757', kind: 'web', url: 'https://claude.ai/' },
  { id: 'coach', name: 'التمارين', icon: '💪', color: '#ea580c', kind: 'coach' },
  { id: 'health', name: 'جسمي', icon: '📊', color: '#059669', kind: 'health' },
  { id: 'video', name: 'فيديو من جهازك', icon: '🎞', color: '#334155', kind: 'video' },
];
const PRESETS = {
  sport: { n: 2, ratios: [0.75, 0.25], panes: [{ app: 'live' }, { app: 'scores' }] },
  watch: { n: 2, ratios: [0.7, 0.3], panes: [{ app: 'youtube' }, { app: 'matches' }] },
  fit: { n: 2, ratios: [0.62, 0.38], panes: [{ app: 'coach' }, { app: 'health' }] },
  quran: { n: 2, ratios: [0.5, 0.5], panes: [{ app: 'quran' }, { app: 'youtube' }] },
};
let state = load();
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s?.panes?.length) return s; } catch {} return { ...structuredClone(PRESETS.sport), orient: 'auto', active: 0 }; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
const appOf = p => APPS.find(a => a.id === p.app) || (p.url ? { id: 'url', name: p.title || hostOf(p.url), kind: 'web', url: p.url, icon: '🌐', color: '#475569' } : APPS[0]);
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

// ---- live scores (the same server and favourites as Madar's sports mode)
const stubApp = new Proxy({ renderer: { overlay: { add() {} } }, toast() {}, log() {}, notify() {} }, { get: (t, k) => (k in t ? t[k] : () => {}) });
let sports = null;
function getSports() {
  if (sports) return sports;
  try { sports = new Sports(stubApp); } catch (e) { console.warn(e); sports = { data: null, teams: () => settings.myTeams || [], mine: () => 0, refresh() {}, live() {}, version: 0 }; }
  sports.refresh?.(true); sports.live?.();
  setInterval(() => { sports.refresh?.(); sports.live?.(); }, 20000);
  return sports;
}

// ---- layout
const lay = $('#lay');
const canvases = new Set();
function orientCol() { return state.orient === 'col' || (state.orient !== 'row' && innerHeight > innerWidth); }
const mounted = [];
function render() {
  while (mounted.length) { try { mounted.pop().destroy(); } catch {} }
  lay.innerHTML = ''; canvases.clear();
  lay.classList.toggle('col', orientCol());
  const n = state.solo != null ? 1 : state.n;
  const idx = state.solo != null ? [state.solo] : [...Array(n).keys()];
  idx.forEach((pi, k) => {
    if (k > 0) lay.appendChild(divider(k - 1));
    lay.appendChild(pane(pi, n === 1 ? 1 : state.ratios[pi]));
  });
  document.querySelectorAll('[data-split]').forEach(b => b.classList.toggle('on', +b.dataset.split === state.n && state.solo == null));
  save();
}
function pane(i, ratio) {
  const p = state.panes[i] || (state.panes[i] = { app: 'scores' }), a = appOf(p);
  const el = document.createElement('div'); el.className = 'pane' + (state.active === i ? ' active' : ''); el.style.flex = ratio + ' 1 0';
  const bar = document.createElement('div'); bar.className = 'bar';
  bar.innerHTML = `<span>${a.icon}</span><span class="name"></span>`;
  bar.querySelector('.name').textContent = a.name;
  const btn = (t, title, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.title = title; b.onclick = e => { e.stopPropagation(); fn(); }; bar.appendChild(b); };
  if (a.kind === 'web') { btn('⟳', 'تحديث', () => { const f = el.querySelector('iframe'); if (f) f.src = f.src; }); btn('↗', 'افتح في المتصفح', () => window.open(p.url || a.url, '_blank')); }
  btn(state.solo === i ? '⤡' : '⤢', 'ملء الشاشة', () => { state.solo = state.solo === i ? null : i; render(); });
  btn('☰', 'غيّر التطبيق', () => { state.active = i; openPicker(i); });
  bar.onclick = () => { state.active = i; document.querySelectorAll('.pane').forEach(x => x.classList.remove('active')); el.classList.add('active'); save(); };
  const body = document.createElement('div'); body.className = 'body';
  el.append(bar, body);
  if (a.kind === 'web') {
    const f = document.createElement('iframe'); f.src = p.url || a.url; f.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture'; f.allowFullscreen = true; f.referrerPolicy = 'no-referrer-when-downgrade';
    body.appendChild(f);
  } else if (a.kind === 'scores' || a.kind === 'matches') {
    const c = document.createElement('canvas'); body.appendChild(c); c.dataset.kind = a.kind; canvases.add(c); getSports();
  } else if (a.kind === 'coach' || a.kind === 'health') {
    // the fitness apps (loaded on demand: the 3D coach is heavy)
    const go = id => { state.panes[i] = { app: id }; render(); };
    import('./fitapp.js').then(m => {
      if (!body.isConnected) return;
      mounted.push(a.kind === 'coach' ? m.mountCoach(body, { onHealth: () => go('health') }) : m.mountHealth(body, { onTrain: () => { const j = state.panes.findIndex(x => x.app === 'coach'); if (j >= 0 && j !== i) render(); else go('coach'); } }));
    }).catch(e => { body.innerHTML = '<div class="empty">تعذّر التحميل: ' + (e.message || e) + '</div>'; });
  } else if (a.kind === 'video') {
    if (p.blobUrl) { const v = document.createElement('video'); v.src = p.blobUrl; v.controls = true; v.playsInline = true; v.autoplay = true; body.appendChild(v); }
    else { const e = document.createElement('div'); e.className = 'empty'; e.innerHTML = '<label style="padding:12px 16px;border-radius:12px;background:rgba(255,255,255,.1)">🎞 اختر فيديو من جهازك<input type="file" accept="video/*" hidden></label>'; e.querySelector('input').onchange = ev => { const file = ev.target.files?.[0]; if (file) { p.blobUrl = URL.createObjectURL(file); p.title = file.name; render(); } }; body.appendChild(e); }
  }
  return el;
}
// the bar between two parts: drag to resize (pages under it are shielded while dragging)
function divider(k) {
  const d = document.createElement('div'); d.className = 'div';
  d.onpointerdown = e => {
    e.preventDefault(); d.setPointerCapture(e.pointerId); document.body.classList.add('dragging');
    const r = lay.getBoundingClientRect(), col = orientCol(), rtl = getComputedStyle(lay).direction === 'rtl';
    const before = state.ratios.slice(0, k).reduce((s, x) => s + x, 0), pair = state.ratios[k] + state.ratios[k + 1];
    const move = ev => {
      let f = col ? (ev.clientY - r.top) / r.height : rtl ? (r.right - ev.clientX) / r.width : (ev.clientX - r.left) / r.width;
      const tot = state.ratios.slice(0, state.n).reduce((s, x) => s + x, 0);
      let a = f * tot - before; a = Math.max(0.12 * tot, Math.min(pair - 0.12 * tot, a));
      state.ratios[k] = a; state.ratios[k + 1] = pair - a;
      const ps = lay.querySelectorAll('.pane'); ps[k].style.flex = state.ratios[k] + ' 1 0'; ps[k + 1].style.flex = state.ratios[k + 1] + ' 1 0';
      sizeCanvases();
    };
    const up = () => { d.removeEventListener('pointermove', move); document.body.classList.remove('dragging'); save(); };
    d.addEventListener('pointermove', move); d.addEventListener('pointerup', up, { once: true }); d.addEventListener('pointercancel', up, { once: true });
  };
  d.ondblclick = () => { const s = state.ratios[k] + state.ratios[k + 1]; state.ratios[k] = state.ratios[k + 1] = s / 2; render(); };
  return d;
}
function setSplit(n) {
  state.solo = null; state.n = n;
  while (state.panes.length < n) state.panes.push({ app: ['live', 'scores', 'youtube'][state.panes.length] || 'scores' });
  state.ratios = n === 1 ? [1] : n === 2 ? (state.ratios.length === 2 ? state.ratios : [0.75, 0.25]) : [0.5, 0.25, 0.25];
  render();
}

// ---- the app picker (for the part you tapped)
function openPicker(i) {
  const sh = $('#sheet');
  const links = (loadLinks() || []).filter(l => l.url).slice(0, 24);
  sh.innerHTML = `<h3>اختر ما يظهر في هذا الجزء</h3><div class="grid" id="g1"></div>
    <div class="row"><input id="url" type="url" placeholder="أو اكتب رابطاً…" inputmode="url" autocapitalize="off"><button id="go" type="button">افتح</button></div>
    ${links.length ? '<h3>روابطك</h3><div class="grid" id="g2"></div>' : ''}`;
  const g = sh.querySelector('#g1');
  const tile = (a, onPick, into) => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<i style="background:${a.color || '#475569'}">${a.icon || '🌐'}</i><span></span>`; b.querySelector('span').textContent = a.name; b.onclick = onPick; into.appendChild(b); };
  APPS.forEach(a => tile(a, () => { state.panes[i] = { app: a.id }; closeSheet(); render(); }, g));
  links.forEach(l => tile({ name: l.title || hostOf(l.url), icon: '🌐' }, () => { state.panes[i] = { app: 'url', url: l.url, title: l.title }; closeSheet(); render(); }, sh.querySelector('#g2')));
  sh.querySelector('#go').onclick = () => { let u = sh.querySelector('#url').value.trim(); if (!u) return; if (!/^https?:\/\//.test(u)) u = 'https://' + u; state.panes[i] = { app: 'url', url: u }; closeSheet(); render(); };
  sh.classList.add('open'); $('#scrim').classList.add('on');
}
function closeSheet() { $('#sheet').classList.remove('open'); $('#scrim').classList.remove('on'); }
$('#scrim').onclick = closeSheet;

// ---- the scores canvases (sharp at the device's pixel ratio, redrawn when the data changes)
function sizeCanvases() {
  const dpr = Math.min(3, devicePixelRatio || 1);
  for (const c of canvases) { const r = c.getBoundingClientRect(), w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; c._v = -1; } }
}
let drawnAt = 0;
function tick(now) {
  if (canvases.size && sports) {
    if (now - drawnAt > 1000) {
      drawnAt = now; sizeCanvases();
      for (const c of canvases) {
        const ctx = c.getContext('2d');
        // the boards are drawn for a 3D panel of about 1000 px wide: scale them to the part's width
        const W = 1000, H = Math.max(300, Math.round(c.height * W / c.width));
        ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
        try { (c.dataset.kind === 'matches' ? drawMatches : drawBoard)(ctx, W, H, sports); } catch (e) { console.warn(e); }
      }
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---- the top bar
document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { const p = structuredClone(PRESETS[b.dataset.preset]); state = { ...state, ...p, solo: null, active: 0 }; render(); });
document.querySelectorAll('[data-split]').forEach(b => b.onclick = () => setSplit(+b.dataset.split));
$('#flip').onclick = () => { state.orient = orientCol() ? 'row' : 'col'; render(); };
$('#hide').onclick = () => { document.body.classList.add('hideTop'); setTimeout(sizeCanvases, 250); showHint(); };
$('#home').onclick = () => { location.href = './'; };
// with the bar hidden: a two-finger tap (or a tap at the very top) brings it back
function showHint() {}
addEventListener('touchstart', e => { if (e.touches.length === 2) { document.body.classList.toggle('hideTop'); setTimeout(sizeCanvases, 250); } }, { passive: true });
addEventListener('pointerdown', e => { if (document.body.classList.contains('hideTop') && e.clientY < 14) { document.body.classList.remove('hideTop'); setTimeout(sizeCanvases, 250); } });
let lastCol = null;
addEventListener('resize', () => { const c = orientCol(); if (c !== lastCol) { lastCol = c; lay.classList.toggle('col', c); } setTimeout(sizeCanvases, 100); });
lastCol = orientCol();
render(); setTimeout(sizeCanvases, 50);
