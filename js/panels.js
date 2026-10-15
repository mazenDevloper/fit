// System panels: the Launcher (home), in-headset calibration, and head-locked toasts.
import * as THREE from 'three';
import { CanvasPanel, glass, text, icon, roundRect, COLORS, blip, canvasTexture } from './ui.js';
import { settings, saveSettings, VIEWER_PRESETS, applyPreset, pairedDevices, KIND_LABEL } from './config.js';
import { listItems, formatSize } from './db.js';

import { ENVS, envKey } from './envs.js';
const ENV_LABEL = new Proxy({}, { get: (_, k) => ENVS[envKey(k)].label });
const TABS = [['apps', 'التطبيقات'], ['devices', 'الأجهزة'], ['library', 'مكتبتي'], ['links', 'المواقع'], ['settings', 'الإعدادات']];

export class Launcher {
  constructor(app) {
    this.app = app;
    this.tab = 'apps'; this.page = 0;
    this.items = []; this.links = [];
    this.panel = new CanvasPanel(1.3, 0.84, (ctx, W, H, p) => this.draw(ctx, W, H, p), { pxPerM: 1300 });
    this.group = new THREE.Group();
    this.group.add(this.panel.mesh);
    // The launcher always draws on top of windows, like a system overlay.
    this.panel.mesh.material.depthTest = false; this.panel.mesh.renderOrder = 900;
    this.group.visible = false;
  }
  get targets() { return [this.panel.mesh]; }
  async refresh() {
    try { this.items = (await listItems()).map(i => ({ id: i.id, name: i.name, type: i.type, size: i.size, format: i.format })); } catch { this.items = []; }
    this.links = this.app.links();
    this.panel.redraw();
  }
  open() {
    this.refresh();
    const yaw = this.app.windows.forwardYaw();
    const d = settings.viewMode !== 'sbs' ? 1.75 : 1.25;
    this.group.position.set(-Math.sin(yaw) * d, -0.08, -Math.cos(yaw) * d);
    this.group.lookAt(0, 0, 0);
    this.group.visible = true;
    blip('open', settings.sounds);
  }
  close() { this.group.visible = false; }
  toggle() { this.group.visible ? this.close() : this.open(); }
  setTab(t) { this.tab = t; this.page = 0; this.panel.redraw(); }

  tile(ctx, p, x, y, w, h, ic, label, sub, action, id, tint = COLORS.accent) {
    const hov = p.isHover(id);
    glass(ctx, x, y, w, h, 34, hov);
    if (hov) { roundRect(ctx, x, y, w, h, 34); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 4; ctx.stroke(); }
    const cx = x + w / 2, cy = y + h * 0.4;
    ctx.beginPath(); ctx.arc(cx, cy, h * 0.2, 0, 7);
    const g = ctx.createLinearGradient(cx, cy - h * 0.2, cx, cy + h * 0.2);
    g.addColorStop(0, 'rgba(255,255,255,0.20)'); g.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.fillStyle = g; ctx.fill();
    icon(ctx, ic, cx, cy, h * 0.2, tint);
    text(ctx, label, cx, y + h * 0.75, h * 0.117, { weight: 800, maxWidth: w - 20 });
    if (sub) text(ctx, sub, cx, y + h * 0.9, h * 0.095, { color: '#d5ddef', weight: 600, maxWidth: w - 24, dir: 'auto' });
    p.region(x, y, w, h, () => { blip('tap', settings.sounds); action(); }, id);
  }

  draw(ctx, W, H, p) {
    roundRect(ctx, 0, 0, W, H, 70); ctx.fillStyle = 'rgba(14,16,24,0.55)'; ctx.fill();
    glass(ctx, 0, 0, W, H, 70);
    // Header
    text(ctx, 'مدار', W - 70, 82, 58, { align: 'right', weight: 750 });
    const tw = 190, th = 66, gap = 12, total = TABS.length * tw + (TABS.length - 1) * gap;
    let tx = (W - total) / 2;
    [...TABS].reverse().forEach(([k, label]) => {
      const id = 'tab-' + k, hov = p.isHover(id), on = this.tab === k;
      roundRect(ctx, tx, 48, tw, th, th / 2);
      ctx.fillStyle = on ? 'rgba(255,255,255,0.9)' : hov ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'; ctx.fill();
      text(ctx, label, tx + tw / 2, 48 + th / 2 + 2, 36, { weight: 800, color: on ? '#151821' : COLORS.text });
      p.region(tx, 48, tw, th, () => { blip('tap', settings.sounds); this.setTab(k); }, id);
      tx += tw + gap;
    });
    // Close
    const hc = p.isHover('close');
    ctx.beginPath(); ctx.arc(95, 81, 38, 0, 7); ctx.fillStyle = hc ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'; ctx.fill();
    icon(ctx, 'close', 95, 81, 34);
    p.region(50, 36, 90, 90, () => { blip('close', settings.sounds); this.close(); }, 'close');

    const top = 150, pad = 50, cols = 5, rows = 2, g = 20;
    const tileW = (W - pad * 2 - g * (cols - 1)) / cols, tileH = (H - top - 60 - g * (rows - 1)) / rows;
    const cell = (i) => { const c = i % cols, r = Math.floor(i / cols); return [W - pad - (c + 1) * tileW - c * g, top + r * (tileH + g)]; };
    const a = this.app;

    if (this.tab === 'apps') {
      const list = [
        ['clock', 'المباريات', 'فرقي ونتائج اليوم', () => { a.openMatches(); this.close(); }],
        ['mic', 'أمر صوتي', 'أو اضغط △ مطوّلاً', () => { this.close(); a.listen('command'); }],
        ['sun', 'مكة المكرمة', 'بيئة 360 حولك', () => { this.close(); a.openMakkah(); }],
        ['target', 'مسح الغرفة', 'تعرّف على عناصر غرفتك ومساحتها', () => { this.close(); a.room.scan(); }],
        ['cube', 'الألعاب', 'ثلاثية الأبعاد وكلاسيكية', () => { this.close(); a.openGames(); }],
        ['globe', 'متصفح مدار', a.browserDevice() ? 'عبر ' + a.browserDevice().name + ' · تقويس و360' : 'يحتاج التابلت في «أجهزتي»', () => { this.close(); a.browserDevice() ? a.openBrowser('https://www.google.com') : a.windows.open({ kind: 'keyboard' }); }],
        ['globe', 'cplay3', 'بالتابات واليد', () => { a.openCplay(); this.close(); }],
        ['grid', 'لوحة المفاتيح', 'رابط أو نص أو رمز', () => { a.windows.open({ kind: 'keyboard' }); this.close(); }],
        ['hand', 'دليل الإيماءات', 'كيف تتحكم', () => { a.windows.open({ kind: 'panel', panel: a.controls.pad.id ? 'pad' : 'guide' }); this.close(); }],
        ['sun', 'البيئة', ENV_LABEL[settings.environment], () => { a.cycleEnvironment(); this.panel.redraw(); }],
        ['stack', 'ترتيب النوافذ', 'أمامك', () => { a.windows.arrange(); this.close(); }],
        ['target', 'إعادة التمركز', 'اجعل الأمام هنا', () => { a.recenter(); this.close(); }],
        ['sliders', 'المعايرة', 'العدسات والمسافات', () => { this.close(); a.calibration.open(); }],
        ['target', 'ضبط العدستين', 'تحريك وتكبير الصورتين', () => { this.close(); a.lensAdjust.open(); }],
      ];
      const per = 10, pages = Math.ceil(list.length / per);
      this.page = Math.min(this.page, pages - 1);
      list.slice(this.page * per, this.page * per + per).forEach(([ic, l, s, act], i) => { const [x, y] = cell(i); this.tile(ctx, p, x, y, tileW, tileH, ic, l, s, act, 'app' + i); });
      if (pages > 1) this.pager(ctx, p, W, H, pages);
    } else if (this.tab === 'devices') {
      this.drawDevices(ctx, W, H, p, top);
    } else if (this.tab === 'library') {
      const per = 10, items = this.items;
      if (!items.length) {
        text(ctx, 'مكتبتك فارغة', W / 2, H * 0.48, 44, { weight: 700 });
        text(ctx, 'أضف الفيديوهات والصور والمجسمات من شاشة مدار الرئيسية قبل الدخول', W / 2, H * 0.58, 30, { color: COLORS.dim });
      } else {
        const pages = Math.ceil(items.length / per);
        this.page = Math.min(this.page, pages - 1);
        items.slice(this.page * per, this.page * per + per).forEach((it, i) => {
          const [x, y] = cell(i);
          const ic = it.type === 'video' ? 'video' : it.type === 'image' ? 'image' : 'cube';
          const tint = it.type === 'video' ? COLORS.accent : it.type === 'image' ? COLORS.warm : COLORS.accent2;
          this.tile(ctx, p, x, y, tileW, tileH, ic, it.name, (it.format ? it.format.toUpperCase() + ' · ' : '') + formatSize(it.size), () => {
            a.windows.open({ kind: it.type, itemId: it.id, name: it.name }); this.close();
          }, 'lib' + i, tint);
        });
        if (pages > 1) this.pager(ctx, p, W, H, pages);
      }
    } else if (this.tab === 'links') {
      const per = 6, links = this.links;
      if (!links.length) {
        text(ctx, 'لا توجد مواقع محفوظة', W / 2, H * 0.48, 44, { weight: 700 });
        text(ctx, 'أضف روابطك (مثل فيديوهات يوتيوب) من الشاشة الرئيسية', W / 2, H * 0.58, 30, { color: COLORS.dim });
      } else {
        const pages = Math.ceil(links.length / per);
        this.page = Math.min(this.page, pages - 1);
        const rh = (H - top - 70) / per;
        links.slice(this.page * per, this.page * per + per).forEach((l, i) => {
          const y = top + i * rh, id = 'link' + i, hov = p.isHover(id);
          glass(ctx, pad, y + 6, W - pad * 2, rh - 12, 26, hov);
          icon(ctx, 'globe', W - pad - 55, y + rh / 2, 40, COLORS.accent);
          text(ctx, l.title || l.url, W - pad - 105, y + rh / 2 - 15, 32, { align: 'right', weight: 650, maxWidth: W - pad * 2 - 160, dir: 'auto' });
          text(ctx, l.url, W - pad - 105, y + rh / 2 + 22, 22, { align: 'right', color: COLORS.dim, dir: 'ltr', maxWidth: W - pad * 2 - 160 });
          p.region(pad, y + 6, W - pad * 2, rh - 12, () => { blip('tap', settings.sounds); a.windows.open({ kind: 'web', url: l.url, title: l.title }); this.close(); }, id);
        });
        if (pages > 1) this.pager(ctx, p, W, H, pages);
      }
    } else {
      const list = [
        ['target', 'النقر بالنظر', settings.dwell ? 'مفعّل' : 'متوقف', () => { saveSettings({ dwell: !settings.dwell }); this.panel.redraw(); }],
        ['sound', 'أصوات الواجهة', settings.sounds ? 'مفعّلة' : 'متوقفة', () => { saveSettings({ sounds: !settings.sounds }); this.panel.redraw(); }],
        ['hand', 'تتبع اليد', settings.handsEnabled ? 'مفعّل' : 'متوقف', () => { saveSettings({ handsEnabled: !settings.handsEnabled }); this.panel.redraw(); }],
        ['stack', 'التحرك في البيئة', settings.moveEnabled ? 'مفعّل' : 'متوقف', () => { saveSettings({ moveEnabled: !settings.moveEnabled }); this.panel.redraw(); }],
        ['reset', 'العودة لمكاني', 'إلغاء التحرك والدوران', () => { a.controls.reset(); a.toast('عدت إلى مكانك'); this.close(); }],
        ['target', 'تتبع العين', settings.eyeTrack ? 'مفعّل · لابتوب' : 'متوقف', () => { a.toggleEyeTrack(); this.panel.redraw(); }],
        ['trash', 'إغلاق كل النوافذ', a.windows.windows.length + ' مفتوحة', () => { a.windows.closeAll(); this.panel.redraw(); }],
        ['grid', 'وضع العرض', { sbs: 'نظارة', mono: 'هاتف', desktop: 'لابتوب' }[settings.viewMode], () => { const o = ['sbs', 'mono', 'desktop']; a.setViewMode(o[(o.indexOf(settings.viewMode) + 1) % 3]); this.panel.redraw(); }],
        ['hand', 'الإصبع كفأرة', settings.handDwell ? 'ثبّته ثانيتين للنقر' : 'متوقف', () => { saveSettings({ handDwell: !settings.handDwell }); this.panel.redraw(); }],
        ['target', 'مثبّت المؤشر', settings.stabilizer ? 'مفعّل' : 'متوقف', () => { saveSettings({ stabilizer: !settings.stabilizer }); this.panel.redraw(); }],
        ['target', 'حارس الغرفة', settings.roomGuard ? 'مفعّل · يخفي النوافذ إذا وقف شخص أمامك' : 'متوقف', async () => { saveSettings({ roomGuard: !settings.roomGuard }); if (settings.roomGuard) { try { await a.room.load(); } catch { a.toast('تعذّر تحميل التعرف'); } } this.panel.redraw(); }],
        ['sun', 'التبريد الأقصى', settings.coolMax ? 'مفعّل · 30 إطاراً وأقل حرارة' : 'متوقف', () => { saveSettings({ coolMax: !settings.coolMax, cool: settings.cool || !settings.coolMax }); a.renderer.resize(); this.panel.redraw(); }],
        ['sun', 'وضع التبريد', settings.cool ? 'مفعّل · حرارة أقل' : 'متوقف · أعلى جودة', () => { saveSettings({ cool: !settings.cool }); a.renderer.resize(); a.toast(settings.cool ? 'وضع التبريد: يعمل بالكامل بعد الدخول التالي' : 'الجودة القصوى: حرارة أعلى', 3000); this.panel.redraw(); }],
        ['target', 'المشي (تجريبي)', settings.walk ? 'مفعّل' : 'متوقف', () => { a.toggleWalk(); this.panel.redraw(); }],
        ['exit', 'الخروج', 'للشاشة الرئيسية', () => { this.close(); a.exit(); }],
      ];
      const per = 10, pages = Math.ceil(list.length / per);
      this.page = Math.min(this.page, pages - 1);
      list.slice(this.page * per, this.page * per + per).forEach(([ic, l, s, act], i) => { const [x, y] = cell(i); this.tile(ctx, p, x, y, tileW, tileH, ic, l, s, act, 'set' + i, l === 'الخروج' ? COLORS.danger : COLORS.accent); });
      if (pages > 1) this.pager(ctx, p, W, H, pages);
    }
  }
  // Devices: this device's number, paired devices and the ones found on the same network.
  drawDevices(ctx, W, H, p, top) {
    const a = this.app, hub = a.devices, me = hub?.me || {};
    const btn = (x, y, w, h, label, act, id, strong) => {
      const hov = p.isHover(id);
      roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = hov ? 'rgba(255,255,255,0.35)' : strong ? 'rgba(124,196,255,0.3)' : 'rgba(255,255,255,0.1)'; ctx.fill();
      text(ctx, label, x + w / 2, y + h / 2 + 2, h * 0.42, { weight: 800 });
      p.region(x, y, w, h, () => { blip('tap', settings.sounds); act(); }, id);
    };
    glass(ctx, 50, top, W - 100, 92, 30);
    text(ctx, 'هذا الجهاز: ' + (me.name || '') + ' · الرقم ' + (me.code || '—'), W - 80, top + 48, 34, { align: 'right', weight: 800, dir: 'auto' });
    btn(80, top + 18, 300, 56, this.scanning ? 'جاري البحث…' : 'بحث في الشبكة', () => this.scan(), 'scan', true);
    const paired = pairedDevices(), near = [...(hub?.nearby.values() || [])];
    const list = [...paired.map(d => ({ ...d, paired: true, near: near.some(n => n.code === d.code) })), ...near.filter(n => !paired.some(d => d.code === n.code)).map(d => ({ ...d, near: true }))];
    if (!list.length) {
      text(ctx, 'لا توجد أجهزة بعد', W / 2, H * 0.55, 42, { weight: 700 });
      text(ctx, 'افتح مدار على التابلت أو اللابتوب أو التلفاز ثم اضغط «بحث في الشبكة»، أو أضف رقمه من الشاشة الرئيسية', W / 2, H * 0.64, 27, { color: COLORS.dim, maxWidth: W - 160 });
      return;
    }
    const per = 5, rh = (H - top - 130) / per, pages = Math.ceil(list.length / per);
    this.page = Math.min(this.page, pages - 1);
    const web = [...a.windows.windows].reverse().find(w => w.kind === 'web');
    list.slice(this.page * per, this.page * per + per).forEach((d, i) => {
      const y = top + 112 + i * rh, id = 'dev' + i;
      if (i % 2 === 0) { roundRect(ctx, 50, y, W - 100, rh - 8, 24); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill(); }
      const ic = d.kind === 'tv' ? 'video' : d.kind === 'computer' ? 'grid' : d.kind === 'playstation' ? 'target' : 'image';
      icon(ctx, ic, W - 95, y + rh / 2 - 4, 34, d.near ? COLORS.accent : COLORS.dim);
      text(ctx, d.name, W - 140, y + rh / 2 - 16, 31, { align: 'right', weight: 800, dir: 'auto', maxWidth: 560 });
      text(ctx, (KIND_LABEL[d.kind] || '') + ' · ' + d.code + (d.near ? ' · في شبكتك' : ''), W - 140, y + rh / 2 + 22, 23, { align: 'right', color: COLORS.dim, dir: 'auto' });
      const bh = Math.min(58, rh - 26), by = y + (rh - 8 - bh) / 2;
      if (d.kind === 'tv') btn(80, by, 220, bh, 'اعرض عليه', () => a.showOnDevice(d.code, settings.mirrorCode), id + 's', true);
      else btn(80, by, 220, bh, 'الشاشة', () => { this.close(); a.connectMirror(d.code); }, id + 's', true);
      if (web) btn(315, by, 250, bh, 'أرسل الموقع', () => a.sendToDevice(d.code, { url: web.url, title: web.title }), id + 'l');
      if (!d.paired) btn(web ? 580 : 315, by, 200, bh, 'إضافة', () => a.pairDevice(d.code), id + 'p');
    });
    if (pages > 1) this.pager(ctx, p, W, H, pages);
  }
  async scan() {
    if (this.scanning || !this.app.devices) return;
    this.scanning = true; this.panel.redraw();
    try { await this.app.devices.scan(); } catch {}
    this.scanning = false; this.panel.redraw();
  }
  pager(ctx, p, W, H, pages) {
    const y = H - 34;
    text(ctx, `${this.page + 1} / ${pages}`, W / 2, y, 26, { color: COLORS.dim, dir: 'ltr' });
    [['chevR', W / 2 - 110, -1], ['chevL', W / 2 + 110, 1]].forEach(([ic, x, d]) => {
      const id = 'pg' + d, hov = p.isHover(id);
      ctx.beginPath(); ctx.arc(x, y, 26, 0, 7); ctx.fillStyle = hov ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'; ctx.fill();
      icon(ctx, ic, x, y, 26);
      p.region(x - 40, y - 34, 80, 68, () => { blip('tap', settings.sounds); this.page = (this.page + d + pages) % pages; this.panel.redraw(); }, id);
    });
  }
}

const ROWS = [
  ['ipd', 'المسافة بين العينين', 1, 50, 80, v => v + ' mm'],
  ['lensSep', 'المسافة بين العدستين', 1, 50, 80, v => v + ' mm'],
  ['screenToLens', 'عمق العدسة (مجال الرؤية)', 1, 25, 70, v => v.toFixed(1) + ' mm'],
  ['k1', 'تصحيح التشوه k1', 0.02, -0.2, 1.2, v => v.toFixed(2)],
  ['k2', 'تصحيح التشوه k2', 0.02, -0.2, 1.2, v => v.toFixed(2)],
  ['vOffset', 'ارتفاع مركز العدسات', 1, -25, 25, v => (v > 0 ? '+' : '') + v + ' mm'],
  ['camFov', 'حجم الواقع (مجال الكاميرا)', 1, 40, 130, v => v + '°'],
  ['poseDelay', 'مزامنة الحركة مع الكاميرا', 10, 0, 200, v => v + ' ms'],
  ['walkScale', 'مقياس المشي', 0.1, 0.3, 5, v => v.toFixed(1) + '×'],
];
const D = v => (v > 0 ? '+' : '') + v.toFixed(2);
const EYE_ROWS = [
  ['sharpen', 'حدة الصورة (للعينين)', 0.05, 0, 1.5, v => v.toFixed(2)],
  ['rxStrength', 'قوة التصحيح حسب الوصفة', 0.1, 0, 2, v => v.toFixed(1) + '×'],
  ['rxR.sph', 'اليمنى: قصر/بعد النظر SPH', 0.25, -8, 8, D],
  ['rxR.cyl', 'اليمنى: الانحراف CYL', 0.25, -6, 0, D],
  ['rxR.axis', 'اليمنى: محور الانحراف', 5, 0, 180, v => v + '°'],
  ['rxL.sph', 'اليسرى: قصر/بعد النظر SPH', 0.25, -8, 8, D],
  ['rxL.cyl', 'اليسرى: الانحراف CYL', 0.25, -6, 0, D],
  ['rxL.axis', 'اليسرى: محور الانحراف', 5, 0, 180, v => v + '°'],
  ['dwellMs', 'مدة النقر بالنظر', 250, 1000, 5000, v => (v / 1000).toFixed(2) + ' s'],
];
const getK = k => k.split('.').reduce((o, x) => o[x], settings);
function setK(k, v) {
  const [a, b] = k.split('.');
  if (!b) return { [a]: v };
  return { [a]: Object.assign({}, settings[a], { [b]: v }) };
}

export class Calibration {
  constructor(app) {
    this.app = app;
    this.panel = new CanvasPanel(1.15, 0.92, (ctx, W, H, p) => this.draw(ctx, W, H, p), { pxPerM: 1300 });
    this.group = new THREE.Group();
    this.group.add(this.panel.mesh);
    // Grid behind the panel: straight lines should look straight when distortion is right.
    const { canvas, ctx, texture } = canvasTexture(1024, 1024);
    ctx.clearRect(0, 0, 1024, 1024);
    ctx.strokeStyle = 'rgba(124,196,255,0.75)'; ctx.lineWidth = 3;
    for (let i = 0; i <= 16; i++) { const v = i * 64; ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, 1024); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, v); ctx.lineTo(1024, v); ctx.stroke(); }
    texture.needsUpdate = true;
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.8 }));
    this.grid.position.z = -1.6;
    this.group.add(this.grid);
    this.group.visible = false;
  }
  get targets() { return [this.panel.mesh]; }
  open() {
    const yaw = this.app.windows.forwardYaw();
    this.group.position.set(-Math.sin(yaw) * 1.2, -0.02, -Math.cos(yaw) * 1.2);
    this.group.lookAt(0, 0, 0);
    this.group.visible = true;
    this.panel.redraw();
  }
  close() { this.group.visible = false; }
  draw(ctx, W, H, p) {
    roundRect(ctx, 0, 0, W, H, 60); ctx.fillStyle = 'rgba(14,16,24,0.55)'; ctx.fill();
    glass(ctx, 0, 0, W, H, 60);
    text(ctx, 'معايرة النظارة', W - 60, 72, 50, { align: 'right', weight: 750 });
    text(ctx, 'عدّل حتى تبدو الشبكة خلف اللوحة مستقيمة وواضحة بعين واحدة وبالعينين', W - 60, 124, 25, { align: 'right', color: COLORS.dim });
    // Preset button
    const pname = VIEWER_PRESETS[settings.preset]?.label || 'مخصص';
    const hp = p.isHover('preset');
    roundRect(ctx, 50, 44, 330, 64, 32); ctx.fillStyle = hp ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)'; ctx.fill();
    text(ctx, 'النظارة: ' + pname, 215, 77, 25, { weight: 650 });
    p.region(50, 44, 330, 64, () => {
      const keys = Object.keys(VIEWER_PRESETS); const i = (keys.indexOf(settings.preset) + 1) % keys.length;
      applyPreset(keys[i]); this.app.applySettings(); blip('tap', settings.sounds); this.panel.redraw();
    }, 'preset');
    // Page switch: lenses / eyes
    [['lens', 'العدسات', W / 2 + 10], ['eyes', 'العينان والوصفة', W / 2 - 250]].forEach(([k, l, x]) => {
      const on = (this.page || 'lens') === k, hov = p.isHover('pg-' + k);
      roundRect(ctx, x, 44, 240, 64, 32); ctx.fillStyle = on ? 'rgba(255,255,255,0.9)' : hov ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'; ctx.fill();
      text(ctx, l, x + 120, 77, 27, { weight: 800, color: on ? '#151821' : COLORS.text });
      p.region(x, 44, 240, 64, () => { this.page = k; blip('tap', settings.sounds); this.panel.redraw(); }, 'pg-' + k);
    });
    const rows = (this.page || 'lens') === 'eyes' ? EYE_ROWS : ROWS;
    const top = 160, rh = (H - top - 120) / rows.length;
    rows.forEach(([key, label, step, min, max, fmt], i) => {
      const y = top + i * rh + rh / 2;
      if (i % 2 === 0) { roundRect(ctx, 40, y - rh / 2 + 3, W - 80, rh - 6, 20); ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fill(); }
      text(ctx, label, W - 70, y, 31, { align: 'right', weight: 700 });
      text(ctx, fmt(getK(key)), 330, y, 30, { dir: 'ltr', weight: 800, color: COLORS.accent });
      [['minus', 120, -1], ['plus', 220, 1]].forEach(([ic, x, d]) => {
        const id = key + d, hov = p.isHover(id);
        ctx.beginPath(); ctx.arc(x, y, rh * 0.36, 0, 7); ctx.fillStyle = hov ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.1)'; ctx.fill();
        icon(ctx, ic, x, y, rh * 0.32);
        p.region(x - rh * 0.45, y - rh / 2, rh * 0.9, rh, () => {
          const v = Math.round((getK(key) + d * step) * 1000) / 1000;
          saveSettings({ ...setK(key, Math.min(max, Math.max(min, v))), preset: ['k1', 'k2', 'lensSep', 'screenToLens'].includes(key) ? 'custom' : settings.preset });
          this.app.applySettings(); blip('tap', settings.sounds); this.panel.redraw();
        }, id);
      });
    });
    const hd = p.isHover('done');
    roundRect(ctx, W / 2 - 170, H - 95, 340, 70, 35); ctx.fillStyle = hd ? '#ffffff' : 'rgba(255,255,255,0.85)'; ctx.fill();
    text(ctx, 'تم', W / 2, H - 59, 32, { weight: 750, color: '#151821' });
    p.region(W / 2 - 170, H - 95, 340, 70, () => { blip('tap', settings.sounds); this.close(); }, 'done');
  }
}

export class Toast {
  constructor() {
    this.panel = new CanvasPanel(0.78, 0.1, (ctx, W, H) => this.draw(ctx, W, H), { pxPerM: 1300 });
    this.panel.mesh.userData.interact = null;
    this.panel.mesh.material.depthTest = false;
    this.panel.mesh.renderOrder = 999;
    this.msg = ''; this.until = 0;
    this.mesh = this.panel.mesh;
    this.mesh.visible = false;
  }
  draw(ctx, W, H) { if (!this.msg) return; glass(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2, true); text(ctx, this.msg, W / 2, H / 2 + 2, H * 0.36, { weight: 600, maxWidth: W - 60, dir: 'auto' }); }
  show(msg, ms = 2800) { this.msg = msg; this.until = performance.now() + ms; this.panel.redraw(); this.mesh.visible = true; }
  update(now, Q) {
    if (!this.mesh.visible) return;
    if (now > this.until) { this.mesh.visible = false; return; }
    this.mesh.position.set(0, -0.27, -1.1).applyQuaternion(Q);
    this.mesh.quaternion.copy(Q);
    const left = this.until - now;
    this.mesh.material.opacity = Math.min(1, left / 300);
  }
}
