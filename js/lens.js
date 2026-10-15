// Lens adjust screen (SBS): move both lens images and zoom them by touch or with a controller.
//  one finger drag sideways = distance between the images · up/down = height
//  two fingers pinch = zoom (bigger/smaller picture) · buttons for fine steps and the right eye's height
import { settings, saveSettings, pxPerMm } from './config.js';

const LIM = { lensSep: [45, 85], vOffset: [-30, 30], screenToLens: [25, 75], vSkew: [-8, 8] };
const clamp = (k, v) => Math.min(LIM[k][1], Math.max(LIM[k][0], Math.round(v * 10) / 10));

export class LensAdjust {
  constructor(app) {
    this.app = app;
    const el = this.el = document.createElement('div');
    el.className = 'lensadj'; el.hidden = true;
    el.innerHTML = `
      <div class="la-ring"></div><div class="la-ring"></div>
      <div class="la-box">
        <b>ضبط العدستين</b>
        <span>اسحب بإصبع: يمين/يسار للمسافة · أعلى/أسفل للارتفاع · بإصبعين للتكبير</span>
        <div class="la-vals"></div>
        <div class="la-row">
          <button data-k="screenToLens" data-d="-1">تصغير −</button><button data-k="screenToLens" data-d="1">تكبير +</button>
          <button data-k="lensSep" data-d="-0.5">تقريب ⇥⇤</button><button data-k="lensSep" data-d="0.5">تبعيد ⇤⇥</button>
        </div>
        <div class="la-row">
          <button data-k="vOffset" data-d="0.5">رفع ↑</button><button data-k="vOffset" data-d="-0.5">خفض ↓</button>
          <button data-k="vSkew" data-d="0.5">العين اليمنى ↑</button><button data-k="vSkew" data-d="-0.5">العين اليمنى ↓</button>
        </div>
        <div class="la-row"><button data-act="reset">الافتراضي</button><button data-act="done" class="la-done">تم</button></div>
      </div>`;
    app.stage.appendChild(el);
    const stop = e => { e.stopPropagation(); };
    ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'wheel'].forEach(t => el.addEventListener(t, stop, { passive: true }));
    el.querySelectorAll('button').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      if (b.dataset.act === 'done') return this.close();
      if (b.dataset.act === 'reset') { saveSettings({ lensSep: 63, vOffset: -6, vSkew: 0, screenToLens: 40 }); this.apply(); return; }
      this.nudge(b.dataset.k, +b.dataset.d);
    }));
    // Touch gestures on the background
    let start = null;
    el.addEventListener('touchstart', e => {
      if (e.target.closest('.la-box')) return;
      const t = [...e.touches].map(x => app.orientation.toStage(x.clientX, x.clientY));
      start = { t, sep: settings.lensSep, voff: settings.vOffset, s2l: settings.screenToLens, d: t.length > 1 ? Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) : 0 };
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (!start) return;
      e.preventDefault();
      const t = [...e.touches].map(x => app.orientation.toStage(x.clientX, x.clientY)), px = pxPerMm();
      if (t.length > 1 && start.d) {
        const d = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y);
        saveSettings({ screenToLens: clamp('screenToLens', start.s2l * d / start.d) });
      } else if (t.length === 1 && start.t.length === 1) {
        const dx = (t[0].x - start.t[0].x) / px, dy = (t[0].y - start.t[0].y) / px;
        const side = start.t[0].x > app.orientation.width / 2 ? 1 : -1;   // dragging outward = farther apart
        saveSettings({ lensSep: clamp('lensSep', start.sep + side * dx * 2), vOffset: clamp('vOffset', start.voff + dy) });
      }
      this.apply(false);
    }, { passive: false });
    el.addEventListener('touchend', e => { if (!e.touches.length) start = null; }, { passive: true });
  }
  get isOpen() { return !this.el.hidden; }
  open() {
    if (settings.viewMode !== 'sbs') { this.app.setViewMode('sbs'); }
    this.el.hidden = false; this.apply();
    this.app.toast('ضبط العدستين: اسحب وكبّر حتى تتطابق الصورتان', 3000);
  }
  close() { this.el.hidden = true; this.app.toast('حُفظ ضبط العدستين'); }
  nudge(k, d) { saveSettings({ [k]: clamp(k, (settings[k] || 0) + d), preset: k === 'vSkew' || k === 'vOffset' ? settings.preset : 'custom' }); this.apply(); }
  // Controller: left stick moves the images, triggers zoom, ✕/○ finish.
  pad(ax, val, edge, dt) {
    const x = Math.abs(ax[0]) > 0.2 ? ax[0] : 0, y = Math.abs(ax[1]) > 0.2 ? ax[1] : 0;
    const z = val(7) - val(6);
    if (x || y || Math.abs(z) > 0.05) {
      saveSettings({
        lensSep: clamp('lensSep', settings.lensSep + x * 12 * dt),
        vOffset: clamp('vOffset', settings.vOffset - y * 12 * dt),
        screenToLens: clamp('screenToLens', settings.screenToLens + z * 10 * dt),
      });
      this.apply(false);
    }
    if (edge(12)) this.nudge('vSkew', 0.5);
    if (edge(13)) this.nudge('vSkew', -0.5);
    if (edge(0) || edge(1)) this.close();
  }
  apply(full = true) {
    this.app.applySettings();
    const px = pxPerMm(), { width, height } = this.app.orientation;
    // Rings show where each lens centre sits now.
    const size = 2 * 1.22 * settings.screenToLens * px * 0.62;
    [...this.el.querySelectorAll('.la-ring')].forEach((r, i) => {
      const cx = width / 2 + (i ? 1 : -1) * settings.lensSep * 0.5 * px;
      const cy = height / 2 - (settings.vOffset + (i ? 0.5 : -0.5) * (settings.vSkew || 0)) * px;
      Object.assign(r.style, { left: cx - size / 2 + 'px', top: cy - size / 2 + 'px', width: size + 'px', height: size + 'px' });
    });
    this.el.querySelector('.la-vals').textContent =
      `المسافة ${settings.lensSep.toFixed(1)} · الارتفاع ${settings.vOffset.toFixed(1)} · التكبير ${settings.screenToLens.toFixed(1)} · اليمنى ${(settings.vSkew || 0).toFixed(1)} mm`;
  }
}
